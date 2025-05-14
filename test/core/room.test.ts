import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatApi } from '../../src/core/chat-api.ts';
import { RoomEvents } from '../../src/core/events.ts';
import { randomId } from '../../src/core/id.ts';
import { DefaultRoom, Room } from '../../src/core/room.ts';
import { RoomLifeCycleEvents } from '../../src/core/room-lifecycle-manager.ts';
import { normalizeRoomOptions, RoomOptions } from '../../src/core/room-options.ts';
import { RoomStatus } from '../../src/core/room-status.ts';
import { DefaultTyping } from '../../src/core/typing.ts';
import EventEmitter from '../../src/core/utils/event-emitter.ts';
import { CHANNEL_OPTIONS_AGENT_STRING, CHANNEL_OPTIONS_AGENT_STRING_REACT } from '../../src/core/version.ts';
import { randomRoomId } from '../helper/identifier.ts';
import { makeTestLogger } from '../helper/logger.ts';
import { ablyRealtimeClient } from '../helper/realtime-client.ts';
import { waitForRoomStatus } from '../helper/room.ts';

vi.mock('ably');

interface TestContext {
  realtime: Ably.Realtime;
  getRoom: (options?: RoomOptions, useReact?: boolean) => Room;
}

describe('Room', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = ablyRealtimeClient();
    const logger = makeTestLogger();
    const chatApi = new ChatApi(context.realtime, logger);
    context.getRoom = (options?: RoomOptions, useReact?: boolean) =>
      new DefaultRoom(
        randomRoomId(),
        randomId(),
        normalizeRoomOptions(options, useReact ?? false),
        context.realtime,
        chatApi,
        logger,
      );
  });

  describe.each([
    [
      'heartbeat interval < 0',
      'typing heartbeat interval must be greater than 0',
      { typing: { heartbeatThrottleMs: -1 } } as RoomOptions,
    ],
    [
      'heartbeat interval = 0',
      'typing heartbeat interval must be greater than 0',
      { typing: { heartbeatThrottleMs: 0 } } as RoomOptions,
    ],
  ])('feature configured', (description: string, reason: string, options: RoomOptions) => {
    it<TestContext>(`should throw an error when passed invalid options: ${description}`, (context) => {
      expect(() => {
        context.getRoom(options);
      }).toThrowErrorInfo({
        code: 40001,
        message: `invalid room configuration: ${reason}`,
      });
    });
  });

  describe.each([
    [
      'heartbeat interval timeout',
      { typing: { heartbeatThrottleMs: 10 } },
      (room: Room) => (room.typing as DefaultTyping).heartbeatThrottleMs === 10,
    ],
  ])('feature configured', (description: string, options: RoomOptions, checkFunc: (room: Room) => boolean) => {
    it<TestContext>(`should apply room options: ${description}`, (context) => {
      expect(checkFunc(context.getRoom(options))).toBe(true);
    });
  });

  describe.each([
    ['vanilla JS', false, CHANNEL_OPTIONS_AGENT_STRING],
    ['react', true, CHANNEL_OPTIONS_AGENT_STRING_REACT],
  ])('should apply channel options %s', (description: string, setReact: boolean, agentString: string) => {
    it<TestContext>('applies the correct options', (context) => {
      vi.spyOn(context.realtime.channels, 'get');
      const room = context.getRoom(
        {
          occupancy: {
            enableEvents: true,
          },
        },
        setReact,
      ) as DefaultRoom;

      // Check that the shared channel for messages, occupancy and presence was called with the correct options
      const expectedChannelOptions = {
        params: { occupancy: 'metrics', agent: agentString },
        modes: ['PUBLISH', 'SUBSCRIBE', 'PRESENCE', 'PRESENCE_SUBSCRIBE', 'ANNOTATION_PUBLISH'],
        attachOnSubscribe: false,
      };

      expect(context.realtime.channels.get).toHaveBeenCalledOnce();
      expect(context.realtime.channels.get).toHaveBeenNthCalledWith(1, room.channel.name, expectedChannelOptions);
    });

    it<TestContext>('correctly enables individual annotations', (context) => {
      vi.spyOn(context.realtime.channels, 'get');
      const room = context.getRoom(
        {
          occupancy: {
            enableEvents: true,
          },
          messages: {
            rawMessageReactions: true,
          },
        },
        setReact,
      ) as DefaultRoom;

      // Check that the shared channel for messages, occupancy and presence was called with the correct options
      const expectedChannelOptions = {
        params: { occupancy: 'metrics', agent: agentString },
        modes: ['PUBLISH', 'SUBSCRIBE', 'PRESENCE', 'PRESENCE_SUBSCRIBE', 'ANNOTATION_PUBLISH', 'ANNOTATION_SUBSCRIBE'],
        attachOnSubscribe: false,
      };

      expect(context.realtime.channels.get).toHaveBeenCalledOnce();
      expect(context.realtime.channels.get).toHaveBeenNthCalledWith(1, room.channel.name, expectedChannelOptions);
    });
  });

  describe('room status', () => {
    it<TestContext>('should have a room status and error', async (context) => {
      const room = context.getRoom();
      expect(room.status).toBe(RoomStatus.Initialized);

      // Wait for the room to be initialized
      await waitForRoomStatus(room, RoomStatus.Initialized);

      // Now change its status to an error
      const lifecycle = (room as DefaultRoom).lifecycle;
      lifecycle.setStatus({ status: RoomStatus.Failed, error: new Ably.ErrorInfo('test', 50000, 500) });

      expect(room.status).toBe(RoomStatus.Failed);
      expect(room.error).toEqual(new Ably.ErrorInfo('test', 50000, 500));

      // Now change its status to released
      lifecycle.setStatus({ status: RoomStatus.Released });

      expect(room.status).toBe(RoomStatus.Released);
      expect(room.error).toBeUndefined();
    });

    it<TestContext>('should allow subscriptions to status changes', async (context) => {
      const room = context.getRoom();

      const statuses: RoomStatus[] = [];
      const errors: Ably.ErrorInfo[] = [];
      const { off } = room.onStatusChange((change) => {
        statuses.push(change.current);
        if (change.error) {
          errors.push(change.error);
        }
      });

      // Wait for the room to be initialized
      await waitForRoomStatus(room, RoomStatus.Initialized);

      // Now change its status to an error
      const lifecycle = (room as DefaultRoom).lifecycle;
      lifecycle.setStatus({ status: RoomStatus.Failed, error: new Ably.ErrorInfo('test', 50000, 500) });

      // Now change its status to releasing
      lifecycle.setStatus({ status: RoomStatus.Releasing });

      expect(statuses).toEqual([RoomStatus.Failed, RoomStatus.Releasing]);
      expect(errors).toEqual([new Ably.ErrorInfo('test', 50000, 500)]);

      // Remove the listener
      off();

      // Now change status to released
      lifecycle.setStatus({ status: RoomStatus.Released });

      // Change should not be recorded
      expect(statuses).toEqual([RoomStatus.Failed, RoomStatus.Releasing]);
    });

    it<TestContext>('should allow all subscriptions to be removed', async (context) => {
      const room = context.getRoom();

      const statuses: RoomStatus[] = [];
      const errors: Ably.ErrorInfo[] = [];
      room.onStatusChange((change) => {
        statuses.push(change.current);
        if (change.error) {
          errors.push(change.error);
        }
      });

      const statuses2 = [] as RoomStatus[];
      const errors2 = [] as Ably.ErrorInfo[];
      room.onStatusChange((change) => {
        statuses2.push(change.current);
        if (change.error) {
          errors2.push(change.error);
        }
      });

      // Wait for the room to be initialized
      await waitForRoomStatus(room, RoomStatus.Initialized);

      // Now change its status to an error
      const lifecycle = (room as DefaultRoom).lifecycle;
      lifecycle.setStatus({ status: RoomStatus.Failed, error: new Ably.ErrorInfo('test', 50000, 500) });

      // Check both subscriptions received the change
      expect(statuses).toEqual([RoomStatus.Failed]);
      expect(errors).toEqual([new Ably.ErrorInfo('test', 50000, 500)]);
      expect(statuses2).toEqual([RoomStatus.Failed]);
      expect(errors2).toEqual([new Ably.ErrorInfo('test', 50000, 500)]);

      // Now remove all subscriptions
      room.offAllStatusChange();

      // Send another event and check that its not received
      lifecycle.setStatus({ status: RoomStatus.Failed });
      expect(statuses).toEqual([RoomStatus.Failed]);
      expect(errors).toEqual([new Ably.ErrorInfo('test', 50000, 500)]);
      expect(statuses2).toEqual([RoomStatus.Failed]);
      expect(errors2).toEqual([new Ably.ErrorInfo('test', 50000, 500)]);
    });
  });

  describe('room release', () => {
    it<TestContext>('should release the room', async (context) => {
      const room = context.getRoom() as DefaultRoom;
      const lifecycleManager = room.lifecycleManager;

      // Setup spies on the realtime client and the room lifecycle manager
      vi.spyOn(context.realtime.channels, 'release');
      vi.spyOn(lifecycleManager, 'release');

      // Release the room
      await room.release();

      // The room lifecycle manager should have been released
      expect(lifecycleManager.release).toHaveBeenCalledTimes(1);

      // The underlying channel should have been released
      expect(context.realtime.channels.release).toHaveBeenCalledTimes(1);

      const messagesChannel = room.channel;
      expect(context.realtime.channels.release).toHaveBeenCalledWith(messagesChannel.name);
    });

    it<TestContext>('should only release with enabled features', async (context) => {
      const room = context.getRoom() as DefaultRoom;
      const lifecycleManager = room.lifecycleManager;

      // Setup spies on the realtime client and the room lifecycle manager
      vi.spyOn(context.realtime.channels, 'release');
      vi.spyOn(lifecycleManager, 'release');

      // Release the room
      await room.release();

      // The room lifecycle manager should have been released
      expect(lifecycleManager.release).toHaveBeenCalledTimes(1);

      // The underlying channel should have been released
      expect(context.realtime.channels.release).toHaveBeenCalledOnce();

      const messagesChannel = room.channel;
      expect(context.realtime.channels.release).toHaveBeenCalledWith(messagesChannel.name);
    });

    it<TestContext>('releasing multiple times is idempotent', async (context) => {
      const room = context.getRoom() as DefaultRoom;
      const lifecycleManager = room.lifecycleManager;

      // Setup spies on the realtime client and the room lifecycle manager
      vi.spyOn(context.realtime.channels, 'release');
      vi.spyOn(lifecycleManager, 'release');
      // Setup spies on the realtime client
      vi.spyOn(context.realtime.channels, 'release');

      // Release the room
      await room.release();
      await room.release();
      await room.release();

      // Channel should have been released only once
      expect(context.realtime.channels.release).toHaveBeenCalledTimes(1);

      // The room lifecycle manager should have been released only once
      expect(lifecycleManager.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('discontinuity handling', () => {
    it<TestContext>('should allow subscriptions to discontinuity events', (context) => {
      const room = context.getRoom() as DefaultRoom;

      const discontinuityErrors: Ably.ErrorInfo[] = [];
      const { off } = room.onDiscontinuity((error) => {
        discontinuityErrors.push(error);
      });

      // Simulate a discontinuity event
      const error = new Ably.ErrorInfo('test discontinuity', 50000, 500);
      const eventEmitter = (room.lifecycleManager as unknown as { _eventEmitter: EventEmitter<RoomLifeCycleEvents> })
        ._eventEmitter;
      eventEmitter.emit(RoomEvents.Discontinuity, new Ably.ErrorInfo('discontinuity detected', 80003, 500, error));

      expect(discontinuityErrors).toEqual([new Ably.ErrorInfo('discontinuity detected', 80003, 500, error)]);

      // Remove the listener
      off();

      // Simulate another discontinuity event
      eventEmitter.emit(RoomEvents.Discontinuity, new Ably.ErrorInfo('discontinuity detected', 80003, 500, error));

      // Change should not be recorded since we removed the listener
      expect(discontinuityErrors).toEqual([new Ably.ErrorInfo('discontinuity detected', 80003, 500, error)]);
    });

    it<TestContext>('should only unsubscribe the correct subscription for discontinuities', (context) => {
      const room = context.getRoom() as DefaultRoom;

      const received: string[] = [];
      const listener = (error?: Ably.ErrorInfo) => {
        received.push(error?.message ?? 'no error');
      };

      const subscription1 = room.onDiscontinuity(listener);
      const subscription2 = room.onDiscontinuity(listener);

      (room.lifecycleManager as unknown as { _eventEmitter: EventEmitter<RoomLifeCycleEvents> })._eventEmitter.emit(
        RoomEvents.Discontinuity,
        new Ably.ErrorInfo('error1', 0, 0),
      );
      expect(received).toEqual(['error1', 'error1']);

      subscription1.off();
      (room.lifecycleManager as unknown as { _eventEmitter: EventEmitter<RoomLifeCycleEvents> })._eventEmitter.emit(
        RoomEvents.Discontinuity,
        new Ably.ErrorInfo('error2', 0, 0),
      );
      expect(received).toEqual(['error1', 'error1', 'error2']);

      subscription2.off();
      (room.lifecycleManager as unknown as { _eventEmitter: EventEmitter<RoomLifeCycleEvents> })._eventEmitter.emit(
        RoomEvents.Discontinuity,
        new Ably.ErrorInfo('error3', 0, 0),
      );
      expect(received).toEqual(['error1', 'error1', 'error2']);
    });

    it<TestContext>('can be released immediately without unhandled rejections', async (context) => {
      const room = context.getRoom();

      // Release the room
      // Note that an unhandled rejection will not cause the test to fail, but it will cause the process to exit
      // with a non-zero exit code.
      await (room as DefaultRoom).release();
    });
  });
});

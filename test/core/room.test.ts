import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatApi } from '../../src/core/chat-api.ts';
import { randomId } from '../../src/core/id.ts';
import { DefaultRoom, Room } from '../../src/core/room.ts';
import { RoomLifecycleManager } from '../../src/core/room-lifecycle-manager.ts';
import { AllFeaturesEnabled, normalizeRoomOptions, RoomOptions } from '../../src/core/room-options.ts';
import { RoomStatus } from '../../src/core/room-status.ts';
import { DefaultTyping } from '../../src/core/typing.ts';
import {
  CHANNEL_OPTIONS_AGENT_STRING,
  CHANNEL_OPTIONS_AGENT_STRING_REACT,
  DEFAULT_CHANNEL_OPTIONS,
  DEFAULT_CHANNEL_OPTIONS_REACT,
} from '../../src/core/version.ts';
import { randomRoomId } from '../helper/identifier.ts';
import { makeTestLogger } from '../helper/logger.ts';
import { ablyRealtimeClient } from '../helper/realtime-client.ts';
import { waitForRoomStatus } from '../helper/room.ts';

vi.mock('ably');

interface TestContext {
  realtime: Ably.Realtime;
  getRoom: (options: RoomOptions, useReact?: boolean) => Room;
}

describe('Room', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = ablyRealtimeClient();
    const logger = makeTestLogger();
    const chatApi = new ChatApi(context.realtime, logger);
    context.getRoom = (options: RoomOptions, useReact?: boolean) =>
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
    ['presence', (room: Room) => room.presence],
    ['occupancy', (room: Room) => room.occupancy],
    ['typing', (room: Room) => room.typing],
    ['reactions', (room: Room) => room.reactions],
  ])('feature not configured', (description: string, featureLoader: (room: Room) => unknown) => {
    it<TestContext>(`should throw error if trying to access ${description} without being enabled`, (context) => {
      const room = context.getRoom({});
      expect(() => featureLoader(room)).toThrowErrorInfoWithCode(40000);
    });
  });

  describe.each([
    ['messages', {}, (room: Room) => room.messages],
    ['presence', { presence: AllFeaturesEnabled.presence }, (room: Room) => room.presence],
    ['occupancy', { occupancy: AllFeaturesEnabled.occupancy }, (room: Room) => room.occupancy],
    ['typing', { typing: AllFeaturesEnabled.typing }, (room: Room) => room.typing],
    ['reactions', { reactions: AllFeaturesEnabled.reactions }, (room: Room) => room.reactions],
  ])('feature configured', (description: string, options: RoomOptions, featureLoader: (room: Room) => unknown) => {
    it<TestContext>(`should not throw an error when trying to access ${description} whilst enabled`, (context) => {
      const room = context.getRoom(options);
      featureLoader(room);
    });
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
    ['vanilla JS', false, CHANNEL_OPTIONS_AGENT_STRING, DEFAULT_CHANNEL_OPTIONS],
    ['react', true, CHANNEL_OPTIONS_AGENT_STRING_REACT, DEFAULT_CHANNEL_OPTIONS_REACT],
  ])(
    'should apply channel options %s',
    (description: string, setReact: boolean, agentString: string, defaultOptions: unknown) => {
      it<TestContext>('applies the correct options', (context) => {
        vi.spyOn(context.realtime.channels, 'get');
        const room = context.getRoom(AllFeaturesEnabled, setReact) as DefaultRoom;

        // Check that the shared channel for messages, occupancy and presence was called with the correct options
        const expectedMessagesChannelOptions = {
          params: { occupancy: 'metrics', agent: agentString },
          modes: [
            'PUBLISH',
            'SUBSCRIBE',
            'ANNOTATION_PUBLISH',
            'ANNOTATION_SUBSCRIBE',
            'PRESENCE',
            'PRESENCE_SUBSCRIBE',
          ],
          attachOnSubscribe: false,
        };

        expect(context.realtime.channels.get).toHaveBeenCalledTimes(5);
        expect(context.realtime.channels.get).toHaveBeenNthCalledWith(
          1,
          room.messages.channel.name,
          expectedMessagesChannelOptions,
        );
        expect(context.realtime.channels.get).toHaveBeenNthCalledWith(
          2,
          room.messages.channel.name,
          expectedMessagesChannelOptions,
        );
        expect(context.realtime.channels.get).toHaveBeenNthCalledWith(
          5,
          room.messages.channel.name,
          expectedMessagesChannelOptions,
        );

        // Check that the reactions and typing channels were called with the default options
        expect(context.realtime.channels.get).toHaveBeenNthCalledWith(3, room.typing.channel.name, defaultOptions);
        expect(context.realtime.channels.get).toHaveBeenNthCalledWith(4, room.reactions.channel.name, defaultOptions);
      });
    },
  );

  describe.each([
    ['vanilla JS', false, CHANNEL_OPTIONS_AGENT_STRING, DEFAULT_CHANNEL_OPTIONS],
    ['react', true, CHANNEL_OPTIONS_AGENT_STRING_REACT, DEFAULT_CHANNEL_OPTIONS_REACT],
  ])(
    'should not have ANNOTATION_SUBSCRIBE if raw annotations disabled: %s',
    (description: string, setReact: boolean, agentString: string, defaultOptions: unknown) => {
      it<TestContext>('applies the correct options', (context) => {
        vi.spyOn(context.realtime.channels, 'get');
        const room = context.getRoom(
          { ...AllFeaturesEnabled, messages: { rawMessageReactions: false } },
          setReact,
        ) as DefaultRoom;

        // Check that the shared channel for messages, occupancy and presence was called with the correct options
        const expectedMessagesChannelOptions = {
          params: { occupancy: 'metrics', agent: agentString },
          modes: ['PUBLISH', 'SUBSCRIBE', 'ANNOTATION_PUBLISH', 'PRESENCE', 'PRESENCE_SUBSCRIBE'],
          attachOnSubscribe: false,
        };

        expect(context.realtime.channels.get).toHaveBeenCalledTimes(5);
        expect(context.realtime.channels.get).toHaveBeenNthCalledWith(
          1,
          room.messages.channel.name,
          expectedMessagesChannelOptions,
        );
        expect(context.realtime.channels.get).toHaveBeenNthCalledWith(
          2,
          room.messages.channel.name,
          expectedMessagesChannelOptions,
        );
        expect(context.realtime.channels.get).toHaveBeenNthCalledWith(
          5,
          room.messages.channel.name,
          expectedMessagesChannelOptions,
        );

        // Check that the reactions and typing channels were called with the default options
        expect(context.realtime.channels.get).toHaveBeenNthCalledWith(3, room.typing.channel.name, defaultOptions);
        expect(context.realtime.channels.get).toHaveBeenNthCalledWith(4, room.reactions.channel.name, defaultOptions);
      });
    },
  );

  describe('room status', () => {
    it<TestContext>('should have a room status and error', async (context) => {
      const room = context.getRoom(AllFeaturesEnabled);
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
      const room = context.getRoom(AllFeaturesEnabled);

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
      const room = context.getRoom(AllFeaturesEnabled);

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
      const room = context.getRoom(AllFeaturesEnabled) as DefaultRoom;
      const lifecycleManager = (room as unknown as { _lifecycleManager: RoomLifecycleManager })._lifecycleManager;

      // Setup spies on the realtime client and the room lifecycle manager
      vi.spyOn(context.realtime.channels, 'release');
      vi.spyOn(lifecycleManager, 'release');

      // Release the room
      await room.release();

      // The room lifecycle manager should have been released
      expect(lifecycleManager.release).toHaveBeenCalledTimes(1);

      // Every underlying feature channel should have been released
      expect(context.realtime.channels.release).toHaveBeenCalledTimes(5);

      const messagesChannel = room.messages.channel;
      expect(context.realtime.channels.release).toHaveBeenCalledWith(messagesChannel.name);

      const presenceChannel = room.presence.channel;
      expect(context.realtime.channels.release).toHaveBeenCalledWith(presenceChannel.name);

      const typingChannel = room.typing.channel;
      expect(context.realtime.channels.release).toHaveBeenCalledWith(typingChannel.name);

      const reactionsChannel = room.reactions.channel;
      expect(context.realtime.channels.release).toHaveBeenCalledWith(reactionsChannel.name);

      const occupancyChannel = room.occupancy.channel;
      expect(context.realtime.channels.release).toHaveBeenCalledWith(occupancyChannel.name);
    });

    it<TestContext>('should only release with enabled features', async (context) => {
      const room = context.getRoom({ typing: AllFeaturesEnabled.typing }) as DefaultRoom;
      const lifecycleManager = (room as unknown as { _lifecycleManager: RoomLifecycleManager })._lifecycleManager;

      // Setup spies on the realtime client and the room lifecycle manager
      vi.spyOn(context.realtime.channels, 'release');
      vi.spyOn(lifecycleManager, 'release');

      // Release the room
      await room.release();

      // The room lifecycle manager should have been released
      expect(lifecycleManager.release).toHaveBeenCalledTimes(1);

      // Every underlying feature channel should have been released
      expect(context.realtime.channels.release).toHaveBeenCalledTimes(2);

      const messagesChannel = room.messages.channel;
      expect(context.realtime.channels.release).toHaveBeenCalledWith(messagesChannel.name);

      const typingChannel = room.typing.channel;
      expect(context.realtime.channels.release).toHaveBeenCalledWith(typingChannel.name);
    });

    it<TestContext>('releasing multiple times is idempotent', async (context) => {
      const room = context.getRoom(AllFeaturesEnabled) as DefaultRoom;
      const lifecycleManager = (room as unknown as { _lifecycleManager: RoomLifecycleManager })._lifecycleManager;

      // Setup spies on the realtime client and the room lifecycle manager
      vi.spyOn(context.realtime.channels, 'release');
      vi.spyOn(lifecycleManager, 'release');
      // Setup spies on the realtime client
      vi.spyOn(context.realtime.channels, 'release');

      // Release the room
      await room.release();
      await room.release();
      await room.release();

      // Every underlying feature channel should have been released
      expect(context.realtime.channels.release).toHaveBeenCalledTimes(5);

      // The room lifecycle manager should have been released only once
      expect(lifecycleManager.release).toHaveBeenCalledTimes(1);
    });
  });

  it<TestContext>('can be released immediately without unhandled rejections', async (context) => {
    const room = context.getRoom(AllFeaturesEnabled);

    // Release the room
    // Note that an unhandled rejection will not cause the test to fail, but it will cause the process to exit
    // with a non-zero exit code.
    await (room as DefaultRoom).release();
  });
});

import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatApi } from '../src/chat-api.ts';
import { randomId } from '../src
import { DefaultRoom, Room } from '../src';
import { RoomLifecycleManager } from '../srcfecycle-manager.ts';
import { RoomOptions, RoomOptionsDefaults } from '../srctions.ts';
import { RoomStatus } from '../srcatus.ts';
import { DefaultTyping } from '../srcts';
import { CHANNEL_OPTIONS_AGENT_STRING, DEFAULT_CHANNEL_OPTIONS } from '../src.ts';
import { randomRoomId } from '../../../test/helper/identifier.ts';
import { makeTestLogger } from '../../../test/helper/logger.ts';
import { ablyRealtimeClient } from '../../../test/helper/realtime-client.ts';
import { defaultRoomOptions, waitForRoomStatus } from '../../../test/helper/room.ts';

vi.mock('ably');

interface TestContext {
  realtime: Ably.Realtime;
  getRoom: (options: RoomOptions) => Room;
}

describe('Room', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = ablyRealtimeClient();
    const logger = makeTestLogger();
    const chatApi = new ChatApi(context.realtime, logger);
    context.getRoom = (options: RoomOptions) =>
      new DefaultRoom(randomRoomId(), randomId(), options, context.realtime, chatApi, logger);
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
    ['presence', { presence: RoomOptionsDefaults.presence }, (room: Room) => room.presence],
    ['occupancy', { occupancy: RoomOptionsDefaults.occupancy }, (room: Room) => room.occupancy],
    ['typing', { typing: RoomOptionsDefaults.typing }, (room: Room) => room.typing],
    ['reactions', { reactions: RoomOptionsDefaults.reactions }, (room: Room) => room.reactions],
  ])('feature configured', (description: string, options: RoomOptions, featureLoader: (room: Room) => unknown) => {
    it<TestContext>(`should not throw an error when trying to access ${description} whilst enabled`, (context) => {
      const room = context.getRoom(options);
      featureLoader(room);
    });
  });

  describe.each([
    ['typing timeout <0', 'typing timeout must be greater than 0', { typing: { timeoutMs: -1 } }],
    ['typing timeout =0', 'typing timeout must be greater than 0', { typing: { timeoutMs: 0 } }],
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
    ['typing timeout', { typing: { timeoutMs: 5 } }, (room: Room) => (room.typing as DefaultTyping).timeoutMs === 5],
  ])('feature configured', (description: string, options: RoomOptions, checkFunc: (room: Room) => boolean) => {
    it<TestContext>(`should apply room options: ${description}`, (context) => {
      expect(checkFunc(context.getRoom(options))).toBe(true);
    });
  });

  it<TestContext>('should apply channel options via the channel manager', (context) => {
    vi.spyOn(context.realtime.channels, 'get');
    const room = context.getRoom(defaultRoomOptions) as DefaultRoom;

    // Check that the shared channel for messages, occupancy and presence was called with the correct options
    const expectedMessagesChannelOptions = {
      params: { occupancy: 'metrics', agent: CHANNEL_OPTIONS_AGENT_STRING },
      modes: ['PUBLISH', 'SUBSCRIBE', 'PRESENCE', 'PRESENCE_SUBSCRIBE'],
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
    expect(context.realtime.channels.get).toHaveBeenNthCalledWith(3, room.typing.channel.name, DEFAULT_CHANNEL_OPTIONS);
    expect(context.realtime.channels.get).toHaveBeenNthCalledWith(
      4,
      room.reactions.channel.name,
      DEFAULT_CHANNEL_OPTIONS,
    );
  });

  describe('room status', () => {
    it<TestContext>('should have a room status and error', async (context) => {
      const room = context.getRoom(defaultRoomOptions);
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
      const room = context.getRoom(defaultRoomOptions);

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
      const room = context.getRoom(defaultRoomOptions);

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
      const room = context.getRoom(defaultRoomOptions) as DefaultRoom;
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
      const room = context.getRoom({ typing: RoomOptionsDefaults.typing }) as DefaultRoom;
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
      const room = context.getRoom(defaultRoomOptions) as DefaultRoom;
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
    const room = context.getRoom(defaultRoomOptions);

    // Release the room
    // Note that an unhandled rejection will not cause the test to fail, but it will cause the process to exit
    // with a non-zero exit code.
    await (room as DefaultRoom).release();
  });
});

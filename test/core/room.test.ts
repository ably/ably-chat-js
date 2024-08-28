import { RoomLifecycle } from '@ably/chat';
import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatApi } from '../../src/core/chat-api.ts';
import { DefaultRoom, Room } from '../../src/core/room.ts';
import { RoomLifecycleManager } from '../../src/core/room-lifecycle-manager.ts';
import { RoomOptions, RoomOptionsDefaults } from '../../src/core/room-options.ts';
import { DefaultTyping } from '../../src/core/typing.ts';
import { randomRoomId } from '../helper/identifier.ts';
import { makeTestLogger } from '../helper/logger.ts';
import { ablyRealtimeClient } from '../helper/realtime-client.ts';
import { defaultRoomOptions } from '../helper/room.ts';

vi.mock('ably');

interface TestContext {
  realtime: Ably.Realtime;
  getRoom: (options: RoomOptions, initAfter?: Promise<void>) => Room;
}

describe('Room', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = ablyRealtimeClient();
    const logger = makeTestLogger();
    const chatApi = new ChatApi(context.realtime, logger);
    context.getRoom = (options: RoomOptions, initAfter?: Promise<void>) => {
      if (!initAfter) {
        initAfter = Promise.resolve();
      }
      return new DefaultRoom(randomRoomId(), options, context.realtime, chatApi, logger, initAfter);
    };
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

  describe('room release', () => {
    it<TestContext>('should release the room', async (context) => {
      const room = context.getRoom(defaultRoomOptions) as DefaultRoom;

      // Wait for the room to be initialized
      await room.initializationStatus();
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

      const messagesChannel = await room.messages.channel;
      expect(context.realtime.channels.release).toHaveBeenCalledWith(messagesChannel.name);

      const presenceChannel = await room.presence.channel;
      expect(context.realtime.channels.release).toHaveBeenCalledWith(presenceChannel.name);

      const typingChannel = await room.typing.channel;
      expect(context.realtime.channels.release).toHaveBeenCalledWith(typingChannel.name);

      const reactionsChannel = await room.reactions.channel;
      expect(context.realtime.channels.release).toHaveBeenCalledWith(reactionsChannel.name);

      const occupancyChannel = await room.occupancy.channel;
      expect(context.realtime.channels.release).toHaveBeenCalledWith(occupancyChannel.name);
    });

    it<TestContext>('should only release with enabled features', async (context) => {
      const room = context.getRoom({ typing: RoomOptionsDefaults.typing }) as DefaultRoom;

      // Wait for the room to be initialized
      await room.initializationStatus();
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

      const messagesChannel = await room.messages.channel;
      expect(context.realtime.channels.release).toHaveBeenCalledWith(messagesChannel.name);

      const typingChannel = await room.typing.channel;
      expect(context.realtime.channels.release).toHaveBeenCalledWith(typingChannel.name);
    });

    it<TestContext>('releasing multiple times is idempotent', async (context) => {
      const room = context.getRoom(defaultRoomOptions) as DefaultRoom;

      // Wait for the room to be initialized
      await room.initializationStatus();
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

  describe('room async initialization', () => {
    it<TestContext>('should wait for initAfter before initializing', async (context) => {
      let resolve = () => {};
      const initAfter = new Promise<void>((res) => {
        resolve = res;
      });

      vi.spyOn(context.realtime.channels, 'get');

      const room = context.getRoom(defaultRoomOptions, initAfter);
      expect(room.status.current).toBe(RoomLifecycle.Initializing);

      // allow a tick to happen
      await new Promise((res) => setTimeout(res, 0));

      // expect no channel to be initialized yet
      expect(context.realtime.channels.get).not.toHaveBeenCalled();

      resolve();

      // await for room to become initialized
      await (room as DefaultRoom).initializationStatus();

      expect(room.status.current).toBe(RoomLifecycle.Initialized);
      expect(context.realtime.channels.get).toHaveBeenCalledTimes(5); // once for each feature
    });

    it<TestContext>('should wait for initAfter before initializing - should work even if initAfter is rejected', async (context) => {
      let reject = () => {};
      const initAfter = new Promise<void>((_res, rej) => {
        reject = rej;
      });

      vi.spyOn(context.realtime.channels, 'get');

      const room = context.getRoom(defaultRoomOptions, initAfter);
      expect(room.status.current).toBe(RoomLifecycle.Initializing);

      // allow a tick to happen
      await new Promise((res) => setTimeout(res, 0));

      // expect no channel to be initialized yet
      expect(context.realtime.channels.get).not.toHaveBeenCalled();

      reject();

      // await for room to become initialized
      await (room as DefaultRoom).initializationStatus();

      expect(room.status.current).toBe(RoomLifecycle.Initialized);
      expect(context.realtime.channels.get).toHaveBeenCalledTimes(5); // once for each feature
    });

    it<TestContext>('should wait for features to be initialized before setting the status to initialized', async (context) => {
      let resolve = () => {};
      const initAfter = new Promise<void>((res) => {
        resolve = res;
      });

      vi.spyOn(context.realtime.channels, 'get');

      const room = context.getRoom({}, initAfter);
      expect(room.status.current).toBe(RoomLifecycle.Initializing);

      let msgResolve: (channel: Ably.RealtimeChannel) => void = () => void 0;
      const messagesChannelPromise = new Promise<Ably.RealtimeChannel>((res) => {
        msgResolve = res;
      });

      vi.spyOn(room.messages, 'channel', 'get').mockReturnValue(messagesChannelPromise);

      // allow a tick to happen
      await new Promise((res) => setTimeout(res, 0));

      // expect no channel to be initialized yet
      expect(context.realtime.channels.get).not.toHaveBeenCalled();

      resolve();

      // allow a tick to happen
      await new Promise((res) => setTimeout(res, 0));

      // must sill be Initializing since messages channel is not yet initialized
      expect(room.status.current).toBe(RoomLifecycle.Initializing);

      // this is the actual channel
      const channel = await (room.messages as unknown as { _channel: Promise<Ably.RealtimeChannel> })._channel;
      msgResolve(channel);

      // await for room to become initialized
      await (room as DefaultRoom).initializationStatus();

      expect(room.status.current).toBe(RoomLifecycle.Initialized);
      expect(context.realtime.channels.get).toHaveBeenCalledTimes(1); // once, only for messages (others are disabled)
    });
  });

  it<TestContext>('should not initialize any features if release called before initAfter resolved', async (context) => {
    const initAfter = new Promise<void>(() => {});

    vi.spyOn(context.realtime.channels, 'get');

    const room = context.getRoom(defaultRoomOptions, initAfter);
    expect(room.status.current).toBe(RoomLifecycle.Initializing);

    // allow a tick to happen
    await new Promise((res) => setTimeout(res, 0));

    // expect no channel to be initialized yet
    expect(context.realtime.channels.get).not.toHaveBeenCalled();

    const initStatus = (room as DefaultRoom).initializationStatus();

    // release the room before it is initialized
    const releasePromise = (room as DefaultRoom).release();

    // expect the release promise to be the initAfter promise because
    // we're in the case where the "previous" room hasn't finished
    // releasing and the "next" room will still have to wait for it.
    expect(releasePromise === initAfter).toBe(true);

    expect(context.realtime.channels.get).not.toHaveBeenCalled();
    await expect(initStatus).rejects.toBeErrorInfoWithCode(40000);
    expect(room.status.current).toBe(RoomLifecycle.Released);
  });

  it<TestContext>('should finish full initialization if released called after features started initializing', async (context) => {
    let resolve = () => {};
    const initAfter = new Promise<void>((res) => {
      resolve = res;
    });

    vi.spyOn(context.realtime.channels, 'get');

    const room = context.getRoom({}, initAfter);
    expect(room.status.current).toBe(RoomLifecycle.Initializing);

    // record all status changes
    const statuses: string[] = [];
    room.status.onChange((status) => {
      statuses.push(status.current);
    });

    let msgResolve: (channel: Ably.RealtimeChannel) => void = () => void 0;
    const messagesChannelPromise = new Promise<Ably.RealtimeChannel>((res) => {
      msgResolve = res;
    });

    vi.spyOn(room.messages, 'channel', 'get').mockReturnValue(messagesChannelPromise);

    // allow a tick to happen
    await new Promise((res) => setTimeout(res, 0));

    // expect no channel to be initialized yet
    expect(context.realtime.channels.get).not.toHaveBeenCalled();

    resolve();

    // allow a tick to happen
    await new Promise((res) => setTimeout(res, 0));

    // must sill be initializing since messages channel is not yet initialized
    expect(room.status.current).toBe(RoomLifecycle.Initializing);
    const releasePromise = (room as DefaultRoom).release();

    // expect the release promise to be different than initAfter now, because
    // the room has already started initialization of features.
    expect(releasePromise !== initAfter).toBe(true);

    // this is the actual channel. this should get resolved because
    // initialization of channels must complete
    const channel = await (room.messages as unknown as { _channel: Promise<Ably.RealtimeChannel> })._channel;
    msgResolve(channel);

    await releasePromise;

    expect(statuses).toEqual([RoomLifecycle.Initialized, RoomLifecycle.Releasing, RoomLifecycle.Released]);
  });

  // ASYNC OPS SHOULD WAIT UNTIL AFTER INITIALIZATION FINISHED (attach and detach)

  // ASYNC OPS SHOULD FAIL IF RELEASED BEFORE INITIALIZATION FINISHED (attach and detach)
});

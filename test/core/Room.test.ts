import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatApi } from '../../src/core/ChatApi.ts';
import { DefaultRoom, Room } from '../../src/core/Room.ts';
import { RoomOptions, RoomOptionsDefaults } from '../../src/core/RoomOptions.ts';
import { DefaultTyping } from '../../src/core/Typing.ts';
import { randomRoomId } from '../helper/identifier.ts';
import { makeTestLogger } from '../helper/logger.ts';
import { ablyRealtimeClient } from '../helper/realtimeClient.ts';
import { defaultRoomOptions } from '../helper/room.ts';

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
    context.getRoom = (options: RoomOptions) => {
      return new DefaultRoom(randomRoomId(), options, context.realtime, chatApi, logger);
    };
  });

  describe.each([
    ['presence', (room: Room) => room.presence],
    ['occupancy', (room: Room) => room.occupancy],
    ['typing', (room: Room) => room.typing],
    ['reactions', (room: Room) => room.reactions],
  ])('feature not configured', (description: string, featureLoader: (room: Room) => unknown) => {
    it<TestContext>(`should throw error if trying to access ${description} without being enabled`, async (context) => {
      const room = context.getRoom({});
      await expect(async () => {
        featureLoader(room);
        return Promise.resolve();
      }).rejects.toBeErrorInfoWithCode(40000);
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
    it<TestContext>(`should throw an error when passed invalid options: ${description}`, async (context) => {
      await expect(async () => {
        context.getRoom(options);
        return Promise.resolve();
      }).rejects.toBeErrorInfo({
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

      // Setup spies on the realtime client and the room lifecycle manager
      vi.spyOn(context.realtime.channels, 'release');
      vi.spyOn(room.lifecycleManager, 'release');

      // Release the room
      await room.release();

      // The room lifecycle manager should have been released
      expect(room.lifecycleManager.release).toHaveBeenCalledTimes(1);

      // Every underlying feature channel should have been released
      expect(context.realtime.channels.release).toHaveBeenCalledTimes(5);
      expect(context.realtime.channels.release).toHaveBeenCalledWith(room.messages.channel.name);
      expect(context.realtime.channels.release).toHaveBeenCalledWith(room.presence.channel.name);
      expect(context.realtime.channels.release).toHaveBeenCalledWith(room.typing.channel.name);
      expect(context.realtime.channels.release).toHaveBeenCalledWith(room.reactions.channel.name);
      expect(context.realtime.channels.release).toHaveBeenCalledWith(room.occupancy.channel.name);
    });

    it<TestContext>('should only release with enabled features', async (context) => {
      const room = context.getRoom({ typing: RoomOptionsDefaults.typing }) as DefaultRoom;

      // Setup spies on the realtime client and the room lifecycle manager
      vi.spyOn(context.realtime.channels, 'release');
      vi.spyOn(room.lifecycleManager, 'release');

      // Release the room
      await room.release();

      // The room lifecycle manager should have been released
      expect(room.lifecycleManager.release).toHaveBeenCalledTimes(1);

      // Every underlying feature channel should have been released
      expect(context.realtime.channels.release).toHaveBeenCalledTimes(2);
      expect(context.realtime.channels.release).toHaveBeenCalledWith(room.messages.channel.name);
      expect(context.realtime.channels.release).toHaveBeenCalledWith(room.typing.channel.name);
    });

    it<TestContext>('releasing multiple times is idempotent', async (context) => {
      const room = context.getRoom(defaultRoomOptions) as DefaultRoom;

      // Setup spies on the realtime client and the room lifecycle manager
      vi.spyOn(context.realtime.channels, 'release');
      vi.spyOn(room.lifecycleManager, 'release');
      // Setup spies on the realtime client
      vi.spyOn(context.realtime.channels, 'release');

      // Release the room
      await room.release();
      await room.release();
      await room.release();

      // Every underlying feature channel should have been released
      expect(context.realtime.channels.release).toHaveBeenCalledTimes(5);

      // The room lifecycle manager should have been released only once
      expect(room.lifecycleManager.release).toHaveBeenCalledTimes(1);
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatApi } from '../src/ChatApi.ts';
import { normaliseClientOptions } from '../src/config.ts';
import { DefaultRoom, Room } from '../src/Room.ts';
import {
  DefaultOccupancyOptions,
  DefaultPresenceOptions,
  DefaultReactionsOptions,
  DefaultTypingOptions,
  RoomOptions,
} from '../src/RoomOptions.ts';
import { DefaultTyping } from '../src/Typing.ts';
import { randomRoomId } from './helper/identifier.ts';
import { makeTestLogger } from './helper/logger.ts';
import { ablyRealtimeClient } from './helper/realtimeClient.ts';

vi.mock('ably');

interface TestContext {
  getRoom: (options: RoomOptions) => Room;
}

describe('Room', () => {
  beforeEach<TestContext>((context) => {
    const realtime = ablyRealtimeClient();
    const logger = makeTestLogger();
    const chatApi = new ChatApi(realtime, logger);
    context.getRoom = (options: RoomOptions) => {
      return new DefaultRoom(randomRoomId(), options, realtime, chatApi, normaliseClientOptions({}), logger);
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
    ['presence', { presence: DefaultPresenceOptions }, (room: Room) => room.presence],
    ['occupancy', { occupancy: DefaultOccupancyOptions }, (room: Room) => room.occupancy],
    ['typing', { typing: DefaultTypingOptions }, (room: Room) => room.typing],
    ['reactions', { reactions: DefaultReactionsOptions }, (room: Room) => room.reactions],
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
});

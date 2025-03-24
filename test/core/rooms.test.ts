import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { normalizeClientOptions } from '../../src/core/config.ts';
import { DefaultRooms, Rooms } from '../../src/core/rooms.ts';
import { ErrorCodes } from '../../src/index.ts';
import { randomRoomId } from '../helper/identifier.ts';
import { makeTestLogger } from '../helper/logger.ts';
import { ablyRealtimeClient } from '../helper/realtime-client.ts';

vi.mock('ably');

interface TestContext {
  realtime: Ably.Realtime;
  rooms: Rooms;
}

describe('rooms', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = ablyRealtimeClient();
    const logger = makeTestLogger();
    context.rooms = new DefaultRooms(context.realtime, normalizeClientOptions({}), logger);
  });

  describe('room get', () => {
    it<TestContext>('throws error if room with same ID but different options already exists', async (context) => {
      const roomId = randomRoomId();
      const room1 = context.rooms.get(roomId);
      const room2 = context.rooms.get(roomId, { typing: {} });
      await expect(room1).resolves.toBeDefined();
      await expect(room2).rejects.toBeErrorInfo({
        statusCode: 400,
        code: 40000,
        message: 'room already exists with different options',
      });
    });

    it<TestContext>('returns a fresh room instance if room does not exist', async (context) => {
      const roomId = randomRoomId();
      const room = context.rooms.get(roomId);
      await expect(room).resolves.toBeDefined();
    });

    it<TestContext>('returns the same room instance if room already exists', async (context) => {
      const roomId = randomRoomId();
      const room1 = await context.rooms.get(roomId);
      const room2 = await context.rooms.get(roomId);
      expect(room1).toBe(room2);
    });
  });

  describe('room get-release lifecycle', () => {
    it<TestContext>('should return a the same room if rooms.get called twice', async (context) => {
      const roomId = randomRoomId();
      const room1 = await context.rooms.get(roomId);
      const room2 = await context.rooms.get(roomId);
      expect(room1).toBe(room2);
    });

    it<TestContext>('should return a fresh room in room.get if previous one is currently releasing', (context) => {
      const roomId = randomRoomId();
      const room1 = context.rooms.get(roomId);
      void context.rooms.release(roomId);
      const room2 = context.rooms.get(roomId);
      expect(room1).not.toBe(room2);
    });

    it<TestContext>('releasing a room should abort any get operations', async (context) => {
      const roomId = randomRoomId();
      const room1 = context.rooms.get(roomId);
      const releasePromise1 = context.rooms.release(roomId);
      const room2 = context.rooms.get(roomId);
      const releasedPromise2 = context.rooms.release(roomId);

      await expect(releasePromise1).resolves.toBeUndefined();
      await expect(room1).resolves.toBeDefined();
      await expect(room2).rejects.toBeErrorInfo({
        statusCode: 400,
        code: ErrorCodes.RoomReleasedBeforeOperationCompleted,
        message: 'room released before get operation could complete',
      });
      await expect(releasedPromise2).resolves.toBeUndefined();
    });

    it<TestContext>('releasing a room should abort any get operations from previous get', async (context) => {
      const roomId = randomRoomId();
      const room1 = context.rooms.get(roomId);
      const releasePromise1 = context.rooms.release(roomId);
      const room2 = context.rooms.get(roomId);
      const releasedPromise2 = context.rooms.release(roomId);
      const room3 = context.rooms.get(roomId);
      const room4 = context.rooms.get(roomId);
      const releasePromise3 = context.rooms.release(roomId);
      const releasePromise4 = context.rooms.release(roomId);
      const finalRoom = context.rooms.get(roomId);

      await expect(room1).resolves.toBeDefined();
      await expect(releasePromise1).resolves.toBeUndefined();
      await expect(room2).rejects.toBeErrorInfo({
        statusCode: 400,
        code: ErrorCodes.RoomReleasedBeforeOperationCompleted,
        message: 'room released before get operation could complete',
      });
      await expect(releasedPromise2).resolves.toBeUndefined();
      await expect(room3).rejects.toBeErrorInfo({
        statusCode: 400,
        code: ErrorCodes.RoomReleasedBeforeOperationCompleted,
        message: 'room released before get operation could complete',
      });
      await expect(room4).rejects.toBeErrorInfo({
        statusCode: 400,
        code: ErrorCodes.RoomReleasedBeforeOperationCompleted,
        message: 'room released before get operation could complete',
      });
      await expect(releasePromise3).resolves.toBeUndefined();
      await expect(releasePromise4).resolves.toBeUndefined();
      await expect(finalRoom).resolves.toBeDefined();

      const initialRoom = await room1;
      const finalRoomInstance = await finalRoom;
      expect(initialRoom).not.toBe(finalRoomInstance);
    });

    it<TestContext>('multiple gets on a releasing room return the same room instance', async (context) => {
      const roomId = randomRoomId();
      const room1 = context.rooms.get(roomId);
      const releasePromise1 = context.rooms.release(roomId);
      const room2 = context.rooms.get(roomId);
      const room3 = context.rooms.get(roomId);
      const room4 = context.rooms.get(roomId);

      await expect(room1).resolves.toBeDefined();
      await expect(releasePromise1).resolves.toBeUndefined();

      const resolvedRoom2 = await room2;
      const resolvedRoom3 = await room3;
      const resolvedRoom4 = await room4;

      expect(resolvedRoom2).toBe(resolvedRoom3);
      expect(resolvedRoom2).toBe(resolvedRoom4);
    });

    it<TestContext>('no-ops if releasing room that does not exist', async (context) => {
      const roomId = randomRoomId();
      const releasePromise = context.rooms.release(roomId);
      await expect(releasePromise).resolves.toBeUndefined();
    });
  });

  describe('client options', () => {
    it<TestContext>('returns the client options', (context) => {
      const clientOptions = context.rooms.clientOptions;
      expect(clientOptions).toEqual(normalizeClientOptions({}));
    });
  });
});

import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { normalizeClientOptions } from '../../src/core/config.ts';
import { DefaultRoom } from '../../src/core/room.ts';
import { RoomOptions } from '../../src/core/room-options.ts';
import { DefaultRooms, Rooms } from '../../src/core/rooms.ts';
import { randomRoomId } from '../helper/identifier.ts';
import { makeTestLogger } from '../helper/logger.ts';
import { ablyRealtimeClient } from '../helper/realtime-client.ts';
import { defaultRoomOptions } from '../helper/room.ts';

vi.mock('ably');

interface TestContext {
  realtime: Ably.Realtime;
  rooms: Rooms;
}

describe('Room', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = ablyRealtimeClient();
    const logger = makeTestLogger();
    context.rooms = new DefaultRooms(context.realtime, normalizeClientOptions({}), logger);
  });

  describe('room get-release lifecycle', () => {
    it<TestContext>('should return a the same room if rooms.get called twice', (context) => {
      const roomId = randomRoomId();
      const roomOptions: RoomOptions = defaultRoomOptions;
      const room1 = context.rooms.get(roomId, roomOptions);
      const room2 = context.rooms.get(roomId, roomOptions);
      expect(room1 === room2).toBeTruthy();
    });

    it<TestContext>('should return a fresh room in room.get if previous one is currently releasing', (context) => {
      const roomId = randomRoomId();
      const roomOptions: RoomOptions = defaultRoomOptions;
      const room1 = context.rooms.get(roomId, roomOptions);
      void context.rooms.release(roomId);
      const room2 = context.rooms.get(roomId, roomOptions);
      expect(room1 === room2).not.toBeTruthy();
    });

    it<TestContext>('should correctly forward releasing promises to new room instances', async (context) => {
      const roomId = randomRoomId();
      const roomOptions: RoomOptions = defaultRoomOptions;
      const room1 = context.rooms.get(roomId, roomOptions);

      let resolveReleasePromise: () => void = () => void 0;
      const releasePromise = new Promise<void>((resolve) => {
        resolveReleasePromise = resolve;
      });

      vi.spyOn(room1 as DefaultRoom, 'release').mockImplementationOnce(() => {
        return releasePromise;
      });

      const room2 = context.rooms.get(roomId, roomOptions);

      // this should forward the previous room's release() promise
      const secondReleasePromise = (room2 as DefaultRoom).release();

      // test that when we resolve the first promise the second one gets resolved
      let secondReleasePromiseResolved = false;
      void secondReleasePromise.then(() => {
        secondReleasePromiseResolved = true;
      });

      // make sure second one doesn't just get resolved by itself
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(secondReleasePromiseResolved).toBeFalsy();

      // resolve first, wait for second
      resolveReleasePromise();
      await secondReleasePromise;
      expect(secondReleasePromiseResolved).toBeTruthy();
    });
  });
});

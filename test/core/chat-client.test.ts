import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatClient } from '../../src/core/chat-client.ts';
import { InternalConnection } from '../../src/core/connection.ts';
import { randomRoomName } from '../helper/identifier.ts';
import { ablyRealtimeClient } from '../helper/realtime-client.ts';
import { expectRoomsCount } from '../helper/room.ts';

vi.mock('ably');

interface TestContext {
  realtime: Ably.Realtime;
  chat: ChatClient;
}

describe('ChatClient', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = ablyRealtimeClient();
    context.chat = new ChatClient(context.realtime);
  });

  describe('dispose', () => {
    it<TestContext>('should dispose successfully and release all rooms automatically', async (context) => {
      // Get a room to add it to the rooms map
      const roomName = randomRoomName();
      await context.chat.rooms.get(roomName);

      // Verify room exists
      expectRoomsCount(context.chat.rooms, 1);

      // Mock the connection dispose method
      const mockConnectionDispose = vi.spyOn(context.chat.connection as InternalConnection, 'dispose');

      // Dispose should succeed and release rooms automatically
      await context.chat.dispose();

      // Should have called connection dispose
      expect(mockConnectionDispose).toHaveBeenCalledTimes(1);

      // Rooms should be released
      expectRoomsCount(context.chat.rooms, 0);
    });

    it<TestContext>('should dispose successfully when no rooms exist', async (context) => {
      // Mock the connection dispose method
      const mockConnectionDispose = vi.spyOn(context.chat.connection as InternalConnection, 'dispose');

      // Attempt to dispose
      await context.chat.dispose();

      // Should have called connection dispose
      expect(mockConnectionDispose).toHaveBeenCalledTimes(1);
    });

    it<TestContext>('should dispose successfully with multiple rooms', async (context) => {
      // Get multiple rooms to add them to the rooms map
      const roomName1 = randomRoomName();
      const roomName2 = randomRoomName();
      await context.chat.rooms.get(roomName1);
      await context.chat.rooms.get(roomName2);

      // Verify rooms exist
      expectRoomsCount(context.chat.rooms, 2);

      // Mock the connection dispose method
      const mockConnectionDispose = vi.spyOn(context.chat.connection as InternalConnection, 'dispose');

      // Dispose should succeed and release all rooms automatically
      await context.chat.dispose();

      // Should have called connection dispose
      expect(mockConnectionDispose).toHaveBeenCalledTimes(1);

      // All rooms should be released
      expectRoomsCount(context.chat.rooms, 0);
    });
  });
});

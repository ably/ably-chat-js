import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatClient } from '../../src/core/chat-client.ts';
import { randomRoomName } from '../helper/identifier.ts';
import { ablyRealtimeClient } from '../helper/realtime-client.ts';

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
      expect(context.chat.rooms.count).toBe(1);

      // Mock the connection dispose method
      const mockConnectionDispose = vi.spyOn(context.chat.connection, 'dispose');

      // Dispose should succeed and release rooms automatically
      await context.chat.dispose();

      // Should have called connection dispose
      expect(mockConnectionDispose).toHaveBeenCalledTimes(1);

      // Rooms should be released
      expect(context.chat.rooms.count).toBe(0);
    });

    it<TestContext>('should dispose successfully when no rooms exist', async (context) => {
      // Mock the connection dispose method
      const mockConnectionDispose = vi.spyOn(context.chat.connection, 'dispose');

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
      expect(context.chat.rooms.count).toBe(2);

      // Mock the connection dispose method
      const mockConnectionDispose = vi.spyOn(context.chat.connection, 'dispose');

      // Dispose should succeed and release all rooms automatically
      await context.chat.dispose();

      // Should have called connection dispose
      expect(mockConnectionDispose).toHaveBeenCalledTimes(1);

      // All rooms should be released
      expect(context.chat.rooms.count).toBe(0);
    });
  });
});

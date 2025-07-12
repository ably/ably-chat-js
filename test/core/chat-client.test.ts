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
    it<TestContext>('should return ErrorInfo if rooms exist in the map', async (context) => {
      // Get a room to add it to the rooms map
      const roomName = randomRoomName();
      await context.chat.rooms.get(roomName);

      // Attempt to dispose
      expect(() => {
        context.chat.dispose();
      }).toThrowErrorInfo({
        code: 40000,
        message: 'cannot dispose client; rooms still exist, please release all rooms before disposing',
        statusCode: 400,
      });
    });

    it<TestContext>('should dispose successfully when no rooms exist', (context) => {
      // Mock the connection dispose method
      const mockConnectionDispose = vi.spyOn(context.chat.connection, 'dispose');

      // Attempt to dispose
      context.chat.dispose();

      // Should have called connection dispose
      expect(mockConnectionDispose).toHaveBeenCalledTimes(1);
    });

    it<TestContext>('should dispose successfully after all rooms are released', async (context) => {
      // Get a room to add it to the rooms map
      const roomName = randomRoomName();
      await context.chat.rooms.get(roomName);

      // Verify dispose fails with rooms present
      expect(() => {
        context.chat.dispose();
      }).toThrowErrorInfo({
        code: 40000,
        message: 'cannot dispose client; rooms still exist, please release all rooms before disposing',
        statusCode: 400,
      });

      // Release the room
      await context.chat.rooms.release(roomName);

      // Mock the connection dispose method
      const mockConnectionDispose = vi.spyOn(context.chat.connection, 'dispose');

      // Now dispose should succeed
      context.chat.dispose();
      expect(mockConnectionDispose).toHaveBeenCalledTimes(1);
    });
  });
});

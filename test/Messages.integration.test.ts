import { beforeEach, describe, it, expect } from 'vitest';
import { ablyRealtimeClientWithToken, defaultTestClientId } from './helper/realtimeClient.ts';
import { Chat } from '../src/Chat.ts';
import { Message } from '../src/entities.ts';

interface TestContext {
  chat: Chat;
}

const waitForMessages = (messages: Message[], expectedCount: number) => {
  return new Promise<void>((resolve, reject) => {
    const interval = setInterval(() => {
      if (messages.length === expectedCount) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
    setTimeout(() => {
      clearInterval(interval);
      reject(new Error('Timed out waiting for messages'));
    }, 3000);
  });
};

describe('integration', () => {
  beforeEach<TestContext>((context) => {
    context.chat = new Chat(ablyRealtimeClientWithToken());
  });

  describe('publish message', () => {
    it<TestContext>('should be able to send and receive chat messages', async (context) => {
      const { chat } = context;

      const roomName = Math.random().toString(36).substring(7);
      const room = chat.rooms.get(roomName);

      // Subscribe to messages and add them to a list when they arive
      const messages: Message[] = [];
      await room.messages.subscribe((messageEvent) => {
        messages.push(messageEvent.message);
      });

      const message1 = await room.messages.send('Hello there!');
      const message2 = await room.messages.send('I have the high ground!');

      // Wait up to 5 seconds for the messagesPromise to resolve
      await waitForMessages(messages, 2);

      // Check that the messages were received
      expect(messages).toEqual([
        expect.objectContaining({
          content: 'Hello there!',
          createdBy: defaultTestClientId,
          timeserial: message1.timeserial,
        }),
        expect.objectContaining({
          content: 'I have the high ground!',
          createdBy: defaultTestClientId,
          timeserial: message2.timeserial,
        }),
      ]);
    });
  });
});

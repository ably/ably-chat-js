import { beforeEach, describe, vi, it, expect } from 'vitest';
import * as Ably from 'ably';
import { ChatApi } from './ChatApi.js';
import { Room } from './Room.js';
import { MessageEvents } from './events.js';

interface TestContext {
  realtime: Ably.Realtime;
  chatApi: ChatApi;
  emulateBackendPublish: Ably.messageCallback<Partial<Ably.Message>>;
}

vi.mock('ably');

describe('Messages', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = new Ably.Realtime({ clientId: 'clientId', key: 'key' });
    context.chatApi = new ChatApi(context.realtime);

    const channel = context.realtime.channels.get('roomId');
    const listeners: Ably.messageCallback<Ably.Message>[] = [];
    vi.spyOn(channel, 'subscribe').mockImplementation(
      // @ts-ignore
      async (
        nameOrListener: string | Ably.messageCallback<Ably.Message>,
        listener: Ably.messageCallback<Ably.Message>,
      ) => {
        if (typeof nameOrListener === 'string') {
          listeners.push(listener);
        } else {
          listeners.push(nameOrListener);
        }
        // @ts-ignore
        context.emulateBackendPublish = (msg) => {
          listeners.forEach((listener) => listener(msg));
        };
      },
    );
  });

  describe('sending message', () => {
    it<TestContext>('should be able to send message and get it back from response', async (context) => {
      const { chatApi, realtime } = context;
      const timestamp = new Date().getTime();
      vi.spyOn(chatApi, 'sendMessage').mockResolvedValue({
        timeserial: 'abcdefghij@1672531200000-123',
        createdAt: timestamp,
      });

      const room = new Room('coffee-room-chat', realtime, chatApi);
      const messagePromise = room.messages.send('hello there');

      const message = await messagePromise;

      expect(message).toEqual(
        expect.objectContaining({
          id: 'abcdefghij@1672531200000-123',
          content: 'hello there',
          created_by: 'clientId',
          created_at: timestamp,
          room_id: 'coffee-room-chat',
        }),
      );
    });
  });

  describe('subscribing to updates', () => {
    it<TestContext>('subscribing to messages should work live', (context) =>
      new Promise<void>((done, reject) => {
        const publishTimestamp = new Date().getTime();
        const { chatApi, realtime } = context;
        const room = new Room('sw', realtime, chatApi);
        room.messages
          .subscribe(MessageEvents.created, (rawMsg) => {
            const message = rawMsg.message;
            try {
              expect(message).toEqual(
                expect.objectContaining({
                  id: 'abcdefg',
                  content: 'may the fourth be with you',
                  created_by: 'yoda',
                  created_at: publishTimestamp,
                  room_id: 'sw',
                }),
              );
            } catch (err) {
              reject(err);
            }
            done();
          })
          .then(() => {
            context.emulateBackendPublish({
              clientId: 'yoda',
              name: 'message.created',
              data: 'may the fourth be with you',
              extras: {
                timeserial: 'abcdefg',
              },
              timestamp: publishTimestamp,
            });
          })
          .catch((err) => {
            reject(err);
          });
      }));
  });
});

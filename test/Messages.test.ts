import { beforeEach, describe, vi, it, expect } from 'vitest';
import * as Ably from 'ably';
import { ChatApi } from '../src/ChatApi.js';
import { Room } from '../src/Room.js';
import { MessageEvents } from '../src/events.js';

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
          timeserial: 'abcdefghij@1672531200000-123',
          content: 'hello there',
          createdBy: 'clientId',
          createdAt: timestamp,
          roomId: 'coffee-room-chat',
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
                  timeserial: 'abcdefg',
                  content: 'may the fourth be with you',
                  createdBy: 'yoda',
                  createdAt: publishTimestamp,
                  roomId: 'sw',
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

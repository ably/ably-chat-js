import { beforeEach, describe, vi, it, expect } from 'vitest';
import * as Ably from 'ably';
import { ChatApi } from '../src/ChatApi.js';
import { Room } from '../src/Room.js';
import { MessageEvents } from '../src/events.js';
import { randomRoomId } from './helper/identifier.js';

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

      const room = new Room('coffee-room-chat', realtime, chatApi, { typingTimeoutMs: 300 });
      const messagePromise = room.messages.send('hello there');

      const message = await messagePromise;

      expect(message).toEqual(
        expect.objectContaining({
          timeserial: 'abcdefghij@1672531200000-123',
          content: 'hello there',
          clientId: 'clientId',
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
        const roomId = randomRoomId();
        const room = new Room(roomId, realtime, chatApi, { typingTimeoutMs: 300 });
        room.messages
          .subscribe(MessageEvents.created, (rawMsg) => {
            const message = rawMsg.message;
            try {
              expect(message).toEqual(
                expect.objectContaining({
                  timeserial: 'abcdefghij@1672531200000-123',
                  content: 'may the fourth be with you',
                  clientId: 'yoda',
                  createdAt: publishTimestamp,
                  roomId: roomId,
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
              data: {
                content: 'may the fourth be with you',
              },
              extras: {
                timeserial: 'abcdefghij@1672531200000-123',
              },
              timestamp: publishTimestamp,
            });
          })
          .catch((err) => {
            reject(err);
          });
      }));
  });

  it<TestContext>('should raise an error if no data provided with incoming message', (context) =>
    new Promise<void>((done, reject) => {
      const publishTimestamp = new Date().getTime();
      const { chatApi, realtime } = context;
      const roomId = randomRoomId();
      const room = new Room(roomId, realtime, chatApi, { typingTimeoutMs: 300 });
      room.messages
        .subscribe(MessageEvents.created, () => {
          reject(new Error('should not have received message without data'));
        })
        .then(() => {
          context.emulateBackendPublish({
            clientId: 'yoda',
            name: 'message.created',
            extras: {
              timeserial: 'abcdefghij@1672531200000-123',
            },
            timestamp: publishTimestamp,
          });
        })
        .catch((error: Ably.ErrorInfo) => {
          if (error.message === 'received message without data') {
            done();
          }

          reject(`received incorrect error for message: ${error.message}`);
        });
    }));

  it<TestContext>('should raise an error if no clientId provided with incoming message', (context) =>
    new Promise<void>((done, reject) => {
      const publishTimestamp = new Date().getTime();
      const { chatApi, realtime } = context;
      const roomId = randomRoomId();
      const room = new Room(roomId, realtime, chatApi, { typingTimeoutMs: 300 });
      room.messages
        .subscribe(MessageEvents.created, () => {
          reject(new Error('should not have received message without clientId'));
        })
        .then(() => {
          context.emulateBackendPublish({
            name: 'message.created',
            data: {
              content: 'may the fourth be with you',
            },
            extras: {
              timeserial: 'abcdefghij@1672531200000-123',
            },
            timestamp: publishTimestamp,
          });
        })
        .catch((error: Ably.ErrorInfo) => {
          if (error.message === 'received message without clientId') {
            done();
          }

          reject(`received incorrect error for message: ${error.message}`);
        });
    }));

  it<TestContext>('should raise an error if no extras provided with incoming message', (context) =>
    new Promise<void>((done, reject) => {
      const publishTimestamp = new Date().getTime();
      const { chatApi, realtime } = context;
      const roomId = randomRoomId();
      const room = new Room(roomId, realtime, chatApi, { typingTimeoutMs: 300 });
      room.messages
        .subscribe(MessageEvents.created, () => {
          reject(new Error('should not have received message without extras'));
        })
        .then(() => {
          context.emulateBackendPublish({
            name: 'message.created',
            clientId: 'abc',
            data: {
              content: 'may the fourth be with you',
            },
            timestamp: publishTimestamp,
          });
        })
        .catch((error: Ably.ErrorInfo) => {
          if (error.message === 'received message without extras') {
            done();
          }

          reject(`received incorrect error for message: ${error.message}`);
        });
    }));

  it<TestContext>('should raise an error if no timeserial provided with incoming message', (context) =>
    new Promise<void>((done, reject) => {
      const publishTimestamp = new Date().getTime();
      const { chatApi, realtime } = context;
      const roomId = randomRoomId();
      const room = new Room(roomId, realtime, chatApi, { typingTimeoutMs: 300 });
      room.messages
        .subscribe(MessageEvents.created, () => {
          reject(new Error('should not have received message without clientId'));
        })
        .then(() => {
          context.emulateBackendPublish({
            name: 'message.created',
            clientId: 'abc',
            data: {
              content: 'may the fourth be with you',
            },
            extras: {},
            timestamp: publishTimestamp,
          });
        })
        .catch((error: Ably.ErrorInfo) => {
          if (error.message === 'received message without timeserial') {
            done();
          }

          reject(`received incorrect error for message: ${error.message}`);
        });
    }));

  it<TestContext>('should raise an error if no content in incoming message', (context) =>
    new Promise<void>((done, reject) => {
      const publishTimestamp = new Date().getTime();
      const { chatApi, realtime } = context;
      const roomId = randomRoomId();
      const room = new Room(roomId, realtime, chatApi, { typingTimeoutMs: 300 });
      room.messages
        .subscribe(MessageEvents.created, () => {
          reject(new Error('should not have received message without content'));
        })
        .then(() => {
          context.emulateBackendPublish({
            name: 'message.created',
            clientId: 'abc',
            data: {},
            extras: {
              timeserial: 'abcdefghij@1672531200000-123',
            },
            timestamp: publishTimestamp,
          });
        })
        .catch((error: Ably.ErrorInfo) => {
          if (error.message === 'received message without content') {
            done();
          }

          reject(`received incorrect error for message: ${error.message}`);
        });
    }));

  it<TestContext>('should raise an error if no timestamp provided with incoming message', (context) =>
    new Promise<void>((done, reject) => {
      const { chatApi, realtime } = context;
      const roomId = randomRoomId();
      const room = new Room(roomId, realtime, chatApi, { typingTimeoutMs: 300 });
      room.messages
        .subscribe(MessageEvents.created, () => {
          reject(new Error('should not have received message without timestamp'));
        })
        .then(() => {
          context.emulateBackendPublish({
            name: 'message.created',
            clientId: 'abc',
            data: {
              content: 'may the fourth be with you',
            },
            extras: {
              timeserial: 'abcdefghij@1672531200000-123',
            },
          });
        })
        .catch((error: Ably.ErrorInfo) => {
          if (error.message === 'received message without timestamp') {
            done();
          }

          reject(`received incorrect error for message: ${error.message}`);
        });
    }));
});

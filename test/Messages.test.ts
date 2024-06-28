import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatApi } from '../src/ChatApi.js';
import { normaliseClientOptions } from '../src/config.js';
import { MessageEvents } from '../src/events.js';
import { DefaultRoom } from '../src/Room.js';
import { randomRoomId } from './helper/identifier.js';
import { makeTestLogger } from './helper/logger.js';
import { testClientOptions } from './helper/options.js';

interface TestContext {
  realtime: Ably.Realtime;
  chatApi: ChatApi;
  emulateBackendPublish: Ably.messageCallback<Partial<Ably.InboundMessage>>;
  channelLevelListeners: Map<Ably.messageCallback<Ably.Message>, string[]>;
}

vi.mock('ably');

// Helper function to create a room
const makeRoom = (context: TestContext) =>
  new DefaultRoom(randomRoomId(), context.realtime, context.chatApi, testClientOptions(), makeTestLogger());

describe('Messages', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = new Ably.Realtime({ clientId: 'clientId', key: 'key' });
    context.channelLevelListeners = new Map<Ably.messageCallback<Ably.Message>, string[]>();
    context.chatApi = new ChatApi(context.realtime, makeTestLogger());

    const channel = context.realtime.channels.get('roomId');
    vi.spyOn(channel, 'subscribe').mockImplementation(
      // @ts-expect-error overriding mock
      async (
        eventsOrListeners: string[] | Ably.messageCallback<Ably.Message>,
        listener: Ably.messageCallback<Ably.Message>,
      ) => {
        if (Array.isArray(eventsOrListeners)) {
          expect(eventsOrListeners, 'array should only contain MessageEvents').toEqual(Object.values(MessageEvents));
          context.channelLevelListeners.set(listener, eventsOrListeners);
        } else {
          context.channelLevelListeners.set(listener, []);
        }
        context.emulateBackendPublish = (msg) => {
          context.channelLevelListeners.forEach((_, cb) => {
            cb(msg);
          });
        };

        return Promise.resolve();
      },
    );

    vi.spyOn(channel, 'unsubscribe').mockImplementation(
      // @ts-expect-error overriding mock
      (listener: Ably.messageCallback<Ably.Message>) => {
        context.channelLevelListeners.delete(listener);
      },
    );

    // Mock the attach
    vi.spyOn(channel, 'attach').mockImplementation(async () => {
      return Promise.resolve(null);
    });

    // Mock the detach
    vi.spyOn(channel, 'detach').mockImplementation(async () => {});
  });

  describe('sending message', () => {
    it<TestContext>('should be able to send message and get it back from response', async (context) => {
      const { chatApi, realtime } = context;
      const timestamp = new Date().getTime();
      vi.spyOn(chatApi, 'sendMessage').mockResolvedValue({
        timeserial: 'abcdefghij@1672531200000-123',
        createdAt: timestamp,
      });

      const room = new DefaultRoom(
        'coffee-room-chat',
        realtime,
        chatApi,
        normaliseClientOptions({ typingTimeoutMs: 300 }),
        makeTestLogger(),
      );
      const messagePromise = room.messages.send('hello there');

      const message = await messagePromise;

      expect(message).toEqual(
        expect.objectContaining({
          timeserial: 'abcdefghij@1672531200000-123',
          text: 'hello there',
          clientId: 'clientId',
          createdAt: new Date(timestamp),
          roomId: 'coffee-room-chat',
        }),
      );
    });
  });

  describe('subscribing to updates', () => {
    it<TestContext>('subscribing to messages should work live', (context) =>
      new Promise<void>((done, reject) => {
        const publishTimestamp = new Date().getTime();
        const room = makeRoom(context);
        room.messages
          .subscribe((rawMsg) => {
            const message = rawMsg.message;
            try {
              expect(message).toEqual(
                expect.objectContaining({
                  timeserial: 'abcdefghij@1672531200000-123',
                  text: 'may the fourth be with you',
                  clientId: 'yoda',
                  createdAt: new Date(publishTimestamp),
                  roomId: room.roomId,
                }),
              );
            } catch (err: unknown) {
              reject(err as Error);
            }
            done();
          })
          .then(() => {
            context.emulateBackendPublish({
              clientId: 'yoda',
              name: 'message.created',
              data: {
                text: 'may the fourth be with you',
              },
              extras: {
                timeserial: 'abcdefghij@1672531200000-123',
              },
              timestamp: publishTimestamp,
            });
          })
          .catch((err: unknown) => {
            reject(err as Error);
          });
      }));
  });

  it<TestContext>('attach its internal listener according to subscriptions', async (context) => {
    const { channelLevelListeners } = context;

    const room = makeRoom(context);
    const listener1 = () => {};
    const listener2 = () => {};

    // First listener added, internal listener should be registered
    await room.messages.subscribe(listener1);
    expect(channelLevelListeners).toHaveLength(1);
    expect(channelLevelListeners.values().next().value).toEqual(['message.created']);

    // A second listener added, internal listener should still be registered but not added again
    await room.messages.subscribe(listener2);
    expect(channelLevelListeners).toHaveLength(1);
    expect(channelLevelListeners.values().next().value).toEqual(['message.created']);

    // First listener removed, internal listener should still be registered
    await room.messages.unsubscribe(listener1);
    expect(channelLevelListeners).toHaveLength(1);
    expect(channelLevelListeners.values().next().value).toEqual(['message.created']);

    // Second listener removed, internal listener should be removed
    await room.messages.unsubscribe(listener2);
    expect(channelLevelListeners).toHaveLength(0);
  });

  it<TestContext>('should raise an error if no data provided with incoming message', (context) =>
    new Promise<void>((done, reject) => {
      const publishTimestamp = new Date().getTime();
      const room = makeRoom(context);
      room.messages
        .subscribe(() => {
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
        .then(() => {
          done();
        })
        .catch((error: unknown) => {
          reject(error as Error);
        });
    }));

  it<TestContext>('should raise an error if no clientId provided with incoming message', (context) =>
    new Promise<void>((done, reject) => {
      const publishTimestamp = new Date().getTime();
      const room = makeRoom(context);
      room.messages
        .subscribe(() => {
          reject(new Error('should not have received message without clientId'));
        })
        .then(() => {
          context.emulateBackendPublish({
            name: 'message.created',
            data: {
              text: 'may the fourth be with you',
            },
            extras: {
              timeserial: 'abcdefghij@1672531200000-123',
            },
            timestamp: publishTimestamp,
          });
        })
        .then(() => {
          done();
        })
        .catch((error: unknown) => {
          reject(error as Error);
        });
    }));

  it<TestContext>('should raise an error if no extras provided with incoming message', (context) =>
    new Promise<void>((done, reject) => {
      const publishTimestamp = new Date().getTime();
      const room = makeRoom(context);
      room.messages
        .subscribe(() => {
          reject(new Error('should not have received message without extras'));
        })
        .then(() => {
          context.emulateBackendPublish({
            name: 'message.created',
            clientId: 'abc',
            data: {
              text: 'may the fourth be with you',
            },
            timestamp: publishTimestamp,
          });
        })
        .then(() => {
          done();
        })
        .catch((error: unknown) => {
          reject(error as Error);
        });
    }));

  it<TestContext>('should raise an error if no timeserial provided with incoming message', (context) =>
    new Promise<void>((done, reject) => {
      const publishTimestamp = new Date().getTime();
      const room = makeRoom(context);
      room.messages
        .subscribe(() => {
          reject(new Error('should not have received message without clientId'));
        })
        .then(() => {
          context.emulateBackendPublish({
            name: 'message.created',
            clientId: 'abc',
            data: {
              text: 'may the fourth be with you',
            },
            extras: {},
            timestamp: publishTimestamp,
          });
        })
        .then(() => {
          done();
        })
        .catch((error: unknown) => {
          reject(error as Error);
        });
    }));

  it<TestContext>('should raise an error if no text in incoming message', (context) =>
    new Promise<void>((done, reject) => {
      const publishTimestamp = new Date().getTime();
      const room = makeRoom(context);
      room.messages
        .subscribe(() => {
          reject(new Error('should not have received message without text'));
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
        .then(() => {
          done();
        })
        .catch((error: unknown) => {
          reject(error as Error);
        });
    }));

  it<TestContext>('should raise an error if no timestamp provided with incoming message', (context) =>
    new Promise<void>((done, reject) => {
      const room = makeRoom(context);
      room.messages
        .subscribe(() => {
          reject(new Error('should not have received message without timestamp'));
        })
        .then(() => {
          context.emulateBackendPublish({
            name: 'message.created',
            clientId: 'abc',
            data: {
              text: 'may the fourth be with you',
            },
            extras: {
              timeserial: 'abcdefghij@1672531200000-123',
            },
          });
        })
        .then(() => {
          done();
        })
        .catch((error: unknown) => {
          reject(error as Error);
        });
    }));
});

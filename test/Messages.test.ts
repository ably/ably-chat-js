import * as Ably from 'ably';
import { ErrorInfo, RealtimeChannel } from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatApi, GetMessagesQueryParams } from '../src/ChatApi.js';
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
  emulateBackendStateChange: (event: string, cb: Ably.ChannelStateChange) => void;
  channelStateListeners: Map<string, Ably.channelEventCallback[]>;
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
    context.channelStateListeners = new Map<string, Ably.channelEventCallback[]>();

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

    vi.spyOn(channel, 'on').mockImplementation(
      // @ts-expect-error overriding mock
      (event: Ably.ChannelEvent, callback: Ably.channelEventCallback) => {
        if (!context.channelStateListeners.has(event)) {
          context.channelStateListeners.set(event, []);
        }
        // Add the callback to the list of listeners for this event
        context.channelStateListeners.get(event)?.push(callback);
        context.emulateBackendStateChange = (event, stateChange) => {
          context.channelStateListeners.get(event)?.forEach((cb) => {
            cb(stateChange);
          });
        };
      },
    );

    vi.spyOn(channel, 'unsubscribe').mockImplementation(
      // @ts-expect-error overriding mock
      (listener: Ably.messageCallback<Ably.Message>) => {
        context.channelLevelListeners.delete(listener);
      },
    );

    // Return a non-resolving promise for whenState as we aren't attached to the channel yet
    vi.spyOn(channel, 'whenState').mockImplementation(async () => {
      return new Promise(() => {});
    });

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
      const messagePromise = room.messages.send({ text: 'hello there' });

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

  describe('headers and metadata', () => {
    it<TestContext>('should be able to send message with headers and metadata and get it back from response', async (context) => {
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
      const messagePromise = room.messages.send({
        text: 'hello there',
        headers: { something: 'else', abc: 123, def: true, bla: null },
        metadata: { hello: { name: 'world', more: ['nested', true] }, 'meta-abc': 'abc', '123': 456, pi: 3.14 },
      });

      const message = await messagePromise;

      expect(message).toEqual(
        expect.objectContaining({
          timeserial: 'abcdefghij@1672531200000-123',
          text: 'hello there',
          clientId: 'clientId',
          createdAt: new Date(timestamp),
          roomId: 'coffee-room-chat',
          headers: {
            something: 'else',
            abc: 123,
            def: true,
            bla: null,
          },
          metadata: { hello: { name: 'world', more: ['nested', true] }, 'meta-abc': 'abc', '123': 456, pi: 3.14 },
        }),
      );
    });

    it<TestContext>('should be not be able to set reserved header prefix', (context) => {
      return new Promise<void>((accept, reject) => {
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

        const messagePromise = room.messages.send({
          text: 'hello there',
          headers: { 'ably-chat.you': 'shall not pass' },
        });

        messagePromise
          .then(() => {
            reject(new Error('message should have not been sent successfully'));
          })
          .catch((err: unknown) => {
            expect(err).toBeTruthy();
            expect((err as Error).message).toMatch(/reserved prefix/);
            accept();
          });
      });
    });

    it<TestContext>('should be not be able to set reserved metadata key', (context) => {
      return new Promise<void>((accept, reject) => {
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

        const messagePromise = room.messages.send({
          text: 'hello there',
          metadata: { 'ably-chat': 'shall not pass' },
        });

        messagePromise
          .then(() => {
            reject(new Error('message should have not been sent successfully'));
          })
          .catch((err: unknown) => {
            expect(err).toBeTruthy();
            expect((err as Error).message).toMatch(/reserved key/);
            accept();
          });
      });
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

  // Tests for getBeforeSubscriptionStart
  it<TestContext>('should throw an error for listener history if not subscribed', async (context) => {
    // Create a room instance
    const room = makeRoom(context);

    let caughtError: ErrorInfo | undefined;

    try {
      // Attempt to query message history before subscribing a listener
      await room.messages.getBeforeSubscriptionStart(() => {}, { limit: 50 });
    } catch (e: unknown) {
      // Expect an error to be thrown since no listener has been subscribed
      caughtError = e as ErrorInfo;
    }

    // Assert that an error was caught
    expect(caughtError).toBeDefined();
    expect(caughtError?.message).toEqual('cannot query history; listener has not been subscribed yet');
  });

  it<TestContext>('should query listener history with the attachment serial after attaching', async (context) => {
    const testAttachSerial = 'abcdefghij@1672531200000-123';
    const testRoomId = 'roomId';
    const testDirection = 'backwards';
    const testLimit = 50;

    // Mock the chat api call used by listener history query
    const mockChatApi = {
      getMessages: function (roomId: string, params: GetMessagesQueryParams): void {
        expect(roomId).toEqual(testRoomId);
        expect(params.direction).toEqual(testDirection);
        expect(params.limit).toEqual(testLimit);
        expect(params.fromSerial).toEqual(testAttachSerial);
      },
    } as unknown as ChatApi;

    // Create a room with the mock chat api so we can check query params
    const room = new DefaultRoom('roomId', context.realtime, mockChatApi, testClientOptions(), makeTestLogger());

    // Force ts to recognize the channel properties
    const channel = room.messages.channel as RealtimeChannel & {
      properties: {
        attachSerial: string | undefined;
      };
    };

    // Set the timeserial of the channel attach
    channel.properties.attachSerial = testAttachSerial;

    vi.spyOn(channel, 'whenState').mockImplementation(async () => {
      return Promise.resolve(null);
    });

    // Create a test listener
    const listener1 = () => {};

    // Subscribe to the messages
    await room.messages.subscribe(listener1);

    // Mock the channel state to be attached
    vi.spyOn(channel, 'state', 'get').mockReturnValue('attached');

    // Initiate an attach state change to resolve the listeners attach point
    context.emulateBackendStateChange('attached', {
      current: 'attached',
      previous: 'detached',
      resumed: false,
    });

    // Run a history query for the listener and check the chat api call is made with the channel attachment serial
    await room.messages.getBeforeSubscriptionStart(listener1, { limit: 50 });
  });

  it<TestContext>('should query listener history with latest channel serial if already attached to the channel', async (context) => {
    // We should use the latest channel serial if we are already attached to the channel
    const latestChannelSerial = 'abcdefghij@1672531200000-123';

    const testRoomId = 'roomId';
    const testDirection = 'backwards';
    const testLimit = 50;

    // Mock the chat api call used by listener history query, using latest channel serial
    const mockChatApi = {
      getMessages: function (roomId: string, params: GetMessagesQueryParams): void {
        expect(roomId).toEqual(testRoomId);
        expect(params.direction).toEqual(testDirection);
        expect(params.limit).toEqual(testLimit);
        expect(params.fromSerial).toEqual(latestChannelSerial);
      },
    } as unknown as ChatApi;

    // Create a room with the mock chat api
    const room = new DefaultRoom('roomId', context.realtime, mockChatApi, testClientOptions(), makeTestLogger());

    // Force ts to recognize the channel properties
    const channel = room.messages.channel as RealtimeChannel & {
      properties: {
        channelSerial: string | undefined;
      };
      state: Ably.ChannelState;
    };

    // Mock the channel state to be attached so we should query with the channel serial
    vi.spyOn(channel, 'state', 'get').mockReturnValue('attached');

    // Set the timeserial of the channel (attachment serial)
    channel.properties.channelSerial = latestChannelSerial;

    // Create a test listener
    const listener1 = () => {};

    // Subscribe the listener to messages
    await room.messages.subscribe(listener1);

    // Run a history query for the listener and check the chat api call is made with the channel timeserial
    await room.messages.getBeforeSubscriptionStart(listener1, { limit: 50 });
  });

  it<TestContext>('when attach occurs, should query with correct params if listener registered before attach', async (context) => {
    const firstAttachmentSerial = '108uyDJAgBOihn12345678@1772531200000-1';

    const testRoomId = 'roomId';
    const testDirection = 'backwards';
    const testLimit = 50;

    let expectFunction: (roomId: string, params: GetMessagesQueryParams) => void = () => {};

    // Mock the chat api call used by listener history query
    const mockChatApi = {
      getMessages: function (roomId: string, params: GetMessagesQueryParams): void {
        expectFunction(roomId, params);
      },
    } as unknown as ChatApi;

    // Create a room with the mock chat api
    const room = new DefaultRoom('roomId', context.realtime, mockChatApi, testClientOptions(), makeTestLogger());

    const channel = room.messages.channel as RealtimeChannel & {
      properties: {
        attachSerial: string | undefined;
        fromSerial: string | undefined;
      };
    };

    // Set the timeserials for before attachment testing
    channel.properties.attachSerial = firstAttachmentSerial;

    // Create a test listener
    const listenerBeforeAttach = () => {};

    // Subscribe to the messages, should receive the attachSerial
    await room.messages.subscribe(listenerBeforeAttach);

    // Mock the channel state to be attached
    vi.spyOn(channel, 'state', 'get').mockReturnValue('attached');

    // Initiate an attach state change to resolve the listeners attach point
    context.emulateBackendStateChange('attached', {
      current: 'attached',
      previous: 'detached',
      resumed: false,
    });

    // Check we are using the attachSerial
    expectFunction = (roomId: string, params: GetMessagesQueryParams) => {
      expect(roomId).toEqual(testRoomId);
      expect(params.direction).toEqual(testDirection);
      expect(params.limit).toEqual(testLimit);
      expect(params.fromSerial).toEqual(firstAttachmentSerial);
    };

    // Run a history query for the listener and check the chat api call is made with the channel attachment serial
    await room.messages.getBeforeSubscriptionStart(listenerBeforeAttach, { limit: 50 });

    // Now update the attach serial
    const secondAttachmentserial = '108hhDJ2dBOihn12345678@1992531200000-1';
    channel.properties.attachSerial = secondAttachmentserial;

    // Initiate a re-attach without resume, should cause all listener points to reset to new attach serial
    context.emulateBackendStateChange('attached', {
      current: 'detached',
      previous: 'attached',
      resumed: false,
    });

    // Check we are now using the new attachSerial
    expectFunction = (_: string, params: GetMessagesQueryParams) => {
      expect(params.fromSerial).toEqual(secondAttachmentserial);
    };

    // Run a history query for the listener and check the chat api call is made with the new attach serial
    await room.messages.getBeforeSubscriptionStart(listenerBeforeAttach, { limit: 50 });

    // Test the case where we receive an attached state change with resume.

    // Change attach serial again
    channel.properties.attachSerial = '108hhDJ2dBOihn12345678@1122531200000-1';

    // Initiate a re-attach this time with resume, should not cause listener points to reset to new attach serial
    context.emulateBackendStateChange('attached', {
      current: 'detached',
      previous: 'attached',
      resumed: true,
    });

    // Check we are using the previous attachSerial
    expectFunction = (_: string, params: GetMessagesQueryParams) => {
      expect(params.fromSerial).toEqual(secondAttachmentserial);
    };

    // Run a history query for the listener and check the chat api call is made with the previous attach serial
    await room.messages.getBeforeSubscriptionStart(listenerBeforeAttach, { limit: 50 });
  });

  it<TestContext>('when attach occurs, should query with correct params if listener register after attach', async (context) => {
    // Testing the case where the channel is already attached and we have a channel serial set
    const firstChannelSerial = 'abghhDJ2dBOihn12345678@1992531200000-1';
    const firstAttachSerial = 'ackhhDJ2dBOihn12345678@1992531200000-1';

    const testRoomId = 'roomId';
    const testDirection = 'backwards';
    const testLimit = 50;

    let expectFunction: (roomId: string, params: GetMessagesQueryParams) => void = () => {};

    // Mock the chat api call used by listener history query
    const mockChatApi = {
      getMessages: function (roomId: string, params: GetMessagesQueryParams): void {
        expectFunction(roomId, params);
      },
    } as unknown as ChatApi;

    // Create a room with the mock chat api
    const room = new DefaultRoom('roomId', context.realtime, mockChatApi, testClientOptions(), makeTestLogger());

    const channel = room.messages.channel as RealtimeChannel & {
      properties: {
        attachSerial: string | undefined;
        channelSerial: string | undefined;
      };
    };

    vi.spyOn(channel, 'whenState').mockImplementation(async () => {
      return Promise.resolve(null);
    });

    // Set the timeserials for the channel
    channel.properties.channelSerial = firstChannelSerial;
    channel.properties.attachSerial = firstAttachSerial;

    // Mock the channel state to be attached
    vi.spyOn(channel, 'state', 'get').mockReturnValue('attached');

    // Create a test listener
    const listenerAfterAttach = () => {};

    // Subscribe the listener to messages
    await room.messages.subscribe(listenerAfterAttach);

    // Check we are using the channel serial
    expectFunction = (roomId: string, params: GetMessagesQueryParams) => {
      expect(roomId).toEqual(testRoomId);
      expect(params.direction).toEqual(testDirection);
      expect(params.limit).toEqual(testLimit);
      expect(params.fromSerial).toEqual(firstChannelSerial);
    };

    // Run a history query for the listener and check the chat api call is made with the channel serial
    await room.messages.getBeforeSubscriptionStart(listenerAfterAttach, { limit: 50 });

    // Change the attach and channel serials
    const secondChannelSerial = '108hhDJ2hpOihn12345678@1992531200000-1';
    const secondAttachSerial = '108hGGJ2hpOill12345678@1992531200000-1';
    channel.properties.channelSerial = secondChannelSerial;
    channel.properties.attachSerial = secondAttachSerial;

    // Initiate a re-attach this time with resume, should not cause listener points to reset to new attach serial
    context.emulateBackendStateChange('attached', {
      current: 'attached',
      previous: 'attached',
      resumed: true,
    });

    // Check we are using the previous channel serial
    expectFunction = (_: string, params: GetMessagesQueryParams) => {
      expect(params.fromSerial).toEqual(firstChannelSerial);
    };

    // Run a history query for the listener and check the chat api call is made with the first channel serial
    await room.messages.getBeforeSubscriptionStart(listenerAfterAttach, { limit: 50 });

    // Initiate a re-attach this time without resume, should cause listener points to reset to new attach serial
    context.emulateBackendStateChange('attached', {
      current: 'attached',
      previous: 'attached',
      resumed: false,
    });

    // Check we are using the new attach serial
    expectFunction = (_: string, params: GetMessagesQueryParams) => {
      expect(params.fromSerial).toEqual(secondAttachSerial);
    };

    // Run a history query for the listener and check the chat api call is made with the attach serial
    await room.messages.getBeforeSubscriptionStart(listenerAfterAttach, { limit: 50 });
  });

  it<TestContext>('when update occurs, should query with correct params', async (context) => {
    // We have tested most of the state change handling logic in previous tests, this test is to ensure that the correct
    // update state change logic is followed when the current and previous states are 'attached'

    const firstChannelSerial = '108hhDJ2hpInKn12345678@1992531200000-1';
    const firstAttachSerial = '108hhDJBiKOihn12345678@1992531200000-1';

    const testRoomId = 'roomId';
    const testDirection = 'backwards';
    const testLimit = 50;

    let expectFunction: (roomId: string, params: GetMessagesQueryParams) => void = () => {};

    // Mock the chat api call used by listener history query
    const mockChatApi = {
      getMessages: function (roomId: string, params: GetMessagesQueryParams): void {
        expectFunction(roomId, params);
      },
    } as unknown as ChatApi;

    // Create a room with the mock chat api
    const room = new DefaultRoom('roomId', context.realtime, mockChatApi, testClientOptions(), makeTestLogger());

    const channel = room.messages.channel as RealtimeChannel & {
      properties: {
        attachSerial: string | undefined;
        channelSerial: string | undefined;
      };
    };

    // Mock the whenState to resolve immediately
    vi.spyOn(channel, 'whenState').mockImplementation(async () => {
      return Promise.resolve(null);
    });

    // Set the timeserials for the channel
    channel.properties.channelSerial = firstChannelSerial;
    channel.properties.attachSerial = firstAttachSerial;

    // Mock the channel state to be attached
    vi.spyOn(channel, 'state', 'get').mockReturnValue('attached');

    // Create a test listener
    const listenerAfterAttach = () => {};

    // Subscribe the listener to messages
    await room.messages.subscribe(listenerAfterAttach);

    // Check we are using the channel serial
    expectFunction = (roomId: string, params: GetMessagesQueryParams) => {
      expect(roomId).toEqual(testRoomId);
      expect(params.direction).toEqual(testDirection);
      expect(params.limit).toEqual(testLimit);
      expect(params.fromSerial).toEqual(firstChannelSerial);
    };

    // Run a history query for the listener and check the chat api call is made with the channel serial
    await room.messages.getBeforeSubscriptionStart(listenerAfterAttach, { limit: 50 });

    // Change the attach and channel serials
    const secondChannelSerial = '108StIJ2hpOihn12345678@1992531200000-1';
    const secondAttachSerial = '108DrInOhpOihn12345678@1992531200000-1';
    channel.properties.channelSerial = secondChannelSerial;
    channel.properties.attachSerial = secondAttachSerial;

    // Initiate a re-attach this time with resume, should not cause listener points to reset to new attach serial
    context.emulateBackendStateChange('update', {
      current: 'attached',
      previous: 'attached',
      resumed: true,
    });

    // Check we are using the previous channel serial
    expectFunction = (_: string, params: GetMessagesQueryParams) => {
      expect(params.fromSerial).toEqual(firstChannelSerial);
    };

    // Run a history query for the listener and check the chat api call is made with the previous channel serial
    await room.messages.getBeforeSubscriptionStart(listenerAfterAttach, { limit: 50 });

    // Initiate a re-attach this time without resume, should cause listener points to reset to new attach serial
    context.emulateBackendStateChange('update', {
      current: 'attached',
      previous: 'attached',
      resumed: false,
    });

    // Check we are using the new attach serial
    expectFunction = (_: string, params: GetMessagesQueryParams) => {
      expect(params.fromSerial).toEqual(secondAttachSerial);
    };

    // Run a history query for the listener and check the chat api call is made with the new attach serial
    await room.messages.getBeforeSubscriptionStart(listenerAfterAttach, { limit: 50 });

    // Change the attach serial again
    channel.properties.attachSerial = '108DrInRiKGihn12345678@1992531200000-1';

    // Initiate a update this time without matching previous and current states, should not trigger
    // listener points to reset to new attach serial
    context.emulateBackendStateChange('update', {
      current: 'detaching',
      previous: 'attached',
      resumed: false,
    });

    // Check we are using the new attach serial
    expectFunction = (_: string, params: GetMessagesQueryParams) => {
      expect(params.fromSerial).toEqual(secondAttachSerial);
    };

    // Run a history query for the listener and check the chat api call is made with the previous attach serial
    await room.messages.getBeforeSubscriptionStart(listenerAfterAttach, { limit: 50 });
  });

  it<TestContext>('should throw an error if listener query end time is later than query timeserial', async (context) => {
    // Create a room instance
    const room = makeRoom(context);

    let caughtError: ErrorInfo | undefined;

    const channel = room.messages.channel as RealtimeChannel & {
      properties: {
        attachSerial: string | undefined;
        channelSerial: string | undefined;
      };
    };

    // Set the timeserials for the channel
    channel.properties.channelSerial = '108uyDJAgBOihn12345678@1772531200000-1';
    channel.properties.attachSerial = '108uyDJAgBOihn12345678@1772531200000-1';

    // Mock the channel state to be attached
    vi.spyOn(channel, 'state', 'get').mockReturnValue('attached');

    // Create a test listener
    const listener1 = () => {};

    // Subscribe to the messages
    await room.messages.subscribe(listener1);

    try {
      // Attempt to query message history before subscribing a listener
      await room.messages.getBeforeSubscriptionStart(listener1, { limit: 50, end: 1992531200000 });
    } catch (e: unknown) {
      // Expect an error to be thrown since no listener has been subscribed
      caughtError = e as ErrorInfo;
    }

    // Assert that an error was caught
    expect(caughtError).toBeDefined();
    expect(caughtError?.message).toEqual(
      'cannot query history; end time is after the subscription point of the listener',
    );
  });
});

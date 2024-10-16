import * as Ably from 'ably';
import { RealtimeChannel } from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatApi, GetMessagesQueryParams } from '../../src/core/chat-api.ts';
import { Message } from '../../src/core/message.ts';
import { DefaultMessages, MessageEventPayload } from '../../src/core/messages.ts';
import { Room } from '../../src/core/room.ts';
import {
  channelEventEmitter,
  ChannelEventEmitterReturnType,
  channelStateEventEmitter,
  ChannelStateEventEmitterReturnType,
} from '../helper/channel.ts';
import { makeTestLogger } from '../helper/logger.ts';
import { makeRandomRoom } from '../helper/room.ts';

interface TestContext {
  realtime: Ably.Realtime;
  chatApi: ChatApi;
  emulateBackendStateChange: ChannelStateEventEmitterReturnType;
  emulateBackendPublish: ChannelEventEmitterReturnType<Partial<Ably.InboundMessage>>;
  room: Room;
}

interface MockPaginatedResult {
  items: Message[];
  first(): Promise<Ably.PaginatedResult<Message>>;
  next(): Promise<Ably.PaginatedResult<Message> | null>;
  current(): Promise<Ably.PaginatedResult<Message>>;
  hasNext(): boolean;
  isLast(): boolean;
}

const mockPaginatedResultWithItems = (items: Message[]): MockPaginatedResult => {
  return {
    items,
    first: () => Promise.resolve(mockPaginatedResultWithItems(items)),
    next: () => Promise.resolve(null),
    current: () => Promise.resolve(mockPaginatedResultWithItems(items)),
    hasNext: () => false,
    isLast: () => true,
  };
};

vi.mock('ably');

describe('Messages', () => {
  beforeEach<TestContext>(async (context) => {
    context.realtime = new Ably.Realtime({ clientId: 'clientId', key: 'key' });
    context.chatApi = new ChatApi(context.realtime, makeTestLogger());
    context.room = makeRandomRoom({ chatApi: context.chatApi, realtime: context.realtime });
    const channel = await context.room.messages.channel;
    context.emulateBackendPublish = channelEventEmitter(channel);
    context.emulateBackendStateChange = channelStateEventEmitter(channel);
  });

  describe('sending message', () => {
    it<TestContext>('should be able to send message and get it back from response', async (context) => {
      const { chatApi } = context;
      const timestamp = Date.now();
      vi.spyOn(chatApi, 'sendMessage').mockResolvedValue({
        timeserial: 'abcdefghij@1672531200000-123',
        createdAt: timestamp,
      });

      const messagePromise = context.room.messages.send({ text: 'hello there' });

      const message = await messagePromise;

      expect(message).toEqual(
        expect.objectContaining({
          timeserial: 'abcdefghij@1672531200000-123',
          text: 'hello there',
          clientId: 'clientId',
          createdAt: new Date(timestamp),
          roomId: context.room.roomId,
        }),
      );
    });
  });

  describe('headers and metadata', () => {
    it<TestContext>('should be able to send message with headers and metadata and get it back from response', async (context) => {
      const { chatApi, realtime } = context;
      const timestamp = Date.now();
      vi.spyOn(chatApi, 'sendMessage').mockResolvedValue({
        timeserial: 'abcdefghij@1672531200000-123',
        createdAt: timestamp,
      });

      const room = makeRandomRoom({ chatApi, realtime });
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
          roomId: room.roomId,
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
  });

  describe('subscribing to updates', () => {
    it<TestContext>('subscribing to messages', (context) =>
      new Promise<void>((done, reject) => {
        const publishTimestamp = Date.now();
        context.room.messages.subscribe((rawMsg) => {
          const message = rawMsg.message;
          try {
            expect(message).toEqual(
              expect.objectContaining({
                timeserial: 'abcdefghij@1672531200000-123',
                text: 'may the fourth be with you',
                clientId: 'yoda',
                createdAt: new Date(publishTimestamp),
                roomId: context.room.roomId,
              }),
            );
          } catch (error: unknown) {
            reject(error as Error);
          }
          done();
        });

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
      }));
  });

  it<TestContext>('unsubscribing from messages', (context) => {
    const { room } = context;

    const receivedMessages: Message[] = [];
    const listener = (message: MessageEventPayload) => {
      receivedMessages.push(message.message);
    };

    const { unsubscribe } = room.messages.subscribe(listener);
    context.emulateBackendPublish({
      clientId: 'yoda',
      name: 'message.created',
      data: {
        text: 'may the fourth be with you',
      },
      extras: {
        timeserial: 'abcdefghij@1672531200000-123',
      },
      timestamp: Date.now(),
    });

    unsubscribe();

    context.emulateBackendPublish({
      clientId: 'yoda2',
      name: 'message.created',
      data: {
        text: 'may the fourth be with you',
      },
      extras: {
        timeserial: 'abcdefghij@1672531200000-123',
      },
      timestamp: Date.now(),
    });

    // We should have only received one message
    expect(receivedMessages).toHaveLength(1);
    expect(receivedMessages[0]?.clientId).toEqual('yoda');

    // A double off should not throw
    unsubscribe();
  });

  it<TestContext>('unsubscribing from all messages', (context) => {
    const { room } = context;

    const receivedMessages: Message[] = [];
    const listener = (message: MessageEventPayload) => {
      receivedMessages.push(message.message);
    };

    const receivedMessages2: Message[] = [];
    const listener2 = (message: MessageEventPayload) => {
      receivedMessages2.push(message.message);
    };

    const { unsubscribe } = room.messages.subscribe(listener);
    const { unsubscribe: unsubscribe2 } = room.messages.subscribe(listener2);
    context.emulateBackendPublish({
      clientId: 'yoda',
      name: 'message.created',
      data: {
        text: 'may the fourth be with you',
      },
      extras: {
        timeserial: 'abcdefghij@1672531200000-123',
      },
      timestamp: Date.now(),
    });

    room.messages.unsubscribeAll();

    context.emulateBackendPublish({
      clientId: 'yoda2',
      name: 'message.created',
      data: {
        text: 'may the fourth be with you',
      },
      extras: {
        timeserial: 'abcdefghij@1672531200000-123',
      },
      timestamp: Date.now(),
    });

    // We should have only received one message
    expect(receivedMessages).toHaveLength(1);
    expect(receivedMessages[0]?.clientId).toEqual('yoda');
    expect(receivedMessages2).toHaveLength(1);
    expect(receivedMessages2[0]?.clientId).toEqual('yoda');

    // A double off should not throw
    unsubscribe();
    unsubscribe2();
  });

  describe.each([
    [
      'unknown event name',
      {
        clientId: 'yoda2',
        name: 'message.foo',
        data: {
          text: 'may the fourth be with you',
        },
        extras: {
          timeserial: 'abcdefghij@1672531200000-123',
        },
        timestamp: Date.now(),
      },
    ],
    [
      'no data',
      {
        clientId: 'yoda2',
        name: 'message.created',
        extras: {
          timeserial: 'abcdefghij@1672531200000-123',
        },
        timestamp: Date.now(),
      },
    ],
    [
      'no text',
      {
        clientId: 'yoda2',
        name: 'message.created',
        data: {},
        extras: {
          timeserial: 'abcdefghij@1672531200000-123',
        },
        timestamp: Date.now(),
      },
    ],
    [
      'no client id',
      {
        name: 'message.created',
        data: {
          text: 'may the fourth be with you',
        },
        extras: {
          timeserial: 'abcdefghij@1672531200000-123',
        },
        timestamp: Date.now(),
      },
    ],
    [
      'no extras',
      {
        clientId: 'yoda2',
        name: 'message.created',
        data: {
          text: 'may the fourth be with you',
        },
        timestamp: Date.now(),
      },
    ],

    [
      'no extras.timeserial',
      {
        clientId: 'yoda2',
        name: 'message.created',
        data: {
          text: 'may the fourth be with you',
        },
        extras: {},
        timestamp: Date.now(),
      },
    ],
    [
      'extras.timeserial invalid',
      {
        clientId: 'yoda2',
        name: 'message.created',
        data: {
          text: 'may the fourth be with you',
        },
        extras: {
          timeserial: 'abc',
        },
        timestamp: Date.now(),
      },
    ],
    [
      'no timestamp',
      {
        clientId: 'yoda2',
        name: 'message.created',
        data: {
          text: 'may the fourth be with you',
        },
        extras: {
          timeserial: 'abcdefghij@1672531200000-123',
        },
      },
    ],
  ])('invalid incoming messages', (name: string, inboundMessage: Partial<Ably.InboundMessage>) => {
    it<TestContext>('should handle invalid inbound messages: ' + name, (context) => {
      const room = context.room;
      let listenerCalled = false;
      room.messages.subscribe(() => {
        listenerCalled = true;
      });

      context.emulateBackendPublish(inboundMessage);
      expect(listenerCalled).toBe(false);
    });
  });

  // Tests for previous messages
  it<TestContext>('should throw an error for listener history if not subscribed', async (context) => {
    const { room } = context;

    const { unsubscribe, getPreviousMessages } = room.messages.subscribe(() => {});

    // Unsubscribe the listener
    unsubscribe();

    await expect(getPreviousMessages({ limit: 50 })).rejects.toBeErrorInfo({
      code: 40000,
      message: 'cannot query history; listener has not been subscribed yet',
    });
  });

  it<TestContext>('should query listener history with the attachment serial after attaching', async (context) => {
    const testAttachSerial = 'abcdefghij@1672531200000-123';
    const testDirection = 'backwards';
    const testLimit = 50;

    const { room, chatApi } = context;

    vi.spyOn(chatApi, 'getMessages').mockImplementation((roomId, params): Promise<Ably.PaginatedResult<Message>> => {
      expect(roomId).toEqual(room.roomId);
      expect(params.direction).toEqual(testDirection);
      expect(params.limit).toEqual(testLimit);
      expect(params.fromSerial).toEqual(testAttachSerial);
      return Promise.resolve(mockPaginatedResultWithItems([]));
    });

    const msgChannel = await room.messages.channel;

    // Force ts to recognize the channel properties
    const channel = msgChannel as RealtimeChannel & {
      properties: {
        attachSerial: string | undefined;
      };
    };

    // Set the timeserial of the channel attach
    channel.properties.attachSerial = testAttachSerial;

    vi.spyOn(channel, 'whenState').mockImplementation(function () {
      return Promise.resolve(null);
    });

    // Subscribe to the messages
    const { getPreviousMessages } = room.messages.subscribe(() => {});

    // This test was failing because now we wait for the channel promise inside
    // DefaultMessages._resolveSubscriptionStart. That got resolved a tick after
    // we changed the channel state below. To address this issue we wait an
    // insignificant amount of time here to ensure the channel promise inside
    // DefaultMessages resolves BEFORE we change the channel state here.
    await new Promise<void>((resolve) =>
      setTimeout(() => {
        resolve();
      }, 10),
    );

    // Mock the channel state to be attached
    vi.spyOn(channel, 'state', 'get').mockReturnValue('attached');

    // Initiate an attach state change to resolve the listeners attach point
    context.emulateBackendStateChange({
      current: 'attached',
      previous: 'detached',
      resumed: true,
    });

    // Run a history query for the listener and check the chat api call is made with the channel attachment serial
    await expect(getPreviousMessages({ limit: 50 })).resolves.toBeTruthy();
  });

  it<TestContext>('should query listener history with latest channel serial if already attached to the channel', async (context) => {
    // We should use the latest channel serial if we are already attached to the channel
    const latestChannelSerial = 'abcdefghij@1672531200000-123';
    const testDirection = 'backwards';
    const testLimit = 50;

    const { room, chatApi } = context;

    vi.spyOn(chatApi, 'getMessages').mockImplementation((roomId, params): Promise<Ably.PaginatedResult<Message>> => {
      expect(roomId).toEqual(room.roomId);
      expect(params.direction).toEqual(testDirection);
      expect(params.limit).toEqual(testLimit);
      expect(params.fromSerial).toEqual(latestChannelSerial);
      return Promise.resolve(mockPaginatedResultWithItems([]));
    });

    const msgChannel = await room.messages.channel;

    // Force ts to recognize the channel properties
    const channel = msgChannel as RealtimeChannel & {
      properties: {
        channelSerial: string | undefined;
      };
      state: Ably.ChannelState;
    };

    // Mock the channel state to be attached so we should query with the channel serial
    vi.spyOn(channel, 'state', 'get').mockReturnValue('attached');

    // Set the timeserial of the channel (attachment serial)
    channel.properties.channelSerial = latestChannelSerial;

    // Subscribe to the messages
    const { getPreviousMessages } = room.messages.subscribe(() => {});

    // Run a history query for the listener and check the chat api call is made with the channel timeserial
    await expect(getPreviousMessages({ limit: 50 })).resolves.toBeTruthy();
  });

  it<TestContext>('when attach occurs, should query with correct params if listener registered before attach', async (context) => {
    const firstAttachmentSerial = '108uyDJAgBOihn12345678@1772531200000-1';
    const testDirection = 'backwards';
    const testLimit = 50;

    let expectFunction: (roomId: string, params: GetMessagesQueryParams) => void = () => {};

    const { room, chatApi } = context;

    vi.spyOn(chatApi, 'getMessages').mockImplementation((roomId, params): Promise<Ably.PaginatedResult<Message>> => {
      expectFunction(roomId, params);
      return Promise.resolve(mockPaginatedResultWithItems([]));
    });

    const msgChannel = await room.messages.channel;
    const channel = msgChannel as RealtimeChannel & {
      properties: {
        attachSerial: string | undefined;
        fromSerial: string | undefined;
      };
    };

    // Set the timeserials for before attachment testing
    channel.properties.attachSerial = firstAttachmentSerial;

    const { getPreviousMessages } = room.messages.subscribe(() => {});

    // wait
    await new Promise<void>((resolve) =>
      setTimeout(() => {
        resolve();
      }, 10),
    );

    // Mock the channel state to be attached
    vi.spyOn(channel, 'state', 'get').mockReturnValue('attached');

    // Initiate an attach state change to resolve the listeners attach point
    context.emulateBackendStateChange({
      current: 'attached',
      previous: 'detached',
      resumed: false,
    });

    // Check we are using the attachSerial
    expectFunction = (roomId: string, params: GetMessagesQueryParams) => {
      expect(roomId).toEqual(room.roomId);
      expect(params.direction).toEqual(testDirection);
      expect(params.limit).toEqual(testLimit);
      expect(params.fromSerial).toEqual(firstAttachmentSerial);
    };

    // Run a history query for the listener and check the chat api call is made with the channel attachment serial
    await expect(getPreviousMessages({ limit: 50 })).resolves.toBeTruthy();

    // Now update the attach serial
    const secondAttachmentSerial = '108hhDJ2dBOihn12345678@1992531200000-1';
    channel.properties.attachSerial = secondAttachmentSerial;

    // Initiate a re-attach without resume, should cause all listener points to reset to new attach serial
    context.emulateBackendStateChange({
      current: 'attached',
      previous: 'detached',
      resumed: false,
    });

    // Check we are now using the new attachSerial
    expectFunction = (_: string, params: GetMessagesQueryParams) => {
      expect(params.fromSerial).toEqual(secondAttachmentSerial);
    };

    // Run a history query for the listener and check the chat api call is made with the channel attachment serial
    await expect(getPreviousMessages({ limit: 50 })).resolves.toBeTruthy();

    // Test the case where we receive an attached state change with resume.

    // Change attach serial again
    channel.properties.attachSerial = '108hhDJ2dBOihn12345678@1122531200000-1';

    // Initiate a re-attach this time with resume, should not cause listener points to reset to new attach serial
    context.emulateBackendStateChange({
      current: 'attached',
      previous: 'detached',
      resumed: true,
    });

    // Check we are using the previous attachSerial
    expectFunction = (_: string, params: GetMessagesQueryParams) => {
      expect(params.fromSerial).toEqual(secondAttachmentSerial);
    };

    // Run a history query for the listener and check the chat api call is made with the previous attach serial
    await expect(getPreviousMessages({ limit: 50 })).resolves.toBeTruthy();
  });

  it<TestContext>('when attach occurs, should query with correct params if listener register after attach', async (context) => {
    // Testing the case where the channel is already attached and we have a channel serial set
    const firstChannelSerial = 'abghhDJ2dBOihn12345678@1992531200000-1';
    const firstAttachSerial = 'ackhhDJ2dBOihn12345678@1992531200000-1';
    const testDirection = 'backwards';
    const testLimit = 50;

    let expectFunction: (roomId: string, params: GetMessagesQueryParams) => void = () => {};

    const { room, chatApi } = context;

    vi.spyOn(chatApi, 'getMessages').mockImplementation((roomId, params): Promise<Ably.PaginatedResult<Message>> => {
      expectFunction(roomId, params);
      return Promise.resolve(mockPaginatedResultWithItems([]));
    });

    const msgChannel = await room.messages.channel;
    const channel = msgChannel as RealtimeChannel & {
      properties: {
        attachSerial: string | undefined;
        channelSerial: string | undefined;
      };
    };

    vi.spyOn(channel, 'whenState').mockImplementation(() => {
      return Promise.resolve(null);
    });

    // Set the timeserials for the channel
    channel.properties.channelSerial = firstChannelSerial;
    channel.properties.attachSerial = firstAttachSerial;

    // Mock the channel state to be attached
    vi.spyOn(channel, 'state', 'get').mockReturnValue('attached');

    // Subscribe to the messages
    const { getPreviousMessages } = room.messages.subscribe(() => {});

    // Check we are using the channel serial
    expectFunction = (roomId: string, params: GetMessagesQueryParams) => {
      expect(roomId).toEqual(room.roomId);
      expect(params.direction).toEqual(testDirection);
      expect(params.limit).toEqual(testLimit);
      expect(params.fromSerial).toEqual(firstChannelSerial);
    };

    // Run a history query for the listener and check the chat api call is made with the channel serial
    await expect(getPreviousMessages({ limit: 50 })).resolves.toBeTruthy();

    // Change the attach and channel serials
    const secondChannelSerial = '108hhDJ2hpOihn12345678@1992531200000-1';
    const secondAttachSerial = '108hGGJ2hpOill12345678@1992531200000-1';
    channel.properties.channelSerial = secondChannelSerial;
    channel.properties.attachSerial = secondAttachSerial;

    // Initiate a re-attach this time with resume, should not cause listener points to reset to new attach serial
    context.emulateBackendStateChange({
      current: 'attached',
      previous: 'attached',
      resumed: true,
    });

    // Check we are using the previous channel serial
    expectFunction = (_: string, params: GetMessagesQueryParams) => {
      expect(params.fromSerial).toEqual(firstChannelSerial);
    };

    // Run a history query for the listener and check the chat api call is made with the first channel serial
    await expect(getPreviousMessages({ limit: 50 })).resolves.toBeTruthy();

    // Initiate a re-attach this time without resume, should cause listener points to reset to new attach serial
    context.emulateBackendStateChange({
      current: 'attached',
      previous: 'attached',
      resumed: false,
    });

    // Check we are using the new attach serial
    expectFunction = (_: string, params: GetMessagesQueryParams) => {
      expect(params.fromSerial).toEqual(secondAttachSerial);
    };

    // Run a history query for the listener and check the chat api call is made with the attach serial
    await expect(getPreviousMessages({ limit: 50 })).resolves.toBeTruthy();
  });

  it<TestContext>('when update occurs, should query with correct params', async (context) => {
    // We have tested most of the state change handling logic in previous tests, this test is to ensure that the correct
    // update state change logic is followed when the current and previous states are 'attached'

    const firstChannelSerial = '108hhDJ2hpInKn12345678@1992531200000-1';
    const firstAttachSerial = '108hhDJBiKOihn12345678@1992531200000-1';
    const testDirection = 'backwards';
    const testLimit = 50;

    let expectFunction: (roomId: string, params: GetMessagesQueryParams) => void = () => {};

    const { room, chatApi } = context;

    vi.spyOn(chatApi, 'getMessages').mockImplementation((roomId, params): Promise<Ably.PaginatedResult<Message>> => {
      expectFunction(roomId, params);
      return Promise.resolve(mockPaginatedResultWithItems([]));
    });

    const msgChannel = await room.messages.channel;
    const channel = msgChannel as RealtimeChannel & {
      properties: {
        attachSerial: string | undefined;
        channelSerial: string | undefined;
      };
    };

    // Mock the whenState to resolve immediately
    vi.spyOn(channel, 'whenState').mockImplementation(() => {
      return Promise.resolve(null);
    });

    // Set the timeserials for the channel
    channel.properties.channelSerial = firstChannelSerial;
    channel.properties.attachSerial = firstAttachSerial;

    // Mock the channel state to be attached
    vi.spyOn(channel, 'state', 'get').mockReturnValue('attached');

    // Subscribe to the messages
    const { getPreviousMessages } = room.messages.subscribe(() => {});

    // Check we are using the channel serial
    expectFunction = (roomId: string, params: GetMessagesQueryParams) => {
      expect(roomId).toEqual(room.roomId);
      expect(params.direction).toEqual(testDirection);
      expect(params.limit).toEqual(testLimit);
      expect(params.fromSerial).toEqual(firstChannelSerial);
    };

    // Run a history query for the listener and check the chat api call is made with the channel serial
    await getPreviousMessages({ limit: 50 });

    // Change the attach and channel serials
    const secondChannelSerial = '108StIJ2hpOihn12345678@1992531200000-1';
    const secondAttachSerial = '108DrInOhpOihn12345678@1992531200000-1';
    channel.properties.channelSerial = secondChannelSerial;
    channel.properties.attachSerial = secondAttachSerial;

    // Initiate a re-attach this time with resume, should not cause listener points to reset to new attach serial
    context.emulateBackendStateChange(
      {
        current: 'attached',
        previous: 'attached',
        resumed: true,
      },
      true,
    );

    // Check we are using the previous channel serial
    expectFunction = (_: string, params: GetMessagesQueryParams) => {
      expect(params.fromSerial).toEqual(firstChannelSerial);
    };

    // Run a history query for the listener and check the chat api call is made with the previous channel serial
    await expect(getPreviousMessages({ limit: 50 })).resolves.toBeTruthy();

    // Initiate a re-attach this time without resume, should cause listener points to reset to new attach serial
    context.emulateBackendStateChange(
      {
        current: 'attached',
        previous: 'attached',
        resumed: false,
      },
      true,
    );

    // Check we are using the new attach serial
    expectFunction = (_: string, params: GetMessagesQueryParams) => {
      expect(params.fromSerial).toEqual(secondAttachSerial);
    };

    // Run a history query for the listener and check the chat api call is made with the new attach serial
    await expect(getPreviousMessages({ limit: 50 })).resolves.toBeTruthy();

    // Change the attach serial again
    channel.properties.attachSerial = '108DrInRiKGihn12345678@1992531200000-1';

    // Initiate a update this time without matching previous and current states, should not trigger
    // listener points to reset to new attach serial
    context.emulateBackendStateChange(
      {
        current: 'attached',
        previous: 'attached',
        resumed: false,
      },
      true,
    );

    // Check we are using the new attach serial
    expectFunction = (_: string, params: GetMessagesQueryParams) => {
      expect(params.fromSerial).toEqual(channel.properties.attachSerial);
    };

    // Run a history query for the listener and check the chat api call is made with the previous attach serial
    await expect(getPreviousMessages({ limit: 50 })).resolves.toBeTruthy();
  });

  it<TestContext>('should throw an error if listener query end time is later than query timeserial', async (context) => {
    // Create a room instance
    const { room } = context;

    const msgChannel = await room.messages.channel;
    const channel = msgChannel as RealtimeChannel & {
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

    const { getPreviousMessages } = room.messages.subscribe(() => {});

    await expect(getPreviousMessages({ limit: 50, end: 1992531200000 })).rejects.toBeErrorInfo({
      code: 40000,
      message: 'cannot query history; end time is after the subscription point of the listener',
    });
  });

  it<TestContext>('has an attachment error code', (context) => {
    expect((context.room.messages as DefaultMessages).attachmentErrorCode).toBe(102001);
  });

  it<TestContext>('has a detachment error code', (context) => {
    expect((context.room.messages as DefaultMessages).detachmentErrorCode).toBe(102050);
  });
});

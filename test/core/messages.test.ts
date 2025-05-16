import * as Ably from 'ably';
import { RealtimeChannel } from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatApi, GetMessagesQueryParams } from '../../src/core/chat-api.ts';
import { ChatMessageActions, MessageEvent, MessageEventType } from '../../src/core/events.ts';
import { Message } from '../../src/core/message.ts';
import { OrderBy } from '../../src/core/messages.ts';
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
  beforeEach<TestContext>((context) => {
    context.realtime = new Ably.Realtime({ clientId: 'clientId', key: 'key' });
    context.chatApi = new ChatApi(context.realtime, makeTestLogger());
    context.room = makeRandomRoom({ chatApi: context.chatApi, realtime: context.realtime });
    const channel = context.room.channel;
    context.emulateBackendPublish = channelEventEmitter(channel);
    context.emulateBackendStateChange = channelStateEventEmitter(channel);
  });

  describe('sending message', () => {
    it<TestContext>('should be able to send message and get it back from response', async (context) => {
      const { chatApi } = context;
      const timestamp = Date.now();
      const serial = 'abcdefghij@' + String(timestamp) + '-123';
      vi.spyOn(chatApi, 'sendMessage').mockResolvedValue({
        serial: serial,
        createdAt: timestamp,
      });

      const messagePromise = context.room.messages.send({ text: 'hello there' });

      const message = await messagePromise;

      expect(message).toEqual(
        expect.objectContaining({
          serial: serial,
          text: 'hello there',
          clientId: 'clientId',
          createdAt: new Date(timestamp),
          roomId: context.room.roomId,
        }),
      );
    });

    it<TestContext>('should be able to delete a message and get it back from response', async (context) => {
      const { chatApi } = context;
      const sendTimestamp = Date.now();
      const sendSerial = '01672531200001-123@abcdefghij:0';
      vi.spyOn(chatApi, 'sendMessage').mockResolvedValue({
        serial: sendSerial,
        createdAt: sendTimestamp,
      });

      const deleteTimestamp = Date.now();
      vi.spyOn(chatApi, 'deleteMessage').mockResolvedValue({
        version: '01672531200001-123@abcdefghij:0',
        timestamp: deleteTimestamp,
      });

      const message1 = await context.room.messages.send({ text: 'hello there' });
      const deleteMessage1 = await context.room.messages.delete(message1);

      expect(deleteMessage1).toEqual(
        expect.objectContaining({
          serial: sendSerial,
          text: 'hello there',
          clientId: 'clientId',
          timestamp: new Date(deleteTimestamp),
          createdAt: new Date(sendTimestamp),
          roomId: context.room.roomId,
        }),
      );

      expect(deleteMessage1.operation).toEqual(expect.objectContaining({ clientId: 'clientId' }));
    });
  });

  describe('headers and metadata', () => {
    it<TestContext>('should be able to send message with headers and metadata and get it back from response', async (context) => {
      const { chatApi, realtime } = context;
      const timestamp = Date.now();
      const serial = 'abcdefghij@' + String(timestamp) + '-123';
      vi.spyOn(chatApi, 'sendMessage').mockResolvedValue({
        serial: serial,
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
          serial: serial,
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

  it<TestContext>('should only unsubscribe the correct subscription', (context) => {
    const { room } = context;

    const sendMessage = (serial: string) => {
      const publishTimestamp = Date.now();
      context.emulateBackendPublish({
        clientId: 'yoda',
        name: 'chat.message',
        data: {
          text: 'may the fourth be with you',
        },
        serial: serial,
        version: serial,
        action: ChatMessageActions.MessageCreate,
        extras: {},
        timestamp: publishTimestamp,
        createdAt: publishTimestamp,
      });
    };

    const received: string[] = [];
    const listener = (message: MessageEvent) => {
      received.push(message.message.serial);
    };
    const subscription1 = room.messages.subscribe(listener);
    const subscription2 = room.messages.subscribe(listener);

    sendMessage('a');
    expect(received).toEqual(['a', 'a']);
    subscription1.unsubscribe();
    sendMessage('b');
    expect(received).toEqual(['a', 'a', 'b']);
    subscription2.unsubscribe();
    sendMessage('c');
    expect(received).toEqual(['a', 'a', 'b']);
  });

  describe('subscribing to updates', () => {
    it<TestContext>('should subscribe to all message events', (context) =>
      new Promise<void>((done, reject) => {
        const publishTimestamp = Date.now();
        let eventCount = 0;
        const timeout = setTimeout(() => {
          reject(new Error('did not receive all message events'));
        }, 300);
        context.room.messages.subscribe(() => {
          eventCount++;
          if (eventCount === 3) {
            clearTimeout(timeout);
            done();
          }
        });
        context.emulateBackendPublish({
          clientId: 'yoda',
          name: 'chat.message',
          data: {
            text: 'this message has been deleted',
          },
          serial: '01672531200000-123@abcdefghij',
          action: ChatMessageActions.MessageDelete,
          version: '01672531200000-123@abcdefghij',
          extras: {},
          timestamp: publishTimestamp,
          createdAt: publishTimestamp,
          operation: { clientId: 'yoda' },
        });
        context.emulateBackendPublish({
          clientId: 'yoda',
          name: 'chat.message',
          data: {
            text: 'some updated text',
          },
          serial: '01672531200000-123@abcdefghij',
          action: ChatMessageActions.MessageUpdate,
          version: '01672531200000-123@abcdefghij',
          extras: {},
          timestamp: publishTimestamp,
          createdAt: publishTimestamp,
          operation: { clientId: 'yoda' },
        });
        context.emulateBackendPublish({
          clientId: 'yoda',
          name: 'chat.message',
          data: {
            text: 'may the fourth be with you',
          },
          version: '01672531200000-123@abcdefghij',
          serial: '01672531200000-123@abcdefghij',
          action: ChatMessageActions.MessageCreate,
          extras: {},
          timestamp: publishTimestamp,
          createdAt: publishTimestamp,
        });
      }));
  });

  it<TestContext>('unsubscribes from messages', (context) => {
    const { room } = context;
    const receivedMessages: Message[] = [];
    const receivedDeletions: Message[] = [];
    const receivedUpdates: Message[] = [];
    const listener = (message: MessageEvent) => {
      switch (message.type) {
        case MessageEventType.Created: {
          receivedMessages.push(message.message);
          break;
        }
        case MessageEventType.Deleted: {
          receivedDeletions.push(message.message);
          break;
        }
        case MessageEventType.Updated: {
          receivedUpdates.push(message.message);
          break;
        }
      }
    };

    const { unsubscribe } = room.messages.subscribe(listener);

    let publishTimestamp = Date.now();
    let updateTimestamp = Date.now() + 500;
    let deletionTimestamp = Date.now() + 1000;
    context.emulateBackendPublish({
      clientId: 'yoda',
      name: 'chat.message',
      data: {
        text: 'may the fourth be with you',
      },
      serial: '01672531200000-123@abcdefghij',
      version: '01672531200000-123@abcdefghij',
      action: ChatMessageActions.MessageCreate,
      extras: {},
      timestamp: publishTimestamp,
      createdAt: publishTimestamp,
    });
    context.emulateBackendPublish({
      clientId: 'yoda',
      name: 'chat.message',
      data: {
        text: 'I have the high ground now',
      },
      serial: '01672531200000-123@abcdefghij',
      action: ChatMessageActions.MessageUpdate,
      extras: {},
      timestamp: updateTimestamp,
      createdAt: publishTimestamp,
      version: '01672531200000-123@abcdefghij:0',
      operation: {
        clientId: 'yoda',
      },
    });
    context.emulateBackendPublish({
      clientId: 'yoda',
      name: 'chat.message',
      data: {
        text: 'I have the high ground now',
      },
      serial: '01672531200000-123@abcdefghij',
      action: ChatMessageActions.MessageDelete,
      extras: {},
      timestamp: deletionTimestamp,
      createdAt: publishTimestamp,
      version: '01672531200000-123@abcdefghij:0',
      operation: {
        clientId: 'yoda',
      },
    });

    expect(receivedMessages).toHaveLength(1);
    expect(receivedDeletions).toHaveLength(1);
    expect(receivedUpdates).toHaveLength(1);
    expect(receivedMessages[0]?.clientId).toEqual('yoda');
    expect(receivedDeletions[0]?.clientId).toEqual('yoda');
    expect(receivedUpdates[0]?.clientId).toEqual('yoda');

    unsubscribe();

    // send, update and delete again when unsubscribed
    publishTimestamp = Date.now();
    updateTimestamp = Date.now() + 500;
    deletionTimestamp = Date.now() + 1000;
    context.emulateBackendPublish({
      clientId: 'yoda',
      name: 'chat.message',
      data: {
        text: 'may the fourth be with you',
      },
      serial: '01672535500000-123@abcdefghij',
      version: '01672535500000-123@abcdefghij',
      action: ChatMessageActions.MessageCreate,
      extras: {},
      timestamp: publishTimestamp,
      createdAt: publishTimestamp,
    });
    context.emulateBackendPublish({
      clientId: 'yoda',
      name: 'chat.message',
      data: {
        text: 'I have the high ground now',
      },
      serial: '01672535500000-123@abcdefghij',
      action: ChatMessageActions.MessageUpdate,
      extras: {},
      timestamp: updateTimestamp,
      createdAt: publishTimestamp,
      version: '01672535600000-123@abcdefghij:0',
      operation: {
        clientId: 'yoda',
      },
    });
    context.emulateBackendPublish({
      clientId: 'yoda',
      name: 'chat.message',
      data: {
        text: 'I have the high ground now',
      },
      serial: '01672535500000-123@abcdefghij',
      action: ChatMessageActions.MessageDelete,
      extras: {},
      timestamp: deletionTimestamp,
      createdAt: publishTimestamp,
      version: '01672535700000-123@abcdefghij:0',
      operation: {
        clientId: 'yoda',
      },
    });

    // We should not have received anything new
    expect(receivedMessages).toHaveLength(1);
    expect(receivedDeletions).toHaveLength(1);
    expect(receivedUpdates).toHaveLength(1);
    expect(receivedMessages[0]?.clientId).toEqual('yoda');
    expect(receivedDeletions[0]?.clientId).toEqual('yoda');
    expect(receivedUpdates[0]?.clientId).toEqual('yoda');

    // A double off should not throw
    unsubscribe();
  });

  it<TestContext>('unsubscribing from all messages', (context) => {
    const { room } = context;
    const receivedMessages: Message[] = [];
    const receivedDeletions: Message[] = [];
    const receivedUpdates: Message[] = [];

    const listener = (message: MessageEvent) => {
      switch (message.type) {
        case MessageEventType.Created: {
          receivedMessages.push(message.message);
          break;
        }
        case MessageEventType.Deleted: {
          receivedDeletions.push(message.message);
          break;
        }
        case MessageEventType.Updated: {
          receivedUpdates.push(message.message);
          break;
        }
      }
    };

    const receivedMessages2: Message[] = [];
    const receivedDeletions2: Message[] = [];
    const receivedUpdates2: Message[] = [];

    const listener2 = (message: MessageEvent) => {
      switch (message.type) {
        case MessageEventType.Created: {
          receivedMessages2.push(message.message);
          break;
        }
        case MessageEventType.Deleted: {
          receivedDeletions2.push(message.message);
          break;
        }
        case MessageEventType.Updated: {
          receivedUpdates2.push(message.message);
          break;
        }
      }
    };

    const { unsubscribe } = room.messages.subscribe(listener);
    const { unsubscribe: unsubscribe2 } = room.messages.subscribe(listener2);

    let publishTimestamp = Date.now();
    let updateTimestamp = Date.now() + 500;
    let deletionTimestamp = Date.now() + 1000;
    context.emulateBackendPublish({
      clientId: 'yoda',
      name: 'chat.message',
      data: {
        text: 'may the fourth be with you',
      },
      serial: '01672531200000-123@abcdefghij',
      version: '01672531200000-123@abcdefghij',
      action: ChatMessageActions.MessageCreate,
      extras: {},
      timestamp: publishTimestamp,
      createdAt: publishTimestamp,
    });
    context.emulateBackendPublish({
      clientId: 'yoda',
      name: 'chat.message',
      data: {
        text: 'I have the high ground now',
      },
      serial: '01672531200000-123@abcdefghij',
      action: ChatMessageActions.MessageUpdate,
      version: '01672531200000-123@abcdefghij:0',
      operation: {
        clientId: 'yoda',
      },
      extras: {},
      timestamp: updateTimestamp,
      createdAt: publishTimestamp,
    });
    context.emulateBackendPublish({
      clientId: 'yoda',
      name: 'chat.message',
      data: {
        text: 'I have the high ground now',
      },
      serial: '01672531200000-123@abcdefghij',
      action: ChatMessageActions.MessageDelete,
      extras: {},
      timestamp: deletionTimestamp,
      createdAt: publishTimestamp,
      version: '01672531200000-123@abcdefghij:0',
      operation: {
        clientId: 'yoda',
      },
    });

    // We should have received the message above and the update and delete
    expect(receivedMessages).toHaveLength(1);
    expect(receivedMessages[0]?.clientId).toEqual('yoda');
    expect(receivedMessages2).toHaveLength(1);
    expect(receivedMessages2[0]?.clientId).toEqual('yoda');

    expect(receivedDeletions).toHaveLength(1);
    expect(receivedDeletions[0]?.clientId).toEqual('yoda');
    expect(receivedDeletions2).toHaveLength(1);
    expect(receivedDeletions2[0]?.clientId).toEqual('yoda');

    expect(receivedUpdates).toHaveLength(1);
    expect(receivedUpdates[0]?.clientId).toEqual('yoda');
    expect(receivedUpdates2).toHaveLength(1);
    expect(receivedUpdates2[0]?.clientId).toEqual('yoda');

    room.messages.unsubscribeAll();

    publishTimestamp = Date.now();
    updateTimestamp = Date.now() + 500;
    deletionTimestamp = Date.now() + 1000;
    context.emulateBackendPublish({
      clientId: 'yoda2',
      name: 'chat.message',
      data: {
        text: 'may the fourth be with you',
      },
      serial: '01672531200000-123@abcdefghij',
      version: '01672531200000-123@abcdefghij',
      action: ChatMessageActions.MessageCreate,
      extras: {},
      createdAt: publishTimestamp,
      timestamp: publishTimestamp,
    });
    context.emulateBackendPublish({
      clientId: 'yoda',
      name: 'chat.message',
      data: {
        text: 'I have the high ground now',
      },
      serial: '01672531200000-123@abcdefghij',
      action: ChatMessageActions.MessageUpdate,
      version: '01672531200000-123@abcdefghij:0',
      operation: {
        clientId: 'yoda',
      },
      extras: {},
      createdAt: publishTimestamp,
      timestamp: updateTimestamp,
    });
    context.emulateBackendPublish({
      clientId: 'yoda2',
      name: 'chat.message',
      data: {
        text: 'I have the high ground now',
      },
      serial: '01672531200000-123@abcdefghij',
      action: ChatMessageActions.MessageDelete,
      extras: {},
      createdAt: publishTimestamp,
      timestamp: deletionTimestamp,
      version: '01672531200000-123@abcdefghij:0',
      operation: {
        clientId: 'yoda2',
      },
    });

    // We should not have received anything new - do same assertions again
    expect(receivedMessages).toHaveLength(1);
    expect(receivedMessages[0]?.clientId).toEqual('yoda');
    expect(receivedMessages2).toHaveLength(1);
    expect(receivedMessages2[0]?.clientId).toEqual('yoda');

    expect(receivedDeletions).toHaveLength(1);
    expect(receivedDeletions[0]?.clientId).toEqual('yoda');
    expect(receivedDeletions2).toHaveLength(1);
    expect(receivedDeletions2[0]?.clientId).toEqual('yoda');

    expect(receivedUpdates).toHaveLength(1);
    expect(receivedUpdates[0]?.clientId).toEqual('yoda');
    expect(receivedUpdates2).toHaveLength(1);
    expect(receivedUpdates2[0]?.clientId).toEqual('yoda');

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
        serial: '01672531200000-123@abcdefghij',
        action: ChatMessageActions.MessageCreate,
        extras: {},
        timestamp: Date.now(),
        createdAt: Date.now(),
      },
    ],
    [
      'unknown action name',
      {
        clientId: 'yoda2',
        name: 'message.foo',
        data: {
          text: 'may the fourth be with you',
        },
        serial: '01672531200000-123@abcdefghij',
        action: 'message.unknown',
        extras: {},
        timestamp: Date.now(),
        createdAt: Date.now(),
      },
    ],
    [
      'no data',
      {
        clientId: 'yoda2',
        name: 'chat.message',
        serial: '01672531200000-123@abcdefghij',
        action: ChatMessageActions.MessageCreate,
        extras: {},
        timestamp: Date.now(),
        createdAt: Date.now(),
      },
    ],
    [
      'no text',
      {
        clientId: 'yoda2',
        name: 'chat.message',
        data: {},
        serial: '01672531200000-123@abcdefghij',
        action: ChatMessageActions.MessageCreate,
        extras: {},
        timestamp: Date.now(),
        createdAt: Date.now(),
      },
    ],
    [
      'no client id',
      {
        name: 'chat.message',
        data: {
          text: 'may the fourth be with you',
        },
        serial: '01672531200000-123@abcdefghij',
        action: ChatMessageActions.MessageCreate,
        extras: {},
        timestamp: Date.now(),
        createdAt: Date.now(),
      },
    ],
    [
      'no extras',
      {
        name: 'chat.message',
        clientId: 'yoda2',
        data: {
          text: 'may the fourth be with you',
        },
        serial: '01672531200000-123@abcdefghij',
        action: ChatMessageActions.MessageCreate,
        timestamp: Date.now(),
        createdAt: Date.now(),
      },
    ],

    [
      'no serial',
      {
        clientId: 'yoda2',
        name: 'chat.message',
        data: {
          text: 'may the fourth be with you',
        },
        action: ChatMessageActions.MessageCreate,
        timestamp: Date.now(),
        createdAt: Date.now(),
      },
    ],
  ])('invalid incoming messages', (name: string, inboundMessage: unknown) => {
    it<TestContext>('should handle invalid inbound messages: ' + name, (context) => {
      const room = context.room;
      let listenerCalled = false;
      room.messages.subscribe(() => {
        listenerCalled = true;
      });

      context.emulateBackendPublish(inboundMessage as Ably.InboundMessage);
      expect(listenerCalled).toBe(false);
    });
  });

  // Tests for previous messages
  it<TestContext>('should throw an error for listener history if not subscribed', async (context) => {
    const { room } = context;

    const { unsubscribe, historyBeforeSubscribe } = room.messages.subscribe(() => {});

    // Unsubscribe the listener
    unsubscribe();

    await expect(historyBeforeSubscribe({ limit: 50 })).rejects.toBeErrorInfo({
      code: 40000,
      message: 'cannot query history; listener has not been subscribed yet',
    });
  });

  it<TestContext>('should query listener history with the attachment serial after attaching', async (context) => {
    const testAttachSerial = '01672531200000-123@abcdefghij';
    const testOrderBy = OrderBy.NewestFirst;
    const testLimit = 50;

    const { room, chatApi } = context;

    vi.spyOn(chatApi, 'getMessages').mockImplementation((roomId, params): Promise<Ably.PaginatedResult<Message>> => {
      expect(roomId).toEqual(room.roomId);
      expect(params.orderBy).toEqual(testOrderBy);
      expect(params.limit).toEqual(testLimit);
      expect(params.fromSerial).toEqual(testAttachSerial);
      return Promise.resolve(mockPaginatedResultWithItems([]));
    });

    const msgChannel = room.channel;

    // Force ts to recognize the channel properties
    const channel = msgChannel as RealtimeChannel & {
      properties: {
        attachSerial: string | undefined;
      };
    };

    // Set the serial of the channel attach
    channel.properties.attachSerial = testAttachSerial;

    vi.spyOn(channel, 'whenState').mockImplementation(function () {
      return Promise.resolve(null);
    });

    // Subscribe to the messages
    const { historyBeforeSubscribe } = room.messages.subscribe(() => {});

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
    await expect(historyBeforeSubscribe({ limit: 50 })).resolves.toBeTruthy();
  });

  it<TestContext>('should query listener history with latest channel serial if already attached to the channel', async (context) => {
    // We should use the latest channel serial if we are already attached to the channel
    const latestChannelSerial = '01672531200000-123@abcdefghij';
    const testOrderBy = OrderBy.NewestFirst;
    const testLimit = 50;

    const { room, chatApi } = context;

    vi.spyOn(chatApi, 'getMessages').mockImplementation((roomId, params): Promise<Ably.PaginatedResult<Message>> => {
      expect(roomId).toEqual(room.roomId);
      expect(params.orderBy).toEqual(testOrderBy);
      expect(params.limit).toEqual(testLimit);
      expect(params.fromSerial).toEqual(latestChannelSerial);
      return Promise.resolve(mockPaginatedResultWithItems([]));
    });

    const msgChannel = room.channel;

    // Force ts to recognize the channel properties
    const channel = msgChannel as RealtimeChannel & {
      properties: {
        channelSerial: string | undefined;
      };
      state: Ably.ChannelState;
    };

    // Mock the channel state to be attached so we should query with the channel serial
    vi.spyOn(channel, 'state', 'get').mockReturnValue('attached');

    // Set the serial of the channel (attachment serial)
    channel.properties.channelSerial = latestChannelSerial;

    // Subscribe to the messages
    const { historyBeforeSubscribe } = room.messages.subscribe(() => {});

    // Run a history query for the listener and check the chat api call is made with the channel serial
    await expect(historyBeforeSubscribe({ limit: 50 })).resolves.toBeTruthy();
  });

  it<TestContext>('when attach occurs, should query with correct params if listener registered before attach', async (context) => {
    const firstAttachmentSerial = '01772531200000-001@108uyDJAgBOihn12345678';
    const testOrderBy = OrderBy.NewestFirst;
    const testLimit = 50;

    let expectFunction: (roomId: string, params: GetMessagesQueryParams) => void = () => {};

    const { room, chatApi } = context;

    vi.spyOn(chatApi, 'getMessages').mockImplementation((roomId, params): Promise<Ably.PaginatedResult<Message>> => {
      expectFunction(roomId, params);
      return Promise.resolve(mockPaginatedResultWithItems([]));
    });

    const msgChannel = room.channel;
    const channel = msgChannel as RealtimeChannel & {
      properties: {
        attachSerial: string | undefined;
        fromSerial: string | undefined;
      };
    };

    // Set the serials for before attachment testing
    channel.properties.attachSerial = firstAttachmentSerial;

    const { historyBeforeSubscribe } = room.messages.subscribe(() => {});

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
      expect(params.orderBy).toEqual(testOrderBy);
      expect(params.limit).toEqual(testLimit);
      expect(params.fromSerial).toEqual(firstAttachmentSerial);
    };

    // Run a history query for the listener and check the chat api call is made with the channel attachment serial
    await expect(historyBeforeSubscribe({ limit: 50 })).resolves.toBeTruthy();

    // Now update the attach serial
    const secondAttachmentSerial = '01992531200000-001@108hhDJ2dBOihn12345678';
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
    await expect(historyBeforeSubscribe({ limit: 50 })).resolves.toBeTruthy();

    // Test the case where we receive an attached state change with resume.

    // Change attach serial again
    channel.properties.attachSerial = '01122531200000-001@108hhDJ2dBOihn12345678';

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
    await expect(historyBeforeSubscribe({ limit: 50 })).resolves.toBeTruthy();
  });

  it<TestContext>('when attach occurs, should query with correct params if listener register after attach', async (context) => {
    // Testing the case where the channel is already attached and we have a channel serial set
    const firstChannelSerial = '01992531200000-001@abghhDJ2dBOihn12345678';
    const firstAttachSerial = '01992531200000-001@ackhhDJ2dBOihn12345678';
    const testOrderBy = OrderBy.NewestFirst;
    const testLimit = 50;

    let expectFunction: (roomId: string, params: GetMessagesQueryParams) => void = () => {};

    const { room, chatApi } = context;

    vi.spyOn(chatApi, 'getMessages').mockImplementation((roomId, params): Promise<Ably.PaginatedResult<Message>> => {
      expectFunction(roomId, params);
      return Promise.resolve(mockPaginatedResultWithItems([]));
    });

    const msgChannel = room.channel;
    const channel = msgChannel as RealtimeChannel & {
      properties: {
        attachSerial: string | undefined;
        channelSerial: string | undefined;
      };
    };

    vi.spyOn(channel, 'whenState').mockImplementation(() => {
      return Promise.resolve(null);
    });

    // Set the serials for the channel
    channel.properties.channelSerial = firstChannelSerial;
    channel.properties.attachSerial = firstAttachSerial;

    // Mock the channel state to be attached
    vi.spyOn(channel, 'state', 'get').mockReturnValue('attached');

    // Subscribe to the messages
    const { historyBeforeSubscribe } = room.messages.subscribe(() => {});

    // Check we are using the channel serial
    expectFunction = (roomId: string, params: GetMessagesQueryParams) => {
      expect(roomId).toEqual(room.roomId);
      expect(params.orderBy).toEqual(testOrderBy);
      expect(params.limit).toEqual(testLimit);
      expect(params.fromSerial).toEqual(firstChannelSerial);
    };

    // Run a history query for the listener and check the chat api call is made with the channel serial
    await expect(historyBeforeSubscribe({ limit: 50 })).resolves.toBeTruthy();

    // Change the attach and channel serials
    const secondChannelSerial = '01992531200000-001@108hhDJ2hpOihn12345678';
    const secondAttachSerial = '01992531200000-001@108hGGJ2hpOill12345678';
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
    await expect(historyBeforeSubscribe({ limit: 50 })).resolves.toBeTruthy();

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
    await expect(historyBeforeSubscribe({ limit: 50 })).resolves.toBeTruthy();
  });

  it<TestContext>('when update occurs, should query with correct params', async (context) => {
    // We have tested most of the state change handling logic in previous tests, this test is to ensure that the correct
    // update state change logic is followed when the current and previous states are 'attached'

    const firstChannelSerial = '01992531200000-001@108hhDJ2hpInKn12345678';
    const firstAttachSerial = '01992531200000-001@108hhDJBiKOihn12345678';
    const testOrderBy = OrderBy.NewestFirst;
    const testLimit = 50;

    let expectFunction: (roomId: string, params: GetMessagesQueryParams) => void = () => {};

    const { room, chatApi } = context;

    vi.spyOn(chatApi, 'getMessages').mockImplementation((roomId, params): Promise<Ably.PaginatedResult<Message>> => {
      expectFunction(roomId, params);
      return Promise.resolve(mockPaginatedResultWithItems([]));
    });

    const msgChannel = room.channel;
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

    // Set the serials for the channel
    channel.properties.channelSerial = firstChannelSerial;
    channel.properties.attachSerial = firstAttachSerial;

    // Mock the channel state to be attached
    vi.spyOn(channel, 'state', 'get').mockReturnValue('attached');

    // Subscribe to the messages
    const { historyBeforeSubscribe } = room.messages.subscribe(() => {});

    // Check we are using the channel serial
    expectFunction = (roomId: string, params: GetMessagesQueryParams) => {
      expect(roomId).toEqual(room.roomId);
      expect(params.orderBy).toEqual(testOrderBy);
      expect(params.limit).toEqual(testLimit);
      expect(params.fromSerial).toEqual(firstChannelSerial);
    };

    // Run a history query for the listener and check the chat api call is made with the channel serial
    await historyBeforeSubscribe({ limit: 50 });

    // Change the attach and channel serials
    const secondChannelSerial = '01992531200000-001@108StIJ2hpOihn12345678';
    const secondAttachSerial = '01992531200000-001@108DrInOhpOihn12345678';
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
    await expect(historyBeforeSubscribe({ limit: 50 })).resolves.toBeTruthy();

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
    await expect(historyBeforeSubscribe({ limit: 50 })).resolves.toBeTruthy();

    // Change the attach serial again
    channel.properties.attachSerial = '01992531200000-001@108DrInRiKGihn12345678';

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
    await expect(historyBeforeSubscribe({ limit: 50 })).resolves.toBeTruthy();
  });
});

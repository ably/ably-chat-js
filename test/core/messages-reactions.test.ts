import * as Ably from 'ably';
import { RealtimeChannel } from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatApi, GetMessagesQueryParams } from '../../src/core/chat-api.ts';
import {
  ChatMessageActions,
  MessageEvents,
  MessageReactionEvents,
  MessageReactionRawEvent,
  ReactionRefType,
} from '../../src/core/events.ts';
import { Message } from '../../src/core/message.ts';
import { DefaultMessages, MessageRawReactionListener, OrderBy } from '../../src/core/messages.ts';
import { Room } from '../../src/core/room.ts';
import {
  channelAnnotationEventEmitter,
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
  emulateBackendAnnotation: ChannelEventEmitterReturnType<Partial<Ably.Annotation>>;
  room: Room;
}

vi.mock('ably');

describe('MessagesReactions', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = new Ably.Realtime({ clientId: 'clientId', key: 'key' });
    context.chatApi = new ChatApi(context.realtime, makeTestLogger());
    context.room = makeRandomRoom({ chatApi: context.chatApi, realtime: context.realtime });
    const channel = context.room.messages.channel;
    context.emulateBackendPublish = channelEventEmitter(channel);
    context.emulateBackendStateChange = channelStateEventEmitter(channel);
    context.emulateBackendAnnotation = channelAnnotationEventEmitter(channel);
  });

  describe('add message reaction', () => {
    it<TestContext>('should correctly send message reaction', async (context) => {
      const { chatApi } = context;
      const timestamp = Date.now();
      const serial = 'abcdefghij@' + String(timestamp) + '-123';
      vi.spyOn(chatApi, 'addMessageReaction').mockResolvedValue();

      context.room.messages.reactions.add({ serial: serial }, ReactionRefType.Unique, '🥕');
      expect(chatApi.addMessageReaction).toHaveBeenLastCalledWith(context.room.roomId, serial, {
        refType: ReactionRefType.Unique,
        reaction: '🥕',
      });

      context.room.messages.reactions.add({ serial: serial }, ReactionRefType.Distinct, '🥕');
      expect(chatApi.addMessageReaction).toHaveBeenLastCalledWith(context.room.roomId, serial, {
        refType: ReactionRefType.Distinct,
        reaction: '🥕',
      });

      context.room.messages.reactions.add({ serial: serial }, ReactionRefType.Multiple, '🥕');
      expect(chatApi.addMessageReaction).toHaveBeenLastCalledWith(context.room.roomId, serial, {
        refType: ReactionRefType.Multiple,
        reaction: '🥕',
        count: 1,
      });

      context.room.messages.reactions.add({ serial: serial }, ReactionRefType.Multiple, '🥕', 10);
      expect(chatApi.addMessageReaction).toHaveBeenLastCalledWith(context.room.roomId, serial, {
        refType: ReactionRefType.Multiple,
        reaction: '🥕',
        count: 10,
      });
    });
  });

  describe('subscribing to message reactions', () => {
    it<TestContext>('should receive summary events', (context) =>
      new Promise<void>((done, reject) => {
        const publishTimestamp = Date.now();

        const timeout = setTimeout(() => {
          reject(new Error('did not receive all message events'));
        }, 300);

        context.room.messages.subscribe((event) => {
          reject(new Error('should not receive message events but received: ' + JSON.stringify(event)));
        });

        const expected = [
          { refSerial: '01672531200000-123@xyzdefghij', unique: { '🥦': { total: 1, clientIds: ['user1'] } } },
          { refSerial: '01672531200001-123@xyzdefghij', distinct: { '🥦': { total: 1, clientIds: ['user2'] } } },
          { refSerial: '01672531200002-123@xyzdefghij', multiple: { '🍌': { clienIds: { user1: 10 }, total: 10 } } },
        ];

        let nextExpected = 0;
        context.room.messages.reactions.subscribe((found) => {
          try {
            if (nextExpected >= expected.length) {
              reject(new Error('received more events than expected'));
            }
            const exp = expected[nextExpected];
            if (!exp) {
              return;
            } // pleasing typescript
            console.log('received event', found);
            expect(found).toMatchObject(exp);

            nextExpected++;
            if (nextExpected >= expected.length) {
              clearTimeout(timeout);
              done();
            }
          } catch (error) {
            // the listener is wrapped in a try-catch so the test will fail with a useless error
            // instead of the real one if we don't try-catch here as well
            reject(error);
          }
        });

        context.emulateBackendPublish({
          name: 'chat.message',
          serial: '01672531200000-123@abcdefghij',
          version: '01672531200000-123@abcdefghij',
          refSerial: '01672531200000-123@xyzdefghij',
          action: ChatMessageActions.MessageAnnotationSummary,
          timestamp: publishTimestamp,
          summary: {
            [ReactionRefType.Unique]: { '🥦': { total: 1, clientIds: ['user1'] } },
          },
        });

        context.emulateBackendPublish({
          name: 'chat.message',
          serial: '01672531200001-123@abcdefghij',
          version: '01672531200001-123@abcdefghij',
          refSerial: '01672531200001-123@xyzdefghij',
          action: ChatMessageActions.MessageAnnotationSummary,
          timestamp: publishTimestamp,
          summary: {
            [ReactionRefType.Distinct]: { '🥦': { total: 1, clientIds: ['user2'] } },
          },
        });

        context.emulateBackendPublish({
          name: 'chat.message',
          serial: '01672531200002-123@abcdefghij',
          version: '01672531200002-123@abcdefghij',
          refSerial: '01672531200002-123@xyzdefghij',
          action: ChatMessageActions.MessageAnnotationSummary,
          timestamp: publishTimestamp,
          summary: {
            [ReactionRefType.Multiple]: { '🍌': { clienIds: { user1: 10 }, total: 10 } },
          },
        });
      }));

    it<TestContext>('should receive raw reaction events', (context) =>
      new Promise<void>((done, reject) => {
        const publishTimestamp = Date.now();

        const timeout = setTimeout(() => {
          reject(new Error('did not receive all message events'));
        }, 300);

        const expected: MessageReactionRawEvent[] = [
          {
            refSerial: '01672531200000-123@xyzdefghij',
            type: MessageReactionEvents.Create,
            reaction: '🥦',
            clientId: 'u1',
            refType: ReactionRefType.Unique,
            timestamp: new Date(publishTimestamp),
          },
          {
            refSerial: '01672531200000-123@xyzdefghij',
            type: MessageReactionEvents.Delete,
            reaction: '',
            clientId: 'u1',
            refType: ReactionRefType.Unique,
            timestamp: new Date(publishTimestamp),
          },
          {
            refSerial: '01672531200000-123@xyzdefghij',
            type: MessageReactionEvents.Create,
            reaction: '🚀',
            clientId: 'u1',
            refType: ReactionRefType.Distinct,
            timestamp: new Date(publishTimestamp),
          },
          {
            refSerial: '01672531200000-123@xyzdefghij',
            type: MessageReactionEvents.Create,
            reaction: '🔥',
            clientId: 'u1',
            refType: ReactionRefType.Multiple,
            count: 10,
            timestamp: new Date(publishTimestamp),
          },
          {
            refSerial: '01672531200000-123@xyzdefghij',
            type: MessageReactionEvents.Create,
            reaction: '👍',
            clientId: 'u1',
            refType: ReactionRefType.Multiple,
            count: 1,
            timestamp: new Date(publishTimestamp),
          },
          {
            refSerial: '01672531200000-123@xyzdefghij',
            type: MessageReactionEvents.Delete,
            reaction: '🍌',
            clientId: 'u1',
            refType: ReactionRefType.Multiple,
            timestamp: new Date(publishTimestamp),
          },
        ];

        let nextExpected = 0;
        context.room.messages.reactions.subscribeRaw((found) => {
          try {
            if (nextExpected >= expected.length) {
              reject(new Error('received more events than expected'));
            }
            const exp = expected[nextExpected];
            if (!exp) {
              return;
            } // pleasing typescript
            expect(found).toEqual(exp);

            nextExpected++;
            if (nextExpected >= expected.length) {
              clearTimeout(timeout);
              done();
            }
          } catch (error) {
            // the listener is wrapped in a try-catch so the test will fail with a useless error
            // instead of the real one if we don't try-catch here as well
            reject(error);
          }
        });

        context.emulateBackendAnnotation({
          serial: '01672531200000-123@abcdefghij',
          refSerial: '01672531200000-123@xyzdefghij',
          refType: ReactionRefType.Unique,
          clientId: 'u1',
          data: '🥦',
          action: 'annotation.create',
          timestamp: publishTimestamp,
        });

        context.emulateBackendAnnotation({
          serial: '01672531200002-123@abcdefghij',
          refSerial: '01672531200000-123@xyzdefghij',
          refType: ReactionRefType.Unique,
          clientId: 'u1',
          action: 'annotation.delete',
          timestamp: publishTimestamp,
        });

        context.emulateBackendAnnotation({
          serial: '01672531200003-123@abcdefghij',
          refSerial: '01672531200000-123@xyzdefghij',
          refType: ReactionRefType.Distinct,
          data: '🚀',
          clientId: 'u1',
          action: 'annotation.create',
          timestamp: publishTimestamp,
        });

        context.emulateBackendAnnotation({
          serial: '01672531200004-123@abcdefghij',
          refSerial: '01672531200000-123@xyzdefghij',
          refType: ReactionRefType.Multiple,
          data: JSON.stringify({ reaction: '🔥', count: 10 }),
          clientId: 'u1',
          action: 'annotation.create',
          timestamp: publishTimestamp,
        });

        context.emulateBackendAnnotation({
          serial: '01672531200005-123@abcdefghij',
          refSerial: '01672531200000-123@xyzdefghij',
          refType: ReactionRefType.Multiple,
          data: JSON.stringify({ reaction: '👍' }),
          clientId: 'u1',
          action: 'annotation.create',
          timestamp: publishTimestamp,
        });

        context.emulateBackendAnnotation({
          serial: '01672531200006-123@abcdefghij',
          refSerial: '01672531200000-123@xyzdefghij',
          refType: ReactionRefType.Multiple,
          data: JSON.stringify({ reaction: '🍌' }),
          clientId: 'u1',
          action: 'annotation.delete',
          timestamp: publishTimestamp,
        });
      }));
  });

  it<TestContext>('should unsubscribe from summary events', async (context) => {
    const { room } = context;
    let c1 = 0;
    let c2 = 0;
    let cu = 0;

    const s1 = room.messages.reactions.subscribe((_event) => {
      c1++;
    });
    const s2 = room.messages.reactions.subscribe((_event) => {
      c2++;
    });
    const uniqueListener = () => {
      cu++;
    };
    const s3 = room.messages.reactions.subscribe(uniqueListener);
    const s4 = room.messages.reactions.subscribe(uniqueListener);

    const publishTimestamp = Date.now();

    context.emulateBackendPublish({
      name: 'chat.message',
      serial: '01672531200000-123@abcdefghij',
      version: '01672531200000-123@abcdefghij',
      refSerial: '01672531200000-123@xyzdefghij',
      action: ChatMessageActions.MessageAnnotationSummary,
      timestamp: publishTimestamp,
      summary: {
        [ReactionRefType.Unique]: { '🥦': { total: 1, clientIds: ['user1'] } },
      },
    });

    expect(c1).toEqual(1);
    expect(c2).toEqual(1);
    expect(cu).toEqual(2);

    context.emulateBackendPublish({
      name: 'chat.message',
      serial: '01672531200000-123@abcdefghij',
      version: '01672531200000-123@abcdefghij',
      refSerial: '01672531200000-123@xyzdefghij',
      action: ChatMessageActions.MessageAnnotationSummary,
      timestamp: publishTimestamp,
      summary: {
        [ReactionRefType.Unique]: { '🥦': { total: 1, clientIds: ['user1'] } },
      },
    });

    expect(c1).toEqual(2);
    expect(c2).toEqual(2);
    expect(cu).toEqual(4);

    s2.unsubscribe();
    s3.unsubscribe();

    context.emulateBackendPublish({
      name: 'chat.message',
      serial: '01672531200000-123@abcdefghij',
      version: '01672531200000-123@abcdefghij',
      refSerial: '01672531200000-123@xyzdefghij',
      action: ChatMessageActions.MessageAnnotationSummary,
      timestamp: publishTimestamp,
      summary: {
        [ReactionRefType.Unique]: { '🥦': { total: 1, clientIds: ['user1'] } },
      },
    });

    expect(c1).toEqual(3);
    expect(c2).toEqual(2);
    expect(cu).toEqual(5);

    s1.unsubscribe();
    s4.unsubscribe();

    context.emulateBackendPublish({
      name: 'chat.message',
      serial: '01672531200000-123@abcdefghij',
      version: '01672531200000-123@abcdefghij',
      refSerial: '01672531200000-123@xyzdefghij',
      action: ChatMessageActions.MessageAnnotationSummary,
      timestamp: publishTimestamp,
      summary: {
        [ReactionRefType.Unique]: { '🥦': { total: 1, clientIds: ['user1'] } },
      },
    });

    expect(c1).toEqual(3);
    expect(c2).toEqual(2);
    expect(cu).toEqual(5);
  });

  it<TestContext>('should unsubscribe from raw events', async (context) => {
    const { room } = context;
    let c1 = 0;
    let c2 = 0;
    let cu = 0;

    const s1 = room.messages.reactions.subscribeRaw((_event) => {
      c1++;
    });
    const s2 = room.messages.reactions.subscribeRaw((_event) => {
      c2++;
    });
    const uniqueListener = () => {
      cu++;
    };
    const s3 = room.messages.reactions.subscribeRaw(uniqueListener);
    const s4 = room.messages.reactions.subscribeRaw(uniqueListener);

    const publishTimestamp = Date.now();

    context.emulateBackendAnnotation({
      serial: '01672531200003-123@abcdefghij',
      refSerial: '01672531200000-123@xyzdefghij',
      refType: ReactionRefType.Distinct,
      data: '🚀',
      clientId: 'u1',
      action: 'annotation.create',
      timestamp: publishTimestamp,
    });

    expect(c1).toEqual(1);
    expect(c2).toEqual(1);
    expect(cu).toEqual(2);

    context.emulateBackendAnnotation({
      serial: '01672531200003-123@abcdefghij',
      refSerial: '01672531200000-123@xyzdefghij',
      refType: ReactionRefType.Distinct,
      data: '🚀',
      clientId: 'u1',
      action: 'annotation.create',
      timestamp: publishTimestamp,
    });

    expect(c1).toEqual(2);
    expect(c2).toEqual(2);
    expect(cu).toEqual(4);

    s2.unsubscribe();
    s3.unsubscribe();

    context.emulateBackendAnnotation({
      serial: '01672531200003-123@abcdefghij',
      refSerial: '01672531200000-123@xyzdefghij',
      refType: ReactionRefType.Distinct,
      data: '🚀',
      clientId: 'u1',
      action: 'annotation.create',
      timestamp: publishTimestamp,
    });

    expect(c1).toEqual(3);
    expect(c2).toEqual(2);
    expect(cu).toEqual(5);

    s1.unsubscribe();
    s4.unsubscribe();

    context.emulateBackendAnnotation({
      serial: '01672531200003-123@abcdefghij',
      refSerial: '01672531200000-123@xyzdefghij',
      refType: ReactionRefType.Distinct,
      data: '🚀',
      clientId: 'u1',
      action: 'annotation.create',
      timestamp: publishTimestamp,
    });

    expect(c1).toEqual(3);
    expect(c2).toEqual(2);
    expect(cu).toEqual(5);
  });

  describe.each([
    [
      'unknown refType',
      {
        serial: '01672531200003-123@abcdefghij',
        refSerial: '01672531200000-123@xyzdefghij',
        refType: 'reaction:unknown.v1',
        data: '🚀',
        clientId: 'u1',
        action: 'annotation.create',
        timestamp: Date.now(),
      },
    ],
    [
      'unknown action',
      {
        serial: '01672531200003-123@abcdefghij',
        refSerial: '01672531200000-123@xyzdefghij',
        refType: ReactionRefType.Distinct,
        data: '🚀',
        clientId: 'u1',
        action: 'annotation.bla',
        timestamp: Date.now(),
      },
    ],
    [
      'no data',
      {
        serial: '01672531200003-123@abcdefghij',
        refSerial: '01672531200000-123@xyzdefghij',
        refType: ReactionRefType.Distinct,
        clientId: 'u1',
        action: 'annotation.create',
        timestamp: Date.now(),
      },
    ],
    [
      'no refSerial',
      {
        serial: '01672531200003-123@abcdefghij',
        refType: ReactionRefType.Distinct,
        data: '🚀',
        clientId: 'u1',
        action: 'annotation.create',
        timestamp: Date.now(),
      },
    ],
  ])('invalid incoming raw reactions', (name: string, inboundMessage: unknown) => {
    it<TestContext>('should handle invalid inbound raw reaction: ' + name, (context) => {
      const room = context.room;
      let listenerCalled = false;
      room.messages.reactions.subscribeRaw(() => {
        listenerCalled = true;
      });

      context.emulateBackendAnnotation(inboundMessage as Ably.Annotation);
      expect(listenerCalled).toBe(false);
    });
  });

  it<TestContext>('should throw error when subscribing to raw reactions if not enabled', (context) => {
    const room = makeRandomRoom({
      options: { messages: { rawMessageReactions: false } },
      chatApi: context.chatApi,
      realtime: context.realtime,
    });

    expect(() => {
      room.messages.reactions.subscribeRaw(() => {});
    }).toThrowErrorInfo({ code: 40001, message: 'Raw message reactions are not enabled', statusCode: 400 });
  });
});

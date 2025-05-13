import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatApi } from '../../src/core/chat-api.ts';
import {
  ChatMessageActions,
  MessageReactionEvents,
  MessageReactionRawEvent,
  MessageReactionType,
} from '../../src/core/events.ts';
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
  describe('message reaction basics', () => {
    beforeEach<TestContext>((context) => {
      context.realtime = new Ably.Realtime({ clientId: 'clientId', key: 'key' });
      context.chatApi = new ChatApi(context.realtime, makeTestLogger());
      context.room = makeRandomRoom({ chatApi: context.chatApi, realtime: context.realtime });
      const channel = context.room.channel;
      context.emulateBackendPublish = channelEventEmitter(channel);
      context.emulateBackendStateChange = channelStateEventEmitter(channel);
      context.emulateBackendAnnotation = channelAnnotationEventEmitter(channel);
    });

    it<TestContext>('should correctly send message reaction', async (context) => {
      const { chatApi } = context;
      const timestamp = Date.now();
      const serial = 'abcdefghij@' + String(timestamp) + '-123';
      vi.spyOn(chatApi, 'addMessageReaction').mockResolvedValue();

      const msg = { serial: serial };

      await context.room.messages.reactions.add(msg, { type: MessageReactionType.Unique, name: '🥕' });
      expect(chatApi.addMessageReaction).toHaveBeenLastCalledWith(context.room.roomId, serial, {
        type: MessageReactionType.Unique,
        name: '🥕',
      });

      await context.room.messages.reactions.add(msg, { type: MessageReactionType.Distinct, name: '🥕' });
      expect(chatApi.addMessageReaction).toHaveBeenLastCalledWith(context.room.roomId, serial, {
        type: MessageReactionType.Distinct,
        name: '🥕',
      });

      await context.room.messages.reactions.add(msg, { type: MessageReactionType.Multiple, name: '🥕' });
      expect(chatApi.addMessageReaction).toHaveBeenLastCalledWith(context.room.roomId, serial, {
        type: MessageReactionType.Multiple,
        name: '🥕',
        count: 1,
      });

      await context.room.messages.reactions.add(msg, { type: MessageReactionType.Multiple, name: '🥕', count: 10 });
      expect(chatApi.addMessageReaction).toHaveBeenLastCalledWith(context.room.roomId, serial, {
        type: MessageReactionType.Multiple,
        name: '🥕',
        count: 10,
      });

      // default is distinct for AllFeaturesEnabled
      await context.room.messages.reactions.add(msg, { name: '👻' });
      expect(chatApi.addMessageReaction).toHaveBeenLastCalledWith(context.room.roomId, serial, {
        type: MessageReactionType.Distinct,
        name: '👻',
      });
    });

    it<TestContext>('should correctly delete message reaction', async (context) => {
      const { chatApi } = context;
      const timestamp = Date.now();
      const serial = 'abcdefghij@' + String(timestamp) + '-123';
      vi.spyOn(chatApi, 'deleteMessageReaction').mockResolvedValue();

      const msg = { serial: serial };

      await context.room.messages.reactions.delete(msg, { type: MessageReactionType.Unique });
      expect(chatApi.deleteMessageReaction).toHaveBeenLastCalledWith(context.room.roomId, serial, {
        type: MessageReactionType.Unique,
      });

      await context.room.messages.reactions.delete(msg, { type: MessageReactionType.Distinct, name: '🥕' });
      expect(chatApi.deleteMessageReaction).toHaveBeenLastCalledWith(context.room.roomId, serial, {
        type: MessageReactionType.Distinct,
        name: '🥕',
      });

      await context.room.messages.reactions.delete(msg, { type: MessageReactionType.Multiple, name: '🥕' });
      expect(chatApi.deleteMessageReaction).toHaveBeenLastCalledWith(context.room.roomId, serial, {
        type: MessageReactionType.Multiple,
        name: '🥕',
      });

      // default is distinct for AllFeaturesEnabled
      await context.room.messages.reactions.delete(msg, { name: '👻' });
      expect(chatApi.deleteMessageReaction).toHaveBeenLastCalledWith(context.room.roomId, serial, {
        type: MessageReactionType.Distinct,
        name: '👻',
      });
    });

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
          { messageSerial: '01672531200000-123@xyzdefghij', unique: { '🥦': { total: 1, clientIds: ['user1'] } } },
          { messageSerial: '01672531200001-123@xyzdefghij', distinct: { '🥦': { total: 1, clientIds: ['user2'] } } },
          {
            messageSerial: '01672531200002-123@xyzdefghij',
            multiple: { '🍌': { clientIds: { user1: 10 }, total: 10 } },
          },
          { messageSerial: '01672531200002-123@xyzdefghij' },
          { messageSerial: '01672531200002-123@xyzdefghij' },
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
            expect(found, 'idx=' + String(nextExpected)).toMatchObject({ summary: exp });

            nextExpected++;
            if (nextExpected >= expected.length) {
              clearTimeout(timeout);
              done();
            }
          } catch (error: unknown) {
            // the listener is wrapped in a try-catch so the test will fail with a useful error
            reject(error as Error);
          }
        });

        context.emulateBackendPublish({
          name: 'chat.message',
          serial: '01672531200000-123@xyzdefghij',
          version: '01672531200000-123@abcdefghij',
          action: ChatMessageActions.MessageAnnotationSummary,
          timestamp: publishTimestamp,
          summary: {
            [MessageReactionType.Unique]: { '🥦': { total: 1, clientIds: ['user1'] } },
          },
        });

        context.emulateBackendPublish({
          name: 'chat.message',
          serial: '01672531200001-123@xyzdefghij',
          version: '01672531200001-123@abcdefghij',
          action: ChatMessageActions.MessageAnnotationSummary,
          timestamp: publishTimestamp,
          summary: {
            [MessageReactionType.Distinct]: { '🥦': { total: 1, clientIds: ['user2'] } },
          },
        });

        context.emulateBackendPublish({
          name: 'chat.message',
          serial: '01672531200002-123@xyzdefghij',
          version: '01672531200002-123@abcdefghij',
          action: ChatMessageActions.MessageAnnotationSummary,
          timestamp: publishTimestamp,
          summary: {
            [MessageReactionType.Multiple]: { '🍌': { clientIds: { user1: 10 }, total: 10, totalUnidentified: 0 } },
          },
        });

        context.emulateBackendPublish({
          name: 'chat.message',
          serial: '01672531200002-123@xyzdefghij',
          version: '01672531200002-123@abcdefghij',
          action: ChatMessageActions.MessageAnnotationSummary,
          timestamp: publishTimestamp,
          summary: {},
        });

        context.emulateBackendPublish({
          name: 'chat.message',
          serial: '01672531200002-123@xyzdefghij',
          version: '01672531200002-123@abcdefghij',
          action: ChatMessageActions.MessageAnnotationSummary,
          timestamp: publishTimestamp,
        });
      }));

    it<TestContext>('should unsubscribe from summary events', (context) => {
      const { room } = context;
      let c1 = 0;
      let c2 = 0;
      let cu = 0;

      const s1 = room.messages.reactions.subscribe(() => {
        c1++;
      });
      const s2 = room.messages.reactions.subscribe(() => {
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
        summary: { [MessageReactionType.Unique]: { '🥦': { total: 1, clientIds: ['user1'] } } },
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
        summary: { [MessageReactionType.Unique]: { '🥦': { total: 1, clientIds: ['user1'] } } },
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
        summary: { [MessageReactionType.Unique]: { '🥦': { total: 1, clientIds: ['user1'] } } },
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
        summary: { [MessageReactionType.Unique]: { '🥦': { total: 1, clientIds: ['user1'] } } },
      });

      expect(c1).toEqual(3);
      expect(c2).toEqual(2);
      expect(cu).toEqual(5);
    });
  });

  describe('raw message reactions', () => {
    beforeEach<TestContext>((context) => {
      context.realtime = new Ably.Realtime({ clientId: 'clientId', key: 'key' });
      context.chatApi = new ChatApi(context.realtime, makeTestLogger());
      context.room = makeRandomRoom({
        chatApi: context.chatApi,
        realtime: context.realtime,
        options: { messages: { rawMessageReactions: true } },
      });
      const channel = context.room.channel;
      context.emulateBackendPublish = channelEventEmitter(channel);
      context.emulateBackendStateChange = channelStateEventEmitter(channel);
      context.emulateBackendAnnotation = channelAnnotationEventEmitter(channel);
    });

    it<TestContext>('should receive raw reaction events', (context) =>
      new Promise<void>((done, reject) => {
        const publishTimestamp = Date.now();

        const timeout = setTimeout(() => {
          reject(new Error('did not receive all message events'));
        }, 300);

        const expected: MessageReactionRawEvent[] = [
          {
            type: MessageReactionEvents.Create,
            timestamp: new Date(publishTimestamp),
            reaction: {
              messageSerial: '01672531200000-123@xyzdefghij',
              name: '🥦',
              clientId: 'u1',
              type: MessageReactionType.Unique,
            },
          },
          {
            type: MessageReactionEvents.Delete,
            timestamp: new Date(publishTimestamp),
            reaction: {
              messageSerial: '01672531200000-123@xyzdefghij',
              name: '',
              clientId: 'u1',
              type: MessageReactionType.Unique,
            },
          },
          {
            type: MessageReactionEvents.Create,
            timestamp: new Date(publishTimestamp),
            reaction: {
              messageSerial: '01672531200000-123@xyzdefghij',
              name: '🚀',
              clientId: 'u1',
              type: MessageReactionType.Distinct,
            },
          },
          {
            type: MessageReactionEvents.Create,
            timestamp: new Date(publishTimestamp),
            reaction: {
              messageSerial: '01672531200000-123@xyzdefghij',
              name: '🔥',
              clientId: 'u1',
              type: MessageReactionType.Multiple,
              count: 10,
            },
          },
          {
            type: MessageReactionEvents.Create,
            timestamp: new Date(publishTimestamp),
            reaction: {
              messageSerial: '01672531200000-123@xyzdefghij',
              name: '👍',
              clientId: 'u1',
              type: MessageReactionType.Multiple,
              count: 1,
            },
          },
          {
            type: MessageReactionEvents.Delete,
            timestamp: new Date(publishTimestamp),
            reaction: {
              messageSerial: '01672531200000-123@xyzdefghij',
              name: '🍌',
              clientId: 'u1',
              type: MessageReactionType.Multiple,
            },
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
            expect(found, 'idx=' + String(nextExpected)).toEqual(exp);

            nextExpected++;
            if (nextExpected >= expected.length) {
              clearTimeout(timeout);
              done();
            }
          } catch (error: unknown) {
            // the listener is wrapped in a try-catch so the test will fail with a useless error
            // instead of the real one if we don't try-catch here as well
            reject(error as Error);
          }
        });

        context.emulateBackendAnnotation({
          serial: '01672531200000-123@abcdefghij',
          messageSerial: '01672531200000-123@xyzdefghij',
          type: MessageReactionType.Unique,
          clientId: 'u1',
          name: '🥦',
          action: 'annotation.create',
          timestamp: publishTimestamp,
        });

        context.emulateBackendAnnotation({
          serial: '01672531200002-123@abcdefghij',
          messageSerial: '01672531200000-123@xyzdefghij',
          type: MessageReactionType.Unique,
          clientId: 'u1',
          action: 'annotation.delete',
          timestamp: publishTimestamp,
        });

        context.emulateBackendAnnotation({
          serial: '01672531200003-123@abcdefghij',
          messageSerial: '01672531200000-123@xyzdefghij',
          type: MessageReactionType.Distinct,
          name: '🚀',
          clientId: 'u1',
          action: 'annotation.create',
          timestamp: publishTimestamp,
        });

        context.emulateBackendAnnotation({
          serial: '01672531200004-123@abcdefghij',
          messageSerial: '01672531200000-123@xyzdefghij',
          type: MessageReactionType.Multiple,
          name: '🔥',
          count: 10,
          encoding: 'json',
          clientId: 'u1',
          action: 'annotation.create',
          timestamp: publishTimestamp,
        });

        context.emulateBackendAnnotation({
          serial: '01672531200005-123@abcdefghij',
          messageSerial: '01672531200000-123@xyzdefghij',
          type: MessageReactionType.Multiple,
          name: '👍',
          encoding: 'json',
          clientId: 'u1',
          action: 'annotation.create',
          timestamp: publishTimestamp,
        });

        context.emulateBackendAnnotation({
          serial: '01672531200006-123@abcdefghij',
          messageSerial: '01672531200000-123@xyzdefghij',
          type: MessageReactionType.Multiple,
          name: '🍌',
          encoding: 'json',
          clientId: 'u1',
          action: 'annotation.delete',
          timestamp: publishTimestamp,
        });
      }));

    it<TestContext>('should unsubscribe from raw events', (context) => {
      const { room } = context;
      let c1 = 0;
      let c2 = 0;
      let cu = 0;

      const s1 = room.messages.reactions.subscribeRaw(() => {
        c1++;
      });
      const s2 = room.messages.reactions.subscribeRaw(() => {
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
        messageSerial: '01672531200000-123@xyzdefghij',
        type: MessageReactionType.Distinct,
        name: '🚀',
        clientId: 'u1',
        action: 'annotation.create',
        timestamp: publishTimestamp,
      });

      expect(c1).toEqual(1);
      expect(c2).toEqual(1);
      expect(cu).toEqual(2);

      context.emulateBackendAnnotation({
        serial: '01672531200003-123@abcdefghij',
        messageSerial: '01672531200000-123@xyzdefghij',
        type: MessageReactionType.Distinct,
        name: '🚀',
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
        messageSerial: '01672531200000-123@xyzdefghij',
        type: MessageReactionType.Distinct,
        name: '🚀',
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
        messageSerial: '01672531200000-123@xyzdefghij',
        type: MessageReactionType.Distinct,
        name: '🚀',
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
        'unknown annotation type',
        {
          serial: '01672531200003-123@abcdefghij',
          messageSerial: '01672531200000-123@xyzdefghij',
          type: 'reaction:unknown.v1',
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
          messageSerial: '01672531200000-123@xyzdefghij',
          type: MessageReactionType.Distinct,
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
          messageSerial: '01672531200000-123@xyzdefghij',
          type: MessageReactionType.Distinct,
          clientId: 'u1',
          action: 'annotation.create',
          timestamp: Date.now(),
        },
      ],
      [
        'no messageSerial',
        {
          serial: '01672531200003-123@abcdefghij',
          type: MessageReactionType.Distinct,
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
});

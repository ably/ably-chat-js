import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatApi } from '../../src/core/chat-api.ts';
import {
  MessageReactionRawEvent,
  MessageReactionRawEventType,
  MessageReactionType,
  ReactionAnnotationType,
} from '../../src/core/events.ts';
import { DefaultMessageReactions } from '../../src/core/message-reactions.ts';
import { Room } from '../../src/core/room.ts';
import {
  channelAnnotationEventEmitter,
  channelEventEmitter,
  ChannelEventEmitterReturnType,
  channelStateEventEmitter,
  ChannelStateEventEmitterReturnType,
} from '../helper/channel.ts';
import { makeTestLogger } from '../helper/logger.ts';
import { waitForUnsubscribeTimes } from '../helper/realtime-subscriptions.ts';
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

describe('MessageReactions', () => {
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
      vi.spyOn(chatApi, 'sendMessageReaction').mockResolvedValue();

      await context.room.messages.reactions.send(serial, { type: MessageReactionType.Unique, name: '🥕' });
      expect(chatApi.sendMessageReaction).toHaveBeenLastCalledWith(context.room.name, serial, {
        type: MessageReactionType.Unique,
        name: '🥕',
      });

      await context.room.messages.reactions.send(serial, { type: MessageReactionType.Distinct, name: '🥕' });
      expect(chatApi.sendMessageReaction).toHaveBeenLastCalledWith(context.room.name, serial, {
        type: MessageReactionType.Distinct,
        name: '🥕',
      });

      await context.room.messages.reactions.send(serial, { type: MessageReactionType.Multiple, name: '🥕' });
      expect(chatApi.sendMessageReaction).toHaveBeenLastCalledWith(context.room.name, serial, {
        type: MessageReactionType.Multiple,
        name: '🥕',
        count: 1,
      });

      await context.room.messages.reactions.send(serial, { type: MessageReactionType.Multiple, name: '🥕', count: 10 });
      expect(chatApi.sendMessageReaction).toHaveBeenLastCalledWith(context.room.name, serial, {
        type: MessageReactionType.Multiple,
        name: '🥕',
        count: 10,
      });

      // default is distinct for AllFeaturesEnabled
      await context.room.messages.reactions.send(serial, { name: '👻' });
      expect(chatApi.sendMessageReaction).toHaveBeenLastCalledWith(context.room.name, serial, {
        type: MessageReactionType.Distinct,
        name: '👻',
      });
    });

    it<TestContext>('should correctly delete message reaction', async (context) => {
      const { chatApi } = context;
      const timestamp = Date.now();
      const serial = 'abcdefghij@' + String(timestamp) + '-123';
      vi.spyOn(chatApi, 'deleteMessageReaction').mockResolvedValue();

      await context.room.messages.reactions.delete(serial, { type: MessageReactionType.Unique });
      expect(chatApi.deleteMessageReaction).toHaveBeenLastCalledWith(context.room.name, serial, {
        type: MessageReactionType.Unique,
      });

      await context.room.messages.reactions.delete(serial, { type: MessageReactionType.Distinct, name: '🥕' });
      expect(chatApi.deleteMessageReaction).toHaveBeenLastCalledWith(context.room.name, serial, {
        type: MessageReactionType.Distinct,
        name: '🥕',
      });

      await context.room.messages.reactions.delete(serial, { type: MessageReactionType.Multiple, name: '🥕' });
      expect(chatApi.deleteMessageReaction).toHaveBeenLastCalledWith(context.room.name, serial, {
        type: MessageReactionType.Multiple,
        name: '🥕',
      });

      // default is distinct for AllFeaturesEnabled
      await context.room.messages.reactions.delete(serial, { name: '👻' });
      expect(chatApi.deleteMessageReaction).toHaveBeenLastCalledWith(context.room.name, serial, {
        type: MessageReactionType.Distinct,
        name: '👻',
      });
    });

    it<TestContext>('should call getClientReactions on the chat API', async (context) => {
      const { chatApi, room } = context;
      const timestamp = Date.now();
      const serial = 'abcdefghij@' + String(timestamp) + '-123';
      const clientId = 'testClient';
      const expectedReactions = {
        unique: { '🥕': { total: 1, clientIds: [clientId], clipped: false } },
        distinct: {},
        multiple: {},
      };

      vi.spyOn(chatApi, 'getClientReactions').mockResolvedValue(expectedReactions);

      const result = await room.messages.reactions.clientReactions(serial, clientId);
      expect(chatApi.getClientReactions).toHaveBeenCalledWith(room.name, serial, clientId);
      expect(result).toBe(expectedReactions);

      // Test without clientId
      await room.messages.reactions.clientReactions(serial);
      expect(chatApi.getClientReactions).toHaveBeenCalledWith(room.name, serial, undefined);
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
          {
            messageSerial: '01672531200000-123@xyzdefghij',
            reactions: { unique: { '🥦': { total: 1, clientIds: ['user1'] } } },
          },
          {
            messageSerial: '01672531200001-123@xyzdefghij',
            reactions: { distinct: { '🥦': { total: 1, clientIds: ['user2'] } } },
          },
          {
            messageSerial: '01672531200002-123@xyzdefghij',
            reactions: { multiple: { '🍌': { clientIds: { user1: 10 }, total: 10 } } },
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
            expect(found, 'idx=' + String(nextExpected)).toMatchObject({ ...exp });

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
          version: { serial: '01672531200000-123@abcdefghij', timestamp: 1672531200000 },
          action: 'message.summary',
          timestamp: publishTimestamp,
          annotations: {
            summary: {
              [ReactionAnnotationType.Unique]: { '🥦': { total: 1, clientIds: ['user1'], clipped: false } },
            },
          },
        });

        context.emulateBackendPublish({
          name: 'chat.message',
          serial: '01672531200001-123@xyzdefghij',
          version: { serial: '01672531200001-123@abcdefghij', timestamp: 1672531200001 },
          action: 'message.summary',
          timestamp: publishTimestamp,
          annotations: {
            summary: {
              [ReactionAnnotationType.Distinct]: { '🥦': { total: 1, clientIds: ['user2'], clipped: false } },
            },
          },
        });

        context.emulateBackendPublish({
          name: 'chat.message',
          serial: '01672531200002-123@xyzdefghij',
          version: { serial: '01672531200002-123@abcdefghij', timestamp: 1672531200002 },
          action: 'message.summary',
          timestamp: publishTimestamp,
          annotations: {
            summary: {
              [ReactionAnnotationType.Multiple]: {
                '🍌': { clientIds: { user1: 10 }, total: 10, totalUnidentified: 0, clipped: false, totalClientIds: 1 },
              },
            },
          },
        });

        context.emulateBackendPublish({
          name: 'chat.message',
          serial: '01672531200002-123@xyzdefghij',
          version: { serial: '01672531200002-123@abcdefghij', timestamp: 1672531200002 },
          action: 'message.summary',
          timestamp: publishTimestamp,
          annotations: {
            summary: {},
          },
        });

        context.emulateBackendPublish({
          name: 'chat.message',
          serial: '01672531200002-123@xyzdefghij',
          version: { serial: '01672531200002-123@abcdefghij', timestamp: 1672531200002 },
          action: 'message.summary',
          timestamp: publishTimestamp,
          annotations: {
            summary: {},
          },
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
        version: { serial: '01672531200000-123@abcdefghij', timestamp: 1672531200000 },
        action: 'message.summary',
        timestamp: publishTimestamp,
        annotations: {
          summary: { [ReactionAnnotationType.Unique]: { '🥦': { total: 1, clientIds: ['user1'], clipped: false } } },
        },
      });

      expect(c1).toEqual(1);
      expect(c2).toEqual(1);
      expect(cu).toEqual(2);

      context.emulateBackendPublish({
        name: 'chat.message',
        serial: '01672531200000-123@abcdefghij',
        version: { serial: '01672531200000-123@abcdefghij', timestamp: 1672531200000 },
        action: 'message.summary',
        timestamp: publishTimestamp,
        annotations: {
          summary: { [ReactionAnnotationType.Unique]: { '🥦': { total: 1, clientIds: ['user1'], clipped: false } } },
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
        version: { serial: '01672531200000-123@abcdefghij', timestamp: 1672531200000 },
        action: 'message.summary',
        timestamp: publishTimestamp,
        annotations: {
          summary: { [MessageReactionType.Unique]: { '🥦': { total: 1, clientIds: ['user1'], clipped: false } } },
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
        version: { serial: '01672531200000-123@abcdefghij', timestamp: 1672531200000 },
        action: 'message.summary',
        timestamp: publishTimestamp,
        annotations: {
          summary: { [MessageReactionType.Unique]: { '🥦': { total: 1, clientIds: ['user1'], clipped: false } } },
        },
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
        options: {
          messages: {
            rawMessageReactions: true,
          },
        },
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
            type: MessageReactionRawEventType.Create,
            timestamp: new Date(publishTimestamp),
            reaction: {
              messageSerial: '01672531200000-123@xyzdefghij',
              name: '🥦',
              clientId: 'u1',
              type: MessageReactionType.Unique,
            },
          },
          {
            type: MessageReactionRawEventType.Delete,
            timestamp: new Date(publishTimestamp),
            reaction: {
              messageSerial: '01672531200000-123@xyzdefghij',
              name: '',
              clientId: 'u1',
              type: MessageReactionType.Unique,
            },
          },
          {
            type: MessageReactionRawEventType.Create,
            timestamp: new Date(publishTimestamp),
            reaction: {
              messageSerial: '01672531200000-123@xyzdefghij',
              name: '🚀',
              clientId: 'u1',
              type: MessageReactionType.Distinct,
            },
          },
          {
            type: MessageReactionRawEventType.Create,
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
            type: MessageReactionRawEventType.Create,
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
            type: MessageReactionRawEventType.Delete,
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
          type: ReactionAnnotationType.Unique,
          clientId: 'u1',
          name: '🥦',
          action: 'annotation.create',
          timestamp: publishTimestamp,
        });

        context.emulateBackendAnnotation({
          serial: '01672531200002-123@abcdefghij',
          messageSerial: '01672531200000-123@xyzdefghij',
          type: ReactionAnnotationType.Unique,
          clientId: 'u1',
          action: 'annotation.delete',
          timestamp: publishTimestamp,
        });

        context.emulateBackendAnnotation({
          serial: '01672531200003-123@abcdefghij',
          messageSerial: '01672531200000-123@xyzdefghij',
          type: ReactionAnnotationType.Distinct,
          name: '🚀',
          clientId: 'u1',
          action: 'annotation.create',
          timestamp: publishTimestamp,
        });

        context.emulateBackendAnnotation({
          serial: '01672531200004-123@abcdefghij',
          messageSerial: '01672531200000-123@xyzdefghij',
          type: ReactionAnnotationType.Multiple,
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
          type: ReactionAnnotationType.Multiple,
          name: '👍',
          encoding: 'json',
          clientId: 'u1',
          action: 'annotation.create',
          timestamp: publishTimestamp,
        });

        context.emulateBackendAnnotation({
          serial: '01672531200006-123@abcdefghij',
          messageSerial: '01672531200000-123@xyzdefghij',
          type: ReactionAnnotationType.Multiple,
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
        type: ReactionAnnotationType.Distinct,
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
        type: ReactionAnnotationType.Distinct,
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
        type: ReactionAnnotationType.Distinct,
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
        type: ReactionAnnotationType.Distinct,
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
        'no name',
        {
          serial: '01672531200003-123@abcdefghij',
          messageSerial: '01672531200000-123@xyzdefghij',
          type: ReactionAnnotationType.Distinct,
          clientId: 'u1',
          action: 'annotation.create',
          timestamp: new Date(1),
        },
        {
          type: MessageReactionRawEventType.Create as MessageReactionRawEventType,
          timestamp: new Date(1),
          reaction: {
            messageSerial: '01672531200000-123@xyzdefghij',
            name: '',
            clientId: 'u1',
            type: MessageReactionType.Distinct,
          },
        },
      ],
      [
        'empty messageSerial',
        {
          serial: '01672531200003-123@abcdefghij',
          messageSerial: '',
          type: ReactionAnnotationType.Distinct,
          name: '🚀',
          clientId: 'u1',
          action: 'annotation.create',
          timestamp: new Date(1),
        },
        {
          type: MessageReactionRawEventType.Create as MessageReactionRawEventType,
          timestamp: new Date(1),
          reaction: {
            messageSerial: '',
            name: '🚀',
            clientId: 'u1',
            type: MessageReactionType.Distinct,
          },
        },
      ],
    ])(
      'invalid incoming raw reactions',
      (name: string, inboundMessage: unknown, expectedEvent: MessageReactionRawEvent) => {
        it<TestContext>('should handle invalid inbound raw reaction: ' + name, (context) => {
          const room = context.room;
          let receivedEvent: MessageReactionRawEvent | undefined;
          room.messages.reactions.subscribeRaw((event) => {
            receivedEvent = event;
          });

          context.emulateBackendAnnotation(inboundMessage as Ably.Annotation);
          expect(receivedEvent).toBeDefined();
          if (receivedEvent) {
            expect(receivedEvent).toMatchObject(expectedEvent);
          }
        });
      },
    );

    it<TestContext>('should ignore unknown reaction types', (context) => {
      const room = context.room;
      let receivedEvent: MessageReactionRawEvent | undefined;
      room.messages.reactions.subscribeRaw((event) => {
        receivedEvent = event;
      });

      context.emulateBackendAnnotation({
        serial: '01672531200003-123@abcdefghij',
        messageSerial: '01672531200000-123@xyzdefghij',
        type: 'not a real reaction type',
        name: '🚀',
        clientId: 'u1',
        action: 'annotation.create',
      });

      expect(receivedEvent).toBeUndefined();
    });

    it<TestContext>('should ignore unknown reaction events', (context) => {
      const room = context.room;
      let receivedEvent: MessageReactionRawEvent | undefined;
      room.messages.reactions.subscribeRaw((event) => {
        receivedEvent = event;
      });

      context.emulateBackendAnnotation({
        serial: '01672531200003-123@abcdefghij',
        messageSerial: '01672531200000-123@xyzdefghij',
        type: ReactionAnnotationType.Distinct,
        name: '🚀',
        clientId: 'u1',
        action: 'not a real action' as unknown as Ably.AnnotationAction,
      });

      expect(receivedEvent).toBeUndefined();
    });

    it<TestContext>('should throw error when subscribing to raw reactions if not enabled', (context) => {
      const room = makeRandomRoom({
        options: { messages: { rawMessageReactions: false } },
        chatApi: context.chatApi,
        realtime: context.realtime,
      });

      expect(() => {
        room.messages.reactions.subscribeRaw(() => {});
      }).toThrowErrorInfo({
        code: 102108,
        message: 'unable to subscribe to message reactions; raw message reactions are not enabled',
        statusCode: 400,
      });
    });
  });

  describe('dispose', () => {
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

    it<TestContext>('should dispose and clean up all realtime channel subscriptions', async (context) => {
      const { room } = context;
      const channel = room.channel;
      const reactions = room.messages.reactions as unknown as DefaultMessageReactions;

      // Mock channel methods
      vi.spyOn(channel, 'unsubscribe').mockImplementation(() => {});
      vi.spyOn(channel.annotations, 'unsubscribe').mockImplementation(() => {});

      // Dispose should clean up listeners and not throw
      expect(() => {
        reactions.dispose();
      }).not.toThrow();

      // Assert - verify the listeners were unsubscribed
      await waitForUnsubscribeTimes(channel, 1); // Summary listener
      await waitForUnsubscribeTimes(channel.annotations, 1); // Raw listener

      // Verify that user-provided listeners were unsubscribed
      expect(reactions.hasListeners()).toBe(false);
    });

    it<TestContext>('should remove user-level listeners from emitter', (context) => {
      const reactions = context.room.messages.reactions as DefaultMessageReactions;

      // Subscribe to add listeners
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      reactions.subscribe(listener1);
      reactions.subscribeRaw(listener2);

      // Emulate a reaction
      context.emulateBackendAnnotation({
        serial: '01672531200003-123@abcdefghij',
        messageSerial: '01672531200000-123@xyzdefghij',
        type: ReactionAnnotationType.Distinct,
        name: '🚀',
        action: 'annotation.create',
        timestamp: Date.now(),
      });

      // Emulate a summary update

      context.emulateBackendPublish({
        name: 'chat.message',
        serial: '01672531200000-123@xyzdefghij',
        version: { serial: '01672531200000-123@abcdefghij', timestamp: 1672531200000 },
        action: 'message.summary',
        timestamp: Date.now(),
        annotations: {
          summary: {
            [ReactionAnnotationType.Unique]: { '🥦': { total: 1, clientIds: ['user1'], clipped: false } },
          },
        },
      });

      // Verify that the listeners were called
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);

      // Reset the listeners
      listener1.mockClear();
      listener2.mockClear();

      // Dispose should clean up listeners and not throw
      expect(() => {
        reactions.dispose();
      }).not.toThrow();

      // Call EmulateBackendAnnotation to trigger a reaction
      context.emulateBackendAnnotation({
        serial: '01672531200003-123@abcdefghij',
        messageSerial: '01672531200000-123@xyzdefghij',
        type: ReactionAnnotationType.Distinct,
        name: '🚀',
        action: 'annotation.create',
        timestamp: Date.now(),
      });

      // Emulate a summary update
      context.emulateBackendPublish({
        name: 'chat.message',
        serial: '01672531200000-123@xyzdefghij',
        version: { serial: '01672531200000-123@abcdefghij', timestamp: 1672531200000 },
        action: 'message.summary',
        timestamp: Date.now(),
        annotations: {
          summary: {},
        },
      });

      // Verify that the listeners were not called
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();

      // Verify that user-provided listeners were unsubscribed
      expect(reactions.hasListeners()).toBe(false);

      // Cleanup should not fail on multiple calls
      expect(() => {
        reactions.dispose();
      }).not.toThrow();
    });

    it<TestContext>('should handle dispose when no listeners are registered', (context) => {
      const reactions = context.room.messages.reactions as unknown as { dispose(): void };

      // Should not throw when called with no listeners
      expect(() => {
        reactions.dispose();
      }).not.toThrow();
    });
  });
});

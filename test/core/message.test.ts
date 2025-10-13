import { describe, expect, it } from 'vitest';

import { ChatMessageAction, ChatMessageEvent, ChatMessageEventType } from '../../src/core/events.ts';
import { DefaultMessage, emptyMessageReactions } from '../../src/core/message.ts';

describe('ChatMessage', () => {
  describe('apply events with with()', () => {
    const message = new DefaultMessage({
      serial: '01672531200000-123@abcdefghij',
      clientId: 'yoda',
      text: 'hello there',
      metadata: {},
      headers: {},
      action: ChatMessageAction.MessageCreate,
      version: {
        serial: '01672531200100-123@abcdefghij',
        timestamp: new Date(1672531200000),
        clientId: undefined,
        description: undefined,
        metadata: undefined,
      },
      timestamp: new Date(1672531200000),
      reactions: emptyMessageReactions(),
    });

    it('should throw an error if different messages', () => {
      const serial = '01672531200000-123@abcdefgxyz';
      const eventMessage = new DefaultMessage({
        serial: serial,
        clientId: 'yoda',
        text: 'hello there',
        metadata: {},
        headers: {},
        action: ChatMessageAction.MessageUpdate,
        version: {
          serial: '01672531200500-123@abcdefghij',
          timestamp: new Date(1672531200500),
          clientId: 'luke',
          description: undefined,
          metadata: undefined,
        },
        timestamp: new Date(1672531200000),
        reactions: emptyMessageReactions(),
      });

      const event: ChatMessageEvent = {
        type: ChatMessageEventType.Updated,
        message: eventMessage,
      };

      expect(() => message.with(event)).toThrowErrorInfo({
        code: 40000,
        statusCode: 400,
        message: 'cannot apply event for a different message',
      });
    });

    it('should throw an error for create events messages', () => {
      const eventMessage = new DefaultMessage({
        serial: message.serial,
        clientId: 'yoda',
        text: 'hello there',
        metadata: {},
        headers: {},
        action: ChatMessageAction.MessageCreate,
        version: {
          serial: '01672531200500-123@abcdefghij',
          timestamp: new Date(1672531200500),
          clientId: 'luke',
          description: undefined,
          metadata: undefined,
        },
        timestamp: new Date(1672531200000),
        reactions: emptyMessageReactions(),
      });

      const event: ChatMessageEvent = {
        type: ChatMessageEventType.Created,
        message: eventMessage,
      };

      expect(() => message.with(event)).toThrowErrorInfo({
        code: 40000,
        statusCode: 400,
        message: 'cannot apply a created event to a message',
      });
    });

    it('should correctly apply an UPDATE', () => {
      const eventMessage = new DefaultMessage({
        serial: message.serial,
        clientId: 'yoda',
        text: 'hi!',
        metadata: {},
        headers: {},
        action: ChatMessageAction.MessageUpdate,
        version: {
          serial: '01672531209999-123@abcdefghij',
          timestamp: new Date(1672531209999),
          clientId: 'luke',
          description: undefined,
          metadata: undefined,
        },
        timestamp: new Date(1672531200000),
        reactions: emptyMessageReactions(),
      });

      const event: ChatMessageEvent = {
        type: ChatMessageEventType.Updated,
        message: eventMessage,
      };

      const newMessage = message.with(event);
      expect(newMessage !== message).toBe(true);
      expect(newMessage).toEqual(eventMessage);
    });

    it('should correctly apply a DELETE', () => {
      const eventMessage = new DefaultMessage({
        serial: message.serial,
        clientId: 'yoda',
        text: 'hola',
        metadata: {},
        headers: {},
        action: ChatMessageAction.MessageDelete,
        version: {
          serial: '01672531209999-123@abcdefghij',
          timestamp: new Date(1672531209999),
          clientId: 'luke',
          description: undefined,
          metadata: undefined,
        },
        timestamp: new Date(1672531200000),
        reactions: emptyMessageReactions(),
      });

      const event: ChatMessageEvent = {
        type: ChatMessageEventType.Updated,
        message: eventMessage,
      };

      const newMessage = message.with(event);
      expect(newMessage !== message).toBe(true);
      expect(newMessage).toEqual(eventMessage);
    });

    it('should ignore outdated versions', () => {
      const eventMessage = new DefaultMessage({
        serial: message.serial,
        clientId: 'yoda',
        text: 'old one',
        metadata: {},
        headers: {},
        action: ChatMessageAction.MessageUpdate,
        version: {
          serial: '01672531200000-123@abcdefghij',
          timestamp: new Date(1672531209999),
          clientId: 'luke',
          description: undefined,
          metadata: undefined,
        },
        timestamp: new Date(1672531200000),
        reactions: emptyMessageReactions(),
      });

      const event: ChatMessageEvent = {
        type: ChatMessageEventType.Updated,
        message: eventMessage,
      };

      const newMessage = message.with(event);
      expect(newMessage === message).toBe(true);
    });

    it('should ignore equal versions', () => {
      const eventMessage = new DefaultMessage({
        serial: message.serial,
        clientId: 'yoda',
        text: 'old one',
        metadata: {},
        headers: {},
        action: ChatMessageAction.MessageUpdate,
        version: message.version,
        timestamp: new Date(1672531200000),
        reactions: emptyMessageReactions(),
      });

      const event: ChatMessageEvent = {
        type: ChatMessageEventType.Updated,
        message: eventMessage,
      };

      const newMessage = message.with(event);
      expect(newMessage === message).toBe(true);
    });

    it('should correctly apply to a message instance', () => {
      const message = new DefaultMessage({
        serial: 'abc',
        clientId: 'yoda',
        text: 'hi!',
        metadata: {},
        headers: {},
        action: ChatMessageAction.MessageUpdate,
        version: {
          serial: '01672531209999-123@abcdefghij',
          timestamp: new Date(1672531209999),
          clientId: 'luke',
          description: undefined,
          metadata: undefined,
        },
        timestamp: new Date(1672531200000),
        reactions: emptyMessageReactions(),
      });

      const message2 = new DefaultMessage({
        serial: 'abc',
        clientId: 'yoda',
        text: 'hi 2!',
        metadata: {},
        headers: {},
        action: ChatMessageAction.MessageUpdate,
        version: {
          serial: '01672531209999-124@abcdefghij',
          timestamp: new Date(1672531209999),
          clientId: 'luke',
          description: undefined,
          metadata: undefined,
        },
        timestamp: new Date(1672531200000),
        reactions: emptyMessageReactions(),
      });

      const newMessage = message.with(message2);
      expect(newMessage !== message).toBe(true);
      expect(newMessage).toEqual(message2);
    });

    it('should return original message if newer message is older', () => {
      const message = new DefaultMessage({
        serial: 'abc',
        clientId: 'yoda',
        text: 'hi!',
        metadata: {},
        headers: {},
        action: ChatMessageAction.MessageUpdate,
        version: {
          serial: '01672531209999-123@abcdefghij',
          timestamp: new Date(1672531209999),
          clientId: 'luke',
          description: undefined,
          metadata: undefined,
        },
        timestamp: new Date(1672531200000),
        reactions: emptyMessageReactions(),
      });

      const message2 = new DefaultMessage({
        serial: 'abc',
        clientId: 'yoda',
        text: 'hi 2!',
        metadata: {},
        headers: {},
        action: ChatMessageAction.MessageUpdate,
        version: {
          serial: '01672531209999-124@abcdefghij',
          timestamp: new Date(1672531209999),
          clientId: 'luke',
          description: undefined,
          metadata: undefined,
        },
        timestamp: new Date(1672531200000),
        reactions: emptyMessageReactions(),
      });

      const newMessage = message.with(message2);
      expect(newMessage !== message).toBe(true);
      expect(newMessage).toEqual(message2);
    });

    it('should return original message if newer message same version', () => {
      const message = new DefaultMessage({
        serial: 'abc',
        clientId: 'yoda',
        text: 'hi!',
        metadata: {},
        headers: {},
        action: ChatMessageAction.MessageUpdate,
        version: {
          serial: '01672531209999-123@abcdefghij',
          timestamp: new Date(1672531209999),
          clientId: 'luke',
          description: undefined,
          metadata: undefined,
        },
        timestamp: new Date(1672531200000),
        reactions: emptyMessageReactions(),
      });

      const message2 = new DefaultMessage({
        serial: 'abc',
        clientId: 'yoda',
        text: 'hi 2!',
        metadata: {},
        headers: {},
        action: ChatMessageAction.MessageUpdate,
        version: {
          serial: '01672531209999-123@abcdefghij',
          timestamp: new Date(1672531209999),
          clientId: 'luke',
          description: undefined,
          metadata: undefined,
        },
        timestamp: new Date(1672531200000),
        reactions: emptyMessageReactions(),
      });

      const newMessage = message.with(message2);
      expect(newMessage === message).toBe(true);
    });
  });

  describe('message copy', () => {
    it('copies a message with updated fields', () => {
      const originalMessage = new DefaultMessage({
        serial: '01672531200000-123@abcdefghij',
        clientId: 'clientId',
        text: 'original text',
        metadata: { key: 'value' },
        headers: { headerKey: 'headerValue' },
        action: ChatMessageAction.MessageCreate,
        version: {
          serial: 'version1',
          timestamp: new Date(1672531200000),
          clientId: 'clientId',
          description: undefined,
          metadata: undefined,
        },
        timestamp: new Date(1672531200000),
        reactions: emptyMessageReactions(),
      });

      const copiedMessage = originalMessage.copy({
        text: 'updated text',
        metadata: { newKey: 'newValue' },
      });

      expect(copiedMessage.text).toBe('updated text');
      expect(copiedMessage.metadata).toEqual({ newKey: 'newValue' });
      expect(copiedMessage.headers).toEqual({ headerKey: 'headerValue' });
      expect(copiedMessage.serial).toBe(originalMessage.serial);
      expect(copiedMessage.clientId).toBe(originalMessage.clientId);
      expect(copiedMessage.action).toBe(originalMessage.action);
      expect(copiedMessage.version).toEqual(originalMessage.version);
      expect(copiedMessage.timestamp).toEqual(originalMessage.timestamp);
    });

    it('copies a message without changes when no parameters are provided', () => {
      const originalMessage = new DefaultMessage({
        serial: '01672531200000-123@abcdefghij',
        clientId: 'clientId',
        text: 'original text',
        metadata: { key: 'value' },
        headers: { headerKey: 'headerValue' },
        action: ChatMessageAction.MessageCreate,
        version: {
          serial: 'version1',
          timestamp: new Date(1672531200000),
          clientId: 'clientId',
          description: undefined,
          metadata: undefined,
        },
        timestamp: new Date(1672531200000),
        reactions: {
          unique: {
            '👍': { total: 2, clientIds: ['a', 'b'], clipped: false },
          },
          distinct: {
            '👍': { total: 2, clientIds: ['a', 'b'], clipped: false },
            '🚀': { total: 1, clientIds: ['a'], clipped: false },
          },
          multiple: {
            '👍': { total: 10, clientIds: { a: 6, b: 4 }, totalUnidentified: 0, clipped: false, totalClientIds: 2 },
            '🚀': { total: 1, clientIds: { a: 1 }, totalUnidentified: 0, clipped: false, totalClientIds: 1 },
          },
        },
      });

      const copiedMessage = originalMessage.copy();

      expect(copiedMessage.text).toBe(originalMessage.text);

      expect(copiedMessage.metadata).toEqual(originalMessage.metadata); // must be equal
      expect(copiedMessage.metadata).not.toBe(originalMessage.metadata); // but not same object

      expect(copiedMessage.headers).toEqual(originalMessage.headers); // must be equal
      expect(copiedMessage.headers).not.toBe(originalMessage.headers); // but not same object

      expect(copiedMessage.serial).toBe(originalMessage.serial);
      expect(copiedMessage.clientId).toBe(originalMessage.clientId);
      expect(copiedMessage.action).toBe(originalMessage.action);
      expect(copiedMessage.version).toEqual(originalMessage.version);
      expect(copiedMessage.timestamp).toEqual(originalMessage.timestamp);

      expect(copiedMessage.reactions).toEqual(originalMessage.reactions); // must be equal
      expect(copiedMessage.reactions).not.toBe(originalMessage.reactions); // but not same object
    });

    it('ensures deep copy of metadata and headers', () => {
      const originalMessage = new DefaultMessage({
        serial: '01672531200000-123@abcdefghij',
        clientId: 'clientId',
        text: 'original text',
        metadata: {
          key: 'value',
          nested: {
            key: 'nestedValue',
          },
        },
        headers: {
          headerKey: 'headerValue',
        },
        action: ChatMessageAction.MessageCreate,
        version: {
          serial: 'version1',
          timestamp: new Date(1672531200000),
          clientId: 'clientId',
          description: undefined,
          metadata: undefined,
        },
        timestamp: new Date(1672531200000),
        reactions: emptyMessageReactions(),
      });

      const copiedMessage = originalMessage.copy();

      // Modify the original message's metadata and headers
      originalMessage.metadata.key = 'newValue';
      originalMessage.headers.headerKey = 'newHeaderValue';

      // Ensure the copied message's metadata and headers remain unchanged
      expect(copiedMessage.metadata.key).toBe('value');
      expect(copiedMessage.headers.headerKey).toBe('headerValue');

      // Check the nested data is deep copied
      const metadata = copiedMessage.metadata as { nested: { key: string } };
      expect(metadata.nested.key).toBe('nestedValue');
      expect(metadata.nested).not.toBe(originalMessage.metadata.nested);
    });

    it('ensures deep replacement of metadata and headers', () => {
      const originalMessage = new DefaultMessage({
        serial: '01672531200000-123@abcdefghij',
        clientId: 'clientId',
        text: 'original text',
        metadata: {
          key: 'value',
          nested: {
            key: 'nestedValue',
          },
        },
        headers: { headerKey: 'headerValue' },
        action: ChatMessageAction.MessageCreate,
        version: {
          serial: 'version1',
          timestamp: new Date(1672531200000),
          clientId: 'clientId',
          description: undefined,
          metadata: undefined,
        },
        timestamp: new Date(1672531200000),
        reactions: emptyMessageReactions(),
      });

      const copiedMessage = originalMessage.copy({
        metadata: { key: 'newValue', nested: { key: 'newNestedValue' } },
      });

      // Modify the original message's metadata and headers
      originalMessage.metadata.key = 'abc';
      originalMessage.headers.headerKey = 'def';

      // Ensure the copied message's metadata and headers remain unchanged
      expect(copiedMessage.headers).not.toBe(originalMessage.headers);

      // Check the nested data is deep copied
      expect(copiedMessage.metadata).not.toBe(originalMessage.metadata);
      expect(copiedMessage.metadata.key).toEqual('newValue');
      const metadata = copiedMessage.metadata as { nested: { key: string } };
      expect(metadata.nested.key).toBe('newNestedValue');
      expect(metadata.nested).not.toBe(originalMessage.metadata.nested);
    });
  });
});

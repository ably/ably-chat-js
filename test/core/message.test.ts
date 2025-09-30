import { describe, expect, it } from 'vitest';

import { ChatMessageAction, ChatMessageEvent, ChatMessageEventType } from '../../src/core/events.ts';
import { DefaultMessage, emptyMessageReactions, Message } from '../../src/core/message.ts';

describe('ChatMessage', () => {
  it('is the same as another message', () => {
    const firstSerial = '01672531200000-123@abcdefghij';
    const secondSerial = '01672531200000-123@abcdefghij';

    const firstMessage = new DefaultMessage({
      serial: firstSerial,
      clientId: 'clientId',
      text: 'hello there',
      metadata: {},
      headers: {},
      action: ChatMessageAction.MessageCreate,
      version: {
        serial: firstSerial,
        timestamp: new Date(1672531200000),
        clientId: 'clientId',
        description: undefined,
        metadata: undefined,
      },
      timestamp: new Date(1672531200000),
      reactions: emptyMessageReactions(),
    });

    const secondMessage = new DefaultMessage({
      serial: secondSerial,
      clientId: 'clientId',
      text: 'hello there',
      metadata: {},
      headers: {},
      action: ChatMessageAction.MessageCreate,
      version: {
        serial: secondSerial,
        timestamp: new Date(1672531200000),
        clientId: 'clientId',
        description: undefined,
        metadata: undefined,
      },
      timestamp: new Date(1672531200000),
      reactions: emptyMessageReactions(),
    });

    expect(firstMessage.equal(secondMessage)).toBe(true);
  });

  it('is not the same as another message', () => {
    const firstSerial = '01672531200000-123@abcdefghij';
    const secondSerial = '01672531200000-124@abcdefghij';

    const firstMessage = new DefaultMessage({
      serial: firstSerial,
      clientId: 'clientId',
      text: 'hello there',
      metadata: {},
      headers: {},
      action: ChatMessageAction.MessageCreate,
      version: {
        serial: firstSerial,
        timestamp: new Date(1672531200000),
        clientId: undefined,
        description: undefined,
        metadata: undefined,
      },
      timestamp: new Date(1672531200000),
      reactions: emptyMessageReactions(),
    });

    const secondMessage = new DefaultMessage({
      serial: secondSerial,
      clientId: 'clientId',
      text: 'hello there',
      metadata: {},
      headers: {},
      action: ChatMessageAction.MessageCreate,
      version: {
        serial: secondSerial,
        timestamp: new Date(1672531200000),
        clientId: undefined,
        description: undefined,
        metadata: undefined,
      },
      timestamp: new Date(1672531200000),
      reactions: emptyMessageReactions(),
    });

    expect(firstMessage.equal(secondMessage)).toBe(false);
  });

  it('is the same as another message using isSameAs', () => {
    const firstSerial = '01672531200000-123@abcdefghij';
    const secondSerial = '01672531200000-123@abcdefghij';

    const firstMessage = new DefaultMessage({
      serial: firstSerial,
      clientId: 'clientId',
      text: 'hello there',
      metadata: {},
      headers: {},
      action: ChatMessageAction.MessageCreate,
      version: {
        serial: firstSerial,
        timestamp: new Date(1672531200000),
        clientId: undefined,
        description: undefined,
        metadata: undefined,
      },
      timestamp: new Date(1672531200000),
      reactions: emptyMessageReactions(),
    });

    const secondMessage = new DefaultMessage({
      serial: secondSerial,
      clientId: 'clientId',
      text: 'hello there',
      metadata: {},
      headers: {},
      action: ChatMessageAction.MessageCreate,
      version: {
        serial: secondSerial,
        timestamp: new Date(1672531200000),
        clientId: undefined,
        description: undefined,
        metadata: undefined,
      },
      timestamp: new Date(1672531200000),
      reactions: emptyMessageReactions(),
    });

    expect(firstMessage.isSameAs(secondMessage)).toBe(true);
  });

  it('is not the same as another message using isSameAs', () => {
    const firstSerial = '01672531200000-123@abcdefghij';
    const secondSerial = '01672531200000-124@abcdefghij';

    const firstMessage = new DefaultMessage({
      serial: firstSerial,
      clientId: 'clientId',
      text: 'hello there',
      metadata: {},
      headers: {},
      action: ChatMessageAction.MessageCreate,
      version: {
        serial: firstSerial,
        timestamp: new Date(1672531200000),
        clientId: undefined,
        description: undefined,
        metadata: undefined,
      },
      timestamp: new Date(1672531200000),
      reactions: emptyMessageReactions(),
    });

    const secondMessage = new DefaultMessage({
      serial: secondSerial,
      clientId: 'clientId',
      text: 'hello there',
      metadata: {},
      headers: {},
      action: ChatMessageAction.MessageCreate,
      version: {
        serial: secondSerial,
        timestamp: new Date(1672531200000),
        clientId: undefined,
        description: undefined,
        metadata: undefined,
      },
      timestamp: new Date(1672531200000),
      reactions: emptyMessageReactions(),
    });

    expect(firstMessage.isSameAs(secondMessage)).toBe(false);
  });

  it('is before another message', () => {
    const firstSerial = '01672531200000-123@abcdefghij';
    const secondSerial = '01672531200000-124@abcdefghij';

    const firstMessage = new DefaultMessage({
      serial: firstSerial,
      clientId: 'clientId',
      text: 'hello there',
      metadata: {},
      headers: {},
      action: ChatMessageAction.MessageCreate,
      version: {
        serial: firstSerial,
        timestamp: new Date(1672531200000),
        clientId: undefined,
        description: undefined,
        metadata: undefined,
      },
      timestamp: new Date(1672531200000),
      reactions: emptyMessageReactions(),
    });

    const secondMessage = new DefaultMessage({
      serial: secondSerial,
      clientId: 'clientId',
      text: 'hello there',
      metadata: {},
      headers: {},
      action: ChatMessageAction.MessageCreate,
      version: {
        serial: secondSerial,
        timestamp: new Date(1672531200000),
        clientId: undefined,
        description: undefined,
        metadata: undefined,
      },
      timestamp: new Date(1672531200000),
      reactions: emptyMessageReactions(),
    });

    expect(firstMessage.before(secondMessage)).toBe(true);
  });

  it('is after another message', () => {
    const firstSerial = '01672531200000-124@abcdefghij';
    const secondSerial = '01672531200000-123@abcdefghij';

    const firstMessage = new DefaultMessage({
      serial: firstSerial,
      clientId: 'clientId',
      text: 'hello there',
      metadata: {},
      headers: {},
      action: ChatMessageAction.MessageCreate,
      version: {
        serial: firstSerial,
        timestamp: new Date(1672531200000),
        clientId: undefined,
        description: undefined,
        metadata: undefined,
      },
      timestamp: new Date(1672531200000),
      reactions: emptyMessageReactions(),
    });

    const secondMessage = new DefaultMessage({
      serial: secondSerial,
      clientId: 'clientId',
      text: 'hello there',
      metadata: {},
      headers: {},
      action: ChatMessageAction.MessageCreate,
      version: {
        serial: secondSerial,
        timestamp: new Date(1672531200000),
        clientId: undefined,
        description: undefined,
        metadata: undefined,
      },
      timestamp: new Date(1672531200000),
      reactions: emptyMessageReactions(),
    });

    expect(firstMessage.after(secondMessage)).toBe(true);
  });

  describe('message versions', () => {
    it('is deleted', () => {
      const firstSerial = '01672531200000-124@abcdefghij:0';
      const firstMessage = new DefaultMessage({
        serial: firstSerial,
        clientId: 'clientId',
        text: 'hello there',
        metadata: {},
        headers: {},
        action: ChatMessageAction.MessageDelete,
        version: {
          serial: '01672531300000-123@abcdefghij:0',
          timestamp: new Date(1672531300000),
          clientId: 'clientId2',
          description: undefined,
          metadata: undefined,
        },
        timestamp: new Date(1672531200000),
        reactions: emptyMessageReactions(),
      });
      expect(firstMessage.isDeleted).toBe(true);
      expect(firstMessage.deletedBy).toBe('clientId2');
    });

    it('is updated', () => {
      const firstSerial = '01672531200000-124@abcdefghij';
      const firstMessage = new DefaultMessage({
        serial: firstSerial,
        clientId: 'clientId',
        text: 'hello there',
        metadata: {},
        headers: {},
        action: ChatMessageAction.MessageUpdate,
        version: {
          serial: '01672531200000-123@abcdefghij:0',
          timestamp: new Date(1672531300000),
          clientId: 'clientId2',
          description: undefined,
          metadata: undefined,
        },
        timestamp: new Date(1672531200000),
        reactions: emptyMessageReactions(),
      });
      expect(firstMessage.isUpdated).toBe(true);
      expect(firstMessage.updatedBy).toBe('clientId2');
    });

    it(`should return false when trying to compare versions belonging to different origin messages`, () => {
      const firstSerial = '01672531200000-124@abcdefghij';
      const secondSerial = '01672531200000-123@abcdefghij';

      const firstVersion = '01672531200000-123@abcdefghij:0';
      const secondVersion = '01672531200000-123@abcdefghij:0';

      const firstMessage = new DefaultMessage({
        serial: firstSerial,
        clientId: 'clientId',
        text: 'hello there',
        metadata: {},
        headers: {},
        action: ChatMessageAction.MessageUpdate,
        version: {
          serial: firstVersion,
          timestamp: new Date(1672531200000),
          clientId: 'clientId',
          description: undefined,
          metadata: undefined,
        },
        timestamp: new Date(1672531200000),
        reactions: emptyMessageReactions(),
      });

      const secondMessage = new DefaultMessage({
        serial: secondSerial,
        clientId: 'clientId',
        text: 'hello there',
        metadata: {},
        headers: {},
        action: ChatMessageAction.MessageUpdate,
        version: {
          serial: secondVersion,
          timestamp: new Date(1672531200000),
          clientId: 'clientId',
          description: undefined,
          metadata: undefined,
        },
        timestamp: new Date(1672531200000),
        reactions: emptyMessageReactions(),
      });

      expect(firstMessage.isSameVersionAs(secondMessage)).toBe(false);
      expect(firstMessage.isOlderVersionOf(secondMessage)).toBe(false);
      expect(firstMessage.isNewerVersionOf(secondMessage)).toBe(false);
    });

    describe.each([
      [
        'isSameVersionAs returns true when this message version is the same as another',
        {
          firstVersion: '01672531200000-123@abcdefghij:0',
          secondVersion: '01672531200000-123@abcdefghij:0',
          expected: (firstMessage: Message, secondMessage: Message) => {
            expect(firstMessage.isSameVersionAs(secondMessage)).toBe(true);
          },
        },
      ],
      [
        'isSameVersionAs returns false when this message version is not same as another message version',
        {
          firstVersion: '01672531200000-123@abcdefghij:0',
          secondVersion: '01672531200000-124@abcdefghij:0',
          expected: (firstMessage: Message, secondMessage: Message) => {
            expect(firstMessage.isSameVersionAs(secondMessage)).toBe(false);
          },
        },
      ],
      [
        'isOlderVersionOf returns true when this message version is older than another message version',
        {
          firstVersion: '01672531200000-123@abcdefghij:0',
          secondVersion: '01672531200000-124@abcdefghij:0',
          expected: (firstMessage: Message, secondMessage: Message) => {
            expect(firstMessage.isOlderVersionOf(secondMessage)).toBe(true);
          },
        },
      ],
      [
        'isNewerVersionOf returns true when this message version is newer than another message version',
        {
          firstVersion: '01672531200000-124@abcdefghij:0',
          secondVersion: '01672531200000-123@abcdefghij:0',
          expected: (firstMessage: Message, secondMessage: Message) => {
            expect(firstMessage.isNewerVersionOf(secondMessage)).toBe(true);
          },
        },
      ],
    ])('compare message versions', (name, { firstVersion, secondVersion, expected }) => {
      it(name, () => {
        const messageSerial = '01672531200000-123@abcdefghij';
        const firstMessage = new DefaultMessage({
          serial: messageSerial,
          clientId: 'clientId',
          text: 'hello there',
          metadata: {},
          headers: {},
          action: ChatMessageAction.MessageUpdate,
          version: {
            serial: firstVersion,
            timestamp: new Date(1672531200001),
            clientId: 'clientId',
            description: undefined,
            metadata: undefined,
          },
          timestamp: new Date(1672531200000),
          reactions: emptyMessageReactions(),
        });

        const secondMessage = new DefaultMessage({
          serial: messageSerial,
          clientId: 'clientId',
          text: 'hello there',
          metadata: {},
          headers: {},
          action: ChatMessageAction.MessageUpdate,
          version: {
            serial: secondVersion,
            timestamp: new Date(1672531200001),
            clientId: 'clientId',
            description: undefined,
            metadata: undefined,
          },
          timestamp: new Date(1672531200000),
          reactions: emptyMessageReactions(),
        });
        expected(firstMessage, secondMessage);
      });
    });
  });

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
            '👍': { total: 2, clientIds: ['a', 'b'] },
          },
          distinct: {
            '👍': { total: 2, clientIds: ['a', 'b'] },
            '🚀': { total: 1, clientIds: ['a'] },
          },
          multiple: {
            '👍': { total: 10, clientIds: { a: 6, b: 4 }, totalUnidentified: 0 },
            '🚀': { total: 1, clientIds: { a: 1 }, totalUnidentified: 0 },
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

import * as Ably from 'ably';
import { describe, expect, it } from 'vitest';

import { ChatMessageAction } from '../../src/core/events.ts';
import { DefaultMessage } from '../../src/core/message.ts';
import { parseMessage } from '../../src/core/message-parser.js';

describe('parseMessage', () => {
  describe.each([
    {
      description: 'message.data is undefined',
      message: {
        clientId: 'client1',
        timestamp: 1728402074206,
        createdAt: 1728402074206,
        extras: {
          headers: {},
        },
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        action: ChatMessageAction.MessageCreate,
      },
      expectedDefaults: { text: '', metadata: {} },
    },
    {
      description: 'message.clientId is undefined',
      message: {
        data: { text: 'hello' },
        timestamp: 1728402074206,
        createdAt: 1728402074206,
        extras: {
          headers: {},
        },
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        action: ChatMessageAction.MessageCreate,
      },
      expectedDefaults: { clientId: '' },
    },
    {
      description: 'message.data.text is undefined',
      message: {
        data: {},
        clientId: 'client1',
        timestamp: 1728402074206,
        createdAt: 1728402074206,
        extras: {
          headers: {},
        },
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        action: ChatMessageAction.MessageCreate,
      },
      expectedDefaults: { text: '' },
    },
    {
      description: 'message.data.metadata is undefined',
      message: {
        data: { text: 'hello' },
        clientId: 'client1',
        timestamp: 1728402074206,
        createdAt: 1728402074206,
        extras: {
          headers: {},
        },
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        action: ChatMessageAction.MessageCreate,
      },
      expectedDefaults: { metadata: {} },
    },
    {
      description: 'message.data.metadata is not an object',
      message: {
        data: { text: 'hello', metadata: 'not an object' },
      },
      expectedDefaults: { metadata: {} },
    },
    {
      description: 'message.extras is undefined',
      message: {
        data: { text: 'hello', metadata: {} },
        clientId: 'client1',
        timestamp: 1728402074206,
        createdAt: 1728402074206,
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        action: ChatMessageAction.MessageCreate,
      },
      expectedDefaults: { headers: {} },
    },
    {
      description: 'message.action is unhandled',
      message: {
        data: { text: 'hello', metadata: {} },
        clientId: 'client1',
        timestamp: 1728402074206,
        createdAt: 1728402074206,
        extras: {
          headers: {},
        },
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        action: 'unhandled.action',
      },
      expectedDefaults: { action: ChatMessageAction.MessageCreate },
    },
    {
      description: 'message.serial is undefined',
      message: {
        data: { text: 'hello' },
        clientId: 'client1',
        timestamp: 1728402074206,
        createdAt: 1728402074206,
        extras: {},
        action: ChatMessageAction.MessageCreate,
        version: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
      },
      expectedDefaults: { serial: '' },
    },
    {
      description: 'message.version is undefined',
      message: {
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        data: { text: 'hello' },
        clientId: 'client1',
        timestamp: 1728402074206,
        createdAt: 1728402074206,
        extras: {},
        action: ChatMessageAction.MessageCreate,
      },
      expectedDefaults: { version: '' },
    },
  ])('should use default values ', ({ description, message, expectedDefaults }) => {
    it(`should use default values if ${description}`, () => {
      const result = parseMessage(message as Ably.InboundMessage);

      expect(result).toBeInstanceOf(DefaultMessage);

      // Check specific default values based on what's missing
      for (const [key, value] of Object.entries(expectedDefaults)) {
        expect(result[key as keyof typeof result]).toEqual(value);
      }
    });
  });

  describe.each([
    {
      description: 'message.data is null',
      message: {
        data: null,
        clientId: 'client1',
        timestamp: 1728402074206,
        createdAt: 1728402074206,
        extras: {},
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        action: ChatMessageAction.MessageCreate,
      },
      expectedDefaults: { text: '', metadata: {} },
    },
    {
      description: 'message.data is a string',
      message: {
        data: 'invalid-data',
        clientId: 'client1',
        timestamp: 1728402074206,
        createdAt: 1728402074206,
        extras: {},
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        action: ChatMessageAction.MessageCreate,
      },
      expectedDefaults: { text: '', metadata: {} },
    },
    {
      description: 'message.data is a number',
      message: {
        data: 123,
        clientId: 'client1',
        timestamp: 1728402074206,
        createdAt: 1728402074206,
        extras: {},
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        action: ChatMessageAction.MessageCreate,
      },
      expectedDefaults: { text: '', metadata: {} },
    },
    {
      description: 'message.data is a boolean',
      message: {
        data: true,
        clientId: 'client1',
        timestamp: 1728402074206,
        createdAt: 1728402074206,
        extras: {},
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        action: ChatMessageAction.MessageCreate,
      },
      expectedDefaults: { text: '', metadata: {} },
    },
    {
      description: 'message.extras is null',
      message: {
        data: { text: 'hello' },
        clientId: 'client1',
        timestamp: 1728402074206,
        createdAt: 1728402074206,
        extras: null,
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        action: ChatMessageAction.MessageCreate,
      },
      expectedDefaults: { headers: {} },
    },
    {
      description: 'message.extras is a string',
      message: {
        data: { text: 'hello' },
        clientId: 'client1',
        timestamp: 1728402074206,
        createdAt: 1728402074206,
        extras: 'invalid-extras',
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        action: ChatMessageAction.MessageCreate,
      },
      expectedDefaults: { headers: {} },
    },
    {
      description: 'message.extras is a number',
      message: {
        data: { text: 'hello' },
        clientId: 'client1',
        timestamp: 1728402074206,
        createdAt: 1728402074206,
        extras: 456,
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        action: ChatMessageAction.MessageCreate,
      },
      expectedDefaults: { headers: {} },
    },
    {
      description: 'message.extras is a boolean',
      message: {
        data: { text: 'hello' },
        clientId: 'client1',
        timestamp: 1728402074206,
        createdAt: 1728402074206,
        extras: false,
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        action: ChatMessageAction.MessageCreate,
      },
      expectedDefaults: { headers: {} },
    },
  ])('should handle non-object values', ({ description, message, expectedDefaults }) => {
    it(`should use empty objects when ${description}`, () => {
      const result = parseMessage(message as Ably.InboundMessage);

      expect(result).toBeInstanceOf(DefaultMessage);

      // Check specific default values based on what's missing
      for (const [key, value] of Object.entries(expectedDefaults)) {
        expect(result[key as keyof typeof result]).toEqual(value);
      }
    });
  });

  it('should use current time as default when createdAt is undefined', () => {
    const message = {
      data: { text: 'hello' },
      clientId: 'client1',
      timestamp: 1728402074206,
      extras: {},
      serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
      version: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
      action: ChatMessageAction.MessageCreate,
    };

    const result = parseMessage(message as Ably.InboundMessage);
    expect(result).toBeInstanceOf(DefaultMessage);
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it('should use current time as default when timestamp is undefined', () => {
    const message = {
      data: { text: 'hello' },
      clientId: 'client1',
      createdAt: 1728402074206,
      extras: {},
      serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
      version: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
      action: ChatMessageAction.MessageCreate,
    };

    const result = parseMessage(message as Ably.InboundMessage);
    expect(result).toBeInstanceOf(DefaultMessage);
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it('should return a DefaultMessage instance for a valid new message', () => {
    const message = {
      data: { text: 'hello', metadata: { key: 'value' } },
      clientId: 'client1',
      createdAt: 1728402074206,
      extras: {
        headers: { headerKey: 'headerValue' },
      },
      timestamp: 1728402074206,
      version: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
      action: ChatMessageAction.MessageCreate,
      serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
    } as Ably.InboundMessage;

    const result = parseMessage(message);

    expect(result).toBeInstanceOf(DefaultMessage);
    expect(result.serial).toBe('01728402074206-000@cbfkKvEYgBhDaZ38195418:0');
    expect(result.clientId).toBe('client1');
    expect(result.text).toBe('hello');
    expect(result.createdAt).toEqual(new Date(1728402074206));
    expect(result.metadata).toEqual({ key: 'value' });
    expect(result.headers).toEqual({ headerKey: 'headerValue' });

    // deletion related fields should be undefined
    expect(result.deletedAt).toBeUndefined();
    expect(result.deletedBy).toBeUndefined();

    // update related fields should be undefined
    expect(result.updatedAt).toBeUndefined();
    expect(result.updatedBy).toBeUndefined();

    expect(result.action).toEqual(ChatMessageAction.MessageCreate);
    expect(result.operation).toBeUndefined();
  });

  it('should return a DefaultMessage instance for a valid updated message', () => {
    const message = {
      id: 'message-id',
      data: { text: 'hello', metadata: { key: 'value' } },
      clientId: 'client1',
      createdAt: 1728402074206,
      extras: {
        headers: { headerKey: 'headerValue' },
      },
      action: ChatMessageAction.MessageUpdate,
      serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
      timestamp: 1728402074206,
      version: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
      operation: { clientId: 'client2', description: 'update message', metadata: { 'custom-update': 'some flag' } },
    } as Ably.InboundMessage;

    const result = parseMessage(message);

    expect(result).toBeInstanceOf(DefaultMessage);
    expect(result.serial).toBe('01728402074206-000@cbfkKvEYgBhDaZ38195418:0');
    expect(result.clientId).toBe('client1');
    expect(result.text).toBe('hello');
    expect(result.createdAt).toEqual(new Date(1728402074206));
    expect(result.metadata).toEqual({ key: 'value' });
    expect(result.headers).toEqual({ headerKey: 'headerValue' });
    expect(result.updatedAt).toEqual(new Date(1728402074206));
    expect(result.updatedBy).toBe('client2');
    expect(result.action).toEqual(ChatMessageAction.MessageUpdate);
    expect(result.version).toEqual('01728402074206-000@cbfkKvEYgBhDaZ38195418:0');
    expect(result.operation).toEqual({
      clientId: 'client2',
      description: 'update message',
      metadata: { 'custom-update': 'some flag' },
    });

    // deletion related fields should be undefined
    expect(result.deletedAt).toBeUndefined();
    expect(result.deletedBy).toBeUndefined();
  });

  it('should return a DefaultMessage instance for a valid deleted message', () => {
    const message = {
      id: 'message-id',
      data: { text: '', metadata: {} },
      clientId: 'client1',
      createdAt: 1728402074206,
      extras: {
        headers: {},
      },
      action: ChatMessageAction.MessageDelete,
      serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
      timestamp: 1728402074206,
      version: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
      operation: {
        clientId: 'client2',
        description: 'delete message',
        metadata: { 'custom-warning': 'this is a warning' },
      },
    } as Ably.InboundMessage;

    const result = parseMessage(message);

    expect(result).toBeInstanceOf(DefaultMessage);
    expect(result.serial).toBe('01728402074206-000@cbfkKvEYgBhDaZ38195418:0');
    expect(result.clientId).toBe('client1');
    expect(result.text).toBe(''); // Empty string for all delete messages
    expect(result.createdAt).toEqual(new Date(1728402074206));
    expect(result.metadata).toEqual({}); // Empty object for all delete messages
    expect(result.headers).toEqual({}); // Empty object for all delete messages
    expect(result.deletedAt).toEqual(new Date(1728402074206));
    expect(result.deletedBy).toBe('client2');
    expect(result.version).toEqual('01728402074206-000@cbfkKvEYgBhDaZ38195418:0');
    expect(result.operation).toEqual({
      clientId: 'client2',
      description: 'delete message',
      metadata: { 'custom-warning': 'this is a warning' },
    });

    // update related fields should be undefined
    expect(result.updatedAt).toBeUndefined();
    expect(result.updatedBy).toBeUndefined();
  });

  it('should return a DefaultMessage instance with empty text/metadata/headers for any deleted message', () => {
    const message = {
      id: 'message-id',
      data: {},
      clientId: 'client1',
      createdAt: 1728402074206,
      action: ChatMessageAction.MessageDelete,
      serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
      timestamp: 1728402074206,
      version: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
      operation: {
        clientId: 'client2',
        description: 'delete message',
        metadata: { 'custom-warning': 'this is a warning' },
      },
      extras: {},
    } as Ably.InboundMessage;

    const result = parseMessage(message);

    expect(result).toBeInstanceOf(DefaultMessage);
    expect(result.serial).toBe('01728402074206-000@cbfkKvEYgBhDaZ38195418:0');
    expect(result.clientId).toBe('client1');
    expect(result.text).toBe(''); // Empty string for all delete messages
    expect(result.createdAt).toEqual(new Date(1728402074206));
    expect(result.metadata).toEqual({}); // Empty object for all delete messages
    expect(result.headers).toEqual({}); // Empty object for all delete messages
    expect(result.deletedAt).toEqual(new Date(1728402074206));
    expect(result.deletedBy).toBe('client2');
    expect(result.version).toEqual('01728402074206-000@cbfkKvEYgBhDaZ38195418:0');
    expect(result.operation).toEqual({
      clientId: 'client2',
      description: 'delete message',
      metadata: { 'custom-warning': 'this is a warning' },
    });

    // update related fields should be undefined
    expect(result.updatedAt).toBeUndefined();
    expect(result.updatedBy).toBeUndefined();
  });

  it('should return a DefaultMessage instance for a deleted message with empty data', () => {
    const message = {
      id: 'message-id',
      data: {}, // Empty data for delete messages
      clientId: 'client1',
      createdAt: 1728402074206,
      // extras can be omitted for delete messages
      action: ChatMessageAction.MessageDelete,
      serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
      timestamp: 1728402074206,
      version: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
      operation: {
        clientId: 'client2',
        description: 'delete message',
        metadata: { 'custom-warning': 'this is a warning' },
      },
      extras: {},
    } as Ably.InboundMessage;

    const result = parseMessage(message);

    expect(result).toBeInstanceOf(DefaultMessage);
    expect(result.serial).toBe('01728402074206-000@cbfkKvEYgBhDaZ38195418:0');
    expect(result.clientId).toBe('client1');
    expect(result.text).toBe(''); // Empty string for all delete messages
    expect(result.createdAt).toEqual(new Date(1728402074206));
    expect(result.metadata).toEqual({}); // Empty object for all delete messages
    expect(result.headers).toEqual({}); // Empty object for all delete messages
    expect(result.deletedAt).toEqual(new Date(1728402074206));
    expect(result.deletedBy).toBe('client2');
    expect(result.version).toEqual('01728402074206-000@cbfkKvEYgBhDaZ38195418:0');
    expect(result.operation).toEqual({
      clientId: 'client2',
      description: 'delete message',
      metadata: { 'custom-warning': 'this is a warning' },
    });

    // update related fields should be undefined
    expect(result.updatedAt).toBeUndefined();
    expect(result.updatedBy).toBeUndefined();
  });
});

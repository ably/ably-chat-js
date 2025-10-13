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
        extras: {
          headers: {},
        },
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: {
          serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
          timestamp: 1728402074206,
        },
        action: ChatMessageAction.MessageCreate,
      },
      expectedDefaults: { text: '', metadata: {} },
    },
    {
      description: 'message.clientId is undefined',
      message: {
        data: { text: 'hello' },
        timestamp: 1728402074206,
        extras: {
          headers: {},
        },
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: {
          serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
          timestamp: 1728402074206,
        },
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
        extras: {
          headers: {},
        },
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: {
          serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
          timestamp: 1728402074206,
        },
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
        extras: {
          headers: {},
        },
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: {
          serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
          timestamp: 1728402074206,
        },
        action: ChatMessageAction.MessageCreate,
      },
      expectedDefaults: { metadata: {} },
    },
    {
      description: 'message.data.metadata is not an object',
      message: {
        data: { text: 'hello', metadata: 'not an object' },
        version: {},
      },
      expectedDefaults: { metadata: {} },
    },
    {
      description: 'message.extras is undefined',
      message: {
        data: { text: 'hello', metadata: {} },
        clientId: 'client1',
        timestamp: 1728402074206,
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: {
          serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
          timestamp: 1728402074206,
        },
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
        extras: {
          headers: {},
        },
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: {
          serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
          timestamp: 1728402074206,
        },
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
        extras: {},
        action: ChatMessageAction.MessageCreate,
        version: {
          serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
          timestamp: 1728402074206,
        },
      },
      expectedDefaults: { serial: '' },
    },
    {
      description: 'message.version.timestamp is undefined',
      message: {
        data: { text: 'hello' },
        clientId: 'client1',
        timestamp: 1728402074206,
        extras: {},
        action: ChatMessageAction.MessageCreate,
        version: {},
      },
      expectedDefaults: {
        version: {
          clientId: undefined,
          description: undefined,
          metadata: undefined,
          serial: '',
          timestamp: new Date(1728402074206),
        },
      },
    },
    {
      description: 'message.version.serial is undefined',
      message: {
        data: { text: 'hello' },
        clientId: 'client1',
        extras: {},
        action: ChatMessageAction.MessageCreate,
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: {},
      },
      expectedDefaults: {
        version: {
          clientId: undefined,
          description: undefined,
          metadata: undefined,
          serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
          timestamp: new Date(0),
        },
      },
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
        extras: {},
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: {
          serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
          timestamp: 1728402074206,
        },
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
        extras: {},
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: {
          serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
          timestamp: 1728402074206,
        },
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
        extras: {},
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: {
          serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
          timestamp: 1728402074206,
        },
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
        extras: {},
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: {
          serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
          timestamp: 1728402074206,
        },
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
        extras: null,
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: {
          serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
          timestamp: 1728402074206,
        },
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
        extras: 'invalid-extras',
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: {
          serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
          timestamp: 1728402074206,
        },
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
        extras: 456,
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: {
          serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
          timestamp: 1728402074206,
        },
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
        extras: false,
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: {
          serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
          timestamp: 1728402074206,
        },
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

  it('should use current time as default when timestamp is undefined', () => {
    const message = {
      data: { text: 'hello' },
      clientId: 'client1',
      extras: {},
      serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
      version: {
        serial: '01728402074207-000@cbfkKvEYgBhDaZ38195418:0',
        timestamp: 1728402074207,
      },
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
      extras: {
        headers: { headerKey: 'headerValue' },
      },
      timestamp: 1728402074206,
      version: {
        serial: '01728402074207-000@cbfkKvEYgBhDaZ38195418:0',
        timestamp: 1728402074207,
      },
      action: ChatMessageAction.MessageCreate,
      serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
    } as Ably.InboundMessage;

    const result = parseMessage(message);

    expect(result).toBeInstanceOf(DefaultMessage);
    expect(result.serial).toBe('01728402074206-000@cbfkKvEYgBhDaZ38195418:0');
    expect(result.clientId).toBe('client1');
    expect(result.text).toBe('hello');
    expect(result.timestamp).toEqual(new Date(1728402074206));
    expect(result.metadata).toEqual({ key: 'value' });
    expect(result.headers).toEqual({ headerKey: 'headerValue' });
    expect(result.version.serial).toBe('01728402074207-000@cbfkKvEYgBhDaZ38195418:0');
    expect(result.version.timestamp).toEqual(new Date(1728402074207));

    expect(result.action).toEqual(ChatMessageAction.MessageCreate);
  });

  it('should return a DefaultMessage instance for a valid updated message', () => {
    const message = {
      id: 'message-id',
      data: { text: 'hello', metadata: { key: 'value' } },
      clientId: 'client1',
      extras: {
        headers: { headerKey: 'headerValue' },
      },
      action: ChatMessageAction.MessageUpdate,
      serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
      timestamp: 1728402074206,
      version: {
        serial: '01728402074207-000@cbfkKvEYgBhDaZ38195418:0',
        timestamp: 1728402074207,
        clientId: 'client2',
        description: 'update message',
        metadata: { 'custom-update': 'some flag' },
      },
      annotations: {
        summary: {},
      },
    } as Ably.InboundMessage;

    const result = parseMessage(message);

    expect(result).toBeInstanceOf(DefaultMessage);
    expect(result.serial).toBe('01728402074206-000@cbfkKvEYgBhDaZ38195418:0');
    expect(result.clientId).toBe('client1');
    expect(result.text).toBe('hello');
    expect(result.timestamp).toEqual(new Date(1728402074206));
    expect(result.metadata).toEqual({ key: 'value' });
    expect(result.headers).toEqual({ headerKey: 'headerValue' });
    expect(result.action).toEqual(ChatMessageAction.MessageUpdate);
    expect(result.version.serial).toEqual('01728402074207-000@cbfkKvEYgBhDaZ38195418:0');
    expect(result.version.timestamp).toEqual(new Date(1728402074207));
    expect(result.version.clientId).toEqual('client2');
    expect(result.version.description).toEqual('update message');
    expect(result.version.metadata).toEqual({ 'custom-update': 'some flag' });
  });

  it('should return a DefaultMessage instance for a valid deleted message', () => {
    const message = {
      id: 'message-id',
      data: { text: '', metadata: {} },
      clientId: 'client1',
      extras: {
        headers: {},
      },
      action: ChatMessageAction.MessageDelete,
      serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
      timestamp: 1728402074206,
      version: {
        serial: '01728402074207-000@cbfkKvEYgBhDaZ38195418:0',
        timestamp: 1728402074207,
        clientId: 'client2',
        description: 'delete message',
        metadata: { 'custom-warning': 'this is a warning' },
      },
      annotations: {
        summary: {},
      },
    } as Ably.InboundMessage;

    const result = parseMessage(message);

    expect(result).toBeInstanceOf(DefaultMessage);
    expect(result.serial).toBe('01728402074206-000@cbfkKvEYgBhDaZ38195418:0');
    expect(result.clientId).toBe('client1');
    expect(result.text).toBe(''); // Empty string for all delete messages
    expect(result.timestamp).toEqual(new Date(1728402074206));
    expect(result.metadata).toEqual({}); // Empty object for all delete messages
    expect(result.headers).toEqual({}); // Empty object for all delete messages
    expect(result.version.serial).toEqual('01728402074207-000@cbfkKvEYgBhDaZ38195418:0');
    expect(result.version.timestamp).toEqual(new Date(1728402074207));
    expect(result.version.clientId).toEqual('client2');
    expect(result.version.description).toEqual('delete message');
    expect(result.version.metadata).toEqual({ 'custom-warning': 'this is a warning' });
  });

  it('should return a DefaultMessage instance with empty text/metadata/headers for any deleted message', () => {
    const message = {
      id: 'message-id',
      data: {},
      clientId: 'client1',
      action: ChatMessageAction.MessageDelete,
      serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
      timestamp: 1728402074206,
      version: {
        serial: '01728402074207-000@cbfkKvEYgBhDaZ38195418:0',
        timestamp: 1728402074207,
        clientId: 'client2',
        description: 'delete message',
        metadata: { 'custom-warning': 'this is a warning' },
      },
      annotations: {
        summary: {},
      },
      extras: {},
    } as Ably.InboundMessage;

    const result = parseMessage(message);

    expect(result).toBeInstanceOf(DefaultMessage);
    expect(result.serial).toBe('01728402074206-000@cbfkKvEYgBhDaZ38195418:0');
    expect(result.clientId).toBe('client1');
    expect(result.text).toBe(''); // Empty string for all delete messages
    expect(result.timestamp).toEqual(new Date(1728402074206));
    expect(result.metadata).toEqual({}); // Empty object for all delete messages
    expect(result.headers).toEqual({}); // Empty object for all delete messages
    expect(result.version.serial).toEqual('01728402074207-000@cbfkKvEYgBhDaZ38195418:0');
    expect(result.version.timestamp).toEqual(new Date(1728402074207));
    expect(result.version.clientId).toEqual('client2');
    expect(result.version.description).toEqual('delete message');
    expect(result.version.metadata).toEqual({ 'custom-warning': 'this is a warning' });
  });

  it('should return a DefaultMessage instance for a deleted message with empty data', () => {
    const message = {
      id: 'message-id',
      data: {}, // Empty data for delete messages
      clientId: 'client1',
      // extras can be omitted for delete messages
      action: ChatMessageAction.MessageDelete,
      serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
      timestamp: 1728402074206,
      version: {
        serial: '01728402074207-000@cbfkKvEYgBhDaZ38195418:0',
        timestamp: 1728402074207,
        clientId: 'client2',
        description: 'delete message',
        metadata: { 'custom-warning': 'this is a warning' },
      },
      annotations: {
        summary: {},
      },
      extras: {},
    } as Ably.InboundMessage;

    const result = parseMessage(message);

    expect(result).toBeInstanceOf(DefaultMessage);
    expect(result.serial).toBe('01728402074206-000@cbfkKvEYgBhDaZ38195418:0');
    expect(result.clientId).toBe('client1');
    expect(result.text).toBe(''); // Empty string for all delete messages
    expect(result.timestamp).toEqual(new Date(1728402074206));
    expect(result.metadata).toEqual({}); // Empty object for all delete messages
    expect(result.headers).toEqual({}); // Empty object for all delete messages
    expect(result.version.serial).toEqual('01728402074207-000@cbfkKvEYgBhDaZ38195418:0');
    expect(result.version.timestamp).toEqual(new Date(1728402074207));
    expect(result.version.clientId).toEqual('client2');
    expect(result.version.description).toEqual('delete message');
    expect(result.version.metadata).toEqual({ 'custom-warning': 'this is a warning' });
  });
});

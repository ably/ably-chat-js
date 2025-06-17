import { describe, expect, it } from 'vitest';

import { ChatMessageAction } from '../../src/core/events.js';
import { DefaultMessage, emptyMessageReactions } from '../../src/core/message.js';
import { messageFromRest, RestMessage } from '../../src/core/rest-types.js';

describe('messageFromRest', () => {
  it('should convert a basic REST message to a Message', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: '01672531200000-123@abcdefghij:0',
      roomId: 'room123',
      text: 'Hello, world!',
      clientId: 'client123',
      action: 'message.create',
      metadata: {},
      headers: {},
      createdAt: 1672531200000,
      timestamp: 1672531300000,
    };

    const result = messageFromRest(restMessage);

    expect(result).toBeInstanceOf(DefaultMessage);
    expect(result.serial).toBe('01672531200000-123@abcdefghij');
    expect(result.version).toBe('01672531200000-123@abcdefghij:0');
    expect(result.text).toBe('Hello, world!');
    expect(result.clientId).toBe('client123');
    expect(result.action).toBe(ChatMessageAction.MessageCreate);
    expect(result.metadata).toEqual({});
    expect(result.headers).toEqual({});
    expect(result.createdAt).toEqual(new Date(1672531200000));
    expect(result.timestamp).toEqual(new Date(1672531300000));
    expect(result.reactions).toEqual(emptyMessageReactions());
    expect(result.operation).toBeUndefined();
  });

  it('should handle message with metadata and headers', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: '01672531200000-123@abcdefghij:0',
      roomId: 'room123',
      text: 'Hello with metadata',
      clientId: 'client123',
      action: 'message.create',
      metadata: {
        messageId: 'msg-123',
        priority: 'high',
        nested: {
          key: 'value',
        },
      },
      headers: {
        'x-custom-header': 'custom-value',
        authorization: 'bearer-token',
      },
      createdAt: 1672531200000,
      timestamp: 1672531300000,
    };

    const result = messageFromRest(restMessage);

    expect(result.metadata).toEqual({
      messageId: 'msg-123',
      priority: 'high',
      nested: {
        key: 'value',
      },
    });
    expect(result.headers).toEqual({
      'x-custom-header': 'custom-value',
      authorization: 'bearer-token',
    });
  });

  it('should handle different message actions', () => {
    const testCases = [
      { action: 'message.create', expected: ChatMessageAction.MessageCreate },
      { action: 'message.update', expected: ChatMessageAction.MessageUpdate },
      { action: 'message.delete', expected: ChatMessageAction.MessageDelete },
    ];

    for (const { action, expected } of testCases) {
      const restMessage: RestMessage = {
        serial: '01672531200000-123@abcdefghij',
        version: '01672531200000-123@abcdefghij:0',
        roomId: 'room123',
        text: 'Test message',
        clientId: 'client123',
        action,
        metadata: {},
        headers: {},
        createdAt: 1672531200000,
        timestamp: 1672531300000,
      };

      const result = messageFromRest(restMessage);
      expect(result.action).toBe(expected);
    }
  });

  it('should handle message with operation', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: '01672531200000-123@abcdefghij:0',
      roomId: 'room123',
      text: 'Updated message',
      clientId: 'client123',
      action: 'message.update',
      metadata: {},
      headers: {},
      createdAt: 1672531200000,
      timestamp: 1672531300000,
      operation: {
        clientId: 'client456',
        description: 'Message updated by admin',
        metadata: {
          reason: 'typo correction',
        },
      },
    };

    const result = messageFromRest(restMessage);

    expect(result.operation).toEqual({
      clientId: 'client456',
      description: 'Message updated by admin',
      metadata: {
        reason: 'typo correction',
      },
    });
  });

  it('should handle message with unique reactions', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: '01672531200000-123@abcdefghij:0',
      roomId: 'room123',
      text: 'Message with reactions',
      clientId: 'client123',
      action: 'message.create',
      metadata: {},
      headers: {},
      createdAt: 1672531200000,
      timestamp: 1672531300000,
      reactions: {
        unique: {
          '👍': {
            total: 2,
            clientIds: ['client1', 'client2'],
          },
          '❤️': {
            total: 1,
            clientIds: ['client3'],
          },
        },
      },
    };

    const result = messageFromRest(restMessage);

    expect(result.reactions.unique).toEqual({
      '👍': {
        total: 2,
        clientIds: ['client1', 'client2'],
      },
      '❤️': {
        total: 1,
        clientIds: ['client3'],
      },
    });
    expect(result.reactions.distinct).toEqual({});
    expect(result.reactions.multiple).toEqual({});
  });

  it('should handle message with distinct reactions', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: '01672531200000-123@abcdefghij:0',
      roomId: 'room123',
      text: 'Message with distinct reactions',
      clientId: 'client123',
      action: 'message.create',
      metadata: {},
      headers: {},
      createdAt: 1672531200000,
      timestamp: 1672531300000,
      reactions: {
        distinct: {
          '🎉': {
            total: 3,
            clientIds: ['client1', 'client2', 'client3'],
          },
        },
      },
    };

    const result = messageFromRest(restMessage);

    expect(result.reactions.distinct).toEqual({
      '🎉': {
        total: 3,
        clientIds: ['client1', 'client2', 'client3'],
      },
    });
    expect(result.reactions.unique).toEqual({});
    expect(result.reactions.multiple).toEqual({});
  });

  it('should handle message with multiple reactions', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: '01672531200000-123@abcdefghij:0',
      roomId: 'room123',
      text: 'Message with multiple reactions',
      clientId: 'client123',
      action: 'message.create',
      metadata: {},
      headers: {},
      createdAt: 1672531200000,
      timestamp: 1672531300000,
      reactions: {
        multiple: {
          '👏': {
            total: 15,
            clientIds: {
              client1: 5,
              client2: 10,
            },
            totalUnidentified: 0,
          },
        },
      },
    };

    const result = messageFromRest(restMessage);

    expect(result.reactions.multiple).toEqual({
      '👏': {
        total: 15,
        clientIds: {
          client1: 5,
          client2: 10,
        },
        totalUnidentified: 0,
      },
    });
    expect(result.reactions.unique).toEqual({});
    expect(result.reactions.distinct).toEqual({});
  });

  it('should handle message with all reaction types', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: '01672531200000-123@abcdefghij:0',
      roomId: 'room123',
      text: 'Message with all reactions',
      clientId: 'client123',
      action: 'message.create',
      metadata: {},
      headers: {},
      createdAt: 1672531200000,
      timestamp: 1672531300000,
      reactions: {
        unique: {
          '👍': {
            total: 1,
            clientIds: ['client1'],
          },
        },
        distinct: {
          '🎉': {
            total: 2,
            clientIds: ['client2', 'client3'],
          },
        },
        multiple: {
          '👏': {
            total: 10,
            clientIds: {
              client4: 10,
            },
            totalUnidentified: 0,
          },
        },
      },
    };

    const result = messageFromRest(restMessage);

    expect(result.reactions.unique).toEqual({
      '👍': {
        total: 1,
        clientIds: ['client1'],
      },
    });
    expect(result.reactions.distinct).toEqual({
      '🎉': {
        total: 2,
        clientIds: ['client2', 'client3'],
      },
    });
    expect(result.reactions.multiple).toEqual({
      '👏': {
        total: 10,
        clientIds: {
          client4: 10,
        },
        totalUnidentified: 0,
      },
    });
  });

  it('should handle message with missing reaction types using fallback', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: '01672531200000-123@abcdefghij:0',
      roomId: 'room123',
      text: 'Message with partial reactions',
      clientId: 'client123',
      action: 'message.create',
      metadata: {},
      headers: {},
      createdAt: 1672531200000,
      timestamp: 1672531300000,
      reactions: {
        unique: {
          '👍': {
            total: 1,
            clientIds: ['client1'],
          },
        },
        // Missing distinct and multiple reactions
      },
    };

    const result = messageFromRest(restMessage);

    expect(result.reactions.unique).toEqual({
      '👍': {
        total: 1,
        clientIds: ['client1'],
      },
    });
    expect(result.reactions.distinct).toEqual({});
    expect(result.reactions.multiple).toEqual({});
  });

  it('should handle message with undefined metadata and headers', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: '01672531200000-123@abcdefghij:0',
      roomId: 'room123',
      text: 'Message without metadata/headers',
      clientId: 'client123',
      action: 'message.create',
      metadata: undefined as unknown as Record<string, unknown>,
      headers: undefined as unknown as Record<string, string>,
      createdAt: 1672531200000,
      timestamp: 1672531300000,
    };

    const result = messageFromRest(restMessage);

    expect(result.metadata).toEqual({});
    expect(result.headers).toEqual({});
  });

  it('should handle message with no reactions field', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: '01672531200000-123@abcdefghij:0',
      roomId: 'room123',
      text: 'Message without reactions',
      clientId: 'client123',
      action: 'message.create',
      metadata: {},
      headers: {},
      createdAt: 1672531200000,
      timestamp: 1672531300000,
    };

    const result = messageFromRest(restMessage);

    expect(result.reactions).toEqual(emptyMessageReactions());
  });

  it('should preserve all other RestMessage fields in the spread', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: '01672531200000-123@abcdefghij:0',
      roomId: 'room123',
      text: 'Test message',
      clientId: 'client123',
      action: 'message.create',
      metadata: { key: 'value' },
      headers: { header: 'value' },
      createdAt: 1672531200000,
      timestamp: 1672531300000,
    };

    const result = messageFromRest(restMessage);

    // Verify that properties are correctly mapped through the spread operator
    expect(result.serial).toBe(restMessage.serial);
    expect(result.version).toBe(restMessage.version);
    expect(result.text).toBe(restMessage.text);
    expect(result.clientId).toBe(restMessage.clientId);
    expect(result.action).toBe(ChatMessageAction.MessageCreate);
    expect(result.createdAt).toEqual(new Date(restMessage.createdAt));
    expect(result.timestamp).toEqual(new Date(restMessage.timestamp));
  });

  it('should handle message with empty reactions object', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: '01672531200000-123@abcdefghij:0',
      roomId: 'room123',
      text: 'Message with empty reactions',
      clientId: 'client123',
      action: 'message.create',
      metadata: {},
      headers: {},
      createdAt: 1672531200000,
      timestamp: 1672531300000,
      reactions: {},
    };

    const result = messageFromRest(restMessage);

    expect(result.reactions).toEqual(emptyMessageReactions());
  });

  it('should handle complex metadata with nested objects and arrays', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: '01672531200000-123@abcdefghij:0',
      roomId: 'room123',
      text: 'Message with complex metadata',
      clientId: 'client123',
      action: 'message.create',
      metadata: {
        messageType: 'announcement',
        priority: 1,
        tags: ['important', 'urgent'],
        attachment: {
          type: 'image',
          url: 'https://example.com/image.jpg',
          size: 1024,
          metadata: {
            width: 800,
            height: 600,
          },
        },
        features: {
          encryption: true,
          mentions: ['@user1', '@user2'],
        },
      },
      headers: {},
      createdAt: 1672531200000,
      timestamp: 1672531300000,
    };

    const result = messageFromRest(restMessage);

    expect(result.metadata).toEqual({
      messageType: 'announcement',
      priority: 1,
      tags: ['important', 'urgent'],
      attachment: {
        type: 'image',
        url: 'https://example.com/image.jpg',
        size: 1024,
        metadata: {
          width: 800,
          height: 600,
        },
      },
      features: {
        encryption: true,
        mentions: ['@user1', '@user2'],
      },
    });
  });

  it('should handle zero timestamps correctly', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: '01672531200000-123@abcdefghij:0',
      roomId: 'room123',
      text: 'Message with zero timestamps',
      clientId: 'client123',
      action: 'message.create',
      metadata: {},
      headers: {},
      createdAt: 0,
      timestamp: 0,
    };

    const result = messageFromRest(restMessage);

    expect(result.createdAt).toEqual(new Date(0));
    expect(result.timestamp).toEqual(new Date(0));
  });
});

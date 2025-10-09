import { describe, expect, it } from 'vitest';

import { ChatMessageAction } from '../../src/core/events.js';
import { DefaultMessage, emptyMessageReactions } from '../../src/core/message.js';
import { messageFromRest, RestClientIdList, RestMessage } from '../../src/core/rest-types.js';

describe('messageFromRest', () => {
  it('should convert a basic REST message to a Message', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: {
        serial: '01672531200000-123@abcdefghij:0',
        timestamp: 1672531300000,
      },
      text: 'Hello, world!',
      clientId: 'client123',
      action: 'message.create',
      metadata: {},
      headers: {},
      timestamp: 1672531300000,
    };

    const result = messageFromRest(restMessage);

    expect(result).toBeInstanceOf(DefaultMessage);
    expect(result.serial).toBe('01672531200000-123@abcdefghij');
    expect(result.version.serial).toBe('01672531200000-123@abcdefghij:0');
    expect(result.text).toBe('Hello, world!');
    expect(result.clientId).toBe('client123');
    expect(result.action).toBe(ChatMessageAction.MessageCreate);
    expect(result.metadata).toEqual({});
    expect(result.headers).toEqual({});
    expect(result.timestamp).toEqual(new Date(1672531300000));
    expect(result.reactions).toEqual(emptyMessageReactions());
  });

  it('should handle message with metadata and headers', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: {
        serial: '01672531200000-123@abcdefghij:0',
        timestamp: 1672531300000,
      },
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
    const testCases: { action: RestMessage['action']; expected: ChatMessageAction }[] = [
      { action: 'message.create', expected: ChatMessageAction.MessageCreate },
      { action: 'message.update', expected: ChatMessageAction.MessageUpdate },
      { action: 'message.delete', expected: ChatMessageAction.MessageDelete },
    ];

    for (const { action, expected } of testCases) {
      const restMessage: RestMessage = {
        serial: '01672531200000-123@abcdefghij',
        version: {
          serial: '01672531200000-123@abcdefghij:0',
          timestamp: 1672531300000,
        },
        text: 'Test message',
        clientId: 'client123',
        action,
        metadata: {},
        headers: {},
        timestamp: 1672531300000,
      };

      const result = messageFromRest(restMessage);
      expect(result.action).toBe(expected);
    }
  });

  it('should handle message with operation', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: {
        serial: '01672531200000-123@abcdefghij:0',
        timestamp: 1672531300000,
        clientId: 'client456',
        description: 'Message updated by admin',
        metadata: {
          reason: 'typo correction',
        },
      },
      text: 'Updated message',
      clientId: 'client123',
      action: 'message.update',
      metadata: {},
      headers: {},
      timestamp: 1672531300000,
    };

    const result = messageFromRest(restMessage);

    // Check that version info contains operation data
    expect(result.version.clientId).toBe('client456');
    expect(result.version.description).toBe('Message updated by admin');
    expect(result.version.metadata).toEqual({
      reason: 'typo correction',
    });
  });

  it('should handle message with unique reactions', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: {
        serial: '01672531200000-123@abcdefghij:0',
        timestamp: 1672531300000,
      },
      text: 'Message with reactions',
      clientId: 'client123',
      action: 'message.create',
      metadata: {},
      headers: {},
      timestamp: 1672531300000,
      reactions: {
        unique: {
          '👍': {
            total: 2,
            clientIds: ['client1', 'client2'],
          } as RestClientIdList,
          '❤️': {
            total: 1,
            clientIds: ['client3'],
          } as RestClientIdList,
        },
      },
    };

    const result = messageFromRest(restMessage);

    expect(result.reactions.unique).toEqual({
      '👍': {
        total: 2,
        clientIds: ['client1', 'client2'],
        clipped: false,
      },
      '❤️': {
        total: 1,
        clientIds: ['client3'],
        clipped: false,
      },
    });
    expect(result.reactions.distinct).toEqual({});
    expect(result.reactions.multiple).toEqual({});
  });

  it('should handle message with distinct reactions', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: {
        serial: '01672531200000-123@abcdefghij:0',
        timestamp: 1672531300000,
      },
      text: 'Message with distinct reactions',
      clientId: 'client123',
      action: 'message.create',
      metadata: {},
      headers: {},
      timestamp: 1672531300000,
      reactions: {
        distinct: {
          '🎉': {
            total: 3,
            clientIds: ['client1', 'client2', 'client3'],
          } as RestClientIdList,
        },
      },
    };

    const result = messageFromRest(restMessage);

    expect(result.reactions.distinct).toEqual({
      '🎉': {
        total: 3,
        clientIds: ['client1', 'client2', 'client3'],
        clipped: false,
      },
    });
    expect(result.reactions.unique).toEqual({});
    expect(result.reactions.multiple).toEqual({});
  });

  it('should handle message with multiple reactions', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: {
        serial: '01672531200000-123@abcdefghij:0',
        timestamp: 1672531300000,
      },
      text: 'Message with multiple reactions',
      clientId: 'client123',
      action: 'message.create',
      metadata: {},
      headers: {},
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
        clipped: false,
        totalClientIds: 0,
      },
    });
    expect(result.reactions.unique).toEqual({});
    expect(result.reactions.distinct).toEqual({});
  });

  it('should handle message with all reaction types', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: {
        serial: '01672531200000-123@abcdefghij:0',
        timestamp: 1672531300000,
      },
      text: 'Message with all reactions',
      clientId: 'client123',
      action: 'message.create',
      metadata: {},
      headers: {},
      timestamp: 1672531300000,
      reactions: {
        unique: {
          '👍': {
            total: 1,
            clientIds: ['client1'],
          } as RestClientIdList,
        },
        distinct: {
          '🎉': {
            total: 2,
            clientIds: ['client2', 'client3'],
          } as RestClientIdList,
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
        clipped: false,
      },
    });
    expect(result.reactions.distinct).toEqual({
      '🎉': {
        total: 2,
        clientIds: ['client2', 'client3'],
        clipped: false,
      },
    });
    expect(result.reactions.multiple).toEqual({
      '👏': {
        total: 10,
        clientIds: {
          client4: 10,
        },
        totalUnidentified: 0,
        clipped: false,
        totalClientIds: 0,
      },
    });
  });

  it('should handle message with missing reaction types using fallback', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: {
        serial: '01672531200000-123@abcdefghij:0',
        timestamp: 1672531300000,
      },
      text: 'Message with partial reactions',
      clientId: 'client123',
      action: 'message.create',
      metadata: {},
      headers: {},
      timestamp: 1672531300000,
      reactions: {
        unique: {
          '👍': {
            total: 1,
            clientIds: ['client1'],
          } as RestClientIdList,
        },
        // Missing distinct and multiple reactions
      },
    };

    const result = messageFromRest(restMessage);

    expect(result.reactions.unique).toEqual({
      '👍': {
        total: 1,
        clientIds: ['client1'],
        clipped: false,
      },
    });
    expect(result.reactions.distinct).toEqual({});
    expect(result.reactions.multiple).toEqual({});
  });

  it('should handle message with no reactions field', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: {
        serial: '01672531200000-123@abcdefghij:0',
        timestamp: 1672531300000,
      },
      text: 'Message without reactions',
      clientId: 'client123',
      action: 'message.create',
      metadata: {},
      headers: {},
      timestamp: 1672531300000,
    };

    const result = messageFromRest(restMessage);

    expect(result.reactions).toEqual(emptyMessageReactions());
  });

  it('should preserve all other RestMessage fields in the spread', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: {
        serial: '01672531200000-123@abcdefghij:0',
        timestamp: 1672531300000,
      },
      text: 'Test message',
      clientId: 'client123',
      action: 'message.create',
      metadata: { key: 'value' },
      headers: { header: 'value' },
      timestamp: 1672531300000,
    };

    const result = messageFromRest(restMessage);

    // Verify that properties are correctly mapped through the spread operator
    expect(result.serial).toBe(restMessage.serial);
    expect(result.version.serial).toBe(restMessage.version.serial);
    expect(result.text).toBe(restMessage.text);
    expect(result.clientId).toBe(restMessage.clientId);
    expect(result.action).toBe(ChatMessageAction.MessageCreate);
    expect(result.timestamp).toEqual(new Date(restMessage.timestamp));
  });

  it('should handle message with empty reactions object', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: {
        serial: '01672531200000-123@abcdefghij:0',
        timestamp: 1672531300000,
      },
      text: 'Message with empty reactions',
      clientId: 'client123',
      action: 'message.create',
      metadata: {},
      headers: {},
      timestamp: 1672531300000,
      reactions: {},
    };

    const result = messageFromRest(restMessage);

    expect(result.reactions).toEqual(emptyMessageReactions());
  });

  it('should handle complex metadata with nested objects and arrays', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: {
        serial: '01672531200000-123@abcdefghij:0',
        timestamp: 1672531300000,
      },
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
      version: {
        serial: '01672531200000-123@abcdefghij:0',
        timestamp: 0,
      },
      text: 'Message with zero timestamps',
      clientId: 'client123',
      action: 'message.create',
      metadata: {},
      headers: {},
      timestamp: 0,
    };

    const result = messageFromRest(restMessage);

    expect(result.timestamp).toEqual(new Date(0));
    expect(result.version.timestamp).toEqual(new Date(0));
  });

  it('should default to message.create for unknown action', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: {
        serial: '01672531200000-123@abcdefghij:0',
        timestamp: 1672531300000,
      },
      text: 'Test message',
      clientId: 'client123',
      action: 'message.unknown' as RestMessage['action'],
      metadata: {},
      headers: {},
      timestamp: 1672531300000,
    };

    const result = messageFromRest(restMessage);
    expect(result.action).toBe(ChatMessageAction.MessageCreate);
  });

  it('should explicitly set clipped to false when missing for unique reactions', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: {
        serial: '01672531200000-123@abcdefghij:0',
        timestamp: 1672531300000,
      },
      text: 'Message with unique reactions missing clipped',
      clientId: 'client123',
      action: 'message.create',
      metadata: {},
      headers: {},
      timestamp: 1672531300000,
      reactions: {
        unique: {
          '👍': {
            total: 2,
            clientIds: ['client1', 'client2'],
            // clipped is intentionally missing
          } as RestClientIdList,
        },
      },
    };

    const result = messageFromRest(restMessage);

    expect(result.reactions.unique['👍']?.clipped).toBe(false);
  });

  it('should explicitly set clipped to false when missing for distinct reactions', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: {
        serial: '01672531200000-123@abcdefghij:0',
        timestamp: 1672531300000,
      },
      text: 'Message with distinct reactions missing clipped',
      clientId: 'client123',
      action: 'message.create',
      metadata: {},
      headers: {},
      timestamp: 1672531300000,
      reactions: {
        distinct: {
          '🎉': {
            total: 3,
            clientIds: ['client1', 'client2', 'client3'],
            // clipped is intentionally missing
          } as RestClientIdList,
        },
      },
    };

    const result = messageFromRest(restMessage);

    expect(result.reactions.distinct['🎉']?.clipped).toBe(false);
  });

  it('should explicitly set clipped to false and totalClientIds to zero when missing for multiple reactions', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: {
        serial: '01672531200000-123@abcdefghij:0',
        timestamp: 1672531300000,
      },
      text: 'Message with multiple reactions missing clipped and totalClientIds',
      clientId: 'client123',
      action: 'message.create',
      metadata: {},
      headers: {},
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
            // clipped and totalClientIds are intentionally missing
          },
        },
      },
    };

    const result = messageFromRest(restMessage);

    expect(result.reactions.multiple['👏']?.clipped).toBe(false);
    expect(result.reactions.multiple['👏']?.totalClientIds).toBe(0);
  });

  it('should preserve existing clipped and totalClientIds values when they are present', () => {
    const restMessage: RestMessage = {
      serial: '01672531200000-123@abcdefghij',
      version: {
        serial: '01672531200000-123@abcdefghij:0',
        timestamp: 1672531300000,
      },
      text: 'Message with reactions that have explicit values',
      clientId: 'client123',
      action: 'message.create',
      metadata: {},
      headers: {},
      timestamp: 1672531300000,
      reactions: {
        unique: {
          '👍': {
            total: 2,
            clientIds: ['client1', 'client2'],
            clipped: true,
          },
        },
        distinct: {
          '🎉': {
            total: 3,
            clientIds: ['client1', 'client2', 'client3'],
            clipped: true,
          },
        },
        multiple: {
          '👏': {
            total: 15,
            clientIds: {
              client1: 5,
              client2: 10,
            },
            totalUnidentified: 0,
            clipped: true,
            totalClientIds: 5,
          },
        },
      },
    };

    const result = messageFromRest(restMessage);

    expect(result.reactions.unique['👍']?.clipped).toBe(true);
    expect(result.reactions.distinct['🎉']?.clipped).toBe(true);
    expect(result.reactions.multiple['👏']?.clipped).toBe(true);
    expect(result.reactions.multiple['👏']?.totalClientIds).toBe(5);
  });
});

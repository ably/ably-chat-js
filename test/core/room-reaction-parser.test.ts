import * as Ably from 'ably';
import { describe, expect, it } from 'vitest';

import { DefaultRoomReaction } from '../../src/core/room-reaction.js';
import { parseRoomReaction } from '../../src/core/room-reaction-parser.js';

describe('parseRoomReaction', () => {
  describe.each([
    {
      description: 'message.data is undefined',
      message: {} as Ably.InboundMessage,
      expectedName: '',
      expectedClientId: '',
    },
    {
      description: 'message.data.name is undefined',
      message: { data: {}, clientId: 'client1', timestamp: 1234567890 },
      expectedName: '',
      expectedClientId: 'client1',
    },
    {
      description: 'message.data.name is not a string',
      message: { data: { name: 123 }, clientId: 'client1', timestamp: 1234567890 },
      expectedName: '',
      expectedClientId: 'client1',
    },
    {
      description: 'message.clientId is undefined',
      message: { data: { name: 'like' }, timestamp: 1234567890 },
      expectedName: 'like',
      expectedClientId: '',
    },
    {
      description: 'message.timestamp is undefined',
      message: { data: { name: 'like' }, clientId: 'client1' },
      expectedName: 'like',
      expectedClientId: 'client1',
    },
  ])('should handle missing fields with defaults', ({ description, message, expectedName, expectedClientId }) => {
    it(`should handle case where ${description}`, () => {
      const result = parseRoomReaction(message as Ably.InboundMessage);

      expect(result).toBeInstanceOf(DefaultRoomReaction);
      expect(result.name).toBe(expectedName);
      expect(result.clientId).toBe(expectedClientId);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.isSelf).toBe(false);
      expect(result.metadata).toEqual({});
      expect(result.headers).toEqual({});
    });
  });

  it('should return a DefaultReaction instance for a valid message', () => {
    const message = {
      data: { name: 'like', metadata: { key: 'value' } },
      clientId: 'client1',
      timestamp: 1234567890,
      extras: { headers: { headerKey: 'headerValue' } },
    } as Ably.InboundMessage;

    const result = parseRoomReaction(message);

    expect(result).toBeInstanceOf(DefaultRoomReaction);
    expect(result.name).toBe('like');
    expect(result.clientId).toBe('client1');
    expect(result.createdAt).toEqual(new Date(1234567890));
    expect(result.isSelf).toBe(false);
    expect(result.metadata).toEqual({ key: 'value' });
    expect(result.headers).toEqual({ headerKey: 'headerValue' });
  });

  it('should set isFromCurrentUser to true if clientId matches', () => {
    const message = {
      data: { name: 'like' },
      clientId: 'client1',
      timestamp: 1234567890,
    } as Ably.InboundMessage;

    const result = parseRoomReaction(message, 'client1');

    expect(result.isSelf).toBe(true);
  });
});

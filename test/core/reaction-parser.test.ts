import * as Ably from 'ably';
import { describe, expect, it } from 'vitest';

import { DefaultReaction } from '../../src/core/reaction.js';
import { parseReaction } from '../../src/core/reaction-parser.js';

describe('parseReaction', () => {
  describe.each([
    {
      description: 'message.data is undefined',
      message: {} as Ably.InboundMessage,
      expectedError: 'received incoming message without data',
    },
    {
      description: 'message.data.type is undefined',
      message: { data: {}, clientId: 'client1', timestamp: 1234567890 },
      expectedError: 'invalid reaction message with no type',
    },
    {
      description: 'message.data.type is not a string',
      message: { data: { type: 123 }, clientId: 'client1', timestamp: 1234567890 },
      expectedError: 'invalid reaction message with no type',
    },
    {
      description: 'message.clientId is undefined',
      message: { data: { type: 'like' }, timestamp: 1234567890 },
      expectedError: 'received incoming message without clientId',
    },
    {
      description: 'message.timestamp is undefined',
      message: { data: { type: 'like' }, clientId: 'client1' },
      expectedError: 'received incoming message without timestamp',
    },
  ])('should throw an error', ({ description, message, expectedError }) => {
    it(`should throw the error if ${description}`, () => {
      expect(() => {
        parseReaction(message as Ably.InboundMessage);
      }).toThrowErrorInfo({
        code: 50000,
        message: expectedError,
      });
    });
  });

  it('should return a DefaultReaction instance for a valid message', () => {
    const message = {
      data: { type: 'like', metadata: { key: 'value' } },
      clientId: 'client1',
      timestamp: 1234567890,
      extras: { headers: { headerKey: 'headerValue' } },
    } as Ably.InboundMessage;

    const result = parseReaction(message);

    expect(result).toBeInstanceOf(DefaultReaction);
    expect(result.name).toBe('like');
    expect(result.clientId).toBe('client1');
    expect(result.createdAt).toEqual(new Date(1234567890));
    expect(result.isSelf).toBe(false);
    expect(result.metadata).toEqual({ key: 'value' });
    expect(result.headers).toEqual({ headerKey: 'headerValue' });
  });

  it('should set isFromCurrentUser to true if clientId matches', () => {
    const message = {
      data: { type: 'like' },
      clientId: 'client1',
      timestamp: 1234567890,
    } as Ably.InboundMessage;

    const result = parseReaction(message, 'client1');

    expect(result.isSelf).toBe(true);
  });
});

import * as Ably from 'ably';
import { describe, expect, it } from 'vitest';

import { DefaultRoomReaction } from '../../src/core/room-reaction.js';
import { parseRoomReaction } from '../../src/core/room-reaction-parser.js';

describe('parseRoomReaction', () => {
  describe.each([
    {
      description: 'message.data is undefined',
      message: {} as Ably.InboundMessage,
      expectedError: 'received incoming room reaction message without data',
    },
    {
      description: 'message.data.name is undefined',
      message: { data: {}, clientId: 'client1', timestamp: 1234567890 },
      expectedError: 'invalid room reaction message with no name',
    },
    {
      description: 'message.data.name is not a string',
      message: { data: { name: 123 }, clientId: 'client1', timestamp: 1234567890 },
      expectedError: 'invalid room reaction message with no name',
    },
    {
      description: 'message.clientId is undefined',
      message: { data: { name: 'like' }, timestamp: 1234567890 },
      expectedError: 'received incoming room reaction message without clientId',
    },
    {
      description: 'message.timestamp is undefined',
      message: { data: { name: 'like' }, clientId: 'client1' },
      expectedError: 'received incoming room reaction message without timestamp',
    },
  ])('should throw an error', ({ description, message, expectedError }) => {
    it(`should throw the error if ${description}`, () => {
      expect(() => {
        parseRoomReaction(message as Ably.InboundMessage);
      }).toThrowErrorInfo({
        code: 50000,
        message: expectedError,
      });
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

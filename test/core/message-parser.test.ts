import * as Ably from 'ably';
import { describe, expect, it } from 'vitest';

import { DefaultMessage } from '../../src/core/message.js';
import { parseMessage } from '../../src/core/message-parser.js';

describe('parseMessage', () => {
  describe.each([
    {
      description: 'roomId is undefined',
      roomId: undefined,
      message: {},
      expectedError: 'received incoming message without roomId',
    },
    {
      description: 'message.data is undefined',
      roomId: 'room1',
      message: { clientId: 'client1', timestamp: 1234567890, extras: { timeserial: 'abcdefghij@1672531200000-123' } },
      expectedError: 'received incoming message without data',
    },
    {
      description: 'message.clientId is undefined',
      roomId: 'room1',
      message: {
        data: { text: 'hello' },
        timestamp: 1234567890,
        extras: { timeserial: 'abcdefghij@1672531200000-123' },
      },
      expectedError: 'received incoming message without clientId',
    },
    {
      description: 'message.timestamp is undefined',
      roomId: 'room1',
      message: {
        data: { text: 'hello' },
        clientId: 'client1',
        extras: { timeserial: 'abcdefghij@1672531200000-123' },
      },
      expectedError: 'received incoming message without timestamp',
    },
    {
      description: 'message.data.text is undefined',
      roomId: 'room1',
      message: {
        data: {},
        clientId: 'client1',
        timestamp: 1234567890,
        extras: { timeserial: 'abcdefghij@1672531200000-123' },
      },
      expectedError: 'received incoming message without text',
    },
    {
      description: 'message.extras is undefined',
      roomId: 'room1',
      message: { data: { text: 'hello' }, clientId: 'client1', timestamp: 1234567890 },
      expectedError: 'received incoming message without extras',
    },
    {
      description: 'message.extras.timeserial is undefined',
      roomId: 'room1',
      message: { data: { text: 'hello' }, clientId: 'client1', timestamp: 1234567890, extras: {} },
      expectedError: 'received incoming message without timeserial',
    },
  ])('should throw an error ', ({ description, roomId, message, expectedError }) => {
    it(`should throw an error if ${description}`, () => {
      expect(() => {
        parseMessage(roomId, message as Ably.InboundMessage);
      }).toThrowErrorInfo({
        code: 50000,
        message: expectedError,
      });
    });
  });

  it('should return a DefaultMessage instance for a valid message', () => {
    const message = {
      data: { text: 'hello', metadata: { key: 'value' } },
      clientId: 'client1',
      timestamp: 1234567890,
      extras: { timeserial: 'abcdefghij@1672531200000-123', headers: { headerKey: 'headerValue' } },
    } as Ably.InboundMessage;

    const result = parseMessage('room1', message);

    expect(result).toBeInstanceOf(DefaultMessage);
    expect(result.timeserial).toBe('abcdefghij@1672531200000-123');
    expect(result.clientId).toBe('client1');
    expect(result.roomId).toBe('room1');
    expect(result.text).toBe('hello');
    expect(result.createdAt).toEqual(new Date(1234567890));
    expect(result.metadata).toEqual({ key: 'value' });
    expect(result.headers).toEqual({ headerKey: 'headerValue' });
  });
});

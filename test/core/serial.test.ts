import { describe, expect, it } from 'vitest';

import { ChatMessageAction } from '../../src/core/events.js';
import { DefaultMessage, emptyMessageReactions } from '../../src/core/message.js';
import { Serial, serialToString } from '../../src/core/serial.js';

describe('serialToString', () => {
  const testSerial = '01672531200000-123@abcdefghij';

  it.each([
    {
      description: 'string serial',
      input: testSerial,
      expected: testSerial,
    },
    {
      description: 'object with serial property',
      input: { serial: testSerial },
      expected: testSerial,
    },
    {
      description: 'Message object',
      input: new DefaultMessage({
        serial: testSerial,
        clientId: 'clientId',
        text: 'hello there',
        metadata: {},
        headers: {},
        action: ChatMessageAction.MessageCreate,
        version: { serial: testSerial, timestamp: new Date(1672531200000) },
        timestamp: new Date(1672531200000),
        reactions: emptyMessageReactions(),
      }),
      expected: testSerial,
    },
  ])('should return the serial when given a $description', ({ input, expected }) => {
    // Act
    const result = serialToString(input);

    // Assert
    expect(result).toBe(expected);
  });

  it.each([
    {
      description: 'invalid object without serial property',
      input: { id: 'some-id', data: 'some-data' } as unknown as Serial,
    },
    {
      description: 'null',
      input: null as unknown as Serial,
    },
    {
      description: 'undefined',
      input: undefined as unknown as Serial,
    },
    {
      description: 'number',
      input: 123 as unknown as Serial,
    },
    {
      description: 'boolean',
      input: true as unknown as Serial,
    },
    {
      description: 'empty string serial',
      input: '',
    },
    {
      description: 'object with empty string serial',
      input: { serial: '' },
    },
  ])('should throw ErrorInfo when given $description', ({ input }) => {
    // Act & Assert
    expect(() => serialToString(input)).toThrowErrorInfo({
      code: 40000,
      statusCode: 400,
      message: 'invalid serial; must be string or object with serial property',
    });
  });
});

import * as Ably from 'ably';
import { describe, expect, it } from 'vitest';

import { DefaultMessage } from '../../src/core/message.ts';
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
      message: {
        clientId: 'client1',
        timestamp: 1234567890,
        extras: {},
        serial: 'cbfkKvEYgBhDaZ38195418@1728402074206-0:0',
        action: 'MESSAGE_CREATE',
      },
      expectedError: 'received incoming message without data',
    },
    {
      description: 'message.clientId is undefined',
      roomId: 'room1',
      message: {
        data: { text: 'hello' },
        timestamp: 1234567890,
        extras: {},
        serial: 'cbfkKvEYgBhDaZ38195418@1728402074206-0:0',
        action: 'MESSAGE_CREATE',
      },
      expectedError: 'received incoming message without clientId',
    },
    {
      description: 'message.timestamp is undefined',
      roomId: 'room1',
      message: {
        data: { text: 'hello' },
        clientId: 'client1',
        extras: {},
        serial: 'cbfkKvEYgBhDaZ38195418@1728402074206-0:0',
        action: 'MESSAGE_CREATE',
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
        extras: {},
        serial: 'cbfkKvEYgBhDaZ38195418@1728402074206-0:0',
        action: 'MESSAGE_CREATE',
      },
      expectedError: 'received incoming message without text',
    },
    {
      description: 'message.extras is undefined',
      roomId: 'room1',
      message: {
        data: { text: 'hello' },
        clientId: 'client1',
        timestamp: 1234567890,
        serial: 'cbfkKvEYgBhDaZ38195418@1728402074206-0:0',
        action: 'MESSAGE_CREATE',
      },
      expectedError: 'received incoming message without extras',
    },
    {
      description: 'message.serial is undefined',
      roomId: 'room1',
      message: {
        data: { text: 'hello' },
        clientId: 'client1',
        timestamp: 1234567890,
        extras: {},
        action: 'MESSAGE_CREATE',
      },
      expectedError: 'received incoming message without serial',
    },
    {
      description: 'message.action is unhandled',
      roomId: 'room1',
      message: {
        data: { text: 'hello' },
        clientId: 'client1',
        timestamp: 1234567890,
        extras: {},
        serial: 'cbfkKvEYgBhDaZ38195418@1728402074206-0:0',
        action: 'UNHANDLED_ACTION',
      },
      expectedError: 'received incoming message with unhandled action; UNHANDLED_ACTION',
    },
    {
      description: 'message.updateAt is undefined for update',
      roomId: 'room1',
      message: {
        data: { text: 'hello' },
        clientId: 'client1',
        timestamp: 1234567890,
        extras: {},
        serial: 'cbfkKvEYgBhDaZ38195418@1728402074206-0:0',
        action: 'MESSAGE_UPDATE',
      },
      expectedError: 'received incoming update message without updatedAt',
    },
    {
      description: 'message.deletedAt is undefined for deletion',
      roomId: 'room1',
      message: {
        data: { text: 'hello' },
        clientId: 'client1',
        timestamp: 1234567890,
        extras: {},
        serial: 'cbfkKvEYgBhDaZ38195418@1728402074206-0:0',
        action: 'MESSAGE_DELETE',
      },
      expectedError: 'received incoming deletion message without deletedAt',
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

  it('should return a DefaultMessage instance for a valid new message', () => {
    const message = {
      data: { text: 'hello', metadata: { key: 'value' } },
      clientId: 'client1',
      timestamp: 1234567890,
      extras: {
        headers: { headerKey: 'headerValue' },
      },
      action: 'MESSAGE_CREATE',
      serial: 'cbfkKvEYgBhDaZ38195418@1728402074206-0:0',
    } as Ably.InboundMessage;

    const result = parseMessage('room1', message);

    expect(result).toBeInstanceOf(DefaultMessage);
    expect(result.timeserial).toBe('cbfkKvEYgBhDaZ38195418@1728402074206-0:0');
    expect(result.clientId).toBe('client1');
    expect(result.roomId).toBe('room1');
    expect(result.text).toBe('hello');
    expect(result.createdAt).toEqual(new Date(1234567890));
    expect(result.metadata).toEqual({ key: 'value' });
    expect(result.headers).toEqual({ headerKey: 'headerValue' });

    // deletion related fields should be undefined
    expect(result.deletedAt).toBeUndefined();
    expect(result.deletedBy).toBeUndefined();
    expect(result.deletionDetail).toBeUndefined();

    // update related fields should be undefined
    expect(result.updatedAt).toBeUndefined();
    expect(result.updatedBy).toBeUndefined();
    expect(result.updateDetail).toBeUndefined();
  });

  it('should return a DefaultMessage instance for a valid updated message', () => {
    const message = {
      id: 'message-id',
      data: { text: 'hello', metadata: { key: 'value' } },
      clientId: 'client1',
      timestamp: 1234567890,
      extras: {
        headers: { headerKey: 'headerValue' },
      },
      action: 'MESSAGE_UPDATE',
      serial: 'cbfkKvEYgBhDaZ38195418@1728402074206-0:0',
      updatedAt: 1234567890,
      operation: { clientId: 'client2', description: 'update message', metadata: { 'custom-update': 'some flag' } },
    } as Ably.InboundMessage;

    const result = parseMessage('room1', message);

    expect(result).toBeInstanceOf(DefaultMessage);
    expect(result.timeserial).toBe('cbfkKvEYgBhDaZ38195418@1728402074206-0:0');
    expect(result.clientId).toBe('client1');
    expect(result.roomId).toBe('room1');
    expect(result.text).toBe('hello');
    expect(result.createdAt).toEqual(new Date(1234567890));
    expect(result.metadata).toEqual({ key: 'value' });
    expect(result.headers).toEqual({ headerKey: 'headerValue' });
    expect(result.updatedAt).toEqual(new Date(1234567890));
    expect(result.updatedBy).toBe('client2');
    expect(result.updateDetail).toEqual({ description: 'update message', metadata: { 'custom-update': 'some flag' } });

    // deletion related fields should be undefined
    expect(result.deletedAt).toBeUndefined();
    expect(result.deletedBy).toBeUndefined();
    expect(result.deletionDetail).toBeUndefined();
  });

  it('should return a DefaultMessage instance for a valid deleted message', () => {
    const message = {
      id: 'message-id',
      data: { text: 'hello', metadata: { key: 'value' } },
      clientId: 'client1',
      timestamp: 1234567890,
      extras: {
        headers: { headerKey: 'headerValue' },
      },
      action: 'MESSAGE_DELETE',
      serial: 'cbfkKvEYgBhDaZ38195418@1728402074206-0:0',
      deletedAt: 1234567890,
      operation: {
        clientId: 'client2',
        description: 'delete message',
        metadata: { 'custom-warning': 'this is a warning' },
      },
    } as Ably.InboundMessage;

    const result = parseMessage('room1', message);

    expect(result).toBeInstanceOf(DefaultMessage);
    expect(result.timeserial).toBe('cbfkKvEYgBhDaZ38195418@1728402074206-0:0');
    expect(result.clientId).toBe('client1');
    expect(result.roomId).toBe('room1');
    expect(result.text).toBe('hello');
    expect(result.createdAt).toEqual(new Date(1234567890));
    expect(result.metadata).toEqual({ key: 'value' });
    expect(result.headers).toEqual({ headerKey: 'headerValue' });
    expect(result.deletedAt).toEqual(new Date(1234567890));
    expect(result.deletedBy).toBe('client2');
    expect(result.deletionDetail).toEqual({
      description: 'delete message',
      metadata: { 'custom-warning': 'this is a warning' },
    });

    // update related fields should be undefined
    expect(result.updatedAt).toBeUndefined();
    expect(result.updatedBy).toBeUndefined();
    expect(result.updateDetail).toBeUndefined();
  });
});

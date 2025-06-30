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
        extras: {},
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        action: ChatMessageAction.MessageCreate,
      },
      expectedError: 'received incoming message without data',
    },
    {
      description: 'message.clientId is undefined',
      message: {
        data: { text: 'hello' },
        timestamp: 1728402074206,
        createdAt: 1728402074206,
        extras: {},
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        action: ChatMessageAction.MessageCreate,
      },
      expectedError: 'received incoming message without clientId',
    },
    {
      description: 'message.data.text is undefined',
      message: {
        data: {},
        clientId: 'client1',
        timestamp: 1728402074206,
        createdAt: 1728402074206,
        extras: {},
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        action: ChatMessageAction.MessageCreate,
      },
      expectedError: 'received incoming message without text',
    },
    {
      description: 'message.data.text is undefined for update action',
      message: {
        data: {},
        clientId: 'client1',
        timestamp: 1728402074206,
        createdAt: 1728402074206,
        extras: {},
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        action: ChatMessageAction.MessageUpdate,
        version: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
      },
      expectedError: 'received incoming message without text',
    },
    {
      description: 'message.extras is undefined',
      message: {
        data: { text: 'hello' },
        clientId: 'client1',
        timestamp: 1728402074206,
        createdAt: 1728402074206,
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        action: ChatMessageAction.MessageCreate,
      },
      expectedError: 'received incoming message without extras',
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
      expectedError: 'received incoming message without serial',
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
      expectedError: 'received incoming message without version',
    },
    {
      description: 'message.action is unhandled',
      message: {
        data: { text: 'hello' },
        clientId: 'client1',
        timestamp: 1728402074206,
        createdAt: 1728402074206,
        extras: {},
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        version: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        action: 'unhandled.action',
      },
      expectedError: 'received incoming message with unhandled action; unhandled.action',
    },
  ])('should throw an error ', ({ description, message, expectedError }) => {
    it(`should throw an error if ${description}`, () => {
      expect(() => {
        parseMessage(message as Ably.InboundMessage);
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
      data: { text: 'hello', metadata: { key: 'value' } },
      clientId: 'client1',
      createdAt: 1728402074206,
      extras: {
        headers: { headerKey: 'headerValue' },
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
    expect(result.text).toBe('hello');
    expect(result.createdAt).toEqual(new Date(1728402074206));
    expect(result.metadata).toEqual({ key: 'value' });
    expect(result.headers).toEqual({ headerKey: 'headerValue' });
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

  it('should return a DefaultMessage instance for a soft deleted message with empty data', () => {
    const message = {
      id: 'message-id',
      data: {}, // Empty data object for soft delete
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
    expect(result.text).toBe(''); // Should be empty string for soft delete
    expect(result.createdAt).toEqual(new Date(1728402074206));
    expect(result.metadata).toEqual({}); // Should be empty object
    expect(result.headers).toEqual({}); // Should be empty object
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

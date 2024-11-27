import * as Ably from 'ably';
import { describe, expect, it } from 'vitest';

import { ChatMessageActions } from '../../src/core/events.ts';
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
        timestamp: 1728402074206,
        createdAt: 1728402074206,
        extras: {},
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        action: ChatMessageActions.MessageCreate,
      },
      expectedError: 'received incoming message without data',
    },
    {
      description: 'message.clientId is undefined',
      roomId: 'room1',
      message: {
        data: { text: 'hello' },
        timestamp: 1728402074206,
        createdAt: 1728402074206,
        extras: {},
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        action: ChatMessageActions.MessageCreate,
      },
      expectedError: 'received incoming message without clientId',
    },
    {
      description: 'message.data.text is undefined',
      roomId: 'room1',
      message: {
        data: {},
        clientId: 'client1',
        timestamp: 1728402074206,
        createdAt: 1728402074206,
        extras: {},
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        action: ChatMessageActions.MessageCreate,
      },
      expectedError: 'received incoming message without text',
    },
    {
      description: 'message.extras is undefined',
      roomId: 'room1',
      message: {
        data: { text: 'hello' },
        clientId: 'client1',
        timestamp: 1728402074206,
        createdAt: 1728402074206,
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        action: ChatMessageActions.MessageCreate,
      },
      expectedError: 'received incoming message without extras',
    },
    {
      description: 'message.serial is undefined',
      roomId: 'room1',
      message: {
        data: { text: 'hello' },
        clientId: 'client1',
        timestamp: 1728402074206,
        createdAt: 1728402074206,
        extras: {},
        action: ChatMessageActions.MessageCreate,
      },
      expectedError: 'received incoming message without serial',
    },
    {
      description: 'message.action is unhandled',
      roomId: 'room1',
      message: {
        data: { text: 'hello' },
        clientId: 'client1',
        timestamp: 1728402074206,
        createdAt: 1728402074206,
        extras: {},
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        action: 'unhandled.action',
      },
      expectedError: 'received incoming message with unhandled action; unhandled.action',
    },
    {
      description: 'message.version is undefined for update',
      roomId: 'room1',
      message: {
        data: { text: 'hello' },
        clientId: 'client1',
        createdAt: 1728402074206,
        extras: {},
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        action: ChatMessageActions.MessageUpdate,
        timestamp: 1234567890,
        version: undefined,
      },
      expectedError: 'received incoming message.update without version',
    },
    {
      description: 'message.version is undefined for deletion',
      roomId: 'room1',
      message: {
        data: { text: 'hello' },
        clientId: 'client1',
        createdAt: 1728402074206,
        extras: {},
        serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
        timestamp: 1234567890,
        version: undefined,
        action: ChatMessageActions.MessageDelete,
      },
      expectedError: 'received incoming message.delete without version',
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
      createdAt: 1728402074206,
      extras: {
        headers: { headerKey: 'headerValue' },
      },
      timestamp: 1728402074206,
      version: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
      action: ChatMessageActions.MessageCreate,
      serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
    } as Ably.InboundMessage;

    const result = parseMessage('room1', message);

    expect(result).toBeInstanceOf(DefaultMessage);
    expect(result.serial).toBe('01728402074206-000@cbfkKvEYgBhDaZ38195418:0');
    expect(result.clientId).toBe('client1');
    expect(result.roomId).toBe('room1');
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

    expect(result.latestAction).toEqual(ChatMessageActions.MessageCreate);
    expect(result.latestActionDetails).toBeUndefined();
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
      action: ChatMessageActions.MessageUpdate,
      serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
      timestamp: 1728402074206,
      version: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
      operation: { clientId: 'client2', description: 'update message', metadata: { 'custom-update': 'some flag' } },
    } as Ably.InboundMessage;

    const result = parseMessage('room1', message);

    expect(result).toBeInstanceOf(DefaultMessage);
    expect(result.serial).toBe('01728402074206-000@cbfkKvEYgBhDaZ38195418:0');
    expect(result.clientId).toBe('client1');
    expect(result.roomId).toBe('room1');
    expect(result.text).toBe('hello');
    expect(result.createdAt).toEqual(new Date(1728402074206));
    expect(result.metadata).toEqual({ key: 'value' });
    expect(result.headers).toEqual({ headerKey: 'headerValue' });
    expect(result.updatedAt).toEqual(new Date(1728402074206));
    expect(result.updatedBy).toBe('client2');
    expect(result.latestAction).toEqual(ChatMessageActions.MessageUpdate);
    expect(result.latestActionSerial).toEqual('01728402074206-000@cbfkKvEYgBhDaZ38195418:0');
    expect(result.latestActionDetails).toEqual({
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
      action: ChatMessageActions.MessageDelete,
      serial: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
      timestamp: 1728402074206,
      version: '01728402074206-000@cbfkKvEYgBhDaZ38195418:0',
      operation: {
        clientId: 'client2',
        description: 'delete message',
        metadata: { 'custom-warning': 'this is a warning' },
      },
    } as Ably.InboundMessage;

    const result = parseMessage('room1', message);

    expect(result).toBeInstanceOf(DefaultMessage);
    expect(result.serial).toBe('01728402074206-000@cbfkKvEYgBhDaZ38195418:0');
    expect(result.clientId).toBe('client1');
    expect(result.roomId).toBe('room1');
    expect(result.text).toBe('hello');
    expect(result.createdAt).toEqual(new Date(1728402074206));
    expect(result.metadata).toEqual({ key: 'value' });
    expect(result.headers).toEqual({ headerKey: 'headerValue' });
    expect(result.deletedAt).toEqual(new Date(1728402074206));
    expect(result.deletedBy).toBe('client2');
    expect(result.latestActionSerial).toEqual('01728402074206-000@cbfkKvEYgBhDaZ38195418:0');
    expect(result.latestActionDetails).toEqual({
      clientId: 'client2',
      description: 'delete message',
      metadata: { 'custom-warning': 'this is a warning' },
    });

    // update related fields should be undefined
    expect(result.updatedAt).toBeUndefined();
    expect(result.updatedBy).toBeUndefined();
  });
});

import * as Ably from 'ably';
import { describe, expect, it, vi } from 'vitest';

import { ChatApi } from '../../src/core/chat-api.ts';
import { ErrorCode } from '../../src/core/errors.ts';
import { makeTestLogger } from '../helper/logger.ts';

vi.mock('ably');

describe('config', () => {
  it('calls the api with the correct protocol version', async () => {
    const realtime = new Ably.Realtime({ clientId: 'test' });
    const chatApi = new ChatApi(realtime, makeTestLogger());

    vi.spyOn(realtime, 'request').mockReturnValue(
      Promise.resolve({
        success: false,
        errorMessage: 'test',
        errorCode: 40000,
        statusCode: 400,
      }) as Promise<Ably.HttpPaginatedResponse>,
    );

    await expect(chatApi.getOccupancy('test')).rejects.toBeErrorInfo({
      message: 'test',
      code: 40000,
      statusCode: 400,
    });
    expect(realtime.request).toHaveBeenCalledWith('GET', '/chat/v4/rooms/test/occupancy', 4, undefined, undefined);
  });

  it('throws an error if Realtime returns ErrorInfo on non-paginated request', async () => {
    const realtime = new Ably.Realtime({ clientId: 'test' });
    const chatApi = new ChatApi(realtime, makeTestLogger());

    vi.spyOn(realtime, 'request').mockReturnValue(
      Promise.resolve({
        success: false,
        errorMessage: 'test',
        errorCode: 40000,
        statusCode: 400,
      }) as Promise<Ably.HttpPaginatedResponse>,
    );

    await expect(chatApi.getOccupancy('test')).rejects.toBeErrorInfo({
      message: 'test',
      code: 40000,
      statusCode: 400,
    });
  });

  it('throws errors if Realtime returns ErrorInfo on paginated request', async () => {
    const realtime = new Ably.Realtime({ clientId: 'test' });
    const chatApi = new ChatApi(realtime, makeTestLogger());

    vi.spyOn(realtime, 'request').mockReturnValue(
      Promise.resolve({
        success: false,
        errorMessage: 'test',
        errorCode: 40000,
        statusCode: 400,
      }) as Promise<Ably.HttpPaginatedResponse>,
    );

    await expect(chatApi.history('test', {})).rejects.toBeErrorInfo({
      message: 'test',
      code: 40000,
      statusCode: 400,
    });
  });

  it('includes errorDetail in thrown ErrorInfo on non-paginated request', async () => {
    const realtime = new Ably.Realtime({ clientId: 'test' });
    const chatApi = new ChatApi(realtime, makeTestLogger());

    vi.spyOn(realtime, 'request').mockReturnValue(
      Promise.resolve({
        success: false,
        errorMessage: 'test',
        errorCode: 40000,
        statusCode: 400,
        errorDetail: { field: 'name', reason: 'invalid' } as Record<string, string>,
      }) as Promise<Ably.HttpPaginatedResponse>,
    );

    await expect(chatApi.sendMessage('test', { text: 'hello world' })).rejects.toBeErrorInfo({
      message: 'test',
      code: 40000,
      statusCode: 400,
      detail: { field: 'name', reason: 'invalid' },
    });
  });

  it('includes errorDetail in thrown ErrorInfo on paginated request', async () => {
    const realtime = new Ably.Realtime({ clientId: 'test' });
    const chatApi = new ChatApi(realtime, makeTestLogger());

    vi.spyOn(realtime, 'request').mockReturnValue(
      Promise.resolve({
        success: false,
        errorMessage: 'test',
        errorCode: 40000,
        statusCode: 400,
        errorDetail: { field: 'name', reason: 'invalid' } as Record<string, string>,
      }) as Promise<Ably.HttpPaginatedResponse>,
    );

    await expect(chatApi.history('test', {})).rejects.toBeErrorInfo({
      message: 'test',
      code: 40000,
      statusCode: 400,
      detail: { field: 'name', reason: 'invalid' },
    });
  });

  it('throws errors if invalid OrderBy used on history request', async () => {
    const realtime = new Ably.Realtime({ clientId: 'test' });
    const chatApi = new ChatApi(realtime, makeTestLogger());

    vi.spyOn(realtime, 'request');

    // @ts-expect-error Testing invalid OrderBy
    await expect(chatApi.history('test', { orderBy: 'foo' })).rejects.toBeErrorInfo({
      message: 'unable to query messages; invalid orderBy value: foo',
      code: ErrorCode.InvalidArgument,
      statusCode: 400,
    });

    expect(realtime.request).not.toHaveBeenCalled();
  });
});

describe('sendMessage idempotency', () => {
  const okResponse = async () =>
    Promise.resolve({
      success: true,
      items: [{ serial: 'srl', clientId: 'test', text: 'hi', timestamp: 1 }],
    }) as Promise<Ably.HttpPaginatedResponse>;

  const KEY_PATTERN = /^[A-Za-z0-9+/]{12}$/;

  it('does not attach an idempotencyKey when disabled (sendMessage)', async () => {
    const realtime = new Ably.Realtime({ clientId: 'test' });
    const chatApi = new ChatApi(realtime, makeTestLogger());
    const requestSpy = vi.spyOn(realtime, 'request').mockReturnValue(okResponse());

    await chatApi.sendMessage('room1', { text: 'hello' });

    expect(requestSpy).toHaveBeenCalledWith('POST', '/chat/v4/rooms/room1/messages', 4, undefined, {
      text: 'hello',
    });
  });

  it('attaches idempotencyKey as a query param when enabled (sendMessage)', async () => {
    const realtime = new Ably.Realtime({ clientId: 'test' });
    const chatApi = new ChatApi(realtime, makeTestLogger(), true);
    const requestSpy = vi.spyOn(realtime, 'request').mockReturnValue(okResponse());

    await chatApi.sendMessage('room1', { text: 'hello' });

    expect(requestSpy).toHaveBeenCalledTimes(1);
    const params = requestSpy.mock.calls[0]?.[3] as { idempotencyKey?: string };
    const body = requestSpy.mock.calls[0]?.[4] as Record<string, unknown>;
    expect(params.idempotencyKey).toMatch(KEY_PATTERN);
    expect(body).not.toHaveProperty('idempotencyKey');
  });

  it('generates a fresh idempotencyKey for each send call', async () => {
    const realtime = new Ably.Realtime({ clientId: 'test' });
    const chatApi = new ChatApi(realtime, makeTestLogger(), true);
    const requestSpy = vi.spyOn(realtime, 'request').mockReturnValue(okResponse());

    await chatApi.sendMessage('room1', { text: 'first' });
    await chatApi.sendMessage('room1', { text: 'second' });

    const firstParams = requestSpy.mock.calls[0]?.[3] as { idempotencyKey: string };
    const secondParams = requestSpy.mock.calls[1]?.[3] as { idempotencyKey: string };
    expect(firstParams.idempotencyKey).not.toBe(secondParams.idempotencyKey);
  });

  it('attaches idempotencyKey as a query param when enabled (deleteMessage)', async () => {
    const realtime = new Ably.Realtime({ clientId: 'test' });
    const chatApi = new ChatApi(realtime, makeTestLogger(), true);
    const requestSpy = vi.spyOn(realtime, 'request').mockReturnValue(okResponse());

    await chatApi.deleteMessage('room1', 'serial-1');

    const params = requestSpy.mock.calls[0]?.[3] as { idempotencyKey?: string };
    expect(params.idempotencyKey).toMatch(KEY_PATTERN);
  });

  it('does not attach an idempotencyKey when disabled (deleteMessage)', async () => {
    const realtime = new Ably.Realtime({ clientId: 'test' });
    const chatApi = new ChatApi(realtime, makeTestLogger());
    const requestSpy = vi.spyOn(realtime, 'request').mockReturnValue(okResponse());

    await chatApi.deleteMessage('room1', 'serial-1');

    expect(requestSpy.mock.calls[0]?.[3]).toBeUndefined();
  });

  it('attaches idempotencyKey as a query param when enabled (updateMessage)', async () => {
    const realtime = new Ably.Realtime({ clientId: 'test' });
    const chatApi = new ChatApi(realtime, makeTestLogger(), true);
    const requestSpy = vi.spyOn(realtime, 'request').mockReturnValue(okResponse());

    await chatApi.updateMessage('room1', 'serial-1', { message: { text: 'updated' } });

    const params = requestSpy.mock.calls[0]?.[3] as { idempotencyKey?: string };
    const body = requestSpy.mock.calls[0]?.[4] as { message: { text: string } } & Record<string, unknown>;
    expect(params.idempotencyKey).toMatch(KEY_PATTERN);
    expect(body.message.text).toBe('updated');
    expect(body).not.toHaveProperty('idempotencyKey');
  });

  it('does not attach an idempotencyKey when disabled (updateMessage)', async () => {
    const realtime = new Ably.Realtime({ clientId: 'test' });
    const chatApi = new ChatApi(realtime, makeTestLogger());
    const requestSpy = vi.spyOn(realtime, 'request').mockReturnValue(okResponse());

    await chatApi.updateMessage('room1', 'serial-1', { message: { text: 'updated' } });

    expect(requestSpy.mock.calls[0]?.[3]).toBeUndefined();
  });
});

describe('getClientReactions', () => {
  it('adds forClientId param when clientId is provided', async () => {
    const realtime = new Ably.Realtime({ clientId: 'test' });
    const chatApi = new ChatApi(realtime, makeTestLogger());
    const requestSpy = vi.spyOn(realtime, 'request').mockReturnValue(
      Promise.resolve({
        success: true,
        items: [{}],
      }) as Promise<Ably.HttpPaginatedResponse>,
    );

    await chatApi.getClientReactions('room123', 'msg-serial-123', 'client123');

    expect(requestSpy).toHaveBeenCalledWith(
      'GET',
      '/chat/v4/rooms/room123/messages/msg-serial-123/client-reactions',
      4,
      { forClientId: 'client123' },
      undefined,
    );
  });

  it('does not add forClientId param when clientId is not provided', async () => {
    const realtime = new Ably.Realtime({ clientId: 'test' });
    const chatApi = new ChatApi(realtime, makeTestLogger());
    const requestSpy = vi.spyOn(realtime, 'request').mockReturnValue(
      Promise.resolve({
        success: true,
        items: [{}],
      }) as Promise<Ably.HttpPaginatedResponse>,
    );

    await chatApi.getClientReactions('room123', 'msg-serial-123');

    expect(requestSpy).toHaveBeenCalledWith(
      'GET',
      '/chat/v4/rooms/room123/messages/msg-serial-123/client-reactions',
      4,
      {},
      undefined,
    );
  });
});

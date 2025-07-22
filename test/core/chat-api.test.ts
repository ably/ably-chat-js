import * as Ably from 'ably';
import { describe, expect, it, vi } from 'vitest';

import { ChatApi } from '../../src/core/chat-api.ts';
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

    await expect(chatApi.getOccupancy('test'))
      .rejects.toBeErrorInfo({
        message: 'test',
        code: 40000,
        statusCode: 400,
      })
      .then(() => {
        expect(realtime.request).toHaveBeenCalledWith('GET', '/chat/v3/rooms/test/occupancy', 3, undefined, undefined);
      });
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

  it('throws errors if invalid OrderBy used on history request', async () => {
    const realtime = new Ably.Realtime({ clientId: 'test' });
    const chatApi = new ChatApi(realtime, makeTestLogger());

    vi.spyOn(realtime, 'request');

    // @ts-expect-error Testing invalid OrderBy
    await expect(chatApi.history('test', { orderBy: 'foo' })).rejects.toBeErrorInfo({
      message: 'invalid orderBy value: foo',
      code: 40000,
      statusCode: 400,
    });

    expect(realtime.request).not.toHaveBeenCalled();
  });
});

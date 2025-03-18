import * as Ably from 'ably';
import { describe, expect, it, vi } from 'vitest';

import { ChatApi } from '../../src/core/chat-api.ts';
import { Message } from '../../src/core/message.ts';
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
        expect(realtime.request).toHaveBeenCalledWith('GET', '/chat/v1/rooms/test/occupancy', 3, undefined, undefined);
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

    await expect(chatApi.getMessages('test', {})).rejects.toBeErrorInfo({
      message: 'test',
      code: 40000,
      statusCode: 400,
    });
  });

  it('should encode the fromSerial parameter if provided', async () => {
    // Mock dependencies
    const realtime = new Ably.Realtime({ clientId: 'test' });
    const chatApi = new ChatApi(realtime, makeTestLogger());

    vi.spyOn(realtime, 'request').mockReturnValue(
      Promise.resolve({ success: true, items: [] as Message[] }) as Promise<Ably.HttpPaginatedResponse<Message>>,
    );
    const roomId = 'test-room';
    const queryParams = {
      fromSerial: 'serial/with/special:chars',
    };

    await chatApi.getMessages(roomId, queryParams);
    expect(realtime.request).toHaveBeenCalledWith(
      'GET',
      '/chat/v2/rooms/test-room/messages',
      3,
      expect.objectContaining({
        fromSerial: encodeURIComponent('serial/with/special:chars'),
      }),
      undefined,
    );
  });

  it('throws errors if invalid OrderBy used on history request', async () => {
    const realtime = new Ably.Realtime({ clientId: 'test' });
    const chatApi = new ChatApi(realtime, makeTestLogger());

    vi.spyOn(realtime, 'request');

    // @ts-expect-error Testing invalid OrderBy
    await expect(chatApi.getMessages('test', { orderBy: 'foo' })).rejects.toBeErrorInfo({
      message: 'invalid orderBy value: foo',
      code: 40000,
      statusCode: 400,
    });

    expect(realtime.request).not.toHaveBeenCalled();
  });
});

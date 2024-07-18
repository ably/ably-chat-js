import * as Ably from 'ably';
import { describe, expect, it, vi } from 'vitest';

import { ChatApi } from '../../src/core/chat-api.ts';
import { makeTestLogger } from '../helper/logger.ts';

vi.mock('ably');

describe('config', () => {
  it('throws errors if Realtime returns ErrorInfo on non-paginated request', async () => {
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
});

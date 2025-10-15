import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DefaultClientIdResolver } from '../../src/core/client-id.ts';
import { makeTestLogger } from '../helper/logger.ts';

interface TestContext {
  realtime: Ably.Realtime;
}

vi.mock('ably');

describe('ClientIdResolver', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = new Ably.Realtime({ clientId: 'initial-client-id', key: 'key' });
  });

  describe('get', () => {
    it<TestContext>('should return the current clientId', (context) => {
      const resolver = new DefaultClientIdResolver(context.realtime, makeTestLogger());

      expect(resolver.get()).toBe('initial-client-id');
    });

    it<TestContext>('should return the updated current clientId', (context) => {
      const resolver = new DefaultClientIdResolver(context.realtime, makeTestLogger());

      expect(resolver.get()).toBe('initial-client-id');
      vi.spyOn(context.realtime.auth, 'clientId', 'get').mockReturnValue('new-client-id');
      expect(resolver.get()).toBe('new-client-id');
    });

    it<TestContext>('should throw error when clientId is not set', (context) => {
      vi.spyOn(context.realtime.auth, 'clientId', 'get');
      const resolver = new DefaultClientIdResolver(context.realtime, makeTestLogger());

      expect(() => resolver.get()).toThrowErrorInfo({
        code: 40012,
        statusCode: 400,
        message: 'unable to get client id; client id is not set',
      });
    });
  });
});

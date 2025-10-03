import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorInfo } from '../../__mocks__/ably/index.ts';
import { DefaultClientIdResolver } from '../../src/core/client-id.ts';
import { DefaultConnection } from '../../src/core/connection.ts';
import { makeTestLogger } from '../helper/logger.ts';

interface TestContext {
  realtime: Ably.Realtime;
  connection: DefaultConnection;
  emulateStateChange: Ably.connectionEventCallback;
  channelLevelListeners: Set<Ably.connectionEventCallback>;
}

vi.mock('ably');

describe('ClientIdResolver', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = new Ably.Realtime({ clientId: 'initial-client-id', key: 'key' });
    context.channelLevelListeners = new Set();

    const connection = context.realtime.connection;
    vi.spyOn(connection, 'on').mockImplementation((listener: Ably.connectionEventCallback) => {
      context.channelLevelListeners.add(listener);

      context.emulateStateChange = (stateChange: Ably.ConnectionStateChange) => {
        vi.spyOn(connection, 'state', 'get').mockReturnValue(stateChange.current);
        vi.spyOn(connection, 'errorReason', 'get').mockReturnValue(stateChange.reason as ErrorInfo);

        for (const cb of context.channelLevelListeners) {
          cb(stateChange);
        }
      };
    });

    vi.spyOn(connection, 'state', 'get').mockReturnValue('disconnected');
    vi.spyOn(connection, 'errorReason', 'get').mockReturnValue(new Ably.ErrorInfo('error', 500, 50000));

    context.connection = new DefaultConnection(context.realtime, makeTestLogger());
  });

  describe('constructor', () => {
    it<TestContext>('should resolve clientId from realtime.auth.clientId on construction', (context) => {
      const resolver = new DefaultClientIdResolver(context.connection, context.realtime, makeTestLogger());

      expect(resolver.get()).toBe('initial-client-id');
    });

    it<TestContext>('should log when clientId is resolved on connection', (context) => {
      const logger = makeTestLogger();
      const debugSpy = vi.spyOn(logger, 'debug');

      new DefaultClientIdResolver(context.connection, context.realtime, logger);

      // Simulate clientId change and connection becoming connected
      vi.spyOn(context.realtime.auth, 'clientId', 'get').mockReturnValue('new-client-id');
      context.emulateStateChange({ current: 'connected', previous: 'disconnected' });

      expect(debugSpy).toHaveBeenCalledWith('resolved clientId', { clientId: 'new-client-id' });
    });
  });

  describe('get', () => {
    it<TestContext>('should return the current clientId', (context) => {
      const resolver = new DefaultClientIdResolver(context.connection, context.realtime, makeTestLogger());

      expect(resolver.get()).toBe('initial-client-id');
    });

    it<TestContext>('should update clientId when connection becomes connected', (context) => {
      const resolver = new DefaultClientIdResolver(context.connection, context.realtime, makeTestLogger());

      // Initially has the clientId from construction
      expect(resolver.get()).toBe('initial-client-id');

      // Simulate clientId change and connection becoming connected
      vi.spyOn(context.realtime.auth, 'clientId', 'get').mockReturnValue('updated-client-id');
      context.emulateStateChange({ current: 'connected', previous: 'disconnected' });

      // Should now have the updated clientId
      expect(resolver.get()).toBe('updated-client-id');
    });

    it<TestContext>('should not update clientId on connection state changes other than connected', (context) => {
      const resolver = new DefaultClientIdResolver(context.connection, context.realtime, makeTestLogger());

      expect(resolver.get()).toBe('initial-client-id');

      // Simulate clientId change but connection going to suspended
      vi.spyOn(context.realtime.auth, 'clientId', 'get').mockReturnValue('should-not-update');
      context.emulateStateChange({ current: 'suspended', previous: 'disconnected' });

      // Should still have the initial clientId
      expect(resolver.get()).toBe('initial-client-id');
    });

    it<TestContext>('should throw error when clientId is not set', (context) => {
      vi.spyOn(context.realtime.auth, 'clientId', 'get');
      const resolver = new DefaultClientIdResolver(context.connection, context.realtime, makeTestLogger());

      expect(() => resolver.get()).toThrowErrorInfo({
        code: 40012,
        statusCode: 400,
        message: 'invalid client id',
      });
    });

    it<TestContext>('should throw error with correct error code and status code', (context) => {
      vi.spyOn(context.realtime.auth, 'clientId', 'get');
      const resolver = new DefaultClientIdResolver(context.connection, context.realtime, makeTestLogger());

      expect(() => resolver.get()).toThrowErrorInfo({
        code: 40012,
        statusCode: 400,
      });
    });

    it<TestContext>('should handle multiple connection state changes', (context) => {
      const resolver = new DefaultClientIdResolver(context.connection, context.realtime, makeTestLogger());

      expect(resolver.get()).toBe('initial-client-id');

      // First connection
      vi.spyOn(context.realtime.auth, 'clientId', 'get').mockReturnValue('first-update');
      context.emulateStateChange({ current: 'connected', previous: 'connecting' });
      expect(resolver.get()).toBe('first-update');

      // Disconnection (should not change clientId)
      vi.spyOn(context.realtime.auth, 'clientId', 'get').mockReturnValue('should-not-change');
      context.emulateStateChange({ current: 'disconnected', previous: 'connected' });
      expect(resolver.get()).toBe('first-update');

      // Reconnection
      vi.spyOn(context.realtime.auth, 'clientId', 'get').mockReturnValue('second-update');
      context.emulateStateChange({ current: 'connected', previous: 'connecting' });
      expect(resolver.get()).toBe('second-update');
    });

    it<TestContext>('should handle clientId becoming undefined after being set', (context) => {
      const resolver = new DefaultClientIdResolver(context.connection, context.realtime, makeTestLogger());

      expect(resolver.get()).toBe('initial-client-id');

      // Simulate clientId becoming undefined on connection
      vi.spyOn(context.realtime.auth, 'clientId', 'get');
      context.emulateStateChange({ current: 'connected', previous: 'disconnected' });

      // Should now throw when trying to get clientId
      expect(() => resolver.get()).toThrowErrorInfo({
        code: 40012,
        statusCode: 400,
        message: 'invalid client id',
      });
    });

    it<TestContext>('should preserve clientId across non-connected state transitions', (context) => {
      const resolver = new DefaultClientIdResolver(context.connection, context.realtime, makeTestLogger());

      expect(resolver.get()).toBe('initial-client-id');

      // Go through various states without becoming connected
      context.emulateStateChange({ current: 'connecting', previous: 'disconnected' });
      expect(resolver.get()).toBe('initial-client-id');

      context.emulateStateChange({ current: 'disconnected', previous: 'connecting' });
      expect(resolver.get()).toBe('initial-client-id');

      context.emulateStateChange({ current: 'suspended', previous: 'disconnected' });
      expect(resolver.get()).toBe('initial-client-id');

      context.emulateStateChange({ current: 'connecting', previous: 'suspended' });
      expect(resolver.get()).toBe('initial-client-id');
    });
  });

  describe('dispose', () => {
    it<TestContext>('should properly dispose and remove connection listener', (context) => {
      const resolver = new DefaultClientIdResolver(context.connection, context.realtime, makeTestLogger());

      // Dispose the resolver
      resolver.dispose();

      // Change the clientId and emit connected event
      vi.spyOn(context.realtime.auth, 'clientId', 'get').mockReturnValue('post-dispose-client-id');
      context.emulateStateChange({ current: 'connected', previous: 'disconnected' });

      // Should still have the initial clientId since listener was removed
      expect(resolver.get()).toBe('initial-client-id');
    });
  });
});

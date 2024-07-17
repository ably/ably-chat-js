import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorInfo } from '../../__mocks__/ably/index.ts';
import { ConnectionLifecycle, DefaultConnectionStatus } from '../../src/core/connection-status.ts';
import { makeTestLogger } from '../helper/logger.ts';

interface TestContext {
  realtime: Ably.Realtime;
  emulateStateChange: Ably.connectionEventCallback;
  channelLevelListeners: Set<Ably.connectionEventCallback>;
}

enum AblyConnectionState {
  Initialized = 'initialized',
  Connected = 'connected',
  Disconnected = 'disconnected',
  Suspended = 'suspended',
  Connecting = 'connecting',
  Closing = 'closing',
  Closed = 'closed',
  Failed = 'failed',
}

const mapAblyStatusToChat = (status: Ably.ConnectionState): ConnectionLifecycle => {
  switch (status) {
    case 'connected': {
      return ConnectionLifecycle.Connected;
    }
    case 'disconnected': {
      return ConnectionLifecycle.Disconnected;
    }
    case 'suspended': {
      return ConnectionLifecycle.Suspended;
    }
    case 'connecting': {
      return ConnectionLifecycle.Connecting;
    }
    case 'failed':
    case 'closing':
    case 'closed': {
      return ConnectionLifecycle.Failed;
    }
    default: {
      return ConnectionLifecycle.Initialized;
    }
  }
};

vi.mock('ably');

describe('connection', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = new Ably.Realtime({ clientId: 'clientId', key: 'key' });
    context.channelLevelListeners = new Set();

    const connection = context.realtime.connection;
    vi.spyOn(connection, 'on').mockImplementation((listener: Ably.connectionEventCallback) => {
      context.channelLevelListeners.add(listener);

      context.emulateStateChange = (stateChange: Ably.ConnectionStateChange) => {
        for (const cb of context.channelLevelListeners) {
          cb(stateChange);
        }
      };
    });

    vi.spyOn(connection, 'state', 'get').mockReturnValue('disconnected');
    vi.spyOn(connection, 'errorReason', 'get').mockReturnValue(new Ably.ErrorInfo('error', 500, 50000));
  });

  it<TestContext>('should set the initial channel state from the connection', (context) => {
    const connection = new DefaultConnectionStatus(context.realtime, makeTestLogger());

    expect(connection.current).toEqual(ConnectionLifecycle.Disconnected);
    expect(connection.error).toEqual(new Ably.ErrorInfo('error', 500, 50000));
  });

  it<TestContext>('listeners can be added', (context) =>
    new Promise<void>((done, reject) => {
      const connection = new DefaultConnectionStatus(context.realtime, makeTestLogger());
      connection.onChange((status) => {
        expect(status.current).toEqual(ConnectionLifecycle.Connected);
        expect(status.previous).toEqual(ConnectionLifecycle.Disconnected);
        expect(status.error).toBeUndefined();
        done();
      });

      context.emulateStateChange({ current: 'connected', previous: 'disconnected' });
      reject(new Error('Expected onChange to be called'));
    }));

  it<TestContext>('listeners can be removed', (context) =>
    new Promise<void>((done, reject) => {
      const connection = new DefaultConnectionStatus(context.realtime, makeTestLogger());
      const { off } = connection.onChange(() => {
        reject(new Error('Expected onChange to not be called'));
      });

      off();
      context.emulateStateChange({ current: 'connected', previous: 'disconnected' });
      done();
    }));

  it<TestContext>('listeners can all be removed', (context) =>
    new Promise<void>((done, reject) => {
      const connection = new DefaultConnectionStatus(context.realtime, makeTestLogger());
      connection.onChange(() => {
        reject(new Error('Expected onChange to not be called'));
      });
      connection.onChange(() => {
        reject(new Error('Expected onChange to not be called'));
      });

      connection.offAll();
      context.emulateStateChange({ current: 'connected', previous: 'disconnected' });
      done();
    }));

  describe.each([
    [ConnectionLifecycle.Connecting, AblyConnectionState.Initialized, AblyConnectionState.Connecting, undefined],
    [ConnectionLifecycle.Connected, AblyConnectionState.Connecting, AblyConnectionState.Connected, undefined],
    [ConnectionLifecycle.Connected, AblyConnectionState.Disconnected, AblyConnectionState.Connected, undefined],
    [ConnectionLifecycle.Connected, AblyConnectionState.Suspended, AblyConnectionState.Connected, undefined],
    [ConnectionLifecycle.Connecting, AblyConnectionState.Connected, AblyConnectionState.Connecting, undefined],
    [ConnectionLifecycle.Suspended, AblyConnectionState.Connecting, AblyConnectionState.Suspended, undefined],
    [
      ConnectionLifecycle.Failed,
      AblyConnectionState.Connecting,
      AblyConnectionState.Failed,
      new Ably.ErrorInfo('error', 500, 99998),
    ],
    [
      ConnectionLifecycle.Failed,
      AblyConnectionState.Connected,
      AblyConnectionState.Failed,
      new Ably.ErrorInfo('error', 500, 99998),
    ],
    [
      ConnectionLifecycle.Failed,
      AblyConnectionState.Disconnected,
      AblyConnectionState.Failed,
      new Ably.ErrorInfo('error', 500, 99998),
    ],

    [
      ConnectionLifecycle.Failed,
      AblyConnectionState.Connecting,
      AblyConnectionState.Failed,
      new Ably.ErrorInfo('error', 500, 99999),
    ],
    [
      ConnectionLifecycle.Failed,
      AblyConnectionState.Connected,
      AblyConnectionState.Closed,
      new Ably.ErrorInfo('error', 500, 99999),
    ],
    [
      ConnectionLifecycle.Failed,
      AblyConnectionState.Connected,
      AblyConnectionState.Closing,
      new Ably.ErrorInfo('error', 500, 99999),
    ],
  ])(
    'processes state changes',
    (
      expectedStatus: ConnectionLifecycle,
      previousRealtimeState: AblyConnectionState,
      newRealtimeState: AblyConnectionState,
      error: ErrorInfo | undefined,
    ) => {
      const baseError = new Ably.ErrorInfo('error', 500, 99999);

      it<TestContext>(`transitions state to ${expectedStatus} when realtime state goes from ${previousRealtimeState} to ${newRealtimeState}`, (context) =>
        new Promise<void>((done, reject) => {
          vi.spyOn(context.realtime.connection, 'state', 'get').mockReturnValue(previousRealtimeState);
          vi.spyOn(context.realtime.connection, 'errorReason', 'get').mockReturnValue(error ?? baseError);
          const connection = new DefaultConnectionStatus(context.realtime, makeTestLogger());

          expect(connection.current).toEqual(mapAblyStatusToChat(previousRealtimeState));
          expect(connection.error).toEqual(error ?? baseError);

          connection.onChange((status) => {
            expect(status.current).toEqual(expectedStatus);
            expect(status.previous).toEqual(mapAblyStatusToChat(previousRealtimeState));
            expect(status.error).toEqual(error);
            expect(connection.current).toEqual(expectedStatus);
            expect(connection.error).toEqual(error);
            done();
          });

          context.emulateStateChange({ current: newRealtimeState, previous: previousRealtimeState, reason: error });
          reject(new Error('Expected onChange to be called'));
        }));
    },
  );

  it<TestContext>('handles transient disconnections', (context) =>
    new Promise<void>((done) => {
      // Start the channel in a connected state
      vi.spyOn(context.realtime.connection, 'state', 'get').mockReturnValue('connected');
      vi.spyOn(context.realtime.connection, 'errorReason', 'get').mockReturnValue(
        new Ably.ErrorInfo('error', 500, 99999),
      );

      const connection = new DefaultConnectionStatus(context.realtime, makeTestLogger());
      expect(connection.current).toEqual(ConnectionLifecycle.Connected);

      // Set a listener that stores the state change
      const stateChanges: ConnectionLifecycle[] = [];
      connection.onChange((status) => {
        stateChanges.push(status.current);
      });

      // Transition to a disconnected state
      context.emulateStateChange({ current: 'disconnected', previous: 'connected' });

      // Wait for 3 seconds (well below the transient timeout)
      void new Promise((resolve) => setTimeout(resolve, 3000)).then(() => {
        // Transition back to a connected state
        context.emulateStateChange({ current: 'connected', previous: 'disconnected' });

        // Assert that we have only seen the connected state
        expect(stateChanges).toEqual([]);

        done();
      });
    }));

  it<TestContext>(
    'emits disconnections after a period of time',
    (context) =>
      new Promise<void>((done) => {
        // Start the channel in a connected state
        vi.spyOn(context.realtime.connection, 'state', 'get').mockReturnValue('connected');
        vi.spyOn(context.realtime.connection, 'errorReason', 'get').mockReturnValue(
          new Ably.ErrorInfo('error', 500, 99999),
        );

        const connection = new DefaultConnectionStatus(context.realtime, makeTestLogger());
        expect(connection.current).toEqual(ConnectionLifecycle.Connected);

        // Set a listener that stores the state change
        const stateChanges: ConnectionLifecycle[] = [];
        connection.onChange((status) => {
          stateChanges.push(status.current);
        });

        // Transition to a disconnected state
        context.emulateStateChange({ current: 'disconnected', previous: 'connected' });

        // Wait for longer than the transient timeout
        void new Promise((resolve) => setTimeout(resolve, 6000)).then(() => {
          // Transition back to a connected state
          context.emulateStateChange({ current: 'connected', previous: 'disconnected' });

          // Assert that we have only seen the connected state
          expect(stateChanges).toEqual([ConnectionLifecycle.Disconnected, ConnectionLifecycle.Connected]);

          done();
        });
      }),
    10000,
  );
});

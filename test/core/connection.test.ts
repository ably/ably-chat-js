import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorInfo } from '../../__mocks__/ably/index.ts';
import { ConnectionStatus, DefaultConnection } from '../../src/core/connection.ts';
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

const mapAblyStatusToChat = (status: Ably.ConnectionState): ConnectionStatus => {
  switch (status) {
    case 'connected': {
      return ConnectionStatus.Connected;
    }
    case 'disconnected': {
      return ConnectionStatus.Disconnected;
    }
    case 'suspended': {
      return ConnectionStatus.Suspended;
    }
    case 'connecting': {
      return ConnectionStatus.Connecting;
    }
    case 'failed':
    case 'closing':
    case 'closed': {
      return ConnectionStatus.Failed;
    }
    default: {
      return ConnectionStatus.Initialized;
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
        vi.spyOn(connection, 'state', 'get').mockReturnValue(stateChange.current);
        vi.spyOn(connection, 'errorReason', 'get').mockReturnValue(stateChange.reason as ErrorInfo);

        for (const cb of context.channelLevelListeners) {
          cb(stateChange);
        }
      };
    });

    vi.spyOn(connection, 'state', 'get').mockReturnValue('disconnected');
    vi.spyOn(connection, 'errorReason', 'get').mockReturnValue(new Ably.ErrorInfo('error', 500, 50000));
  });

  // CHA-RS5
  it<TestContext>('should set the initial channel state from the connection', (context) => {
    const connection = new DefaultConnection(context.realtime, makeTestLogger());

    expect(connection.status).toEqual(ConnectionStatus.Disconnected);
    expect(connection.error).toEqual(new Ably.ErrorInfo('error', 500, 50000));
  });

  it<TestContext>('listeners can be added', async (context) =>
    new Promise<void>((done, reject) => {
      const connection = new DefaultConnection(context.realtime, makeTestLogger());
      connection.onStatusChange((status) => {
        expect(status.current).toEqual(ConnectionStatus.Connected);
        expect(status.previous).toEqual(ConnectionStatus.Disconnected);
        expect(status.error).toBeUndefined();
        done();
      });

      context.emulateStateChange({ current: 'connected', previous: 'disconnected' });
      reject(new Error('Expected onChange to be called'));
    }));

  it<TestContext>('listeners can be removed', async (context) =>
    new Promise<void>((done, reject) => {
      const connection = new DefaultConnection(context.realtime, makeTestLogger());
      const { off } = connection.onStatusChange(() => {
        reject(new Error('Expected onChange to not be called'));
      });

      off();
      context.emulateStateChange({ current: 'connected', previous: 'disconnected' });
      done();
    }));

  it<TestContext>('subscriptions are unique even for same listener', (context) => {
    const connection = new DefaultConnection(context.realtime, makeTestLogger());

    let eventCount = 0;
    const listener = () => {
      eventCount++;
    };

    const s1 = connection.onStatusChange(listener);
    const s2 = connection.onStatusChange(listener);
    context.emulateStateChange({ current: 'connecting', previous: 'initialized' });
    expect(eventCount).toEqual(2);

    s1.off();
    context.emulateStateChange({ current: 'connected', previous: 'connecting' });
    expect(eventCount).toEqual(3);

    s2.off();
    context.emulateStateChange({ current: 'suspended', previous: 'connected' });
    expect(eventCount).toEqual(3);
  });

  describe.each([
    [ConnectionStatus.Connecting, AblyConnectionState.Initialized, AblyConnectionState.Connecting, undefined],
    [ConnectionStatus.Connected, AblyConnectionState.Connecting, AblyConnectionState.Connected, undefined],
    [ConnectionStatus.Connected, AblyConnectionState.Disconnected, AblyConnectionState.Connected, undefined],
    [ConnectionStatus.Connected, AblyConnectionState.Suspended, AblyConnectionState.Connected, undefined],
    [ConnectionStatus.Connecting, AblyConnectionState.Connected, AblyConnectionState.Connecting, undefined],
    [ConnectionStatus.Suspended, AblyConnectionState.Connecting, AblyConnectionState.Suspended, undefined],
    [
      ConnectionStatus.Failed,
      AblyConnectionState.Connecting,
      AblyConnectionState.Failed,
      new Ably.ErrorInfo('error', 500, 99998),
    ],
    [
      ConnectionStatus.Failed,
      AblyConnectionState.Connected,
      AblyConnectionState.Failed,
      new Ably.ErrorInfo('error', 500, 99998),
    ],
    [
      ConnectionStatus.Failed,
      AblyConnectionState.Disconnected,
      AblyConnectionState.Failed,
      new Ably.ErrorInfo('error', 500, 99998),
    ],

    [
      ConnectionStatus.Failed,
      AblyConnectionState.Connecting,
      AblyConnectionState.Failed,
      new Ably.ErrorInfo('error', 500, 99999),
    ],
    [
      ConnectionStatus.Failed,
      AblyConnectionState.Connected,
      AblyConnectionState.Closed,
      new Ably.ErrorInfo('error', 500, 99999),
    ],
    [
      ConnectionStatus.Failed,
      AblyConnectionState.Connected,
      AblyConnectionState.Closing,
      new Ably.ErrorInfo('error', 500, 99999),
    ],
  ])(
    'processes state changes',
    (
      expectedStatus: ConnectionStatus,
      previousRealtimeState: AblyConnectionState,
      newRealtimeState: AblyConnectionState,
      error: ErrorInfo | undefined,
    ) => {
      const baseError = new Ably.ErrorInfo('error', 500, 99999);

      it<TestContext>(`transitions state to ${expectedStatus} when realtime state goes from ${previousRealtimeState} to ${newRealtimeState}`, async (context) =>
        new Promise<void>((done, reject) => {
          vi.spyOn(context.realtime.connection, 'state', 'get').mockReturnValue(previousRealtimeState);
          vi.spyOn(context.realtime.connection, 'errorReason', 'get').mockReturnValue(error ?? baseError);
          const connection = new DefaultConnection(context.realtime, makeTestLogger());

          expect(connection.status).toEqual(mapAblyStatusToChat(previousRealtimeState));
          expect(connection.error).toEqual(error ?? baseError);

          connection.onStatusChange((status) => {
            expect(status.current).toEqual(expectedStatus);
            expect(status.previous).toEqual(mapAblyStatusToChat(previousRealtimeState));
            expect(status.error).toEqual(error);
            expect(connection.status).toEqual(expectedStatus);
            expect(connection.error).toEqual(error);
            done();
          });

          context.emulateStateChange({ current: newRealtimeState, previous: previousRealtimeState, reason: error });
          reject(new Error('Expected onChange to be called'));
        }));
    },
  );

  describe('dispose', () => {
    it<TestContext>('should dispose connection and remove listeners', (context) => {
      const connection = new DefaultConnection(context.realtime, makeTestLogger());
      const mockConnectionOff = vi.spyOn(context.realtime.connection, 'off');

      // Add a listener to verify it's cleaned up
      let listenerCallCount = 0;
      connection.onStatusChange(() => {
        listenerCallCount++;
      });

      // Dispose the connection
      connection.dispose();

      // Verify the connection listener was removed
      expect(mockConnectionOff).toHaveBeenCalledTimes(1);

      // Emit a state change and verify listeners are no longer called
      context.emulateStateChange({ current: 'connected', previous: 'disconnected' });
      expect(listenerCallCount).toBe(0);

      // Verify the connection has no listeners
      expect(connection.hasListeners()).toBe(false);
    });
  });
});

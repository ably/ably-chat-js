import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorInfo } from '../../../__mocks__/ably/index.ts';
import { makeTestLogger } from '../../shared/testhelper/logger.ts';
import { ConnectionStatus, ConnectionStatusChange, DefaultConnection } from '../src/connection.ts';

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

  it<TestContext>('should set the initial channel state from the connection', (context) => {
    const connection = new DefaultConnection(context.realtime, makeTestLogger());

    expect(connection.status).toEqual(ConnectionStatus.Disconnected);
    expect(connection.error).toEqual(new Ably.ErrorInfo('error', 500, 50000));
  });

  it<TestContext>('listeners can be added', (context) =>
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

  it<TestContext>('listeners can be removed', (context) =>
    new Promise<void>((done, reject) => {
      const connection = new DefaultConnection(context.realtime, makeTestLogger());
      const { off } = connection.onStatusChange(() => {
        reject(new Error('Expected onChange to not be called'));
      });

      off();
      context.emulateStateChange({ current: 'connected', previous: 'disconnected' });
      done();
    }));

  it<TestContext>('listeners can all be removed', (context) =>
    new Promise<void>((done, reject) => {
      const connection = new DefaultConnection(context.realtime, makeTestLogger());
      connection.onStatusChange(() => {
        reject(new Error('Expected onChange to not be called'));
      });
      connection.onStatusChange(() => {
        reject(new Error('Expected onChange to not be called'));
      });

      connection.offAllStatusChange();
      context.emulateStateChange({ current: 'connected', previous: 'disconnected' });
      done();
    }));

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

      it<TestContext>(`transitions state to ${expectedStatus} when realtime state goes from ${previousRealtimeState} to ${newRealtimeState}`, (context) =>
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

  it<TestContext>('handles transient disconnections', async (context) => {
    // Start the channel in a connected state
    vi.spyOn(context.realtime.connection, 'state', 'get').mockReturnValue('connected');
    vi.spyOn(context.realtime.connection, 'errorReason', 'get').mockReturnValue(
      new Ably.ErrorInfo('error', 500, 99999),
    );

    const connection = new DefaultConnection(context.realtime, makeTestLogger());
    expect(connection.status).toEqual(ConnectionStatus.Connected);

    // Set a listener that stores the state change
    const stateChanges: ConnectionStatus[] = [];
    connection.onStatusChange((status) => {
      stateChanges.push(status.current);
    });

    // Transition to a disconnected state
    context.emulateStateChange({ current: 'disconnected', previous: 'connected' });

    // Wait for 3 seconds (well below the transient timeout)
    await new Promise((resolve) => setTimeout(resolve, 3000)).then(() => {
      // Transition back to a connected state
      context.emulateStateChange({ current: 'connected', previous: 'disconnected' });

      // Assert that we have only seen the connected state
      expect(stateChanges).toEqual([]);
    });
  });

  it<TestContext>('handles transient disconnections with intermediate state changes', async (context) => {
    // Start the channel in a connected state
    vi.spyOn(context.realtime.connection, 'state', 'get').mockReturnValue('connected');
    vi.spyOn(context.realtime.connection, 'errorReason', 'get').mockReturnValue(
      new Ably.ErrorInfo('error', 500, 99999),
    );

    const connection = new DefaultConnection(context.realtime, makeTestLogger());
    expect(connection.status).toEqual(ConnectionStatus.Connected);

    // Set a listener that stores the state change
    const stateChanges: ConnectionStatus[] = [];
    connection.onStatusChange((status) => {
      stateChanges.push(status.current);
    });

    // Transition to a disconnected state
    const disconnectError = new Ably.ErrorInfo('error', 500, 99999);
    context.emulateStateChange({ current: 'disconnected', previous: 'connected', reason: disconnectError });

    // Now transition to a connecting state
    context.emulateStateChange({ current: 'connecting', previous: 'disconnected' });

    // Wait for 3 seconds (well below the transient timeout)
    await new Promise((resolve) => setTimeout(resolve, 3000)).then(() => {
      // Transition back to a connected state
      context.emulateStateChange({ current: 'connected', previous: 'disconnected' });

      // Assert that we have only seen the connected state
      expect(stateChanges).toEqual([]);
    });
  });

  it<TestContext>('emits disconnections after a period of time', async (context) => {
    // Start the channel in a connected state
    vi.spyOn(context.realtime.connection, 'state', 'get').mockReturnValue('connected');
    vi.spyOn(context.realtime.connection, 'errorReason', 'get').mockReturnValue(
      new Ably.ErrorInfo('error', 500, 99999),
    );

    const connection = new DefaultConnection(context.realtime, makeTestLogger());
    expect(connection.status).toEqual(ConnectionStatus.Connected);

    // Set a listener that stores the state change
    const stateChanges: ConnectionStatusChange[] = [];
    connection.onStatusChange((status) => {
      stateChanges.push(status);
    });

    // Transition to a disconnected state
    const disconnectError = new Ably.ErrorInfo('error', 500, 99999);
    context.emulateStateChange({ current: 'disconnected', previous: 'connected', reason: disconnectError });

    // Wait for longer than the transient timeout
    await new Promise((resolve) => setTimeout(resolve, 6000)).then(() => {
      // Transition back to a connected state
      context.emulateStateChange({ current: 'connected', previous: 'disconnected' });

      // Assert that we have only seen the connected state
      expect(stateChanges.map((change) => change.current)).toEqual([
        ConnectionStatus.Disconnected,
        ConnectionStatus.Connected,
      ]);

      // The first change should have the disconnect error
      expect(stateChanges[0]?.error).toEqual(disconnectError);
    });
  }, 10000);

  it<TestContext>('emits disconnections after a period of time to an intermediate state', async (context) => {
    // Start the channel in a connected state
    vi.spyOn(context.realtime.connection, 'state', 'get').mockReturnValue('connected');
    vi.spyOn(context.realtime.connection, 'errorReason', 'get').mockReturnValue(
      new Ably.ErrorInfo('error', 500, 99999),
    );

    const connection = new DefaultConnection(context.realtime, makeTestLogger());
    expect(connection.status).toEqual(ConnectionStatus.Connected);

    // Set a listener that stores the state change
    const stateChanges: ConnectionStatusChange[] = [];
    connection.onStatusChange((status) => {
      stateChanges.push(status);
    });

    // Transition to a disconnected state
    const disconnectError = new Ably.ErrorInfo('error', 500, 99999);
    context.emulateStateChange({ current: 'disconnected', previous: 'connected', reason: disconnectError });

    // Now transition to a connecting state
    context.emulateStateChange({ current: 'connecting', previous: 'disconnected' });

    // Now transition to a disconnected state
    context.emulateStateChange({ current: 'disconnected', previous: 'connecting' });

    // Now transition to a connecting state
    context.emulateStateChange({ current: 'connecting', previous: 'disconnected' });

    // Wait for longer than the transient timeout
    await new Promise((resolve) => setTimeout(resolve, 8000)).then(() => {
      // Transition back to a connected state
      context.emulateStateChange({ current: 'connected', previous: 'connecting' });

      // Assert that we have only seen the connected state
      expect(stateChanges.map((change) => change.current)).toEqual([
        ConnectionStatus.Connecting,
        ConnectionStatus.Connected,
      ]);

      // The first change should have the disconnect error
      expect(stateChanges[0]?.error).toEqual(disconnectError);
    });
  }, 10000);
});

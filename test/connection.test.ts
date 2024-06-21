import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorInfo } from '../__mocks__/ably/index.ts';
import { ConnectionStatus, DefaultConnection } from '../src/connection.ts';
import { makeTestLogger } from './helper/logger.ts';

interface TestContext {
  realtime: Ably.Realtime;
  emulateStateChange: Ably.connectionEventCallback;
  channelLevelListeners: Set<Ably.connectionEventCallback>;
}

enum AblyConnectionState {
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
    case 'connected':
      return ConnectionStatus.Connected;
    case 'disconnected':
    case 'suspended':
    case 'connecting':
      return ConnectionStatus.Disconnected;
    case 'failed':
    case 'closing':
    case 'closed':
      return ConnectionStatus.Failed;
    default:
      return ConnectionStatus.Initialised;
  }
};

vi.mock('ably');

describe('connection', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = new Ably.Realtime({ clientId: 'clientId', key: 'key' });
    context.channelLevelListeners = new Set();

    const connection = context.realtime.connection;
    vi.spyOn(connection, 'on').mockImplementation(
      // @ts-ignore
      async (listener: Ably.connectionEventCallback) => {
        context.channelLevelListeners.add(listener);

        // @ts-ignore
        context.emulateStateChange = (stateChange: Ably.ConnectionStateChange) => {
          context.channelLevelListeners.forEach((cb) => cb(stateChange));
        };
      },
    );

    vi.spyOn(connection, 'state', 'get').mockReturnValue('disconnected');
    vi.spyOn(connection, 'errorReason', 'get').mockReturnValue(new Ably.ErrorInfo('error', 500, 50000));
  });

  it<TestContext>('should set the initial channel state from the connection', (context) => {
    const connection = new DefaultConnection(context.realtime, makeTestLogger());

    expect(connection.currentStatus).toEqual(ConnectionStatus.Disconnected);
    expect(connection.error).toEqual(new Ably.ErrorInfo('error', 500, 50000));
  });

  it<TestContext>('listeners can be added', (context) =>
    new Promise<void>((done, reject) => {
      const connection = new DefaultConnection(context.realtime, makeTestLogger());
      connection.onStatusChange((status) => {
        expect(status.status).toEqual(ConnectionStatus.Connected);
        expect(status.error).toBeUndefined();
        done();
      });

      context.emulateStateChange({ current: 'connected', previous: 'disconnected' });
      reject(new Error('Expected onStatusChange to be called'));
    }));

  it<TestContext>('listeners can be removed', (context) =>
    new Promise<void>((done, reject) => {
      const connection = new DefaultConnection(context.realtime, makeTestLogger());
      const { off } = connection.onStatusChange(() => {
        reject(new Error('Expected onStatusChange to not be called'));
      });

      off();
      context.emulateStateChange({ current: 'connected', previous: 'disconnected' });
      done();
    }));

  it<TestContext>('listeners can all be removed', (context) =>
    new Promise<void>((done, reject) => {
      const connection = new DefaultConnection(context.realtime, makeTestLogger());
      connection.onStatusChange(() => {
        reject(new Error('Expected onStatusChange to not be called'));
      });
      connection.onStatusChange(() => {
        reject(new Error('Expected onStatusChange to not be called'));
      });

      connection.offAll();
      context.emulateStateChange({ current: 'connected', previous: 'disconnected' });
      done();
    }));

  describe.each([
    [ConnectionStatus.Connected, AblyConnectionState.Connecting, AblyConnectionState.Connected, undefined],
    [ConnectionStatus.Connected, AblyConnectionState.Disconnected, AblyConnectionState.Connected, undefined],
    [ConnectionStatus.Connected, AblyConnectionState.Suspended, AblyConnectionState.Connected, undefined],
    [ConnectionStatus.Disconnected, AblyConnectionState.Connected, AblyConnectionState.Connecting, undefined],
    [ConnectionStatus.Disconnected, AblyConnectionState.Connected, AblyConnectionState.Disconnected, undefined],
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
    `processes state changes`,
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

          expect(connection.currentStatus).toEqual(mapAblyStatusToChat(previousRealtimeState));
          expect(connection.error).toEqual(error ?? baseError);

          connection.onStatusChange((status) => {
            expect(status.status).toEqual(expectedStatus);
            expect(status.error).toEqual(error);
            expect(connection.currentStatus).toEqual(expectedStatus);
            expect(connection.error).toEqual(error);
            done();
          });

          context.emulateStateChange({ current: newRealtimeState, previous: previousRealtimeState, reason: error });
          reject(new Error('Expected onStatusChange to be called'));
        }));
    },
  );

  describe.each([
    [AblyConnectionState.Connected, AblyConnectionState.Connected],
    [AblyConnectionState.Disconnected, AblyConnectionState.Disconnected],
    [AblyConnectionState.Disconnected, AblyConnectionState.Connecting],
    [AblyConnectionState.Suspended, AblyConnectionState.Suspended],
    [AblyConnectionState.Connecting, AblyConnectionState.Connecting],
    [AblyConnectionState.Closing, AblyConnectionState.Closing],
    [AblyConnectionState.Closed, AblyConnectionState.Closed],
    [AblyConnectionState.Failed, AblyConnectionState.Failed],
  ])(`doesnt do state changes`, (previousRealtimeState: AblyConnectionState, newRealtimeState: AblyConnectionState) => {
    it<TestContext>(`does not transitions state when realtime state goes from ${previousRealtimeState} to ${newRealtimeState}`, (context) =>
      new Promise<void>((done, reject) => {
        vi.spyOn(context.realtime.connection, 'state', 'get').mockReturnValue(previousRealtimeState);
        const connection = new DefaultConnection(context.realtime, makeTestLogger());

        expect(connection.currentStatus).toEqual(mapAblyStatusToChat(previousRealtimeState));

        connection.onStatusChange(() => {
          reject(new Error('Expected onStatusChange to not be called'));
        });

        context.emulateStateChange({ current: newRealtimeState, previous: previousRealtimeState });
        expect(connection.currentStatus).toEqual(mapAblyStatusToChat(previousRealtimeState));
        done();
      }));
  });
});

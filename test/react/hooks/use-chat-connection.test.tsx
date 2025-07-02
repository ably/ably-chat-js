import { act, cleanup, renderHook } from '@testing-library/react';
import * as Ably from 'ably';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectionStatus, ConnectionStatusChange, ConnectionStatusListener } from '../../../src/core/connection.ts';
import { useChatConnection } from '../../../src/react/hooks/use-chat-connection.ts';
import { makeTestLogger } from '../../helper/logger.ts';

let mockCallbacks: ConnectionStatusListener[] = [];

const createMockChatClient = (currentStatus: ConnectionStatus, error?: Ably.ErrorInfo) => {
  return {
    connection: {
      status: currentStatus,
      error: error,
      onStatusChange: (callback: ConnectionStatusListener) => {
        mockCallbacks.push(callback);
        return {
          off: () => {
            mockCallbacks = mockCallbacks.filter((cb) => cb !== callback);
          },
        };
      },
    },
    logger: makeTestLogger(),
  };
};

let mockChatClient: object;

const publishStatusChange = (statusChange: ConnectionStatusChange) => {
  for (const callback of mockCallbacks) {
    callback(statusChange);
  }
};

// Mock the useChatClient hook
vi.mock('../../../src/react/hooks/use-chat-client.ts', () => {
  return {
    useChatClient: () => mockChatClient,
  };
});

describe('useChatConnection', () => {
  beforeEach(() => {
    mockCallbacks = [];
    mockChatClient = createMockChatClient(ConnectionStatus.Initialized);
  });

  afterEach(() => {
    cleanup();
  });

  it('should provide the initial state of the connection on render', () => {
    const { result } = renderHook(() => useChatConnection());
    expect(result.current.currentStatus).toBe(ConnectionStatus.Initialized);
    expect(result.current.error).toEqual(undefined);
  });

  it('should update the status correctly on status change', () => {
    const { result } = renderHook(() => useChatConnection());
    // check the initial state
    expect(result.current.currentStatus).toBe(ConnectionStatus.Initialized);
    expect(result.current.error).toEqual(undefined);

    // re-render the component, emitting a status change
    act(() => {
      publishStatusChange({
        current: ConnectionStatus.Connected,
        previous: ConnectionStatus.Connecting,
        error: undefined,
      });
    });

    // check the updated state
    expect(result.current.currentStatus).toBe(ConnectionStatus.Connected);
    expect(result.current.error).toEqual(undefined);
  });

  it('should update the error correctly on status change', () => {
    const { result } = renderHook(() => useChatConnection());
    // check the initial state
    expect(result.current.currentStatus).toBe(ConnectionStatus.Initialized);
    expect(result.current.error).toEqual(undefined);

    const testError = new Ably.ErrorInfo('error', 500, 50000);
    // re-render the component, emitting a status change
    act(() => {
      publishStatusChange({
        current: ConnectionStatus.Disconnected,
        previous: ConnectionStatus.Initialized,
        error: testError,
        retryIn: 100,
      });
    });

    // check the updated state
    expect(result.current.currentStatus).toBe(ConnectionStatus.Disconnected);
    expect(result.current.error).toEqual(testError);
  });

  it('should call the user supplied listener with the status change ', () => {
    const listener = (statusChange: ConnectionStatusChange) => {
      expect(statusChange.current).toBe(ConnectionStatus.Connected);
      expect(statusChange.previous).toBe(ConnectionStatus.Connecting);
      expect(statusChange.error).toEqual(undefined);
      expect(statusChange.retryIn).toEqual(undefined);
    };

    renderHook(() => useChatConnection({ onStatusChange: listener }));

    // re-render the component, emitting a status change
    act(() => {
      publishStatusChange({
        current: ConnectionStatus.Connected,
        previous: ConnectionStatus.Connecting,
        error: undefined,
      });
    });
  });

  it('should handle rerender if the chat client instance changes', () => {
    const { result, rerender } = renderHook(() => useChatConnection());
    // check the initial state
    expect(result.current.currentStatus).toBe(ConnectionStatus.Initialized);
    expect(result.current.error).toEqual(undefined);

    // change the chat client instance
    mockChatClient = createMockChatClient(ConnectionStatus.Connected);

    // re-render the component, use effect should run and update the state
    rerender();

    // check the updated state
    expect(result.current.currentStatus).toBe(ConnectionStatus.Connected);
    expect(result.current.error).toEqual(undefined);
  });

  it('should call the off functions for registered listeners on unmount', () => {
    const { unmount } = renderHook(() =>
      useChatConnection({
        onStatusChange: () => {},
      }),
    );
    expect(mockCallbacks.length).toBe(2);
    unmount();
    expect(mockCallbacks.length).toBe(0);
  });
});

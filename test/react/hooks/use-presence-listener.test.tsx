import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import * as Ably from 'ably';
import { ErrorInfo } from 'ably';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectionStatus } from '../../../src/core/connection.ts';
import { DiscontinuityListener } from '../../../src/core/discontinuity.ts';
import { PresenceEventType } from '../../../src/core/events.ts';
import { Logger } from '../../../src/core/logger.ts';
import { PresenceEvent, PresenceListener, PresenceMember } from '../../../src/core/presence.ts';
import { Room } from '../../../src/core/room.ts';
import { InternalRoomLifecycle, RoomStatus } from '../../../src/core/room-status.ts';
import { usePresenceListener, UsePresenceListenerParams } from '../../../src/react/hooks/use-presence-listener.ts';
import { makeTestLogger } from '../../helper/logger.ts';
import { makeRandomRoom } from '../../helper/room.ts';

let mockRoom: Room;
let mockRoomContext: { room: Promise<Room> };
let mockLogger: Logger;

let mockCurrentConnectionStatus: ConnectionStatus;
let mockCurrentRoomStatus: RoomStatus;
let mockConnectionError: Ably.ErrorInfo;
let mockRoomError: Ably.ErrorInfo;

// apply mocks for the useChatConnection and useRoom hooks
vi.mock('../../../src/react/hooks/use-chat-connection.js', () => ({
  useChatConnection: () => ({
    currentStatus: mockCurrentConnectionStatus,
    error: mockConnectionError,
  }),
}));

vi.mock('../../../src/react/hooks/internal/use-room-context.js', () => ({
  useRoomContext: () => mockRoomContext,
}));

vi.mock('../../../src/react/hooks/internal/use-room-status.js', () => ({
  useRoomStatus: () => ({ status: mockCurrentRoomStatus, error: mockRoomError }),
}));

vi.mock('../../../src/react/hooks/internal/use-logger.js', () => ({
  useRoomLogger: () => mockLogger,
}));

vi.mock('ably');

const updateMockRoom = (newRoom: Room) => {
  mockRoom = newRoom;
  (mockRoom as unknown as { _lifecycle: InternalRoomLifecycle })._lifecycle.setStatus({ status: RoomStatus.Attached });
  mockRoomContext = { room: Promise.resolve(newRoom) };
};

describe('usePresenceListener', () => {
  beforeEach(() => {
    // create a new mock room before each test
    updateMockRoom(makeRandomRoom());
    mockLogger = makeTestLogger();
    mockCurrentRoomStatus = RoomStatus.Attached;
    mockCurrentConnectionStatus = ConnectionStatus.Connected;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('should provide the presence data and correct chat status response metrics', () => {
    mockConnectionError = new Ably.ErrorInfo('test', 500, 50000);
    mockRoomError = new Ably.ErrorInfo('test', 500, 50000);
    mockCurrentRoomStatus = RoomStatus.Attached;
    mockCurrentConnectionStatus = ConnectionStatus.Connected;

    const { result } = renderHook(() => usePresenceListener());

    expect(result.current.presenceData).toEqual([]);

    // check connection and room metrics are correctly provided
    expect(result.current.roomStatus).toBe(RoomStatus.Attached);
    expect(result.current.roomError).toBe(mockRoomError);
    expect(result.current.connectionStatus).toEqual(ConnectionStatus.Connected);
    expect(result.current.connectionError).toBe(mockConnectionError);
  });

  it('should correctly subscribe and unsubscribe to presence', async () => {
    // mock listener and associated unsubscribe function
    const mockListener = vi.fn();
    const mockUnsubscribe = vi.fn();

    const presenceListeners = new Set<PresenceListener | undefined>();

    vi.spyOn(mockRoom.presence, 'subscribe').mockImplementation((listener: PresenceListener | undefined) => {
      presenceListeners.add(listener);
      return { unsubscribe: mockUnsubscribe };
    });
    vi.spyOn(mockRoom.presence, 'get').mockResolvedValue([]);

    const { unmount } = renderHook(() => usePresenceListener({ listener: mockListener }));

    // Assert that our listener gets registered
    await vi.waitFor(() => {
      // verify that subscribe was called with the mock listener on mount by triggering a presence event
      const testPresenceEvent: PresenceEvent = {
        type: PresenceEventType.Enter,
        member: {
          clientId: 'client1',
          data: undefined,
          extras: undefined,
          updatedAt: new Date(),
          connectionId: 'connection1',
          encoding: 'json',
        },
      };
      for (const listener of presenceListeners) {
        listener?.(testPresenceEvent);
      }
      expect(mockListener).toHaveBeenCalledWith(testPresenceEvent);
    });

    // unmount the hook and verify that unsubscribe was called
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('should handle rerender if the room instance changes', async () => {
    const mockOff = vi.fn();
    const listeners = new Set<DiscontinuityListener>();
    vi.spyOn(mockRoom, 'onDiscontinuity').mockImplementation((listener: DiscontinuityListener) => {
      listeners.add(listener);
      return { off: mockOff };
    });

    const { result, rerender } = renderHook((props: UsePresenceListenerParams) => usePresenceListener(props), {
      initialProps: {
        onDiscontinuity: vi.fn(),
      },
    });

    // check the initial state of the presence object
    expect(result.current.error).toBeUndefined();

    await vi.waitFor(() => {
      expect(mockRoom.onDiscontinuity).toHaveBeenCalledTimes(1);
    });

    // change the mock room instance, making it not attached
    updateMockRoom(makeRandomRoom());
    vi.spyOn(mockRoom, 'onDiscontinuity').mockImplementation((listener: DiscontinuityListener) => {
      listeners.add(listener);
      return { off: mockOff };
    });

    expect(mockRoom.onDiscontinuity).toHaveBeenCalledTimes(0);

    // re-render to trigger the useEffect
    rerender({ onDiscontinuity: vi.fn() });

    // check that the room presence instance is updated
    await vi.waitFor(() => {
      expect(mockRoom.onDiscontinuity).toHaveBeenCalledTimes(1);
    });
  });

  it('should set the initial present clients on mount', async () => {
    // spy on the subscribe method of the presence instance
    vi.spyOn(mockRoom.presence, 'subscribe').mockImplementation(() => ({ unsubscribe: vi.fn() }));

    const testPresenceMembers: PresenceMember[] = [
      {
        clientId: 'client1',
        data: undefined,
        extras: undefined,
        updatedAt: new Date(),
        connectionId: 'connection1',
        encoding: 'json',
      },
      {
        clientId: 'client2',
        data: undefined,
        extras: undefined,
        updatedAt: new Date(),
        connectionId: 'connection1',
        encoding: 'json',
      },
    ];

    // spy on the get method of the presence instance, return an initial set
    vi.spyOn(mockRoom.presence, 'get').mockResolvedValue(testPresenceMembers);

    // render the hook and check the initial state
    const { result } = renderHook(() => usePresenceListener());

    await waitFor(
      () => {
        // check that the presence data is correctly set
        expect(result.current.presenceData.length).toBe(2);
      },
      { timeout: 3000 },
    );

    expect(mockRoom.presence.subscribe).toHaveBeenCalledTimes(1);
    expect(mockRoom.presence.get).toHaveBeenCalledOnce();

    // check that the presence data is correctly set
    expect(result.current.presenceData).toEqual(testPresenceMembers);
  });

  it('should set and return the error state when the call to get the initial presence data fails', async () => {
    // spy on the get method of the presence instance and throw an error
    vi.spyOn(mockRoom.presence, 'get').mockRejectedValue(new ErrorInfo('test', 500, 50000));
    vi.spyOn(mockRoom.presence, 'subscribe');

    // render the hook
    const { result } = renderHook(() => usePresenceListener());

    // wait for the hook to finish mounting and set the error state
    await waitFor(
      () => {
        expect(result.current.error).toBeDefined();
      },
      { timeout: 3000 },
    );

    // ensure the get method was called
    expect(mockRoom.presence.get).toHaveBeenCalledOnce();
    expect(mockRoom.presence.subscribe).toHaveBeenCalledTimes(1);

    // ensure we have the correct error state
    expect(result.current.error).toBeErrorInfo({
      message: 'test',
      statusCode: 50000,
      code: 500,
    });
  });

  it('should reset the current error state if a new presence event is received', async () => {
    // in the case where we have an error state set, we should clear it if a new presence event is received, since
    // this means we once again have the most up-to-date presence data

    // spy on the get method of the presence instance and throw an error
    vi.spyOn(mockRoom.presence, 'get').mockRejectedValue(new ErrorInfo('test', 500, 50000));

    let subscribedListener: PresenceListener | undefined;

    // spy on the subscribe method of the presence instance
    vi.spyOn(mockRoom.presence, 'subscribe').mockImplementation((listener) => {
      subscribedListener = listener;
      return { unsubscribe: vi.fn() };
    });

    // render the hook
    const { result } = renderHook(() => usePresenceListener());

    // wait for the hook to finish mounting and set the error state
    await waitFor(
      () => {
        expect(result.current.error).toBeDefined();
      },
      { timeout: 3000 },
    );

    expect(mockRoom.presence.get).toHaveBeenCalledOnce();

    // change the spy so that the next call to get will resolve successfully
    vi.spyOn(mockRoom.presence, 'get').mockReturnValue(Promise.resolve([]));

    const testPresenceEvent: PresenceEvent = {
      type: PresenceEventType.Enter,
      member: {
        clientId: 'client1',
        data: undefined,
        extras: undefined,
        updatedAt: new Date(),
        connectionId: 'connection1',
        encoding: 'json',
      },
    };

    // now emit a presence event which should clear the error state
    act(() => {
      if (subscribedListener) {
        subscribedListener(testPresenceEvent);
      }
    });

    // check that the error state is now cleared
    await waitFor(
      () => {
        expect(result.current.error).toBeUndefined();
      },
      { timeout: 3000 },
    );
  });

  it('should retry updating the presence state on failure', async () => {
    let subscribedListener: PresenceListener | undefined;

    // spy on the subscribe method of the room presence instance
    vi.spyOn(mockRoom.presence, 'subscribe').mockImplementation((listener?: PresenceListener) => {
      subscribedListener = listener;
      return { unsubscribe: vi.fn() };
    });

    // during mount, set initial resolve to an empty array as we are not
    // testing this behavior here
    vi.spyOn(mockRoom.presence, 'get').mockResolvedValue([]);

    // render the hook, this should trigger a useEffect call to subscribe to the presence events
    const { result } = renderHook(() => usePresenceListener());

    // wait for the hook to subscribe the listener
    await waitFor(() => subscribedListener !== undefined);

    // wait until the

    if (!subscribedListener) {
      expect.fail('subscribedListener is undefined');
    }

    // change the mock so it now throws an error on the next call,
    // this should trigger a retry to get the presence data
    let callNum = 0;
    vi.spyOn(mockRoom.presence, 'get').mockImplementation(async () => {
      callNum++;
      if (callNum === 1) {
        throw new Ably.ErrorInfo('test', 500, 50000);
      }
      // return a successful response on the second call with a presence member
      return await Promise.resolve([
        {
          clientId: 'client1',
          data: undefined,
          extras: undefined,
          updatedAt: new Date(),
          connectionId: 'connection1',
          encoding: 'json',
        },
      ]);
    });

    // trigger the listener; this should trigger the next call to presence.get
    subscribedListener({
      type: PresenceEventType.Enter,
      member: {
        clientId: 'client1',
        data: undefined,
        extras: undefined,
        updatedAt: new Date(),
        connectionId: 'connection1',
        encoding: 'json',
      },
    });

    // Wait for our mock room's presence to be called
    await waitFor(() => {
      expect(mockRoom.presence.get).toBeCalledTimes(1);
    });

    // wait for the hook to retry the presence.get call
    await waitFor(
      () => {
        expect(result.current.presenceData.length).toBe(1);
      },
      { timeout: 3000 },
    );

    // we should have retried the presence.get call
    expect(mockRoom.presence.get).toBeCalledTimes(2);

    // our returned data should be the presence member we received
    expect(result.current.presenceData[0]?.clientId).toEqual('client1');
  }, 10000);

  it('should not return stale presence data even if they resolve out of order', async () => {
    let subscribedListener: PresenceListener | undefined;

    // spy on the subscribe method of the room presence instance
    vi.spyOn(mockRoom.presence, 'subscribe').mockImplementation((listener?: PresenceListener) => {
      subscribedListener = listener;
      return { unsubscribe: vi.fn() };
    });

    // render the hook, this should trigger a useEffect call to subscribe to the presence events
    const { result, rerender } = renderHook(() => usePresenceListener());

    // wait for the hook to subscribe the listener
    await waitFor(() => subscribedListener !== undefined);

    if (!subscribedListener) {
      expect.fail('subscribedListener is undefined');
    }

    // this promise will allow us to resolve an event late
    let stopWaiting: () => void;
    const waitForThis = new Promise<void>((accept) => {
      stopWaiting = accept;
    });

    const testPresenceData1: PresenceMember[] = [
      {
        clientId: 'client1',
        data: undefined,
        extras: undefined,
        updatedAt: new Date(),
        connectionId: 'connection1',
        encoding: 'json',
      },
    ];

    const testPresenceData2: PresenceMember[] = [
      {
        clientId: 'client2',
        data: undefined,
        extras: undefined,
        updatedAt: new Date(),
        connectionId: 'connection1',
        encoding: 'json',
      },
    ];

    let callNum = 0;
    vi.spyOn(mockRoom.presence, 'get').mockImplementation(async () => {
      callNum++;
      if (callNum === 1) {
        return new Promise((accept) => {
          setTimeout(() => {
            accept(testPresenceData1);
            // delay resolving the first event, allowing the second event to resolve first
            setTimeout(stopWaiting, 500);
          }, 500);
        });
      } else {
        return new Promise((accept) => {
          setTimeout(() => {
            accept(testPresenceData2);
          }, 100);
        });
      }
    });

    // emit the first presence event, this should trigger the first call to presence.get
    subscribedListener({
      type: PresenceEventType.Enter,
      member: {
        clientId: 'client1',
        data: undefined,
        extras: undefined,
        updatedAt: new Date(),
        connectionId: 'connection1',
        encoding: 'json',
      },
    });

    // ensure that the first call to presence.get was made - eventually
    await waitFor(() => {
      expect(mockRoom.presence.get).toBeCalledTimes(1);
    });

    // now emit the second presence event, this should trigger the second call to presence.get
    subscribedListener({
      type: PresenceEventType.Enter,
      member: {
        clientId: 'client2',
        data: undefined,
        extras: undefined,
        updatedAt: new Date(),
        connectionId: 'connection1',
        encoding: 'json',
      },
    });

    // ensure that the first call to presence.get was made - eventually
    await waitFor(() => {
      expect(mockRoom.presence.get).toBeCalledTimes(2);
    });

    // since we already have a newer event, triggering the first event to resolve
    // should result in the first event being discarded
    await waitForThis;

    // wait for the hook to update the presence data
    await waitFor(
      () => {
        // force the hook to run again until the presence data is updated
        rerender();
        expect(result.current.presenceData.length).toBe(1);
      },
      { timeout: 5000 },
    );

    // our returned data should be the second event we received
    expect(result.current.presenceData).toHaveLength(1);
    expect(result.current.presenceData[0]).toStrictEqual(testPresenceData2[0]);
  }, 10000);

  it('should correctly subscribe and unsubscribe onDiscontinuity listener', async () => {
    // mock onDiscontinuity listener and associated off function
    const mockOnDiscontinuity = vi.fn();
    const mockOff = vi.fn();

    let registeredListener: DiscontinuityListener | undefined;

    vi.spyOn(mockRoom, 'onDiscontinuity').mockImplementation((listener) => {
      registeredListener = listener;
      return {
        off: () => {
          mockOff();
        },
      };
    });

    // Render the hook with the onDiscontinuity listener
    const { unmount } = renderHook(() => usePresenceListener({ onDiscontinuity: mockOnDiscontinuity }));

    // Verify that onDiscontinuity was called and stored our listener
    await vi.waitFor(() => {
      expect(mockRoom.onDiscontinuity).toHaveBeenCalled();
      expect(registeredListener).toBeDefined();
    });

    // Trigger the discontinuity listener with an error
    const errorInfo = new Ably.ErrorInfo('test', 500, 50000);
    registeredListener?.(errorInfo);
    expect(mockOnDiscontinuity).toHaveBeenCalledWith(errorInfo);

    // Unmount the hook and verify that off was called
    unmount();
    expect(mockOff).toHaveBeenCalled();
  });
});

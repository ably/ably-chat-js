import {
  ConnectionLifecycle,
  Logger,
  PresenceEvent,
  PresenceEvents,
  PresenceListener,
  PresenceMember,
  Room,
  RoomLifecycle,
} from '@ably/chat';
import { act, renderHook, waitFor } from '@testing-library/react';
import * as Ably from 'ably';
import { ErrorInfo } from 'ably';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePresenceListener } from '../../../src/react/hooks/use-presence-listener.ts';
import { makeTestLogger } from '../../helper/logger.ts';
import { makeRandomRoom } from '../../helper/room.ts';

let mockRoom: Room;
let mockLogger: Logger;

let mockCurrentConnectionStatus: ConnectionLifecycle;
let mockCurrentRoomStatus: RoomLifecycle;
let mockConnectionError: Ably.ErrorInfo;
let mockRoomError: Ably.ErrorInfo;

// apply mocks for the useChatConnection and useRoom hooks
vi.mock('../../../src/react/hooks/use-chat-connection.js', () => ({
  useChatConnection: () => ({
    currentStatus: mockCurrentConnectionStatus,
    error: mockConnectionError,
  }),
}));

vi.mock('../../../src/react/hooks/use-room.js', () => ({
  useRoom: () => {
    return {
      room: mockRoom,
      roomStatus: mockCurrentRoomStatus,
      roomError: mockRoomError,
    };
  },
}));

vi.mock('../../../src/react/hooks/use-logger.js', () => ({
  useLogger: () => mockLogger,
}));

vi.mock('ably');

describe('usePresenceListener', () => {
  beforeEach(() => {
    // create a new mock room before each test
    mockRoom = makeRandomRoom({ options: { presence: { subscribe: true } } });
    mockLogger = makeTestLogger();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should provide the room presence instance, presence data and correct chat status response metrics', () => {
    mockConnectionError = new Ably.ErrorInfo('test', 500, 50000);
    mockRoomError = new Ably.ErrorInfo('test', 500, 50000);
    mockCurrentRoomStatus = RoomLifecycle.Attached;
    mockCurrentConnectionStatus = ConnectionLifecycle.Connected;

    const { result, unmount } = renderHook(() => usePresenceListener());

    // check that the room presence instance is correctly provided
    expect(result.current.presence).toBe(mockRoom.presence);
    expect(result.current.presenceData).toEqual([]);

    // check connection and room metrics are correctly provided
    expect(result.current.roomStatus).toBe(RoomLifecycle.Attached);
    expect(result.current.roomError).toBe(mockRoomError);
    expect(result.current.connectionStatus).toEqual(ConnectionLifecycle.Connected);
    expect(result.current.connectionError).toBe(mockConnectionError);
    unmount();
  });

  it('should correctly subscribe and unsubscribe to presence', () => {
    // mock listener and associated unsubscribe function
    const mockListener = vi.fn();
    const mockUnsubscribe = vi.fn();

    vi.spyOn(mockRoom.presence, 'subscribe').mockReturnValue({ unsubscribe: mockUnsubscribe });
    vi.spyOn(mockRoom.presence, 'get').mockResolvedValue([]);

    const { unmount } = renderHook(() => usePresenceListener({ listener: mockListener }));

    // verify that subscribe was called with the mock listener on mount
    expect(mockRoom.presence.subscribe).toHaveBeenCalledWith(mockListener);

    // unmount the hook and verify that unsubscribe was called
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('should handle rerender if the room instance changes', () => {
    const { result, rerender, unmount } = renderHook(() => usePresenceListener());

    // check the initial state of the presence object
    expect(result.current.presence).toBe(mockRoom.presence);

    // change the mock room instance
    mockRoom = makeRandomRoom({ options: { presence: { subscribe: true } } });

    // re-render to trigger the useEffect
    rerender();

    // check that the room presence instance is updated
    expect(result.current.presence).toBe(mockRoom.presence);
    unmount();
  });

  it('should set the initial present clients on mount', async () => {
    // spy on the subscribe method of the presence instance
    vi.spyOn(mockRoom.presence, 'subscribe').mockImplementation(() => {
      return { unsubscribe: vi.fn() };
    });

    const testPresenceMembers: PresenceMember[] = [
      {
        clientId: 'client1',
        action: 'enter',
        data: undefined,
        extras: undefined,
        updatedAt: Date.now(),
      },
      {
        clientId: 'client2',
        action: 'enter',
        data: undefined,
        extras: undefined,
        updatedAt: Date.now(),
      },
    ];

    // spy on the get method of the presence instance, return an initial set
    vi.spyOn(mockRoom.presence, 'get').mockResolvedValue(testPresenceMembers);

    // render the hook and check the initial state
    const { result, unmount } = renderHook(() => usePresenceListener());

    await waitFor(
      () => {
        // check that the presence data is correctly set
        expect(result.current.presenceData.length).toBe(2);
      },
      { timeout: 3000 },
    );

    expect(mockRoom.presence.subscribe).toHaveBeenCalledOnce();
    expect(mockRoom.presence.get).toHaveBeenCalledOnce();

    // check that the presence data is correctly set
    expect(result.current.presenceData).toEqual(testPresenceMembers);
    unmount();
  });

  it('should set and return the error state when the call to get the initial presence data fails', async () => {
    // spy on the get method of the presence instance and throw an error
    vi.spyOn(mockRoom.presence, 'get').mockRejectedValue(new ErrorInfo('test', 500, 50000));
    vi.spyOn(mockRoom.presence, 'subscribe');

    // render the hook
    const { result, unmount } = renderHook(() => usePresenceListener());

    // wait for the hook to finish mounting and set the error state
    await waitFor(
      () => {
        expect(result.current.error).toBeDefined();
      },
      { timeout: 3000 },
    );

    // ensure the get method was called
    expect(mockRoom.presence.get).toHaveBeenCalledOnce();
    expect(mockRoom.presence.subscribe).toHaveBeenCalledOnce();

    // ensure we have the correct error state
    expect(result.current.error).toBeErrorInfo({
      message: 'test',
      statusCode: 50000,
      code: 500,
    });
    unmount();
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
    const { result, unmount } = renderHook(() => usePresenceListener());

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
      clientId: 'client1',
      action: PresenceEvents.Enter,
      data: undefined,
      timestamp: Date.now(),
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
    unmount();
  });

  it('should subscribe and unsubscribe to discontinuity events', () => {
    const mockOff = vi.fn();
    const mockDiscontinuityListener = vi.fn();

    // spy on the onDiscontinuity method of the room presence instance
    vi.spyOn(mockRoom.presence, 'onDiscontinuity').mockReturnValue({ off: mockOff });

    // render the hook with a discontinuity listener
    const { unmount } = renderHook(() => usePresenceListener({ onDiscontinuity: mockDiscontinuityListener }));

    // check that the listener was subscribed to the discontinuity events
    expect(mockRoom.presence.onDiscontinuity).toHaveBeenCalledWith(mockDiscontinuityListener);

    // unmount the hook and verify that the listener was unsubscribed
    unmount();

    expect(mockOff).toHaveBeenCalled();
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
    const { result, unmount } = renderHook(() => usePresenceListener());

    // wait for the hook to subscribe the listener
    await waitFor(() => {
      return subscribedListener !== undefined;
    });

    if (!subscribedListener) {
      expect.fail('subscribedListener is undefined');
    }

    // change the mock so it now throws an error on the next call,
    // this should trigger a retry to get the presence data
    let callNum = 0;
    vi.spyOn(mockRoom.presence, 'get').mockImplementation(() => {
      callNum++;
      if (callNum === 1) {
        return Promise.reject<PresenceMember[]>(new Ably.ErrorInfo('test', 500, 50000));
      } else {
        // return a successful response on the second call with a presence member
        return Promise.resolve<PresenceMember[]>([
          {
            clientId: 'client1',
            action: 'enter',
            data: undefined,
            extras: undefined,
            updatedAt: Date.now(),
          },
        ]);
      }
    });

    // trigger the listener; this should trigger the next call to presence.get
    subscribedListener({
      action: PresenceEvents.Enter,
      clientId: 'client1',
      timestamp: Date.now(),
      data: undefined,
    });

    expect(mockRoom.presence.get).toBeCalledTimes(1);

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
    expect(result.current.presenceData[0]?.action).toEqual('enter');
    unmount();
  }, 10000);

  it('should not return stale presence data even if they resolve out of order', async () => {
    let subscribedListener: PresenceListener | undefined;

    // spy on the subscribe method of the room presence instance
    vi.spyOn(mockRoom.presence, 'subscribe').mockImplementation((listener?: PresenceListener) => {
      subscribedListener = listener;
      return { unsubscribe: vi.fn() };
    });

    // render the hook, this should trigger a useEffect call to subscribe to the presence events
    const { result, rerender, unmount } = renderHook(() => usePresenceListener());

    // wait for the hook to subscribe the listener
    await waitFor(() => {
      return subscribedListener !== undefined;
    });

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
        action: 'enter',
        data: undefined,
        extras: undefined,
        updatedAt: Date.now(),
      },
    ];

    const testPresenceData2: PresenceMember[] = [
      {
        clientId: 'client2',
        action: 'enter',
        data: undefined,
        extras: undefined,
        updatedAt: Date.now(),
      },
    ];

    let callNum = 0;
    vi.spyOn(mockRoom.presence, 'get').mockImplementation(() => {
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
      action: PresenceEvents.Enter,
      clientId: 'client1',
      timestamp: Date.now(),
      data: undefined,
    });

    // ensure that the first call to presence.get was made
    expect(mockRoom.presence.get).toBeCalledTimes(1);

    // now emit the second presence event, this should trigger the second call to presence.get
    subscribedListener({
      action: PresenceEvents.Enter,
      clientId: 'client2',
      timestamp: Date.now(),
      data: undefined,
    });

    // ensure that the second call to presence.get was made
    expect(mockRoom.presence.get).toBeCalledTimes(2);

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
    unmount();
  }, 10000);
});

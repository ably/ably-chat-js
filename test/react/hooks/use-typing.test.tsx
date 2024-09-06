import { ConnectionLifecycle, DiscontinuityListener, Logger, Room, RoomLifecycle, TypingListener } from '@ably/chat';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import * as Ably from 'ably';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTyping } from '../../../src/react/hooks/use-typing.ts';
import { makeTestLogger } from '../../helper/logger.ts';
import { makeRandomRoom } from '../../helper/room.ts';

let mockRoom: Room;
let mockLogger: Logger;

// apply mocks for the useChatConnection and useRoom hooks
vi.mock('../../../src/react/hooks/use-chat-connection.js', () => ({
  useChatConnection: () => ({ currentStatus: ConnectionLifecycle.Connected }),
}));

vi.mock('../../../src/react/hooks/use-room.js', () => ({
  useRoom: () => ({ room: mockRoom, roomStatus: RoomLifecycle.Attached }),
}));

vi.mock('../../../src/react/hooks/use-logger.js', () => ({
  useLogger: () => mockLogger,
}));

vi.mock('ably');

describe('useTyping', () => {
  beforeEach(() => {
    // create a new mock room before each test, enabling typing
    vi.resetAllMocks();
    mockRoom = makeRandomRoom({ options: { typing: { timeoutMs: 500 } } });
    mockLogger = makeTestLogger();
  });

  afterEach(() => {
    cleanup();
  });

  it('should provide the typing instance and chat status response metrics', () => {
    const { result } = renderHook(() => useTyping());

    // check that the typing instance is correctly provided
    expect(result.current.typingIndicators).toBe(mockRoom.typing);

    // check connection and room metrics are correctly provided
    expect(result.current.roomStatus).toBe(RoomLifecycle.Attached);
    expect(result.current.roomError).toBeUndefined();
    expect(result.current.connectionStatus).toEqual(ConnectionLifecycle.Connected);
    expect(result.current.connectionError).toBeUndefined();
  });

  it('should correctly subscribe and unsubscribe to typing events', () => {
    // mock listener and associated unsubscribe function
    const mockListener = vi.fn();
    const mockUnsubscribe = vi.fn();

    const mockTyping = {
      ...mockRoom.typing,
      listeners: new Set<TypingListener>(),
      subscribe: vi.fn().mockImplementation((listener: TypingListener) => {
        mockTyping.listeners.add(listener);
        return { unsubscribe: mockUnsubscribe };
      }),
      onDiscontinuity: vi.fn().mockReturnValue({ off: vi.fn() }),
    };

    // update the mock room with the new typing object
    mockRoom = { ...mockRoom, typing: mockTyping };

    const { unmount } = renderHook(() => useTyping({ listener: mockListener }));

    // verify that subscribe was called with the mock listener on mount by triggering an event
    const typingEvent = { currentlyTyping: new Set<string>() };
    for (const listener of mockTyping.listeners) {
      listener(typingEvent);
    }
    expect(mockListener).toHaveBeenCalledWith(typingEvent);

    // unmount the hook and verify that unsubscribe was called
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('should correctly call the typing start method', async () => {
    const { result } = renderHook(() => useTyping());

    // spy on the start method of the typing instance
    const startSpy = vi.spyOn(mockRoom.typing, 'start');

    // call the start method
    await act(async () => {
      await result.current.start();
    });

    // verify that the start method was called
    expect(startSpy).toHaveBeenCalled();
  });

  it('should correctly call the typing stop method', async () => {
    const { result } = renderHook(() => useTyping());

    // spy on the stop method of the typing instance
    const stopSpy = vi.spyOn(mockRoom.typing, 'stop');

    // call the stop method
    await act(async () => {
      await result.current.stop();
    });

    // verify that the stop method was called
    expect(stopSpy).toHaveBeenCalled();
  });

  it('should update the currently typing clients on new typing events', async () => {
    let subscribedListener: TypingListener | undefined;

    // spy on the subscribe method of the typing instance
    vi.spyOn(mockRoom.typing, 'subscribe').mockImplementation((listener) => {
      subscribedListener = listener;
      return { unsubscribe: vi.fn() };
    });

    // spy on the get method of the typing instance, for now return an empty set
    vi.spyOn(mockRoom.typing, 'get').mockReturnValue(Promise.resolve(new Set()));

    // render the hook and check the initial state
    const { result } = renderHook(() => useTyping());

    // check currentlyTyping is a Set with no elements
    expect(result.current.currentlyTyping).toBeInstanceOf(Set);
    expect(result.current.currentlyTyping.size).toBe(0);

    const testSet = new Set<string>(['user1', 'user2']);

    // wait for the hook to finish mounting and subscribe to the typing events
    await waitFor(
      () => {
        expect(subscribedListener).toBeDefined();
      },
      { timeout: 3000 },
    );

    // emit a typing event which should update the DOM
    act(() => {
      if (subscribedListener) {
        subscribedListener({ currentlyTyping: testSet });
      }
    });

    // check the states of the occupancy metrics are correctly updated
    expect(result.current.currentlyTyping).toEqual(testSet);
  });

  it('should set the initial currently typing clients on mount', async () => {
    // spy on the subscribe method of the typing instance
    vi.spyOn(mockRoom.typing, 'subscribe').mockImplementation(() => {
      return { unsubscribe: vi.fn() };
    });

    const testSet = new Set<string>(['user1', 'user2']);
    // spy on the get method of the typing instance, return an initial set
    vi.spyOn(mockRoom.typing, 'get').mockResolvedValue(testSet);

    // render the hook and check the initial state
    const { result } = renderHook(() => useTyping());

    await waitFor(
      () => {
        // check currentlyTyping is a Set with elements
        expect(result.current.currentlyTyping.size).toBe(2);
      },
      { timeout: 3000 },
    );

    expect(mockRoom.typing.subscribe).toHaveBeenCalledTimes(1);
    expect(mockRoom.typing.get).toHaveBeenCalledOnce();

    // check the states of the occupancy metrics are correctly updated
    expect(result.current.currentlyTyping).toEqual(testSet);
  });

  it('should set and return the error state when the call to get the initial typers set fails', async () => {
    // spy on the get method of the typing instance and throw an error
    vi.spyOn(mockRoom.typing, 'get').mockRejectedValue(new Ably.ErrorInfo('test', 500, 50000));
    vi.spyOn(mockRoom.typing, 'subscribe');

    // render the hook
    const { result } = renderHook(() => useTyping());

    // wait for the hook to finish mounting and set the error state
    await waitFor(
      () => {
        expect(result.current.error).toBeDefined();
      },
      { timeout: 3000 },
    );

    // ensure the get method was called
    expect(mockRoom.typing.get).toHaveBeenCalledOnce();
    expect(mockRoom.typing.subscribe).toHaveBeenCalledTimes(1);

    // ensure we have the correct error state
    expect(result.current.error).toBeErrorInfo({
      message: 'test',
      statusCode: 50000,
      code: 500,
    });
  });

  it('should reset the current error state if a new typing event is received', async () => {
    // in the case where the initial call to `typing.get` fails, we still register the listener.
    // if we then receive a typing event, we should clear the error state since we now have the latest set of typers

    // spy on the get method of the typing instance and throw an error
    vi.spyOn(mockRoom.typing, 'get').mockRejectedValue(new Ably.ErrorInfo('test', 500, 50000));

    let subscribedListener: TypingListener | undefined;

    // spy on the subscribe method of the typing instance
    vi.spyOn(mockRoom.typing, 'subscribe').mockImplementation((listener) => {
      subscribedListener = listener;
      return { unsubscribe: vi.fn() };
    });

    // render the hook
    const { result } = renderHook(() => useTyping());

    // wait for the hook to finish mounting and set the error state
    await waitFor(
      () => {
        expect(result.current.error).toBeDefined();
      },
      { timeout: 3000 },
    );

    expect(mockRoom.typing.get).toHaveBeenCalledOnce();

    // now emit a typing event which should clear the error state
    act(() => {
      if (subscribedListener) {
        subscribedListener({ currentlyTyping: new Set() });
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

  it('should handle rerender if the room instance changes', () => {
    const { result, rerender } = renderHook(() => useTyping());

    // check the initial state of the typing instance
    expect(result.current.typingIndicators).toBe(mockRoom.typing);

    // change the mock room instance
    mockRoom = makeRandomRoom({
      options: {
        typing: {
          timeoutMs: 500,
        },
      },
    });

    // re-render to trigger the useEffect
    rerender();

    // check that the typing instance is updated
    expect(result.current.typingIndicators).toBe(mockRoom.typing);
  });

  it('should subscribe and unsubscribe to discontinuity events', () => {
    const mockOff = vi.fn();
    const mockDiscontinuityListener = vi.fn();

    // spy on the onDiscontinuity method of the typing instance
    let discontinuityListener: DiscontinuityListener | undefined;
    vi.spyOn(mockRoom.typing, 'onDiscontinuity').mockImplementation((listener: DiscontinuityListener) => {
      discontinuityListener = listener;
      return { off: mockOff };
    });

    // render the hook with a discontinuity listener
    const { unmount } = renderHook(() => useTyping({ onDiscontinuity: mockDiscontinuityListener }));

    // check that the listener was subscribed to the discontinuity events by triggering one
    const discontinuityEvent = new Ably.ErrorInfo('test', 50000, 500);
    expect(discontinuityListener).toBeDefined();
    discontinuityListener?.(discontinuityEvent);
    expect(mockDiscontinuityListener).toHaveBeenCalledWith(discontinuityEvent);

    // unmount the hook and verify that the listener was unsubscribed
    unmount();

    expect(mockOff).toHaveBeenCalled();
  });
});

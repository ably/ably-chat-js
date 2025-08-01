import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import * as Ably from 'ably';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectionStatus } from '../../../src/core/connection.ts';
import { DiscontinuityListener } from '../../../src/core/discontinuity.ts';
import { TypingEventType, TypingSetEvent, TypingSetEventType } from '../../../src/core/events.ts';
import { Logger } from '../../../src/core/logger.ts';
import { Room } from '../../../src/core/room.ts';
import { DefaultRoomLifecycle, InternalRoomLifecycle, RoomStatus } from '../../../src/core/room-status.ts';
import { TypingListener } from '../../../src/core/typing.ts';
import { useTyping } from '../../../src/react/hooks/use-typing.ts';
import { makeTestLogger } from '../../helper/logger.ts';
import { makeRandomRoom } from '../../helper/room.ts';
import { waitForEventualHookValue, waitForEventualHookValueToBeDefined } from '../../helper/wait-for-eventual-hook.ts';

let mockRoom: Room;
let mockRoomContext: { room: Promise<Room> };
let mockLogger: Logger;

// apply mocks for the useChatConnection and useRoom hooks
vi.mock('../../../src/react/hooks/use-chat-connection.js', () => ({
  useChatConnection: () => ({ currentStatus: ConnectionStatus.Connected }),
}));

vi.mock('../../../src/react/helper/use-room-context.js', () => ({
  useRoomContext: () => mockRoomContext,
}));

vi.mock('../../../src/react/helper/use-room-status.js', () => ({
  useRoomStatus: () => ({ status: RoomStatus.Attached }),
}));

vi.mock('../../../src/react/hooks/use-logger.js', () => ({
  useRoomLogger: () => mockLogger,
}));

vi.mock('ably');

const updateMockRoom = (newRoom: Room & { _lifecycle?: InternalRoomLifecycle }) => {
  mockRoom = newRoom;
  (mockRoom as unknown as { _lifecycle: InternalRoomLifecycle })._lifecycle.setStatus({ status: RoomStatus.Attached });
  mockRoomContext = { room: Promise.resolve(newRoom) };
};

describe('useTyping', () => {
  beforeEach(() => {
    // create a new mock room before each test, enabling typing
    vi.resetAllMocks();
    updateMockRoom(makeRandomRoom({ options: { typing: { heartbeatThrottleMs: 500 } } }));
    mockLogger = makeTestLogger();
  });

  afterEach(() => {
    cleanup();
  });

  it('should provide the typing instance and chat status response metrics', async () => {
    const { result } = renderHook(() => useTyping());

    // check that the typing instance is correctly provided
    await waitForEventualHookValue(result, mockRoom.typing, (value) => value.typingIndicators);

    // check connection and room metrics are correctly provided
    expect(result.current.roomStatus).toBe(RoomStatus.Attached);
    expect(result.current.roomError).toBeUndefined();
    expect(result.current.connectionStatus).toEqual(ConnectionStatus.Connected);
    expect(result.current.connectionError).toBeUndefined();
  });

  it('should correctly subscribe and unsubscribe to typing events', async () => {
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
      current: mockRoom.typing.current,
    };

    // update the mock room with the new typing object
    updateMockRoom({ ...mockRoom, _lifecycle: new DefaultRoomLifecycle(mockLogger), typing: mockTyping });
    const { result, unmount } = renderHook(() => useTyping({ listener: mockListener }));

    await waitForEventualHookValueToBeDefined(result, (value) => value.typingIndicators);

    // verify that subscribe was called with the mock listener on mount by triggering an event
    const typingEvent: TypingSetEvent = {
      type: TypingSetEventType.SetChanged,
      change: { clientId: 'someClientId', type: TypingEventType.Stopped },
      currentlyTyping: new Set<string>(),
    };
    for (const listener of mockTyping.listeners) {
      listener(typingEvent);
    }
    expect(mockListener).toHaveBeenCalledWith(typingEvent);

    // unmount the hook and verify that unsubscribe was called
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('should correctly call the typing keystroke method', async () => {
    const { result } = renderHook(() => useTyping());

    // spy on the keystroke method of the typing instance
    const keystrokeSpy = vi.spyOn(mockRoom.typing, 'keystroke').mockImplementation(() => Promise.resolve());

    // call the keystroke method
    await act(async () => {
      await result.current.keystroke();
    });

    // verify that the keystroke method was called
    expect(keystrokeSpy).toHaveBeenCalled();
  });

  it('should correctly call the typing stop method', async () => {
    const { result } = renderHook(() => useTyping());

    // spy on the stop method of the typing instance
    const stopSpy = vi.spyOn(mockRoom.typing, 'stop').mockImplementation(() => Promise.resolve());

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
    vi.spyOn(mockRoom.typing, 'current').mockReturnValue(new Set());

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
        subscribedListener({
          type: TypingSetEventType.SetChanged,
          change: { clientId: 'user2', type: TypingEventType.Started },
          currentlyTyping: testSet,
        });
      }
    });

    // check the states of the occupancy metrics are correctly updated
    expect(result.current.currentlyTyping).toEqual(testSet);
  });

  it('should set the initial currently typing clients on mount', async () => {
    // spy on the subscribe method of the typing instance
    vi.spyOn(mockRoom.typing, 'subscribe').mockImplementation(() => ({ unsubscribe: vi.fn() }));

    const testSet = new Set<string>(['user1', 'user2']);
    // spy on the get method of the typing instance, return an initial set
    vi.spyOn(mockRoom.typing, 'current').mockReturnValue(testSet);

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
    expect(mockRoom.typing.current).toHaveBeenCalledOnce();

    // check the states of the occupancy metrics are correctly updated
    expect(result.current.currentlyTyping).toEqual(testSet);
  });

  it('should handle rerender if the room instance changes', async () => {
    const { result, rerender } = renderHook(() => useTyping());

    // check the initial state of the typing instance
    await waitForEventualHookValue(result, mockRoom.typing, (value) => value.typingIndicators);

    // change the mock room instance
    updateMockRoom(
      makeRandomRoom({
        options: {
          typing: {
            heartbeatThrottleMs: 500,
          },
        },
      }),
    );

    // re-render to trigger the useEffect
    rerender();

    // check that the typing instance is updated
    await waitForEventualHookValue(result, mockRoom.typing, (value) => value.typingIndicators);
  });

  it('should subscribe and unsubscribe to discontinuity events', async () => {
    const mockOff = vi.fn();
    const mockDiscontinuityListener = vi.fn();

    // spy on the onDiscontinuity method of the typing instance
    let discontinuityListener: DiscontinuityListener | undefined;
    vi.spyOn(mockRoom, 'onDiscontinuity').mockImplementation((listener: DiscontinuityListener) => {
      discontinuityListener = listener;
      return { off: mockOff };
    });

    // render the hook with a discontinuity listener
    const { unmount } = renderHook(() => useTyping({ onDiscontinuity: mockDiscontinuityListener }));

    // check that the listener was subscribed to the discontinuity events by triggering one
    const discontinuityEvent = new Ably.ErrorInfo('test', 50000, 500);
    await waitFor(() => {
      expect(discontinuityListener).toBeDefined();
    });
    discontinuityListener?.(discontinuityEvent);
    expect(mockDiscontinuityListener).toHaveBeenCalledWith(discontinuityEvent);

    // unmount the hook and verify that the listener was unsubscribed
    unmount();

    expect(mockOff).toHaveBeenCalled();
  });
});

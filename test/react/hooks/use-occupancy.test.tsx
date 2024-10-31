import {
  ConnectionLifecycle,
  DiscontinuityListener,
  OccupancyEvent,
  OccupancyListener,
  Room,
  RoomLifecycle,
} from '@ably/chat';
import { act, cleanup, renderHook } from '@testing-library/react';
import * as Ably from 'ably';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRoomContext } from '../../../src/react/helper/use-room-context.ts';
import { useOccupancy } from '../../../src/react/hooks/use-occupancy.ts';
import { makeTestLogger } from '../../helper/logger.ts';
import { makeRandomRoom } from '../../helper/room.ts';
import { waitForEventualHookValue, waitForEventualHookValueToBeDefined } from '../../helper/wait-for-eventual-hook.ts';

let mockRoom: Room;
let mockRoomContext: { room: Promise<Room> };
let mockLogger: ReturnType<typeof makeTestLogger>;

// apply mocks for the useChatConnection and useRoom hooks
vi.mock('../../../src/react/hooks/use-chat-connection.js', () => ({
  useChatConnection: () => ({ currentStatus: ConnectionLifecycle.Connected }),
}));
vi.mock('../../../src/react/helper/use-room-context.js', () => ({
  useRoomContext: () => mockRoomContext,
}));

vi.mock('../../../src/react/helper/use-room-status.js', () => ({
  useRoomStatus: () => ({ status: RoomLifecycle.Attached}),
}));

vi.mock('../../../src/react/hooks/use-logger.js', () => ({
  useLogger: () => mockLogger,
}));

vi.mock('ably');

const updateMockRoom = (newRoom: Room) => {
  mockRoom = newRoom;
  mockRoomContext = { room: Promise.resolve(newRoom) };
}

describe('useOccupancy', () => {
  beforeEach(() => {
    // create a new mock room before each test, enabling occupancy
    vi.resetAllMocks();
    mockLogger = makeTestLogger();
    updateMockRoom(makeRandomRoom({ options: { occupancy: {} } }));
  });

  afterEach(() => {
    cleanup();
  });

  it('should provide the occupancy instance, associated metrics, and chat status response metrics', async () => {
    const { result } = renderHook(() => useOccupancy());

    // check that the occupancy instance and metrics are correctly provided
    await waitForEventualHookValue(result, mockRoom.occupancy, (value) => value.occupancy);
    expect(result.current.connections).toBe(0);
    expect(result.current.presenceMembers).toBe(0);

    // check connection and room metrics are correctly provided
    expect(result.current.roomStatus).toBe(RoomLifecycle.Attached);
    expect(result.current.roomError).toBeUndefined();
    expect(result.current.connectionStatus).toEqual(ConnectionLifecycle.Connected);
    expect(result.current.connectionError).toBeUndefined();
  });

  it('should correctly subscribe and unsubscribe to occupancy events', async () => {
    // mock listener and associated unsubscribe function
    const mockListener = vi.fn();
    const mockUnsubscribe = vi.fn();

    const mockOccupancy = {
      ...mockRoom.occupancy,
      callAllListeners: (arg: OccupancyEvent) => {
        for (const listener of mockOccupancy.listeners) {
          listener(arg);
        }
      },
      listeners: new Set<OccupancyListener>(),
      subscribe: vi.fn().mockImplementation((listener: OccupancyListener) => {
        mockOccupancy.listeners.add(listener);
        return {
          unsubscribe: () => {
            mockOccupancy.listeners.delete(listener);
            mockUnsubscribe();
          },
        };
      }),
      onDiscontinuity: vi.fn().mockReturnValue({ off: vi.fn() }),
    };

    // update the mock room with the new occupancy object
    updateMockRoom({ ...mockRoom, occupancy: mockOccupancy });

    const { result, unmount } = renderHook(() => useOccupancy({ listener: mockListener }));

    await waitForEventualHookValueToBeDefined(result, (value) => value.occupancy);

    // verify that subscribe was called with the mock listener on mount by triggering an occupancy event
    mockOccupancy.callAllListeners({ connections: 5, presenceMembers: 3 });
    expect(mockListener).toHaveBeenCalledWith({ connections: 5, presenceMembers: 3 });

    // unmount the hook and verify that unsubscribe was called
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('should update the occupancy metrics on new occupancy events', async () => {
    let subscribedListener: OccupancyListener;

    // spy on the subscribe method of the occupancy instance
    let callTimes = 0;
    vi.spyOn(mockRoom.occupancy, 'subscribe').mockImplementation((listener) => {
      // We only care about the first call to subscribe, as that's the internal listener going on
      if (callTimes === 0) {
        callTimes++;
        subscribedListener = listener;
      }

      return { unsubscribe: vi.fn() };
    });

    // render the hook and check the initial state of the occupancy metrics
    const { result } = renderHook(() => useOccupancy());

    await waitForEventualHookValueToBeDefined(result, (value) => value.occupancy);

    expect(result.current.connections).toBe(0);
    expect(result.current.presenceMembers).toBe(0);

    // emit an occupancy event which should update the DOM
    act(() => {
      subscribedListener({ connections: 5, presenceMembers: 3 });
    });

    // check the states of the occupancy metrics are correctly updated
    expect(result.current.connections).toBe(5);
    expect(result.current.presenceMembers).toBe(3);
  });

  it('should handle rerender if the room instance changes', async () => {
    const { result, rerender } = renderHook(() => useOccupancy());

    // check the initial state of the occupancy instance
    await waitForEventualHookValue(result, mockRoom.occupancy, (value) => value.occupancy);
    expect(result.current.occupancy).toBe(mockRoom.occupancy);

    // change the mock room instance
    updateMockRoom(makeRandomRoom({ options: { occupancy: {} } }));

    // re-render to trigger the useEffect
    rerender();

    // check that the occupancy instance is updated
    await waitForEventualHookValue(result, mockRoom.occupancy, (value) => value.occupancy);
  });

  it('should subscribe and unsubscribe to discontinuity events', async () => {
    const mockOff = vi.fn();
    const mockDiscontinuityListener = vi.fn();

    const mockOccupancy = {
      ...mockRoom.occupancy,
      callAllListeners: (arg: Ably.ErrorInfo) => {
        for (const listener of mockOccupancy.listeners) {
          listener(arg);
        }
      },
      listeners: new Set<DiscontinuityListener>(),
      onDiscontinuity: vi.fn().mockImplementation((listener: DiscontinuityListener) => {
        mockOccupancy.listeners.add(listener);
        return {
          off: () => {
            mockOccupancy.listeners.delete(listener);
            mockOff();
          },
        };
      }),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    };

    // update the mock room with the new occupancy object
    updateMockRoom({ ...mockRoom, occupancy: mockOccupancy });

    // render the hook with a discontinuity listener
    const { result, unmount } = renderHook(() => useOccupancy({ onDiscontinuity: mockDiscontinuityListener }));

    await waitForEventualHookValueToBeDefined(result, (value) => value.occupancy);

    // check that the listener was subscribed to the discontinuity events by triggering one
    const errorInfo = new Ably.ErrorInfo('test', 50000, 500);
    mockOccupancy.callAllListeners(errorInfo);
    expect(mockDiscontinuityListener).toHaveBeenCalledWith(errorInfo);

    // unmount the hook and verify that the listener was unsubscribed
    unmount();

    expect(mockOff).toHaveBeenCalled();
  });
});

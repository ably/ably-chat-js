import { ConnectionLifecycle, OccupancyListener, Room, RoomLifecycle } from '@ably/chat';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useOccupancy } from '../../../src/react/hooks/use-occupancy.ts';
import { makeRandomRoom } from '../../helper/room.ts';

let mockRoom: Room;

// apply mocks for the useChatConnection and useRoom hooks
vi.mock('../../../src/react/hooks/use-chat-connection.js', () => ({
  useChatConnection: () => ({ currentStatus: ConnectionLifecycle.Connected }),
}));

vi.mock('../../../src/react/hooks/use-room.js', () => ({
  useRoom: () => ({ room: mockRoom, roomStatus: RoomLifecycle.Attached }),
}));

vi.mock('ably');

describe('useOccupancy', () => {
  beforeEach(() => {
    // create a new mock room before each test, enabling occupancy
    vi.resetAllMocks();
    mockRoom = makeRandomRoom({ options: { occupancy: true } });
  });

  it('should provide the occupancy instance, associated metrics, and chat status response metrics', () => {
    const { result } = renderHook(() => useOccupancy());

    // check that the occupancy instance and metrics are correctly provided
    expect(result.current.occupancy).toBe(mockRoom.occupancy);
    expect(result.current.connections).toBe(0);
    expect(result.current.presenceMembers).toBe(0);

    // check connection and room metrics are correctly provided
    expect(result.current.roomStatus).toBe(RoomLifecycle.Attached);
    expect(result.current.roomError).toBeUndefined();
    expect(result.current.connectionStatus).toEqual(ConnectionLifecycle.Connected);
    expect(result.current.connectionError).toBeUndefined();
  });

  it('should correctly subscribe and unsubscribe to occupancy events', () => {
    // mock listener and associated unsubscribe function
    const mockListener = vi.fn();
    const mockUnsubscribe = vi.fn();

    const mockOccupancy = {
      ...mockRoom.occupancy,
      subscribe: vi.fn().mockReturnValue({ unsubscribe: mockUnsubscribe }),
    };

    // update the mock room with the new occupancy object
    mockRoom = { ...mockRoom, occupancy: mockOccupancy };

    const { unmount } = renderHook(() => useOccupancy({ listener: mockListener }));

    // verify that subscribe was called with the mock listener on mount
    expect(mockOccupancy.subscribe).toHaveBeenCalledWith(mockListener);

    // unmount the hook and verify that unsubscribe was called
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('should update the occupancy metrics on new occupancy events', () => {
    let subscribedListener: OccupancyListener;

    // spy on the subscribe method of the occupancy instance
    vi.spyOn(mockRoom.occupancy, 'subscribe').mockImplementation((listener) => {
      subscribedListener = listener;
      return { unsubscribe: vi.fn() };
    });

    // render the hook and check the initial state of the occupancy metrics
    const { result } = renderHook(() => useOccupancy());

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

  it('should handle rerender if the room instance changes', () => {
    const { result, rerender } = renderHook(() => useOccupancy());

    // check the initial state of the occupancy instance
    expect(result.current.occupancy).toBe(mockRoom.occupancy);

    // change the mock room instance
    mockRoom = makeRandomRoom({ options: { occupancy: true } });

    // re-render to trigger the useEffect
    rerender();

    // check that the occupancy instance is updated
    expect(result.current.occupancy).toBe(mockRoom.occupancy);
  });

  it('should subscribe and unsubscribe to discontinuity events', () => {
    const mockOff = vi.fn();
    const mockDiscontinuityListener = vi.fn();

    // spy on the onDiscontinuity method of the occupancy instance
    vi.spyOn(mockRoom.occupancy, 'onDiscontinuity').mockReturnValue({ off: mockOff });

    // render the hook with a discontinuity listener
    const { unmount } = renderHook(() => useOccupancy({ onDiscontinuity: mockDiscontinuityListener }));

    // check that the listener was subscribed to the discontinuity events
    expect(mockRoom.occupancy.onDiscontinuity).toHaveBeenCalledWith(mockDiscontinuityListener);

    // unmount the hook and verify that the listener was unsubscribed
    unmount();

    expect(mockOff).toHaveBeenCalled();
  });
});

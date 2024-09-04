import { ConnectionLifecycle, Room, RoomLifecycle } from '@ably/chat';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRoomReactions } from '../../../src/react/hooks/use-room-reactions.ts';
import { makeTestLogger } from '../../helper/logger.ts';
import { makeRandomRoom } from '../../helper/room.ts';

let mockRoom: Room;

// apply mocks for the useChatConnection and useRoom hooks
vi.mock('../../../src/react/hooks/use-chat-connection.js', () => ({
  useChatConnection: () => ({ currentStatus: ConnectionLifecycle.Connected }),
}));

vi.mock('../../../src/react/hooks/use-room.js', () => ({
  useRoom: () => ({ room: mockRoom, roomStatus: RoomLifecycle.Attached }),
}));

vi.mock('../../../src/react/hooks/use-logger.js', () => ({
  useLogger: () => makeTestLogger(),
}));

vi.mock('ably');

describe('useRoomReactions', () => {
  beforeEach(() => {
    // create a new mock room before each test
    vi.resetAllMocks();
    mockRoom = makeRandomRoom({ options: { reactions: true } });
  });

  it('should provide the room reactions instance and correct chat status response metrics', () => {
    const { result } = renderHook(() => useRoomReactions());

    // check that the room reactions instance is correctly provided
    expect(result.current.reactions).toBe(mockRoom.reactions);

    // check connection and room metrics are correctly provided
    expect(result.current.roomStatus).toBe(RoomLifecycle.Attached);
    expect(result.current.roomError).toBeUndefined();
    expect(result.current.connectionStatus).toEqual(ConnectionLifecycle.Connected);
    expect(result.current.connectionError).toBeUndefined();
  });

  it('should correctly call the room reactions send method', async () => {
    const { result } = renderHook(() => useRoomReactions());

    // spy on the send method of the room reactions instance
    const sendSpy = vi.spyOn(mockRoom.reactions, 'send');

    // call the send method with a 'like' reaction
    await act(async () => {
      await result.current.send({ type: 'like' });
    });

    // verify that the send method was called with the correct arguments
    expect(sendSpy).toHaveBeenCalledWith({ type: 'like' });
  });

  it('should correctly subscribe and unsubscribe to reactions', () => {
    // mock listener and associated unsubscribe function
    const mockListener = vi.fn();
    const mockUnsubscribe = vi.fn();

    const mockReactions = {
      ...mockRoom.reactions,
      subscribe: vi.fn().mockReturnValue({ unsubscribe: mockUnsubscribe }),
    };

    // update the mock room with the new reactions object
    mockRoom = { ...mockRoom, reactions: mockReactions };

    const { unmount } = renderHook(() => useRoomReactions({ listener: mockListener }));

    // verify that subscribe was called with the mock listener on mount
    expect(mockReactions.subscribe).toHaveBeenCalledWith(mockListener);

    // unmount the hook and verify that unsubscribe was called
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('should handle rerender if the room instance changes', () => {
    const { result, rerender } = renderHook(() => useRoomReactions());

    // check the initial state of the reactions object
    expect(result.current.reactions).toBe(mockRoom.reactions);

    // change the mock room instance
    mockRoom = makeRandomRoom({ options: { reactions: true } });

    // re-render to trigger the useEffect
    rerender();

    // check that the room reactions instance is updated
    expect(result.current.reactions).toBe(mockRoom.reactions);
  });

  it('should subscribe and unsubscribe to discontinuity events', () => {
    const mockOff = vi.fn();
    const mockDiscontinuityListener = vi.fn();

    // spy on the onDiscontinuity method of the room reactions instance
    vi.spyOn(mockRoom.reactions, 'onDiscontinuity').mockReturnValue({ off: mockOff });

    // render the hook with a discontinuity listener
    const { unmount } = renderHook(() => useRoomReactions({ onDiscontinuity: mockDiscontinuityListener }));

    // check that the listener was subscribed to the discontinuity events
    expect(mockRoom.reactions.onDiscontinuity).toHaveBeenCalledWith(mockDiscontinuityListener);

    // unmount the hook and verify that the listener was unsubscribed
    unmount();

    expect(mockOff).toHaveBeenCalled();
  });
});

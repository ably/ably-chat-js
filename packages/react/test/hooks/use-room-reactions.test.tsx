import { act, cleanup, renderHook } from '@testing-library/react';
import * as Ably from 'ably';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectionStatus } from '../../../core/src/connection.ts';
import { DiscontinuityListener } from '../../../core/src/discontinuity.ts';
import { Room } from '../../../core/src/room.ts';
import { RoomReactionListener } from '../../../core/src/room-reactions.ts';
import { RoomStatus } from '../../../core/src/room-status.ts';
import { useRoomReactions } from '../../src/hooks/use-room-reactions.ts';
import { makeTestLogger } from '../../../shared/testhelper/logger.ts';
import { makeRandomRoom } from '../../../shared/testhelper/room.ts';
import { waitForEventualHookValue, waitForEventualHookValueToBeDefined } from '../../../shared/testhelper/wait-for-eventual-hook.ts';

let mockRoom: Room;
let mockLogger: ReturnType<typeof makeTestLogger>;
let mockRoomContext: { room: Promise<Room> };

// apply mocks for the useChatConnection and useRoom hooks
vi.mock('../../src/hooks/use-chat-connection.js', () => ({
  useChatConnection: () => ({ currentStatus: ConnectionStatus.Connected }),
}));

vi.mock('../../src/helper/use-room-context.js', () => ({
  useRoomContext: () => {
    mockLogger.debug('useRoomContext() called;');
    return mockRoomContext;
  },
}));

vi.mock('../../src/helper/use-room-status.js', () => ({
  useRoomStatus: () => ({ status: RoomStatus.Attached }),
}));

vi.mock('../../src/hooks/use-logger.js', () => ({
  useLogger: () => mockLogger,
}));

vi.mock('ably');

const updateMockRoom = (room: Room) => {
  mockRoom = room;
  mockRoomContext = { room: Promise.resolve(mockRoom) };
};

describe('useRoomReactions', () => {
  beforeEach(() => {
    // create a new mock room before each test
    vi.resetAllMocks();
    mockLogger = makeTestLogger();
    updateMockRoom(makeRandomRoom({ options: { reactions: {} } }));
  });

  afterEach(() => {
    cleanup();
  });

  it('should provide the room reactions instance and correct chat status response metrics', async () => {
    const { result } = renderHook(() => useRoomReactions());

    // check that the room reactions instance is correctly provided - eventually
    await vi.waitFor(() => {
      expect(result.current.reactions).toBe(mockRoom.reactions);
    });

    // check connection and room metrics are correctly provided
    expect(result.current.roomStatus).toBe(RoomStatus.Attached);
    expect(result.current.roomError).toBeUndefined();
    expect(result.current.connectionStatus).toEqual(ConnectionStatus.Connected);
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

  it('should correctly subscribe and unsubscribe to reactions', async () => {
    // mock listener and associated unsubscribe function
    const mockListener = vi.fn();
    const mockUnsubscribe = vi.fn();

    const mockReactions = {
      ...mockRoom.reactions,
      listeners: new Set<RoomReactionListener>(),
      subscribe: vi.fn().mockImplementation((listener: RoomReactionListener) => {
        mockReactions.listeners.add(listener);
        return {
          unsubscribe: () => {
            mockReactions.listeners.delete(listener);
            mockUnsubscribe();
          },
        };
      }),
      onDiscontinuity: vi.fn().mockReturnValue({ off: vi.fn() }),
    };

    // update the mock room with the new reactions object
    updateMockRoom({ ...mockRoom, reactions: mockReactions });

    const { result, unmount } = renderHook(() => useRoomReactions({ listener: mockListener }));
    await waitForEventualHookValueToBeDefined(result, (value) => value.reactions);

    // verify that subscribe was called with the mock listener on mount by triggering a reaction event
    const reaction = {
      type: 'like',
      user: { id: 'user1' },
      metadata: { test: 'data' },
      headers: {},
      createdAt: new Date(),
      clientId: 'client1',
      isSelf: false,
    };
    for (const listener of mockReactions.listeners) {
      listener(reaction);
    }
    expect(mockListener).toHaveBeenCalledWith(reaction);

    // unmount the hook and verify that unsubscribe was called
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('should handle rerender if the room instance changes', async () => {
    const { result, rerender } = renderHook(() => useRoomReactions());

    // check the initial state of the reactions object
    await waitForEventualHookValue(result, mockRoom.reactions, (value) => value.reactions);

    // change the mock room instance
    updateMockRoom(makeRandomRoom({ options: { reactions: {} } }));
    mockLogger.debug('rerendering with new room instance');

    // re-render to trigger the useEffect
    rerender();

    // check that the room reactions instance is updated
    await waitForEventualHookValue(result, mockRoom.reactions, (value) => value.reactions);
  });

  it('should subscribe and unsubscribe to discontinuity events', async () => {
    const mockOff = vi.fn();
    const mockDiscontinuityListener = vi.fn();

    // spy on the onDiscontinuity method of the room reactions instance
    let discontinuityListener: DiscontinuityListener | undefined;
    vi.spyOn(mockRoom.reactions, 'onDiscontinuity').mockImplementation((listener: DiscontinuityListener) => {
      discontinuityListener = listener;
      return { off: mockOff };
    });

    // render the hook with a discontinuity listener
    const { result, unmount } = renderHook(() => useRoomReactions({ onDiscontinuity: mockDiscontinuityListener }));
    await waitForEventualHookValueToBeDefined(result, (value) => value.reactions);

    // check that the listener was subscribed to the discontinuity events by triggering one
    const errorInfo = new Ably.ErrorInfo('test', 50000, 500);
    expect(discontinuityListener).toBeDefined();
    discontinuityListener?.(errorInfo);
    expect(mockDiscontinuityListener).toHaveBeenCalledWith(errorInfo);

    // unmount the hook and verify that the listener was unsubscribed
    unmount();

    expect(mockOff).toHaveBeenCalled();
  });
});

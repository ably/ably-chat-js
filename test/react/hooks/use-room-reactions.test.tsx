import { act, cleanup, renderHook } from '@testing-library/react';
import * as Ably from 'ably';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectionStatus } from '../../../src/core/connection.js';
import { DiscontinuityListener } from '../../../src/core/discontinuity.ts';
import { RoomReactionEventType } from '../../../src/core/events.js';
import { Room } from '../../../src/core/room.js';
import { RoomReactionListener } from '../../../src/core/room-reactions.js';
import { RoomStatus } from '../../../src/core/room-status.js';
import { useRoomReactions, UseRoomReactionsParams } from '../../../src/react/hooks/use-room-reactions.js';
import { makeTestLogger } from '../../helper/logger.js';
import { makeRandomRoom } from '../../helper/room.js';

let mockRoom: Room;
let mockLogger: ReturnType<typeof makeTestLogger>;
let mockRoomContext: { room: Promise<Room> };

// apply mocks for the useChatConnection and useRoom hooks
vi.mock('../../../src/react/hooks/use-chat-connection.js', () => ({
  useChatConnection: () => ({ currentStatus: ConnectionStatus.Connected }),
}));

vi.mock('../../../src/react/helper/use-room-context.js', () => ({
  useRoomContext: () => {
    mockLogger.debug('useRoomContext() called;');
    return mockRoomContext;
  },
}));

vi.mock('../../../src/react/helper/use-room-status.js', () => ({
  useRoomStatus: () => ({ status: RoomStatus.Attached }),
}));

vi.mock('../../../src/react/hooks/use-logger.js', () => ({
  useRoomLogger: () => mockLogger,
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
    updateMockRoom(makeRandomRoom());
  });

  afterEach(() => {
    cleanup();
  });

  it('should provide the room reactions instance and correct chat status response metrics', () => {
    const { result } = renderHook(() => useRoomReactions());

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
      await result.current.sendRoomReaction({ name: 'like' });
    });

    // verify that the send method was called with the correct arguments
    expect(sendSpy).toHaveBeenCalledWith({ name: 'like' });
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

    const { unmount } = renderHook(() => useRoomReactions({ listener: mockListener }));

    // verify that subscribe was called with the mock listener on mount by triggering a reaction event
    await vi.waitFor(() => {
      const reaction = {
        name: 'like',
        user: { id: 'user1' },
        metadata: { test: 'data' },
        headers: {},
        createdAt: new Date(),
        clientId: 'client1',
        isSelf: false,
      };
      for (const listener of mockReactions.listeners) {
        listener({
          type: RoomReactionEventType.Reaction,
          reaction,
        });
      }
      expect(mockListener).toHaveBeenCalledWith({
        type: RoomReactionEventType.Reaction,
        reaction,
      });
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

    const { rerender } = renderHook((props: UseRoomReactionsParams) => useRoomReactions(props), {
      initialProps: {
        onDiscontinuity: vi.fn(),
      },
    });

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

  it('should subscribe and unsubscribe to discontinuity events', async () => {
    const mockOff = vi.fn();
    const mockDiscontinuityListener = vi.fn();

    // spy on the onDiscontinuity method of the room reactions instance
    let discontinuityListener: DiscontinuityListener | undefined;
    vi.spyOn(mockRoom, 'onDiscontinuity').mockImplementation((listener: DiscontinuityListener) => {
      discontinuityListener = listener;
      return { off: mockOff };
    });

    // render the hook with a discontinuity listener
    const { unmount } = renderHook(() => useRoomReactions({ onDiscontinuity: mockDiscontinuityListener }));

    // check that the listener was subscribed to the discontinuity events by triggering one
    await vi.waitFor(() => {
      const errorInfo = new Ably.ErrorInfo('test', 50000, 500);
      expect(discontinuityListener).toBeDefined();
      discontinuityListener?.(errorInfo);
      expect(mockDiscontinuityListener).toHaveBeenCalledWith(errorInfo);
    });

    // unmount the hook and verify that the listener was unsubscribed
    unmount();

    expect(mockOff).toHaveBeenCalled();
  });
});

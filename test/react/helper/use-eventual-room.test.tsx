import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Logger } from '../../../src/core/logger.ts';
import { Room } from '../../../src/core/room.ts';
import { useEventualRoom, useEventualRoomProperty } from '../../../src/react/helper/use-eventual-room.ts';
import { makeTestLogger } from '../../helper/logger.ts';
import { makeRandomRoom } from '../../helper/room.ts';

let mockRoom: Room;
let mockRoomContext: { room: Promise<Room> };
let mockLogger: Logger;

vi.mock('../../../src/react/helper/use-room-context.js', () => ({
  useRoomContext: () => mockRoomContext,
}));

vi.mock('../../../src/react/hooks/use-logger.js', () => ({
  useRoomLogger: () => mockLogger,
}));

vi.mock('ably');

const updateMockRoom = (newRoom: Room) => {
  mockRoom = newRoom;
  mockRoomContext = { room: Promise.resolve(newRoom) };
};

describe('eventual rooms', () => {
  beforeEach(() => {
    mockLogger = makeTestLogger();
    updateMockRoom(makeRandomRoom());
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  describe('useEventualRoom', () => {
    it('returns the room', async () => {
      const { result } = renderHook(() => useEventualRoom());

      // We should start with the room being undefined
      expect(result.current).toBeUndefined();

      // Eventually, the room should resolve
      await vi.waitFor(() => {
        expect(result.current).toBe(mockRoom);
      });
    });

    it('updates the room', async () => {
      const { result, rerender } = renderHook(() => useEventualRoom());

      // We should start with the room being undefined
      expect(result.current).toBeUndefined();

      // Eventually, the room should resolve
      await vi.waitFor(() => {
        expect(result.current).toBe(mockRoom);
      });

      // Now update the room and re-render
      const newRoom = makeRandomRoom();
      updateMockRoom(newRoom);

      rerender();

      // Eventually, the room should resolve
      await vi.waitFor(() => {
        expect(result.current).toBe(newRoom);
      });
    });

    it('does not update state if unmounted before room resolves', () => {
      // Create a promise that we can control when it resolves
      let resolveRoom: (value: Room | PromiseLike<Room>) => void = () => {};
      const roomPromise = new Promise<Room>((resolve) => {
        resolveRoom = resolve;
      });
      mockRoomContext = { room: roomPromise };

      const { result, unmount } = renderHook(() => useEventualRoom());

      // We should start with the room being undefined
      expect(result.current).toBeUndefined();

      // Unmount before resolving the room
      unmount();

      // Now resolve the room
      resolveRoom(mockRoom);

      // Wait a bit to ensure no state updates happen
      vi.advanceTimersByTime(100);

      // The result should still be undefined since we unmounted
      expect(result.current).toBeUndefined();
    });
  });

  describe('useEventualRoomProperty', () => {
    it('returns the room property', async () => {
      const { result } = renderHook(() => useEventualRoomProperty(() => mockRoom.messages));

      // We should start with the room being undefined
      expect(result.current).toBeUndefined();

      // Eventually, the room should resolve
      await vi.waitFor(() => {
        expect(result.current).toBe(mockRoom.messages);
      });
    });

    it('updates the room property', async () => {
      const { result, rerender } = renderHook(() => useEventualRoomProperty(() => mockRoom.messages));

      // We should start with the room being undefined
      expect(result.current).toBeUndefined();

      // Eventually, the room should resolve
      await vi.waitFor(() => {
        expect(result.current).toBe(mockRoom.messages);
      });

      // Now update the room and re-render
      const newRoom = makeRandomRoom();
      updateMockRoom(newRoom);

      rerender();

      // Eventually, the room should resolve
      await vi.waitFor(() => {
        expect(result.current).toBe(newRoom.messages);
      });
    });

    it('does not update state if unmounted before room resolves', () => {
      // Create a promise that we can control when it resolves
      let resolveRoom: (value: Room | PromiseLike<Room>) => void = () => {};
      const roomPromise = new Promise<Room>((resolve) => {
        resolveRoom = resolve;
      });
      mockRoomContext = { room: roomPromise };

      const { result, unmount } = renderHook(() => useEventualRoomProperty(() => mockRoom.messages));

      // We should start with the room being undefined
      expect(result.current).toBeUndefined();

      // Unmount before resolving the room
      unmount();

      // Now resolve the room
      resolveRoom(mockRoom);

      // Wait a bit to ensure no state updates happen
      vi.advanceTimersByTime(100);

      // The result should still be undefined since we unmounted
      expect(result.current).toBeUndefined();
    });
  });
});

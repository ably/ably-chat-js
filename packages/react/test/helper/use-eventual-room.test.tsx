import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Logger } from '../../../core/src/logger.ts';
import { Room } from '../../../core/src/room.ts';
import { RoomOptionsDefaults } from '../../../core/src/room-options.ts';
import { useEventualRoom, useEventualRoomProperty } from '../../src/helper/use-eventual-room.ts';
import { makeTestLogger } from '../../shared/testhelper/logger.ts';
import { makeRandomRoom } from '../../shared/testhelper/room.ts';

let mockRoom: Room;
let mockRoomContext: { room: Promise<Room> };
let mockLogger: Logger;

vi.mock('../../src/helper/use-room-context.js', () => ({
  useRoomContext: () => mockRoomContext,
}));

vi.mock('../../src/hooks/use-logger.js', () => ({
  useLogger: () => mockLogger,
}));

vi.mock('ably');

const updateMockRoom = (newRoom: Room) => {
  mockRoom = newRoom;
  mockRoomContext = { room: Promise.resolve(newRoom) };
};

describe('eventual rooms', () => {
  beforeEach(() => {
    mockLogger = makeTestLogger();
    updateMockRoom(makeRandomRoom({ options: RoomOptionsDefaults }));
  });

  afterEach(() => {
    cleanup();
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
      const newRoom = makeRandomRoom({ options: RoomOptionsDefaults });
      updateMockRoom(newRoom);

      rerender();

      // Eventually, the room should resolve
      await vi.waitFor(() => {
        expect(result.current).toBe(newRoom);
      });
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
      const newRoom = makeRandomRoom({ options: RoomOptionsDefaults });
      updateMockRoom(newRoom);

      rerender();

      // Eventually, the room should resolve
      await vi.waitFor(() => {
        expect(result.current).toBe(newRoom.messages);
      });
    });
  });
});

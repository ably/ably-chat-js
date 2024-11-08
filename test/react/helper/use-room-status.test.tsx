import { Logger, Room, RoomOptionsDefaults, RoomStatus, RoomStatusChange } from '@ably/chat';
import { cleanup, renderHook } from '@testing-library/react';
import * as Ably from 'ably';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InternalRoomLifecycle } from '../../../src/core/room-status.ts';
import { useRoomStatus } from '../../../src/react/helper/use-room-status.ts';
import { makeTestLogger } from '../../helper/logger.ts';
import { makeRandomRoom } from '../../helper/room.ts';
import { waitForEventualHookValue } from '../../helper/wait-for-eventual-hook.ts';

let mockRoom: Room;
let mockRoomContext: { room: Promise<Room> };
let mockLogger: Logger;

vi.mock('../../../src/react/helper/use-room-context.js', () => ({
  useRoomContext: () => mockRoomContext,
}));

vi.mock('../../../src/react/hooks/use-logger.js', () => ({
  useLogger: () => mockLogger,
}));

vi.mock('ably');

const updateMockRoom = (newRoom: Room) => {
  mockRoom = newRoom;
  mockRoomContext = { room: Promise.resolve(newRoom) };
};

describe('useRoomStatus', () => {
  beforeEach(() => {
    mockLogger = makeTestLogger();
    updateMockRoom(makeRandomRoom({ options: RoomOptionsDefaults }));
  });

  afterEach(() => {
    cleanup();
  });

  it('sets instantaneous room state values', () => {
    const { result } = renderHook(() => useRoomStatus());

    // We should have initialized and no error
    expect(result.current.status).toBe(RoomStatus.Initializing);
    expect(result.current.error).toBeUndefined();
  });

  it('sets room status values after useEffect', async () => {
    // Before we render the hook, lets update the mock room to have a status and an error
    const error = new Ably.ErrorInfo('test', 50000, 500);
    (mockRoom as unknown as { _lifecycle: InternalRoomLifecycle })._lifecycle.setStatus({
      status: RoomStatus.Failed,
      error,
    });

    // Render the hook
    const { result } = renderHook(() => useRoomStatus());
    expect(result.current.status).toBe(RoomStatus.Initializing);
    expect(result.current.error).toBeUndefined();

    // Now wait until the hook has updated the status and error
    await waitForEventualHookValue(result, RoomStatus.Failed, (value) => value.status);
    await waitForEventualHookValue(result, error, (value) => value.error);
  });

  it('subscribes to changing room status', async () => {
    // Before we render the hook, lets update the mock room to have a status and an error
    const error = new Ably.ErrorInfo('test', 50000, 500);
    (mockRoom as unknown as { _lifecycle: InternalRoomLifecycle })._lifecycle.setStatus({
      status: RoomStatus.Failed,
      error,
    });

    // Render the hook
    const { result } = renderHook(() => useRoomStatus());
    expect(result.current.status).toBe(RoomStatus.Initializing);
    expect(result.current.error).toBeUndefined();

    // Now wait until the hook has updated the status and error
    await waitForEventualHookValue(result, RoomStatus.Failed, (value) => value.status);
    await waitForEventualHookValue(result, error, (value) => value.error);

    // Now update the status and error again
    const newError = new Ably.ErrorInfo('test', 50001, 500);
    (mockRoom as unknown as { _lifecycle: InternalRoomLifecycle })._lifecycle.setStatus({
      status: RoomStatus.Detached,
      error: newError,
    });

    // Now wait until the hook has updated the status and error
    await waitForEventualHookValue(result, RoomStatus.Detached, (value) => value.status);
    await waitForEventualHookValue(result, newError, (value) => value.error);
  });

  it('subscribes user-provided listeners to changing room status', async () => {
    const receivedEvents: RoomStatusChange[] = [];

    // Before we render the hook, lets update the mock room to have a status and an error
    const error = new Ably.ErrorInfo('test', 50000, 500);
    (mockRoom as unknown as { _lifecycle: InternalRoomLifecycle })._lifecycle.setStatus({
      status: RoomStatus.Failed,
      error,
    });

    // Render the hook
    const { unmount } = renderHook(() =>
      useRoomStatus({
        onRoomStatusChange: (change) => {
          receivedEvents.push(change);
        },
      }),
    );

    // Wait until we have an event
    await vi.waitFor(() => {
      expect(receivedEvents).toHaveLength(1);
    });

    // At this point we should have two listeners on the room status
    expect((mockRoom as unknown as { _lifecycle: { listeners(): unknown[] } })._lifecycle.listeners()).toHaveLength(2);

    // Check the event
    expect(receivedEvents[0]?.current).toBe(RoomStatus.Failed);
    expect(receivedEvents[0]?.previous).toBe(RoomStatus.Initializing);
    expect(receivedEvents[0]?.error).toBe(error);

    // Now do another status change
    const newError = new Ably.ErrorInfo('test', 50001, 500);
    (mockRoom as unknown as { _lifecycle: InternalRoomLifecycle })._lifecycle.setStatus({
      status: RoomStatus.Detached,
      error: newError,
    });

    // Wait until we have another event
    await vi.waitFor(() => {
      expect(receivedEvents).toHaveLength(2);
    });

    // Check the event
    expect(receivedEvents[1]?.current).toBe(RoomStatus.Detached);
    expect(receivedEvents[1]?.previous).toBe(RoomStatus.Failed);
    expect(receivedEvents[1]?.error).toBe(newError);

    // After unmount we should have no listeners
    unmount();
    expect((mockRoom as unknown as { _lifecycle: { listeners(): unknown[] } })._lifecycle.listeners()).toBeNull();
  });
});

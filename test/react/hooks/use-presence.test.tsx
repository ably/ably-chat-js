import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import * as Ably from 'ably';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectionStatus } from '../../../src/core/connection.ts';
import { DiscontinuityListener } from '../../../src/core/discontinuity.ts';
import { Room } from '../../../src/core/room.ts';
import { InternalRoomLifecycle, RoomStatus } from '../../../src/core/room-status.ts';
import { usePresence } from '../../../src/react/hooks/use-presence.ts';
import { makeTestLogger } from '../../helper/logger.ts';
import { makeRandomRoom } from '../../helper/room.ts';
import { waitForEventualHookValue } from '../../helper/wait-for-eventual-hook.ts';

let mockRoom: Room;
let mockRoomContext: { room: Promise<Room> };
let mockCurrentConnectionStatus: ConnectionStatus;
let mockCurrentRoomStatus: RoomStatus;
let mockConnectionError: Ably.ErrorInfo;
let mockRoomError: Ably.ErrorInfo;
let mockLogger: ReturnType<typeof makeTestLogger>;

// apply mocks for the useChatConnection and useRoom hooks
vi.mock('../../../src/react/hooks/use-chat-connection.js', () => ({
  useChatConnection: () => ({
    currentStatus: mockCurrentConnectionStatus,
    error: mockConnectionError,
  }),
}));

vi.mock('../../../src/react/helper/use-room-context.js', () => ({
  useRoomContext: () => mockRoomContext,
}));

vi.mock('../../../src/react/helper/use-room-status.js', () => ({
  useRoomStatus: () => ({ status: mockCurrentRoomStatus, error: mockRoomError }),
}));

vi.mock('../../../src/react/hooks/use-logger.js', () => ({
  useRoomLogger: () => mockLogger,
}));

vi.mock('ably');

const updateMockRoom = (newRoom: Room) => {
  mockRoom = newRoom;
  (mockRoom as unknown as { _lifecycle: InternalRoomLifecycle })._lifecycle.setStatus({ status: RoomStatus.Attached });
  mockRoomContext = { room: Promise.resolve(newRoom) };
  vi.spyOn(mockRoom.channel, 'state', 'get').mockReturnValue('attached');
};

describe('usePresence', () => {
  beforeEach(() => {
    // create a new mock room before each test, enabling presence
    vi.resetAllMocks();
    mockLogger = makeTestLogger();
    mockCurrentConnectionStatus = ConnectionStatus.Connected;
    mockCurrentRoomStatus = RoomStatus.Attached;
    updateMockRoom(makeRandomRoom());
  });

  afterEach(() => {
    cleanup();
  });

  it('should provide the presence instance and chat status response metrics', async () => {
    // set the connection and room errors to check that they are correctly provided
    mockConnectionError = new Ably.ErrorInfo('test error', 40000, 400);
    mockRoomError = new Ably.ErrorInfo('test error', 40000, 400);

    const { result } = renderHook(() => usePresence());

    // check that the presence instance and metrics are correctly provided
    await waitForEventualHookValue(result, mockRoom.presence, (value) => value.presence);
    expect(result.current.myPresenceState.present).toBe(true);
    expect(result.current.myPresenceState.error).toBeUndefined();

    // check connection and room metrics are correctly provided
    expect(result.current.roomStatus).toBe(RoomStatus.Attached);
    expect(result.current.roomError).toBeErrorInfo({ message: 'test error' });
    expect(result.current.connectionStatus).toEqual(ConnectionStatus.Connected);
    expect(result.current.connectionError).toBeErrorInfo({ message: 'test error' });
  });

  it('should handle rerender if the room instance changes', async () => {
    vi.spyOn(mockRoom.presence, 'enter');

    const { result, rerender } = renderHook(() => usePresence({ enterWithData: { test: 'data' } }));

    // ensure we have entered presence
    await waitFor(() => {
      expect(mockRoom.presence.enter).toHaveBeenCalledWith({ test: 'data' });
    });

    await waitFor(() => result.current.myPresenceState.present);

    // check the initial state of the presence instance
    expect(result.current.presence).toBe(mockRoom.presence);
    expect(result.current.myPresenceState.present).toBe(true);

    // change the mock room instance
    updateMockRoom(makeRandomRoom());

    vi.spyOn(mockRoom.presence, 'enter');

    // re-render to trigger entering presence on the new room instance
    rerender();

    // ensure we have entered presence on the new room instance
    await waitFor(() => {
      expect(mockRoom.presence.enter).toHaveBeenCalledWith({ test: 'data' });
    });
    await waitFor(() => result.current.myPresenceState.present);
    expect(result.current.myPresenceState.present).toBe(true);

    // check that the presence instance is updated
    expect(result.current.presence).toBe(mockRoom.presence);
  });

  it('should correctly enter presence on render and leave on unmount', async () => {
    // spy on the update method of the presence instance
    const enterSpy = vi.spyOn(mockRoom.presence, 'enter');
    const leaveSpy = vi.spyOn(mockRoom.presence, 'leave');

    const { result, unmount } = renderHook(() =>
      usePresence({
        enterWithData: { test: 'enter' },
        leaveWithData: { test: 'leave' },
      }),
    );

    await waitFor(() => result.current.myPresenceState.present, { timeout: 500 });

    // verify that the update method was called
    expect(enterSpy).toHaveBeenCalledWith({ test: 'enter' });

    // unmount the hook
    unmount();

    // verify that the leave method was called
    expect(leaveSpy).toHaveBeenCalledWith({ test: 'leave' });
  });

  it('should correctly call the update method', async () => {
    // spy on the update method of the presence instance
    const updateSpy = vi.spyOn(mockRoom.presence, 'update');

    const { result } = renderHook(() => usePresence({ enterWithData: { test: 'data' } }));

    // call the update method
    await act(async () => {
      await result.current.update({ test: 'data' });
    });

    // verify that the update method was called
    expect(updateSpy).toHaveBeenCalled();

    expect(result.current.myPresenceState.present).toBe(true);
  });

  it('should correctly handle enter errors', async () => {
    // Create an error to be emitted
    const errorInfo = new Ably.ErrorInfo('enter error', 40000, 400);

    // Mock enter to reject with the error
    vi.spyOn(mockRoom.presence, 'enter').mockRejectedValue(errorInfo);

    const { result } = renderHook(() => usePresence({ enterWithData: { test: 'data' } }));

    // Verify the enter method was called
    await waitFor(() => {
      expect(mockRoom.presence.enter).toHaveBeenCalled();
    });

    // Verify the presence state is false (not present)
    expect(result.current.myPresenceState.present).toBe(false);
  });

  describe.each([[ConnectionStatus.Failed], [ConnectionStatus.Suspended]])(
    'invalid connection state for joining presence',
    (connectionState: ConnectionStatus) => {
      it('should not join presence if connection state is: ' + connectionState, () => {
        // change the connection status, so we render the hook with the new status
        mockCurrentConnectionStatus = connectionState;

        // spy on the enter method of the presence instance to check if it is called
        vi.spyOn(mockRoom.presence, 'enter');
        renderHook(() => usePresence({ enterWithData: { test: 'data' } }));

        // ensure we have not entered presence
        expect(mockRoom.presence.enter).not.toHaveBeenCalled();
      });
    },
  );

  it('should not join presence if the room is not attached', () => {
    vi.spyOn(mockRoom.presence, 'enter');
    // check we do not enter presence if the room is not attached
    for (const status of [
      RoomStatus.Detaching,
      RoomStatus.Detached,
      RoomStatus.Suspended,
      RoomStatus.Failed,
      RoomStatus.Releasing,
      RoomStatus.Released,
    ]) {
      // change the room status, so we render the hook with the new status
      mockCurrentRoomStatus = status;

      renderHook(() => usePresence({ enterWithData: { test: 'data' } }));
      // ensure we have not entered presence
      expect(mockRoom.presence.enter).not.toHaveBeenCalled();
    }
  });

  it('should subscribe and unsubscribe to discontinuity events', async () => {
    const mockOff = vi.fn();
    const mockDiscontinuityListener = vi.fn();

    // spy on the onDiscontinuity method of the presence instance
    let discontinuityListener: DiscontinuityListener | undefined;
    vi.spyOn(mockRoom, 'onDiscontinuity').mockImplementation((listener: DiscontinuityListener) => {
      discontinuityListener = listener;
      return { off: mockOff };
    });

    // render the hook with a discontinuity listener
    const { unmount } = renderHook(() => usePresence({ onDiscontinuity: mockDiscontinuityListener }));

    // check that the listener was subscribed to the discontinuity events by triggering the listener
    const errorInfo = new Ably.ErrorInfo('test', 50000, 500);
    await waitFor(() => {
      expect(discontinuityListener).toBeDefined();
    });
    discontinuityListener?.(errorInfo);
    expect(mockDiscontinuityListener).toHaveBeenCalledWith(errorInfo);

    // unmount the hook and verify that the listener was unsubscribed
    unmount();

    expect(mockOff).toHaveBeenCalled();
  });

  it('should handle presence state changes', async () => {
    // Mock enter to resolve
    vi.spyOn(mockRoom.presence, 'enter').mockResolvedValue();

    const { result } = renderHook(() => usePresence());

    // Verify that the initial presence state is false
    expect(result.current.myPresenceState.present).toBe(false);

    // Verify that the update method works
    await act(async () => {
      await result.current.update();
    });

    // Verify that the presence state is true after update
    expect(result.current.myPresenceState.present).toBe(true);
  });

  describe('autoEnterLeave behavior', () => {
    it('should automatically enter and leave when autoEnterLeave is true (default)', async () => {
      const enterSpy = vi.spyOn(mockRoom.presence, 'enter');
      const leaveSpy = vi.spyOn(mockRoom.presence, 'leave');

      const { result, unmount } = renderHook(() =>
        usePresence({
          enterWithData: { test: 'enter' },
          leaveWithData: { test: 'leave' },
          autoEnterLeave: true,
        }),
      );

      // Verify enter is called automatically on mount
      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith({ test: 'enter' });
      });

      // Verify the hook provides access to enter and leave methods
      expect(typeof result.current.enter).toBe('function');
      expect(typeof result.current.leave).toBe('function');

      // Unmount and verify leave is called automatically
      unmount();
      expect(leaveSpy).toHaveBeenCalledWith({ test: 'leave' });
    });

    it('should automatically enter and leave when autoEnterLeave is not provided (defaults to true)', async () => {
      const enterSpy = vi.spyOn(mockRoom.presence, 'enter');
      const leaveSpy = vi.spyOn(mockRoom.presence, 'leave');

      const { unmount } = renderHook(() =>
        usePresence({
          enterWithData: { test: 'enter' },
          leaveWithData: { test: 'leave' },
        }),
      );

      // Verify enter is called automatically on mount (default behavior)
      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith({ test: 'enter' });
      });

      // Unmount and verify leave is called automatically
      unmount();
      expect(leaveSpy).toHaveBeenCalledWith({ test: 'leave' });
    });

    it('should NOT automatically enter and leave when autoEnterLeave is false', async () => {
      const enterSpy = vi.spyOn(mockRoom.presence, 'enter');
      const leaveSpy = vi.spyOn(mockRoom.presence, 'leave');

      const { unmount } = renderHook(() =>
        usePresence({
          enterWithData: { test: 'enter' },
          leaveWithData: { test: 'leave' },
          autoEnterLeave: false,
        }),
      );

      // Wait a bit to ensure enter is not called
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify enter is NOT called automatically on mount
      expect(enterSpy).not.toHaveBeenCalled();

      // Unmount and verify leave is NOT called automatically
      unmount();
      expect(leaveSpy).not.toHaveBeenCalled();
    });
  });

  describe('exposed enter and leave methods', () => {
    it('should correctly call the exposed enter method', async () => {
      const enterSpy = vi.spyOn(mockRoom.presence, 'enter');

      const { result } = renderHook(() =>
        usePresence({
          autoEnterLeave: false, // Disable auto behavior to test manual calls
        }),
      );

      // Call the exposed enter method
      await act(async () => {
        await result.current.enter({ manual: 'enter' });
      });

      // Verify that the enter method was called with correct data
      expect(enterSpy).toHaveBeenCalledWith({ manual: 'enter' });
    });

    it('should correctly call the exposed leave method', async () => {
      const leaveSpy = vi.spyOn(mockRoom.presence, 'leave');

      const { result } = renderHook(() =>
        usePresence({
          autoEnterLeave: false, // Disable auto behavior to test manual calls
        }),
      );

      // Call the exposed leave method
      await act(async () => {
        await result.current.leave({ manual: 'leave' });
      });

      // Verify that the leave method was called with correct data
      expect(leaveSpy).toHaveBeenCalledWith({ manual: 'leave' });
    });

    it('should allow manual enter/leave calls when autoEnterLeave is false', async () => {
      const enterSpy = vi.spyOn(mockRoom.presence, 'enter');
      const leaveSpy = vi.spyOn(mockRoom.presence, 'leave');

      const { result } = renderHook(() =>
        usePresence({
          autoEnterLeave: false,
        }),
      );

      // Verify auto enter didn't happen
      expect(enterSpy).not.toHaveBeenCalled();

      // Manually enter
      await act(async () => {
        await result.current.enter({ manual: 'entry' });
      });

      expect(enterSpy).toHaveBeenCalledWith({ manual: 'entry' });

      // Manually leave
      await act(async () => {
        await result.current.leave({ manual: 'exit' });
      });

      expect(leaveSpy).toHaveBeenCalledWith({ manual: 'exit' });
    });

    it('should allow manual enter/leave calls even when autoEnterLeave is true', async () => {
      const enterSpy = vi.spyOn(mockRoom.presence, 'enter');
      const leaveSpy = vi.spyOn(mockRoom.presence, 'leave');

      const { result } = renderHook(() =>
        usePresence({
          autoEnterLeave: true,
          enterWithData: { auto: 'enter' },
        }),
      );

      // Wait for auto enter to complete
      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith({ auto: 'enter' });
      });

      // Reset spy to test manual calls
      enterSpy.mockClear();
      leaveSpy.mockClear();

      // Manually enter with different data
      await act(async () => {
        await result.current.enter({ manual: 'override' });
      });

      expect(enterSpy).toHaveBeenCalledWith({ manual: 'override' });

      // Manually leave
      await act(async () => {
        await result.current.leave({ manual: 'goodbye' });
      });

      expect(leaveSpy).toHaveBeenCalledWith({ manual: 'goodbye' });
    });
  });
});

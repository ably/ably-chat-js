import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import * as Ably from 'ably';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectionStatus } from '../../../src/core/connection.ts';
import { DiscontinuityListener } from '../../../src/core/discontinuity.ts';
import { Room } from '../../../src/core/room.ts';
import { InternalRoomLifecycle, RoomStatus } from '../../../src/core/room-status.ts';
import { usePresence, UsePresenceParams } from '../../../src/react/hooks/use-presence.ts';
import { makeTestLogger } from '../../helper/logger.ts';
import { makeRandomRoom } from '../../helper/room.ts';

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

vi.mock('../../../src/react/hooks/internal/use-room-context.js', () => ({
  useRoomContext: () => mockRoomContext,
}));

vi.mock('../../../src/react/hooks/internal/use-room-status.js', () => ({
  useRoomStatus: () => ({ status: mockCurrentRoomStatus, error: mockRoomError }),
}));

vi.mock('../../../src/react/hooks/internal/use-logger.js', () => ({
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

  describe('Basic Functionality', () => {
    it('should handle hook with no initialData provided', async () => {
      const enterSpy = vi.spyOn(mockRoom.presence, 'enter');

      renderHook(() => usePresence());

      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith(undefined);
      });
    });

    it('should handle component re-mount scenario with data persistence within same room', async () => {
      const enterSpy = vi.spyOn(mockRoom.presence, 'enter');

      // First mount
      const { result: firstResult, unmount: firstUnmount } = renderHook(() =>
        usePresence({ initialData: { mount: 'first' } }),
      );

      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith({ mount: 'first' });
      });

      // Update data
      await act(async () => {
        await firstResult.current.update({ mount: 'first_updated' });
      });

      // Unmount first component
      firstUnmount();

      enterSpy.mockClear();

      // Second mount - should use initialData again since it's a new component instance
      renderHook(() => usePresence({ initialData: { mount: 'second' } }));

      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith({ mount: 'second' });
      });
    });

    it('should provide the presence instance and chat status response metrics', async () => {
      // set the connection and room errors to check that they are correctly provided
      mockConnectionError = new Ably.ErrorInfo('test error', 40000, 400);
      mockRoomError = new Ably.ErrorInfo('test error', 40000, 400);

      const { result } = renderHook(() => usePresence());

      await vi.waitFor(() => {
        // check that the presence instance and metrics are correctly provided
        expect(result.current.myPresenceState.present).toBe(true);
        expect(result.current.myPresenceState.error).toBeUndefined();

        // check connection and room metrics are correctly provided
        expect(result.current.roomStatus).toBe(RoomStatus.Attached);
        expect(result.current.roomError).toBeErrorInfo({ message: 'test error' });
        expect(result.current.connectionStatus).toEqual(ConnectionStatus.Connected);
        expect(result.current.connectionError).toBeErrorInfo({ message: 'test error' });
      });
    });

    it('should handle rerender if the room instance changes', async () => {
      vi.spyOn(mockRoom.presence, 'enter');

      const { result, rerender } = renderHook(() => usePresence({ initialData: { test: 'data' } }));

      // ensure we have entered presence
      await waitFor(() => {
        expect(mockRoom.presence.enter).toHaveBeenCalledWith({ test: 'data' });
      });

      await waitFor(() => result.current.myPresenceState.present);

      // check the initial state of the presence instance
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
    });
  });

  describe('error handling', () => {
    it('should correctly handle enter errors', async () => {
      // Create an error to be emitted
      const errorInfo = new Ably.ErrorInfo('enter error', 40000, 400);

      // Mock enter to reject with the error
      vi.spyOn(mockRoom.presence, 'enter').mockRejectedValue(errorInfo);

      const { result } = renderHook(() => usePresence({ initialData: { test: 'data' } }));

      // Verify the enter method was called
      await waitFor(() => {
        expect(mockRoom.presence.enter).toHaveBeenCalled();
      });

      // Verify the presence state is false (not present)
      expect(result.current.myPresenceState.present).toBe(false);
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

    it('should update myPresenceState when channel enters detached state', async () => {
      const { result } = renderHook(() => usePresence({ initialData: { test: 'data' } }));

      // Wait for initial enter to complete and presence to be true
      await waitFor(() => {
        expect(result.current.myPresenceState.present).toBe(true);
      });

      // Simulate channel state change to detached
      const channelStateChange: Ably.ChannelStateChange = {
        current: 'detached',
        previous: 'attached',
        resumed: false,
      };

      // Trigger the channel detached event
      act(() => {
        const emit = (
          mockRoom.channel as unknown as {
            emit: (event: string, arg: unknown) => void;
          }
        ).emit;
        emit('detached', channelStateChange);
      });

      // Verify that myPresenceState.present becomes false
      await waitFor(() => {
        expect(result.current.myPresenceState.present).toBe(false);
      });
      expect(result.current.myPresenceState.error).toBeUndefined();
    });

    it('should update myPresenceState when channel enters failed state', async () => {
      const { result } = renderHook(() => usePresence({ initialData: { test: 'data' } }));

      // Wait for initial enter to complete and presence to be true
      await waitFor(() => {
        expect(result.current.myPresenceState.present).toBe(true);
      });

      // Simulate channel state change to failed
      const channelStateChange: Ably.ChannelStateChange = {
        current: 'failed',
        previous: 'attached',
        resumed: false,
        reason: new Ably.ErrorInfo('failed', 40000, 400),
      };

      // Trigger the channel detached event
      act(() => {
        const emit = (
          mockRoom.channel as unknown as {
            emit: (event: string, arg: unknown) => void;
          }
        ).emit;
        emit('failed', channelStateChange);
      });

      // Verify that myPresenceState.present becomes false
      await waitFor(() => {
        expect(result.current.myPresenceState.present).toBe(false);
      });
      expect(result.current.myPresenceState.error).toBeErrorInfo({ message: 'failed', code: 40000, statusCode: 400 });
    });
  });

  describe('presence status tracking', () => {
    it('should update myPresenceState when channel enters detached state', async () => {
      const { result } = renderHook(() => usePresence({ initialData: { test: 'data' } }));

      // Wait for initial enter to complete and presence to be true
      await waitFor(() => {
        expect(result.current.myPresenceState.present).toBe(true);
      });

      // Simulate channel state change to detached
      const channelStateChange: Ably.ChannelStateChange = {
        current: 'detached',
        previous: 'attached',
        resumed: false,
      };

      // Trigger the channel detached event
      act(() => {
        const emit = (
          mockRoom.channel as unknown as {
            emit: (event: string, arg: unknown) => void;
          }
        ).emit;
        emit('detached', channelStateChange);
      });

      // Verify that myPresenceState.present becomes false
      await waitFor(() => {
        expect(result.current.myPresenceState.present).toBe(false);
      });
      expect(result.current.myPresenceState.error).toBeUndefined();
    });

    it('should update myPresenceState when channel enters failed state', async () => {
      const { result } = renderHook(() => usePresence({ initialData: { test: 'data' } }));

      // Wait for initial enter to complete and presence to be true
      await waitFor(() => {
        expect(result.current.myPresenceState.present).toBe(true);
      });

      // Simulate channel state change to failed
      const channelStateChange: Ably.ChannelStateChange = {
        current: 'failed',
        previous: 'attached',
        resumed: false,
        reason: new Ably.ErrorInfo('failed', 40000, 400),
      };

      // Trigger the channel detached event
      act(() => {
        const emit = (
          mockRoom.channel as unknown as {
            emit: (event: string, arg: unknown) => void;
          }
        ).emit;
        emit('failed', channelStateChange);
      });

      // Verify that myPresenceState.present becomes false
      await waitFor(() => {
        expect(result.current.myPresenceState.present).toBe(false);
      });
      expect(result.current.myPresenceState.error).toBeErrorInfo({ message: 'failed', code: 40000, statusCode: 400 });
    });
  });

  describe('autoEnterLeave behavior', () => {
    describe.each([
      [ConnectionStatus.Failed],
      [ConnectionStatus.Suspended],
      [ConnectionStatus.Closing],
      [ConnectionStatus.Closed],
    ])('invalid connection state for joining presence', (connectionState: ConnectionStatus) => {
      it('should not join presence if connection state is: ' + connectionState, () => {
        // change the connection status, so we render the hook with the new status
        mockCurrentConnectionStatus = connectionState;

        // spy on the enter method of the presence instance to check if it is called
        vi.spyOn(mockRoom.presence, 'enter');
        renderHook(() => usePresence({ initialData: { test: 'data' } }));

        // ensure we have not entered presence
        expect(mockRoom.presence.enter).not.toHaveBeenCalled();
      });
    });

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

        renderHook(() => usePresence({ initialData: { test: 'data' } }));
        // ensure we have not entered presence
        expect(mockRoom.presence.enter).not.toHaveBeenCalled();
      }
    });

    it('should automatically enter and leave when autoEnterLeave is true (default)', async () => {
      const enterSpy = vi.spyOn(mockRoom.presence, 'enter');
      const leaveSpy = vi.spyOn(mockRoom.presence, 'leave');

      const { result, unmount } = renderHook(() =>
        usePresence({
          initialData: { test: 'enter' },
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

      // Unmount and verify leave is called automatically without data
      unmount();

      await vi.waitFor(
        () => {
          expect(leaveSpy).toHaveBeenCalledWith();
        },
        {
          timeout: 1000,
        },
      );
    });

    it('should automatically enter and leave when autoEnterLeave is not provided (defaults to true)', async () => {
      const enterSpy = vi.spyOn(mockRoom.presence, 'enter');
      const leaveSpy = vi.spyOn(mockRoom.presence, 'leave');

      const { unmount } = renderHook(() =>
        usePresence({
          initialData: { test: 'enter' },
        }),
      );

      // Verify enter is called automatically on mount (default behavior)
      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith({ test: 'enter' });
      });

      // Unmount and verify leave is called automatically without data
      unmount();

      await vi.waitFor(
        () => {
          expect(leaveSpy).toHaveBeenCalledWith();
        },
        {
          timeout: 1000,
        },
      );
    });

    it('should NOT automatically enter and leave when autoEnterLeave is false', async () => {
      const enterSpy = vi.spyOn(mockRoom.presence, 'enter');
      const leaveSpy = vi.spyOn(mockRoom.presence, 'leave');

      const { unmount } = renderHook(() =>
        usePresence({
          initialData: { test: 'enter' },
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

    it('should only auto-enter on first connection, not on subsequent status changes', async () => {
      const enterSpy = vi.spyOn(mockRoom.presence, 'enter');

      const { rerender } = renderHook(() => usePresence({ initialData: { test: 'data' } }));

      // Wait for initial auto-enter
      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith({ test: 'data' });
      });

      expect(enterSpy).toHaveBeenCalledTimes(1);
      enterSpy.mockClear();

      // Simulate connection status changes - should NOT trigger auto-enter
      mockCurrentConnectionStatus = ConnectionStatus.Disconnected;
      rerender();

      mockCurrentConnectionStatus = ConnectionStatus.Connected;
      rerender();

      // Wait to ensure no additional enters happen
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(enterSpy).not.toHaveBeenCalled();

      // Simulate room status changes (but not to detached) - should NOT trigger auto-enter
      mockCurrentRoomStatus = RoomStatus.Attaching;
      rerender();

      mockCurrentRoomStatus = RoomStatus.Attached;
      rerender();

      // Wait to ensure no additional enters happen
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(enterSpy).not.toHaveBeenCalled();
    });

    it('should auto-enter after room goes detached->attached even if already auto-entered before', async () => {
      const enterSpy = vi.spyOn(mockRoom.presence, 'enter');

      const { rerender } = renderHook(() => usePresence({ initialData: { test: 'data' } }));

      // Wait for initial auto-enter
      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith({ test: 'data' });
      });

      expect(enterSpy).toHaveBeenCalledTimes(1);
      enterSpy.mockClear();

      // Simulate room going to detached
      mockCurrentRoomStatus = RoomStatus.Detached;
      rerender();

      // Simulate room going back to attached - should trigger auto-enter again
      mockCurrentRoomStatus = RoomStatus.Attached;
      rerender();

      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith({ test: 'data' });
      });
      expect(enterSpy).toHaveBeenCalledTimes(1);
    });

    it('should auto-enter on first time even after multiple non-detached status changes', async () => {
      const enterSpy = vi.spyOn(mockRoom.presence, 'enter');

      // Start with conditions that prevent auto-enter
      mockCurrentRoomStatus = RoomStatus.Attaching;
      mockCurrentConnectionStatus = ConnectionStatus.Suspended;

      const { rerender } = renderHook(() => usePresence({ initialData: { test: 'data' } }));

      // Should not have auto-entered yet
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(enterSpy).not.toHaveBeenCalled();

      // Change room status but keep connection non-ready
      mockCurrentRoomStatus = RoomStatus.Attached;
      rerender();

      // Still shouldn't auto-enter
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(enterSpy).not.toHaveBeenCalled();

      // Finally make connection ready - should auto-enter for first time
      mockCurrentConnectionStatus = ConnectionStatus.Connected;
      rerender();

      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith({ test: 'data' });
      });
      expect(enterSpy).toHaveBeenCalledTimes(1);
    });

    it('should not auto-enter after detached->attached if presence was explicitly left', async () => {
      const enterSpy = vi.spyOn(mockRoom.presence, 'enter');
      const leaveSpy = vi.spyOn(mockRoom.presence, 'leave');

      const { result, rerender } = renderHook(() => usePresence({ initialData: { test: 'data' } }));

      // Wait for initial auto-enter
      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith({ test: 'data' });
      });

      enterSpy.mockClear();

      // Explicitly leave
      await act(async () => {
        await result.current.leave();
      });

      await waitFor(() => {
        expect(leaveSpy).toHaveBeenCalled();
      });

      // Simulate room detached->attached cycle
      mockCurrentRoomStatus = RoomStatus.Detached;
      rerender();

      mockCurrentRoomStatus = RoomStatus.Attached;
      rerender();

      // Should NOT auto-enter since presence was explicitly left
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(enterSpy).not.toHaveBeenCalled();
    });

    it('should auto-enter after detached->attached even with connection status changes in between', async () => {
      const enterSpy = vi.spyOn(mockRoom.presence, 'enter');

      const { rerender } = renderHook(() => usePresence({ initialData: { test: 'data' } }));

      // Wait for initial auto-enter
      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith({ test: 'data' });
      });

      enterSpy.mockClear();

      // Simulate room going to detached
      mockCurrentRoomStatus = RoomStatus.Detached;
      rerender();

      // Simulate connection status changes while detached
      mockCurrentConnectionStatus = ConnectionStatus.Disconnected;
      rerender();

      mockCurrentConnectionStatus = ConnectionStatus.Connected;
      rerender();

      // Should not auto-enter while still detached
      expect(enterSpy).not.toHaveBeenCalled();

      // Simulate room going back to attached
      mockCurrentRoomStatus = RoomStatus.Attached;
      rerender();

      // Should auto-enter now
      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith({ test: 'data' });
      });
      expect(enterSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple detached->attached cycles correctly', async () => {
      const enterSpy = vi.spyOn(mockRoom.presence, 'enter');

      const { rerender } = renderHook(() => usePresence({ initialData: { test: 'data' } }));

      // Wait for initial auto-enter
      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith({ test: 'data' });
      });
      expect(enterSpy).toHaveBeenCalledTimes(1);

      // First detached->attached cycle
      enterSpy.mockClear();
      mockCurrentRoomStatus = RoomStatus.Detached;
      rerender();
      mockCurrentRoomStatus = RoomStatus.Attached;
      rerender();

      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith({ test: 'data' });
      });
      expect(enterSpy).toHaveBeenCalledTimes(1);

      // Second detached->attached cycle
      enterSpy.mockClear();
      mockCurrentRoomStatus = RoomStatus.Detached;
      rerender();
      mockCurrentRoomStatus = RoomStatus.Attached;
      rerender();

      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith({ test: 'data' });
      });
      expect(enterSpy).toHaveBeenCalledTimes(1);
    });

    it('should re-enter presence automatically after transitioning from detached', async () => {
      const enterSpy = vi.spyOn(mockRoom.presence, 'enter');

      const { rerender } = renderHook((props: UsePresenceParams) => usePresence(props), {
        initialProps: {
          initialData: { test: 'data' },
          autoEnterLeave: true,
        },
      });

      // Wait for initial auto-enter
      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith({ test: 'data' });
      });

      enterSpy.mockClear();

      // Simulate room transitioning to detached
      mockCurrentRoomStatus = RoomStatus.Detached;
      (mockRoom as unknown as { _lifecycle: InternalRoomLifecycle })._lifecycle.setStatus({
        status: RoomStatus.Detached,
      });

      // Do a re-render
      rerender();

      // Simulate room transitioning back to attached
      mockCurrentRoomStatus = RoomStatus.Attached;
      (mockRoom as unknown as { _lifecycle: InternalRoomLifecycle })._lifecycle.setStatus({
        status: RoomStatus.Attached,
      });

      // Re-render again
      rerender();

      // Should re-enter presence automatically
      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith({ test: 'data' });
      });
    });

    it('should not re-enter presence automatically after transitioning from detached if presence has been explicitly left', async () => {
      const enterSpy = vi.spyOn(mockRoom.presence, 'enter');
      const leaveSpy = vi.spyOn(mockRoom.presence, 'leave');

      const { result, rerender } = renderHook(() =>
        usePresence({
          initialData: { test: 'data' },
          autoEnterLeave: true,
        }),
      );

      // Wait for initial auto-enter
      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith({ test: 'data' });
      });

      enterSpy.mockClear();

      // Explicitly leave presence
      await act(async () => {
        await result.current.leave();
      });

      await vi.waitFor(
        () => {
          expect(leaveSpy).toHaveBeenCalledWith(undefined);
        },
        {
          timeout: 1000,
        },
      );

      // Simulate room transitioning to detached
      mockCurrentRoomStatus = RoomStatus.Detached;
      (mockRoom as unknown as { _lifecycle: InternalRoomLifecycle })._lifecycle.setStatus({
        status: RoomStatus.Detached,
      });

      // Do a re-render
      rerender();

      // Simulate room transitioning back to attached
      mockCurrentRoomStatus = RoomStatus.Attached;
      (mockRoom as unknown as { _lifecycle: InternalRoomLifecycle })._lifecycle.setStatus({
        status: RoomStatus.Attached,
      });

      // Do a re-render
      rerender();

      // Should NOT re-enter presence since it was explicitly left
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(enterSpy).not.toHaveBeenCalled();
    });

    it('should re-enter presence automatically after explicit enter call followed by detached->attached transition', async () => {
      const enterSpy = vi.spyOn(mockRoom.presence, 'enter');
      const leaveSpy = vi.spyOn(mockRoom.presence, 'leave');

      const { result, rerender } = renderHook(() =>
        usePresence({
          initialData: { test: 'data' },
          autoEnterLeave: true,
        }),
      );

      // Wait for initial auto-enter
      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith({ test: 'data' });
      });

      // Explicitly leave presence first
      await act(async () => {
        await result.current.leave();
      });

      await vi.waitFor(
        () => {
          expect(leaveSpy).toHaveBeenCalledWith(undefined);
        },
        {
          timeout: 1000,
        },
      );

      enterSpy.mockClear();

      // Explicitly enter presence (this should reset hasExplicitlyLeftRef to false)
      await act(async () => {
        await result.current.enter({ explicit: 'enter' });
      });

      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith({ explicit: 'enter' });
      });

      enterSpy.mockClear();

      // Simulate room transitioning to detached
      mockCurrentRoomStatus = RoomStatus.Detached;
      (mockRoom as unknown as { _lifecycle: InternalRoomLifecycle })._lifecycle.setStatus({
        status: RoomStatus.Detached,
      });

      // Do a re-render
      rerender();

      // Simulate room transitioning back to attached
      mockCurrentRoomStatus = RoomStatus.Attached;
      (mockRoom as unknown as { _lifecycle: InternalRoomLifecycle })._lifecycle.setStatus({
        status: RoomStatus.Attached,
      });

      // Do a re-render
      rerender();

      // Should re-enter presence automatically since explicit enter was called after leave
      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith({ explicit: 'enter' });
      });
    });

    it('should re-enter presence automatically after explicit update call followed by detached->attached transition', async () => {
      const enterSpy = vi.spyOn(mockRoom.presence, 'enter');
      const updateSpy = vi.spyOn(mockRoom.presence, 'update');
      const leaveSpy = vi.spyOn(mockRoom.presence, 'leave');

      const { result, rerender } = renderHook(() =>
        usePresence({
          initialData: { test: 'data' },
          autoEnterLeave: true,
        }),
      );

      // Wait for initial auto-enter
      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith({ test: 'data' });
      });

      // Explicitly leave presence first
      await act(async () => {
        await result.current.leave();
      });

      await vi.waitFor(
        () => {
          expect(leaveSpy).toHaveBeenCalledWith(undefined);
        },
        {
          timeout: 1000,
        },
      );

      enterSpy.mockClear();

      // Explicitly update presence (this should reset hasExplicitlyLeftRef to false)
      await act(async () => {
        await result.current.update({ explicit: 'update' });
      });

      await waitFor(() => {
        expect(updateSpy).toHaveBeenCalledWith({ explicit: 'update' });
      });

      // Simulate room transitioning to detached
      mockCurrentRoomStatus = RoomStatus.Detached;
      (mockRoom as unknown as { _lifecycle: InternalRoomLifecycle })._lifecycle.setStatus({
        status: RoomStatus.Detached,
      });

      // Do a re-render
      rerender();

      // Simulate room transitioning back to attached
      mockCurrentRoomStatus = RoomStatus.Attached;
      (mockRoom as unknown as { _lifecycle: InternalRoomLifecycle })._lifecycle.setStatus({
        status: RoomStatus.Attached,
      });

      // Do a re-render
      rerender();

      // Should re-enter presence automatically since explicit update was called after leave
      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith({ explicit: 'update' });
      });
    });
  });

  describe('explicit enter/update/leave', () => {
    it('should correctly call the enter method', async () => {
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

    it('should correctly call the update method', async () => {
      // spy on the update method of the presence instance
      const updateSpy = vi.spyOn(mockRoom.presence, 'update');

      const { result } = renderHook(() => usePresence({ initialData: { test: 'data' } }));

      // call the update method
      await act(async () => {
        await result.current.update({ test: 'updated' });
      });

      // verify that the update method was called
      expect(updateSpy).toHaveBeenCalledWith({ test: 'updated' });

      expect(result.current.myPresenceState.present).toBe(true);
    });

    it('should correctly call the leave method', async () => {
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
          initialData: { auto: 'enter' },
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

  describe('data tracking and persistence', () => {
    it('should use initialData for first auto-enter', async () => {
      const enterSpy = vi.spyOn(mockRoom.presence, 'enter');

      renderHook(() => usePresence({ initialData: { status: 'initial' } }));

      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith({ status: 'initial' });
      });
    });

    it('should track latest data from manual enter calls for subsequent auto-enters', async () => {
      const enterSpy = vi.spyOn(mockRoom.presence, 'enter');

      const { result, rerender } = renderHook(() => usePresence({ initialData: { status: 'auto_entered' } }));
      await vi.waitFor(
        () => {
          expect(enterSpy).toHaveBeenCalledWith({ status: 'auto_entered' });
        },
        { timeout: 1000 },
      );

      // Manual enter with specific data
      await act(async () => {
        await result.current.enter({ status: 'manually_entered' });
      });

      await vi.waitFor(
        () => {
          expect(enterSpy).toHaveBeenCalledWith({ status: 'manually_entered' });
        },
        { timeout: 1000 },
      );
      enterSpy.mockClear();
      expect(enterSpy).not.toHaveBeenCalled();

      // Simulate room reconnection by changing room instance
      updateMockRoom(makeRandomRoom());
      vi.spyOn(mockRoom.presence, 'enter');

      // Re-render with autoEnterLeave enabled to trigger auto-enter
      rerender(() => usePresence({ initialData: { status: 'another_reenter' } }));

      // Should use the data from the previous manual enter
      await waitFor(() => {
        expect(mockRoom.presence.enter).toHaveBeenCalledWith({ status: 'manually_entered' });
      });
    });

    it('should track latest data from update calls for subsequent auto-enters', async () => {
      const enterSpy = vi.spyOn(mockRoom.presence, 'enter');
      const updateSpy = vi.spyOn(mockRoom.presence, 'update');

      const { result, rerender } = renderHook(() => usePresence({ initialData: { status: 'initial' } }));

      // Wait for initial enter
      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith({ status: 'initial' });
      });

      // Update presence data
      await act(async () => {
        await result.current.update({ status: 'updated' });
      });

      expect(updateSpy).toHaveBeenCalledWith({ status: 'updated' });
      enterSpy.mockClear();

      // Simulate room reconnection by changing room instance
      updateMockRoom(makeRandomRoom());
      vi.spyOn(mockRoom.presence, 'enter');

      // Re-render to trigger auto-enter on new room
      rerender();

      // Should use the data from the update call
      await waitFor(() => {
        expect(mockRoom.presence.enter).toHaveBeenCalledWith({ status: 'updated' });
      });
    });

    it('should preserve data ref across re-renders', async () => {
      const enterSpy = vi.spyOn(mockRoom.presence, 'enter');

      const { result, rerender } = renderHook(({ data }) => usePresence({ initialData: data }), {
        initialProps: { data: { status: 'initial' } },
      });

      await waitFor(() => {
        expect(enterSpy).toHaveBeenCalledWith({ status: 'initial' });
      });

      // Update presence data
      await act(async () => {
        await result.current.update({ status: 'from_update' });
      });

      enterSpy.mockClear();

      // Re-render with different initialData - should not affect tracked data
      rerender({ data: { status: 'different_initial' } });

      // Simulate room change to trigger auto-enter
      updateMockRoom(makeRandomRoom());
      vi.spyOn(mockRoom.presence, 'enter');
      rerender({ data: { status: 'different_initial' } });

      // Should still use the data from update, not the new initialData
      await waitFor(() => {
        expect(mockRoom.presence.enter).toHaveBeenCalledWith({ status: 'from_update' });
      });
    });

    it('should handle multiple sequential enter/update calls correctly', async () => {
      const enterSpy = vi.spyOn(mockRoom.presence, 'enter');
      const updateSpy = vi.spyOn(mockRoom.presence, 'update');

      const { result, rerender } = renderHook((props: UsePresenceParams) => usePresence(props), {
        initialProps: { autoEnterLeave: false },
      });

      // Sequence of calls
      await act(async () => {
        await result.current.enter({ step: 1 });
      });
      await act(async () => {
        await result.current.update({ step: 2 });
      });
      await act(async () => {
        await result.current.enter({ step: 3 });
      });

      expect(enterSpy).toHaveBeenNthCalledWith(1, { step: 1 });
      expect(updateSpy).toHaveBeenCalledWith({ step: 2 });
      expect(enterSpy).toHaveBeenNthCalledWith(2, { step: 3 });

      enterSpy.mockClear();

      // Simulate auto-enter scenario
      updateMockRoom(makeRandomRoom());
      vi.spyOn(mockRoom.presence, 'enter');
      rerender({ autoEnterLeave: true });

      // Should use the latest data from the last enter call
      await waitFor(() => {
        expect(mockRoom.presence.enter).toHaveBeenCalledWith({ step: 3 });
      });
    });

    it('should handle rapid enter/update calls with data consistency', async () => {
      const enterSpy = vi.spyOn(mockRoom.presence, 'enter');
      const updateSpy = vi.spyOn(mockRoom.presence, 'update');

      const { result, rerender } = renderHook((props: UsePresenceParams) => usePresence(props), {
        initialProps: { autoEnterLeave: false },
      });

      // Rapid sequence of calls
      await act(async () => {
        const promises = [
          result.current.enter({ rapid: 1 }),
          result.current.update({ rapid: 2 }),
          result.current.enter({ rapid: 3 }),
          result.current.update({ rapid: 4 }),
        ];
        await Promise.all(promises);
      });

      await vi.waitFor(
        () => {
          expect(enterSpy).toHaveBeenCalledTimes(2);
          expect(enterSpy).toHaveBeenCalledWith({ rapid: 1 });
          expect(enterSpy).toHaveBeenCalledWith({ rapid: 3 });
          expect(updateSpy).toHaveBeenCalledWith({ rapid: 2 });
          expect(updateSpy).toHaveBeenCalledWith({ rapid: 4 });
        },
        {
          timeout: 1000,
        },
      );

      // Clear spies for auto-enter test
      enterSpy.mockClear();

      // Trigger auto-enter scenario
      updateMockRoom(makeRandomRoom());
      vi.spyOn(mockRoom.presence, 'enter');
      rerender({ autoEnterLeave: true });

      // Should use the last call's data
      await waitFor(() => {
        expect(mockRoom.presence.enter).toHaveBeenCalledWith({ rapid: 4 });
      });
    });
  });
});

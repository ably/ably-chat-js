import { ConnectionLifecycle, DiscontinuityListener, Room, RoomLifecycle } from '@ably/chat';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import * as Ably from 'ably';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePresence } from '../../../src/react/hooks/use-presence.ts';
import { makeTestLogger } from '../../helper/logger.ts';
import { makeRandomRoom } from '../../helper/room.ts';

let mockRoom: Room;
let mockCurrentConnectionStatus: ConnectionLifecycle;
let mockCurrentRoomStatus: RoomLifecycle;
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

vi.mock('../../../src/react/hooks/use-room.js', () => ({
  useRoom: () => ({
    room: mockRoom,
    roomStatus: mockCurrentRoomStatus,
    roomError: mockRoomError,
  }),
}));

vi.mock('../../../src/react/hooks/use-logger.js', () => ({
  useLogger: () => mockLogger,
}));

vi.mock('ably');

describe('usePresence', () => {
  beforeEach(() => {
    // create a new mock room before each test, enabling presence
    vi.resetAllMocks();
    mockLogger = makeTestLogger();
    mockCurrentConnectionStatus = ConnectionLifecycle.Connected;
    mockCurrentRoomStatus = RoomLifecycle.Attached;
    mockRoom = makeRandomRoom({
      options: {
        presence: {
          enter: true,
          subscribe: true,
        },
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('should provide the presence instance and chat status response metrics', () => {
    // set the connection and room errors to check that they are correctly provided
    mockConnectionError = new Ably.ErrorInfo('test error', 40000, 400);
    mockRoomError = new Ably.ErrorInfo('test error', 40000, 400);

    const { result } = renderHook(() => usePresence());

    // check that the presence instance and metrics are correctly provided
    expect(result.current.presence).toBe(mockRoom.presence);
    expect(result.current.isPresent).toBe(false);
    expect(result.current.error).toBeUndefined();

    // check connection and room metrics are correctly provided
    expect(result.current.roomStatus).toBe(RoomLifecycle.Attached);
    expect(result.current.roomError).toBeErrorInfo({ message: 'test error' });
    expect(result.current.connectionStatus).toEqual(ConnectionLifecycle.Connected);
    expect(result.current.connectionError).toBeErrorInfo({ message: 'test error' });
  });

  it('should handle rerender if the room instance changes', async () => {
    vi.spyOn(mockRoom.presence, 'enter');

    const { result, rerender } = renderHook(() => usePresence({ enterWithData: { test: 'data' } }));

    // ensure we have entered presence
    expect(mockRoom.presence.enter).toHaveBeenCalledWith({ test: 'data' });

    await waitFor(() => result.current.isPresent);

    // check the initial state of the presence instance
    expect(result.current.presence).toBe(mockRoom.presence);
    expect(result.current.isPresent).toBe(true);

    // change the mock room instance
    mockRoom = makeRandomRoom({
      options: {
        presence: {
          enter: true,
          subscribe: true,
        },
      },
    });

    vi.spyOn(mockRoom.presence, 'enter');

    // re-render to trigger entering presence on the new room instance
    rerender();

    // ensure we have entered presence on the new room instance
    expect(mockRoom.presence.enter).toHaveBeenCalledWith({ test: 'data' });
    await waitFor(() => result.current.isPresent);
    expect(result.current.isPresent).toBe(true);

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

    await waitFor(() => result.current.isPresent, { timeout: 500 });

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

    expect(result.current.isPresent).toBe(true);
  });

  it('should correctly return any error that occurs', async () => {
    // spy on the leave method of the presence instance
    const enterSpy = vi
      .spyOn(mockRoom.presence, 'enter')
      .mockRejectedValue(new Ably.ErrorInfo('enter error', 40000, 400));

    const { result } = renderHook(() => usePresence({ enterWithData: { test: 'data' } }));

    // expect the enter method to be called
    expect(enterSpy).toHaveBeenCalled();

    // wait for the error to be set from the useEffect
    await waitFor(
      () => {
        expect(result.current.error).toBeErrorInfo({ message: 'enter error' });
      },
      { timeout: 3000 },
    );
  });

  describe.each([[ConnectionLifecycle.Failed], [ConnectionLifecycle.Suspended]])(
    'invalid connection state for joining presence',
    (connectionState: ConnectionLifecycle) => {
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
      RoomLifecycle.Detaching,
      RoomLifecycle.Detached,
      RoomLifecycle.Suspended,
      RoomLifecycle.Failed,
      RoomLifecycle.Releasing,
      RoomLifecycle.Released,
    ]) {
      // change the room status, so we render the hook with the new status
      mockCurrentRoomStatus = status;

      renderHook(() => usePresence({ enterWithData: { test: 'data' } }));
      // ensure we have not entered presence
      expect(mockRoom.presence.enter).not.toHaveBeenCalled();
    }
  });

  it('should subscribe and unsubscribe to discontinuity events', () => {
    const mockOff = vi.fn();
    const mockDiscontinuityListener = vi.fn();

    // spy on the onDiscontinuity method of the presence instance
    let discontinuityListener: DiscontinuityListener | undefined;
    vi.spyOn(mockRoom.presence, 'onDiscontinuity').mockImplementation((listener: DiscontinuityListener) => {
      discontinuityListener = listener;
      return { off: mockOff };
    });

    // render the hook with a discontinuity listener
    const { unmount } = renderHook(() => usePresence({ onDiscontinuity: mockDiscontinuityListener }));

    // check that the listener was subscribed to the discontinuity events by triggering the listener
    const errorInfo = new Ably.ErrorInfo('test', 50000, 500);
    expect(discontinuityListener).toBeDefined();
    discontinuityListener?.(errorInfo);
    expect(mockDiscontinuityListener).toHaveBeenCalledWith(errorInfo);

    // unmount the hook and verify that the listener was unsubscribed
    unmount();

    expect(mockOff).toHaveBeenCalled();
  });
});

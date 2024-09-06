import { ConnectionLifecycle, Message, Room, RoomLifecycle } from '@ably/chat';
import { act, renderHook, waitFor } from '@testing-library/react';
import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PaginatedResult } from '../../../src/core/query.ts';
import { useMessages } from '../../../src/react/hooks/use-messages.ts';
import { makeTestLogger } from '../../helper/logger.ts';
import { makeRandomRoom } from '../../helper/room.ts';

let mockRoom: Room;
let mockCurrentConnectionStatus: ConnectionLifecycle;
let mockCurrentRoomStatus: RoomLifecycle;
let mockConnectionError: Ably.ErrorInfo;
let mockRoomError: Ably.ErrorInfo;
let testLogger: ReturnType<typeof makeTestLogger>;

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
  useLogger: () => testLogger,
}));

vi.mock('ably');

describe('useMessages', () => {
  beforeEach(() => {
    // create a new mock room before each test, enabling messages
    vi.resetAllMocks();
    testLogger = makeTestLogger();
    mockCurrentConnectionStatus = ConnectionLifecycle.Connected;
    mockCurrentRoomStatus = RoomLifecycle.Attached;
    mockRoom = makeRandomRoom({});
  });

  it('should provide the messages instance and chat status response metrics', () => {
    // set the connection and room errors to check that they are correctly provided
    mockConnectionError = new Ably.ErrorInfo('test error', 40000, 400);
    mockRoomError = new Ably.ErrorInfo('test error', 40000, 400);

    const { result, unmount } = renderHook(() => useMessages());

    // check that the messages instance and metrics are correctly provided
    expect(result.current.messages).toBe(mockRoom.messages);
    expect(result.current.getPreviousMessages).toBeUndefined();

    // check connection and room metrics are correctly provided
    expect(result.current.roomStatus).toBe(RoomLifecycle.Attached);
    expect(result.current.roomError).toBeErrorInfo({ message: 'test error' });
    expect(result.current.connectionStatus).toEqual(ConnectionLifecycle.Connected);
    expect(result.current.connectionError).toBeErrorInfo({ message: 'test error' });
    unmount();
  });

  it('should correctly subscribe and unsubscribe to message events', async () => {
    // mock listener and associated unsubscribe and getPreviousMessages functions
    const mockListener = vi.fn();
    const mockUnsubscribe = vi.fn();
    const mockGetPreviousMessages = vi.fn().mockResolvedValue({ items: [] });
    vi.spyOn(mockRoom.messages, 'subscribe').mockReturnValue({
      unsubscribe: mockUnsubscribe,
      getPreviousMessages: mockGetPreviousMessages,
    });

    let result = renderHook(() =>
      useMessages({
        listener: mockListener,
      }),
    );

    const getPreviousMessages = result.result.current.getPreviousMessages;

    // verify that subscribe was called with the mock listener on mount
    expect(mockRoom.messages.subscribe).toHaveBeenCalledWith(mockListener);

    // wait for the getPreviousMessages function to be defined
    await waitFor(
      async () => {
        expect(getPreviousMessages).toBeDefined();
        // call the getPreviousMessages function and verify that it was called
        if (getPreviousMessages) {
          await getPreviousMessages({ limit: 10 });
        }
      },
      { timeout: 3000 },
    );

    // verify the getPreviousMessages function was called with the correct parameters
    expect(mockGetPreviousMessages).toHaveBeenCalledWith({ limit: 10 });

    // unmount the hook and verify that unsubscribe was called
    result.unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();

    // now check that if we render the hook without previousMessagesParams
    result = renderHook(() => useMessages({ listener: mockListener }));

    // the mock should not have been called again
    expect(mockGetPreviousMessages).toHaveBeenCalledTimes(1);
    result.unmount();
  });

  it('should correctly call the send and get message methods', async () => {
    const { result, unmount } = renderHook(() => useMessages());

    // spy on the send method of the messages instance
    const sendSpy = vi.spyOn(mockRoom.messages, 'send').mockResolvedValue({} as unknown as Message);

    // spy on the get method of the messages instance
    const getSpy = vi.spyOn(mockRoom.messages, 'get').mockResolvedValue({} as unknown as PaginatedResult<Message>);

    // call both methods and ensure they call the underlying messages methods
    await act(async () => {
      await result.current.send({ text: 'test message' });
      await result.current.get({ limit: 10 });
    });

    expect(sendSpy).toHaveBeenCalledWith({ text: 'test message' });
    expect(getSpy).toHaveBeenCalledWith({ limit: 10 });
    unmount();
  });

  it('should handle rerender if the room instance changes', () => {
    const { result, rerender, unmount } = renderHook(() => useMessages());

    // check the initial state of the messages instance
    expect(result.current.messages).toBe(mockRoom.messages);

    // change the mock room instance
    mockRoom = makeRandomRoom({});

    // re-render to trigger the useEffect
    rerender();

    // check that the messages instance is updated
    expect(result.current.messages).toBe(mockRoom.messages);
    unmount();
  });

  it('should subscribe and unsubscribe to discontinuity events', () => {
    const mockOff = vi.fn();
    const mockDiscontinuityListener = vi.fn();

    // spy on the onDiscontinuity method of the messages instance
    vi.spyOn(mockRoom.messages, 'onDiscontinuity').mockReturnValue({ off: mockOff });

    // render the hook with a discontinuity listener
    const { unmount } = renderHook(() => useMessages({ onDiscontinuity: mockDiscontinuityListener }));

    // check that the listener was subscribed to the discontinuity events
    expect(mockRoom.messages.onDiscontinuity).toHaveBeenCalledWith(mockDiscontinuityListener);

    // unmount the hook and verify that the listener was unsubscribed
    unmount();

    expect(mockOff).toHaveBeenCalled();
  });
});
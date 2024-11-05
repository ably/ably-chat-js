import {
  ConnectionStatus,
  DiscontinuityListener,
  Message,
  MessageEvents,
  MessageListener,
  Room,
  RoomStatus,
} from '@ably/chat';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import * as Ably from 'ably';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PaginatedResult } from '../../../src/core/query.ts';
import { useMessages } from '../../../src/react/hooks/use-messages.ts';
import { makeTestLogger } from '../../helper/logger.ts';
import { makeRandomRoom } from '../../helper/room.ts';

let mockRoom: Room;
let mockCurrentConnectionStatus: ConnectionStatus;
let mockCurrentRoomStatus: RoomStatus;
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
    mockCurrentConnectionStatus = ConnectionStatus.Connected;
    mockCurrentRoomStatus = RoomStatus.Attached;
    mockRoom = makeRandomRoom({});
  });

  afterEach(() => {
    cleanup();
  });

  it('should provide the messages instance and chat status response metrics', () => {
    // set the connection and room errors to check that they are correctly provided
    mockConnectionError = new Ably.ErrorInfo('test error', 40000, 400);
    mockRoomError = new Ably.ErrorInfo('test error', 40000, 400);

    const { result } = renderHook(() => useMessages());

    // check that the messages instance and metrics are correctly provided
    expect(result.current.messages).toBe(mockRoom.messages);

    // check connection and room metrics are correctly provided
    expect(result.current.roomStatus).toBe(RoomStatus.Attached);
    expect(result.current.roomError).toBeErrorInfo({ message: 'test error' });
    expect(result.current.connectionStatus).toEqual(ConnectionStatus.Connected);
    expect(result.current.connectionError).toBeErrorInfo({ message: 'test error' });
  });

  it('should correctly subscribe and unsubscribe to message events', async () => {
    // mock listener and associated unsubscribe and getPreviousMessages functions
    const mockListener = vi.fn();
    const mockUnsubscribe = vi.fn();
    const mockGetPreviousMessages = vi.fn().mockResolvedValue({ items: [] });

    const messageListeners = new Set<MessageListener>();
    vi.spyOn(mockRoom.messages, 'subscribe').mockImplementation((listener) => {
      messageListeners.add(listener);
      return { unsubscribe: mockUnsubscribe, getPreviousMessages: mockGetPreviousMessages };
    });

    const { result, unmount } = renderHook(() =>
      useMessages({
        listener: mockListener,
      }),
    );

    const getPreviousMessages = result.current.getPreviousMessages;

    // verify that subscribe was called with the mock listener on mount by invoking it
    const messageEvent = {
      type: MessageEvents.Created,
      message: {
        timestamp: new Date(),
        text: 'test message',
        timeserial: '123',
        clientId: '123',
        roomId: '123',
        createdAt: new Date(),
        before: vi.fn(),
        after: vi.fn(),
        equal: vi.fn(),
        headers: {},
        metadata: {},
      },
    };
    for (const listener of messageListeners) listener(messageEvent);
    expect(mockListener).toHaveBeenCalledWith(messageEvent);

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
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();

    // now check that if we render the hook without previousMessagesParams
    renderHook(() => useMessages({ listener: mockListener }));

    // the mock should not have been called again
    expect(mockGetPreviousMessages).toHaveBeenCalledTimes(1);
  });

  it('should correctly call the send and get message methods', async () => {
    const { result } = renderHook(() => useMessages());

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
  });

  it('should handle rerender if the room instance changes', () => {
    const { result, rerender } = renderHook(() => useMessages());

    // check the initial state of the messages instance
    expect(result.current.messages).toBe(mockRoom.messages);

    // change the mock room instance
    mockRoom = makeRandomRoom({});

    // re-render to trigger the useEffect
    rerender();

    // check that the messages instance is updated
    expect(result.current.messages).toBe(mockRoom.messages);
  });

  it('should subscribe and unsubscribe to discontinuity events', () => {
    const mockOff = vi.fn();
    const mockDiscontinuityListener = vi.fn();

    // spy on the onDiscontinuity method of the messages instance
    let discontinuityListener: DiscontinuityListener | undefined;
    vi.spyOn(mockRoom.messages, 'onDiscontinuity').mockImplementation((listener) => {
      discontinuityListener = listener;
      return { off: mockOff };
    });

    // render the hook with a discontinuity listener
    const { unmount } = renderHook(() => useMessages({ onDiscontinuity: mockDiscontinuityListener }));

    // check that the listener was subscribed to the discontinuity events by invoking it
    const errorInfo = new Ably.ErrorInfo('test error', 40000, 400);
    expect(discontinuityListener).toBeDefined();
    discontinuityListener?.(errorInfo);
    expect(mockDiscontinuityListener).toHaveBeenCalledWith(errorInfo);

    // unmount the hook and verify that the listener was unsubscribed
    unmount();

    expect(mockOff).toHaveBeenCalled();
  });
});

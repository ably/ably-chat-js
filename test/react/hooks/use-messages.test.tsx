import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import * as Ably from 'ably';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectionStatus } from '../../../src/core/connection.ts';
import { DiscontinuityListener } from '../../../src/core/discontinuity.ts';
import { ChatMessageAction, MessageEventType } from '../../../src/core/events.ts';
import { DefaultMessage, emptyMessageReactions, Message } from '../../../src/core/message.ts';
import { MessageListener } from '../../../src/core/messages.ts';
import { PaginatedResult } from '../../../src/core/query.ts';
import { Room } from '../../../src/core/room.ts';
import { RoomStatus } from '../../../src/core/room-status.ts';
import { useMessages } from '../../../src/react/hooks/use-messages.ts';
import { makeTestLogger } from '../../helper/logger.ts';
import { makeRandomRoom } from '../../helper/room.ts';
import { waitForEventualHookValue, waitForEventualHookValueToBeDefined } from '../../helper/wait-for-eventual-hook.ts';

let mockRoom: Room;
let mockRoomContext: { room: Promise<Room> };
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

vi.mock('../../../src/react/helper/use-room-context.js', () => ({
  useRoomContext: () => mockRoomContext,
}));

vi.mock('../../../src/react/helper/use-room-status.js', () => ({
  useRoomStatus: () => ({ status: mockCurrentRoomStatus, error: mockRoomError }),
}));

vi.mock('../../../src/react/hooks/use-logger.js', () => ({
  useRoomLogger: () => testLogger,
}));

vi.mock('ably');

const updateMockRoom = (newRoom: Room) => {
  mockRoom = newRoom;
  mockRoomContext = { room: Promise.resolve(newRoom) };
};

describe('useMessages', () => {
  beforeEach(() => {
    // create a new mock room before each test, enabling messages
    vi.resetAllMocks();
    testLogger = makeTestLogger();
    mockCurrentConnectionStatus = ConnectionStatus.Connected;
    mockCurrentRoomStatus = RoomStatus.Attached;
    updateMockRoom(makeRandomRoom({}));
  });

  afterEach(() => {
    cleanup();
  });

  it('should provide the messages instance and chat status response metrics', async () => {
    // set the connection and room errors to check that they are correctly provided
    mockConnectionError = new Ably.ErrorInfo('test error', 40000, 400);
    mockRoomError = new Ably.ErrorInfo('test error', 40000, 400);

    const { result } = renderHook(() => useMessages());

    // check that the messages instance and metrics are correctly provided
    await waitForEventualHookValue(result, mockRoom.messages, (value) => value.messages);

    // check connection and room metrics are correctly provided
    expect(result.current.roomStatus).toBe(RoomStatus.Attached);
    expect(result.current.roomError).toBeErrorInfo({ message: 'test error' });
    expect(result.current.connectionStatus).toEqual(ConnectionStatus.Connected);
    expect(result.current.connectionError).toBeErrorInfo({ message: 'test error' });
  });

  it('should correctly subscribe and unsubscribe to message events', async () => {
    // mock listener and associated unsubscribe and historyBeforeSubscribe functions
    const mockListener = vi.fn();
    const mockUnsubscribe = vi.fn();
    const mockHistoryBeforeSubscribe = vi.fn().mockResolvedValue({ items: [] });

    const messageListeners = new Set<MessageListener>();
    vi.spyOn(mockRoom.messages, 'subscribe').mockImplementation((listener) => {
      messageListeners.add(listener);
      return { unsubscribe: mockUnsubscribe, historyBeforeSubscribe: mockHistoryBeforeSubscribe };
    });

    const { result, unmount } = renderHook(() =>
      useMessages({
        listener: mockListener,
      }),
    );

    await waitForEventualHookValueToBeDefined(result, (value) => value.historyBeforeSubscribe);
    const historyBeforeSubscribe = result.current.historyBeforeSubscribe;

    // verify that subscribe was called with the mock listener on mount by invoking it
    const messageEvent = {
      type: MessageEventType.Created,
      message: {
        timestamp: new Date(),
        text: 'test message',
        serial: '123',
        clientId: '123',
        roomId: '123',
        createdAt: new Date(),
        action: ChatMessageAction.MessageCreate,
        version: '123',
        isUpdated: false,
        isDeleted: false,
        deletedBy: undefined,
        updatedBy: undefined,
        deletedAt: undefined,
        updatedAt: undefined,
        isOlderVersionOf: vi.fn(),
        isNewerVersionOf: vi.fn(),
        isSameVersionAs: vi.fn(),
        before: vi.fn(),
        after: vi.fn(),
        equal: vi.fn(),
        isSameAs: vi.fn(),
        with: vi.fn(),
        headers: {},
        metadata: {},
        copy: vi.fn(),
        reactions: {
          version: '',
          unique: {},
          distinct: {},
          multiple: {},
        },
      },
    };
    for (const listener of messageListeners) {
      listener(messageEvent);
    }
    expect(mockListener).toHaveBeenCalledWith(messageEvent);

    // wait for the historyBeforeSubscribe function to be defined
    await waitFor(
      async () => {
        expect(historyBeforeSubscribe).toBeDefined();
        // call the historyBeforeSubscribe function and verify that it was called
        if (historyBeforeSubscribe) {
          await historyBeforeSubscribe({ limit: 10 });
        }
      },
      { timeout: 3000 },
    );

    // verify the historyBeforeSubscribe function was called with the correct parameters
    expect(mockHistoryBeforeSubscribe).toHaveBeenCalledWith({ limit: 10 });

    // unmount the hook and verify that unsubscribe was called
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();

    // now check that if we render the hook without previousMessagesParams
    renderHook(() => useMessages({ listener: mockListener }));

    // the mock should not have been called again
    expect(mockHistoryBeforeSubscribe).toHaveBeenCalledTimes(1);
  });

  it('should correctly call the methods exposed by the hook', async () => {
    const { result } = renderHook(() => useMessages());

    // spy on the send method of the messages instance
    const sendSpy = vi.spyOn(mockRoom.messages, 'send').mockResolvedValue({} as unknown as Message);

    // spy on the history method of the messages instance
    const historySpy = vi
      .spyOn(mockRoom.messages, 'history')
      .mockResolvedValue({} as unknown as PaginatedResult<Message>);

    const deleteSpy = vi.spyOn(mockRoom.messages, 'delete').mockResolvedValue({} as unknown as Message);

    const message = new DefaultMessage({
      serial: '01719948956834-000@108TeGZDQBderu97202638',
      clientId: 'client-1',
      roomId: 'some-room',
      text: 'I have the high ground now',
      metadata: {},
      headers: {},
      action: ChatMessageAction.MessageCreate,
      version: '01719948956834-000@108TeGZDQBderu97202638',
      createdAt: new Date(1719948956834),
      timestamp: new Date(1719948956834),
      reactions: emptyMessageReactions(),
    });
    // call both methods and ensure they call the underlying messages methods
    await act(async () => {
      await result.current.send({ text: 'test message' });
      await result.current.history({ limit: 10 });
      await result.current.deleteMessage(message, {
        description: 'deleted',
        metadata: { reason: 'test' },
      });
    });

    expect(sendSpy).toHaveBeenCalledWith({ text: 'test message' });
    expect(historySpy).toHaveBeenCalledWith({ limit: 10 });
    expect(deleteSpy).toHaveBeenCalledWith(message, {
      description: 'deleted',
      metadata: { reason: 'test' },
    });
  });

  it('should handle rerender if the room instance changes', async () => {
    const { result, rerender } = renderHook(() => useMessages());

    // check the initial state of the messages instance
    await waitForEventualHookValue(result, mockRoom.messages, (value) => value.messages);
    expect(result.current.messages).toBe(mockRoom.messages);

    // change the mock room instance
    updateMockRoom(makeRandomRoom({}));

    // re-render to trigger the useEffectYou
    rerender();

    // check that the messages instance is updated
    await waitForEventualHookValue(result, mockRoom.messages, (value) => value.messages);
  });

  it('should subscribe and unsubscribe to discontinuity events', async () => {
    const mockOff = vi.fn();
    const mockDiscontinuityListener = vi.fn();

    // spy on the onDiscontinuity method of the room instance
    let discontinuityListener: DiscontinuityListener | undefined;
    vi.spyOn(mockRoom, 'onDiscontinuity').mockImplementation((error) => {
      discontinuityListener = error;
      return { off: mockOff };
    });

    // render the hook with a discontinuity listener
    const { unmount } = renderHook(() => useMessages({ onDiscontinuity: mockDiscontinuityListener }));

    // check that the listener was subscribed to the discontinuity events by invoking it
    const errorInfo = new Ably.ErrorInfo('test error', 40000, 400);
    await vi.waitFor(() => discontinuityListener !== undefined);
    discontinuityListener?.(errorInfo);
    expect(mockDiscontinuityListener).toHaveBeenCalledWith(errorInfo);

    // unmount the hook and verify that the listener was unsubscribed
    unmount();

    expect(mockOff).toHaveBeenCalled();
  });
});

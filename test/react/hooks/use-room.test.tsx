import { ChatClient, RoomOptionsDefaults, RoomStatus, RoomStatusListener } from '@ably/chat';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import * as Ably from 'ably';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatRoomProvider, useRoom, UseRoomResponse } from '../../../src/react/index.ts';
import { ChatClientProvider } from '../../../src/react/providers/chat-client-provider.tsx';
import { newChatClient as newChatClientLib } from '../../helper/chat.ts';
import { randomRoomId } from '../../helper/identifier.ts';

const TestComponent: React.FC<{ callback?: (room: UseRoomResponse) => void }> = ({ callback }) => {
  const response = useRoom();
  if (callback) callback(response);
  return <></>;
};

vi.mock('ably');

function newChatClient() {
  return newChatClientLib() as unknown as ChatClient;
}

describe('useRoom', () => {
  afterEach(() => {
    cleanup();
  });

  it('should throw an error if used outside of ChatRoomProvider', () => {
    const chatClient = newChatClient();

    const TestThrowError: React.FC = () => {
      expect(() => useRoom()).toThrowErrorInfo({
        code: 40000,
        message: 'useRoom hook must be used within a <ChatRoomProvider>',
      });
      return null;
    };

    const TestProvider = () => (
      <ChatClientProvider client={chatClient}>
        <TestThrowError />
      </ChatClientProvider>
    );

    render(<TestProvider />);
  });

  it('should get the room from the context without error', async () => {
    const chatClient = newChatClient();
    let latestResponse: UseRoomResponse | undefined;
    const roomId = randomRoomId();
    const TestProvider = () => (
      <ChatClientProvider client={chatClient}>
        <ChatRoomProvider
          id={roomId}
          attach={false}
          release={false}
          options={RoomOptionsDefaults}
        >
          <TestComponent
            callback={(response) => {
              latestResponse = response;
            }}
          />
        </ChatRoomProvider>
      </ChatClientProvider>
    );
    render(<TestProvider />);
    await vi.waitFor(() => {
      expect(latestResponse?.room?.roomId).toBe(roomId);
    });
    expect(latestResponse?.attach).toBeTruthy();
    expect(latestResponse?.detach).toBeTruthy();
    expect(latestResponse?.roomStatus).toBe(RoomStatus.Initialized);
  });

  it('should return working shortcuts for attach and detach functions', async () => {
    const chatClient = newChatClient();
    let called = false;
    const roomId = randomRoomId();
    const TestProvider = () => (
      <ChatClientProvider client={chatClient}>
        <ChatRoomProvider
          id={roomId}
          attach={false}
          release={false}
          options={RoomOptionsDefaults}
        >
          <TestComponent
            callback={(response) => {
              if (!response.room) return;

              vi.spyOn(response.room, 'attach').mockImplementation(() => Promise.resolve());
              vi.spyOn(response.room, 'detach').mockImplementation(() => Promise.resolve());
              // no awaiting since we don't care about result, just that the relevant function was called
              void response.attach();
              expect(response.room.attach).toHaveBeenCalled();
              void response.detach();
              expect(response.room.detach).toHaveBeenCalled();
              called = true;
            }}
          />
        </ChatRoomProvider>
      </ChatClientProvider>
    );
    render(<TestProvider />);

    await vi.waitFor(() => called, { timeout: 5000 });
  });

  it('should attach, detach and release correctly with the same room twice', async () => {
    const chatClient = newChatClient();
    let called1 = 0;
    let called2 = 0;
    const roomId = randomRoomId();
    const room = await chatClient.rooms.get(roomId, RoomOptionsDefaults);

    vi.spyOn(room, 'attach').mockImplementation(() => Promise.resolve());
    vi.spyOn(room, 'detach').mockImplementation(() => Promise.resolve());
    vi.spyOn(chatClient.rooms, 'release');

    const TestProvider = ({ room1 = true, room2 = true }) => {
      const component1 = (
        <ChatRoomProvider
          id={roomId}
          attach={false}
          release={false}
          options={RoomOptionsDefaults}
        >
          <TestComponent
            callback={() => {
              called1 += 1;
            }}
          />
        </ChatRoomProvider>
      );

      const component2 = (
        <ChatRoomProvider
          id={roomId}
          attach={true}
          release={true}
          options={RoomOptionsDefaults}
        >
          <TestComponent
            callback={() => {
              called2 += 1;
            }}
          />
        </ChatRoomProvider>
      );

      return (
        <ChatClientProvider client={chatClient}>
          {room1 ? component1 : <></>}
          {room2 ? component2 : <></>}
        </ChatClientProvider>
      );
    };

    const r = render(
      <TestProvider
        room1={true}
        room2={true}
      />,
    );

    expect(called1).toBe(1);
    expect(called2).toBe(1);
    await vi.waitFor(() => {
      expect(room.attach).toHaveBeenCalledTimes(1);
    });
    expect(room.detach).toHaveBeenCalledTimes(0);
    expect(chatClient.rooms.release).toHaveBeenCalledTimes(0);

    r.rerender(
      <TestProvider
        room1={false}
        room2={true}
      />,
    );
    expect(called1).toBe(2);
    expect(called2).toBe(3);
    await vi.waitFor(() => {
      expect(room.attach).toHaveBeenCalledTimes(1);
    });
    expect(room.detach).toHaveBeenCalledTimes(0);
    expect(chatClient.rooms.release).toHaveBeenCalledTimes(0);

    r.rerender(
      <TestProvider
        room1={true}
        room2={true}
      />,
    );
    expect(called1).toBe(3);
    expect(called2).toBe(4);
    await vi.waitFor(() => {
      expect(room.attach).toHaveBeenCalledTimes(1);
    });
    expect(room.detach).toHaveBeenCalledTimes(0);
    expect(chatClient.rooms.release).toHaveBeenCalledTimes(0);

    r.rerender(
      <TestProvider
        room1={false}
        room2={true}
      />,
    );
    expect(called1).toBe(3);
    expect(called2).toBe(5);
    await vi.waitFor(() => {
      expect(room.attach).toHaveBeenCalledTimes(1);
    });
    expect(room.detach).toHaveBeenCalledTimes(0);
    expect(chatClient.rooms.release).toHaveBeenCalledTimes(0);

    r.rerender(
      <TestProvider
        room1={false}
        room2={false}
      />,
    );
    expect(called1).toBe(3);
    expect(called2).toBe(5);
    await vi.waitFor(() => {
      expect(room.attach).toHaveBeenCalledTimes(1);
    });
    // room.detach is not called when releasing, detach happens via lifecycleManager but skipping the public API
    expect(room.detach).toHaveBeenCalledTimes(0);
    await vi.waitFor(() => {
      expect(chatClient.rooms.release).toHaveBeenCalledWith(roomId);
    });
  });

  it('should correctly set room status callback', async () => {
    const chatClient = newChatClient();
    const roomId = randomRoomId();
    const room = await chatClient.rooms.get(roomId, RoomOptionsDefaults);

    let listeners: RoomStatusListener[] = [];

    vi.spyOn(room, 'onStatusChange').mockImplementation((listener) => {
      listeners.push(listener);
      return {
        off: () => {
          listeners = listeners.filter((l) => l !== listener);
        },
      };
    });

    const expectedChange = { current: RoomStatus.Attached, previous: RoomStatus.Attaching };
    let called = false;
    const listener: RoomStatusListener = (foundChange) => {
      expect(foundChange).toBe(expectedChange);
      called = true;
    };

    const WithClient = ({ children }: { children: React.ReactNode }) => {
      return (
        <ChatClientProvider client={chatClient}>
          <ChatRoomProvider
            id={roomId}
            options={RoomOptionsDefaults}
          >
            {children}
          </ChatRoomProvider>
        </ChatClientProvider>
      );
    };

    renderHook(
      () =>
        useRoom({
          onStatusChange: listener,
        }),
      { wrapper: WithClient },
    );

    // useEffect is async, so we need to wait for it to run
    await vi.waitFor(() => {
      expect(listeners.length).toBe(2);
    });

    act(() => {
      for (const l of listeners) l(expectedChange);
    });

    expect(called).toBeTruthy();
    await room.detach();
  });

  it('should correctly set room status and error state variables', async () => {
    const chatClient = newChatClient();
    const roomId = randomRoomId();
    const room = await chatClient.rooms.get(roomId, RoomOptionsDefaults);

    let listeners: RoomStatusListener[] = [];

    vi.spyOn(room, 'onStatusChange').mockImplementation((listener) => {
      listeners.push(listener);
      return {
        off: () => {
          listeners = listeners.filter((l) => l !== listener);
        },
      };
    });

    const WithClient = ({ children }: { children: React.ReactNode }) => {
      return (
        <ChatClientProvider client={chatClient}>
          <ChatRoomProvider
            id={roomId}
            options={RoomOptionsDefaults}
          >
            {children}
          </ChatRoomProvider>
        </ChatClientProvider>
      );
    };

    const { result } = renderHook(() => useRoom(), { wrapper: WithClient });

    // Because useEffect adds listeners async, wait until we have a listener
    await vi.waitFor(() => {
      expect(listeners.length).toBe(1);
    });

    act(() => {
      const change = { current: RoomStatus.Attached, previous: RoomStatus.Attaching };
      for (const l of listeners) l(change);
    });

    await vi.waitFor(() => {
      expect(result.current.roomStatus).toBe(RoomStatus.Attached);
    });
    expect(result.current.roomError).toBeUndefined();

    act(() => {
      const change = { current: RoomStatus.Detaching, previous: RoomStatus.Attached };
      for (const l of listeners) l(change);
    });

    await vi.waitFor(() => {
      expect(result.current.roomStatus).toBe(RoomStatus.Detaching);
    });
    expect(result.current.roomError).toBeUndefined();

    const err = new Ably.ErrorInfo('test', 123, 456);
    act(() => {
      const change = { current: RoomStatus.Failed, previous: RoomStatus.Detaching, error: err };
      for (const l of listeners) l(change);
    });

    await vi.waitFor(() => {
      expect(result.current.roomStatus).toBe(RoomStatus.Failed);
    });
    await vi.waitFor(() => {
      expect(result.current.roomError).toBe(err);
    });
    await room.detach();
  });
});

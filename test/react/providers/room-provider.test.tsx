import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useRoom } from '../../../src/react/index.ts';
import { ChatClientProvider } from '../../../src/react/providers/chat-client-provider.tsx';
import { ChatRoomProvider } from '../../../src/react/providers/chat-room-provider.tsx';
import { newChatClient } from '../../helper/chat.ts';
import { randomRoomId } from '../../helper/identifier.ts';

vi.mock('ably');

describe('ChatRoomProvider', () => {
  afterEach(() => {
    cleanup();
  });

  it('should create a provider without error', async () => {
    const chatClient = newChatClient();
    let roomResolved = false;
    const TestComponent = () => {
      const { room } = useRoom();
      if (room) {
        roomResolved = true;
      }
      return <div />;
    };
    const roomId = randomRoomId();
    const TestProvider = () => {
      return (
        <ChatClientProvider client={chatClient}>
          <ChatRoomProvider
            id={roomId}
            attach={false}
            release={true}
          >
            <TestComponent />
          </ChatRoomProvider>
        </ChatClientProvider>
      );
    };
    render(<TestProvider />);

    // Try to get the client to get a room with different options, should fail
    await vi.waitFor(() => {
      expect(roomResolved).toBeTruthy();
    });
    await expect(() =>
      chatClient.rooms.get(roomId, { occupancy: { enableOccupancyEvents: true } }),
    ).rejects.toBeErrorInfoWithCode(40000);

    // Now try it with the right options, should be fine
    await chatClient.rooms.get(roomId);
    expect(() => chatClient.rooms.get(roomId)).toBeTruthy();
  });

  it('should correctly release rooms', async () => {
    const chatClient = newChatClient();
    const TestComponent = () => {
      return <div />;
    };
    const roomId = randomRoomId();
    const TestProvider = () => {
      return (
        <ChatClientProvider client={chatClient}>
          <ChatRoomProvider
            id={roomId}
            attach={false}
            release={true}
          >
            <TestComponent />
          </ChatRoomProvider>
        </ChatClientProvider>
      );
    };
    const r = render(<TestProvider />);

    // Try to get the client to get a room with different options, should fail
    await expect(() =>
      chatClient.rooms.get(roomId, { occupancy: { enableOccupancyEvents: true } }),
    ).rejects.toBeErrorInfoWithCode(40000);

    // Now try it with the right options, should be fine
    expect(() => chatClient.rooms.get(roomId));

    // Unmount provider
    r.unmount();

    // Since the room is supposed to be released on unmount, we should be able
    // to get it again with different settings
    expect(() => chatClient.rooms.get(roomId)).toBeTruthy();
  });

  it('should attach and detach correctly', async () => {
    const chatClient = newChatClient();
    const TestComponent = () => {
      return <div />;
    };
    const roomId = randomRoomId();

    const room = await chatClient.rooms.get(roomId);
    expect(room).toBeTruthy();

    vi.spyOn(room, 'attach');
    vi.spyOn(room, 'detach');

    const TestProvider = () => {
      return (
        <ChatClientProvider client={chatClient}>
          <ChatRoomProvider
            id={roomId}
            attach={true}
            release={false}
          >
            <TestComponent />
          </ChatRoomProvider>
        </ChatClientProvider>
      );
    };
    const r = render(<TestProvider />);

    // Make sure the room is attaching
    await vi.waitFor(() => {
      expect(room.attach).toHaveBeenCalled();
    });

    r.unmount();
    // Make sure the room is detaching
    await vi.waitFor(() => {
      expect(room.detach).toHaveBeenCalled();
    });

    // Try to get the client to get a room with different options, should fail
    await expect(() =>
      chatClient.rooms.get(roomId, { occupancy: { enableOccupancyEvents: true } }),
    ).rejects.toBeErrorInfoWithCode(40000);
  });

  it('should not attach, detach, or release when not configured to do so', async () => {
    const chatClient = newChatClient();
    const TestComponent = () => {
      return <div />;
    };
    const roomId = randomRoomId();

    const room = await chatClient.rooms.get(roomId);
    expect(room).toBeTruthy();

    vi.spyOn(room, 'attach');
    vi.spyOn(room, 'detach');

    const TestProvider = () => {
      return (
        <ChatClientProvider client={chatClient}>
          <ChatRoomProvider
            id={roomId}
            attach={false}
            release={false}
          >
            <TestComponent />
          </ChatRoomProvider>
        </ChatClientProvider>
      );
    };
    const r = render(<TestProvider />);

    // Make sure the room is attaching
    expect(room.attach).toHaveBeenCalledTimes(0);

    r.unmount();
    // Make sure the room is detaching
    expect(room.detach).toHaveBeenCalledTimes(0);

    // Try to get the client to get a room with different options, should fail (since it should not be released)
    await expect(() =>
      chatClient.rooms.get(roomId, { occupancy: { enableOccupancyEvents: true } }),
    ).rejects.toBeErrorInfoWithCode(40000);

    await chatClient.rooms.release(roomId);
  });
});

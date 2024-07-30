import { ChatClient, RoomOptionsDefaults } from '@ably/chat';
import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ChatClientProvider } from '../../../src/react/providers/chat-client-provider.tsx';
import { ChatRoomProvider } from '../../../src/react/providers/chat-room-provider.tsx';
import { newChatClient } from '../../helper/chat.ts';
import { randomRoomId } from '../../helper/identifier.ts';

vi.mock('ably');

describe('ChatRoomProvider', () => {
  it('should create a provider without error', () => {
    const chatClient = newChatClient() as unknown as ChatClient;
    const TestComponent = () => {
      return <div />;
    };
    const roomId = randomRoomId();
    const TestProvider = () => {
      return (
        <ChatClientProvider client={chatClient}>
          <ChatRoomProvider
            id={roomId}
            options={{ reactions: RoomOptionsDefaults.reactions }}
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
    expect(() => chatClient.rooms.get(roomId, RoomOptionsDefaults)).toThrowErrorInfoWithCode(40000);

    // Now try it with the right options, should be fine
    expect(() => chatClient.rooms.get(roomId, { reactions: RoomOptionsDefaults.reactions })).toBeTruthy();
  });

  it('should correctly release rooms', () => {
    const chatClient = newChatClient() as unknown as ChatClient;
    const TestComponent = () => {
      return <div />;
    };
    const roomId = randomRoomId();
    const TestProvider = () => {
      return (
        <ChatClientProvider client={chatClient}>
          <ChatRoomProvider
            id={roomId}
            options={{ reactions: RoomOptionsDefaults.reactions }}
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
    expect(() => chatClient.rooms.get(roomId, RoomOptionsDefaults)).toThrowErrorInfoWithCode(40000);

    // Now try it with the right options, should be fine
    expect(() => chatClient.rooms.get(roomId, { reactions: RoomOptionsDefaults.reactions }));

    // Unmount provider
    r.unmount();

    // Since the room is supposed to be released on unmount, we should be able
    // to get it again with different settings
    expect(() => chatClient.rooms.get(roomId, RoomOptionsDefaults)).toBeTruthy();
  });

  it('should attach and detach correctly', () => {
    const chatClient = newChatClient() as unknown as ChatClient;
    const TestComponent = () => {
      return <div />;
    };
    const roomId = randomRoomId();

    const room = chatClient.rooms.get(roomId, { reactions: RoomOptionsDefaults.reactions });
    expect(room).toBeTruthy();

    vi.spyOn(room, 'attach');
    vi.spyOn(room, 'detach');

    const TestProvider = () => {
      return (
        <ChatClientProvider client={chatClient}>
          <ChatRoomProvider
            id={roomId}
            options={{ reactions: RoomOptionsDefaults.reactions }}
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
    expect(room.attach).toHaveBeenCalled();

    r.unmount();
    // Make sure the room is detaching
    expect(room.detach).toHaveBeenCalled();

    // Try to get the client to get a room with different options, should fail
    expect(() => chatClient.rooms.get(roomId, RoomOptionsDefaults)).toThrowErrorInfoWithCode(40000);
  });

  it('should not attach, detach, or release when not configured to do so', () => {
    const chatClient = newChatClient() as unknown as ChatClient;
    const TestComponent = () => {
      return <div />;
    };
    const roomId = randomRoomId();

    const room = chatClient.rooms.get(roomId, { reactions: RoomOptionsDefaults.reactions });
    expect(room).toBeTruthy();

    vi.spyOn(room, 'attach');
    vi.spyOn(room, 'detach');

    const TestProvider = () => {
      return (
        <ChatClientProvider client={chatClient}>
          <ChatRoomProvider
            id={roomId}
            options={{ reactions: RoomOptionsDefaults.reactions }}
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
    expect(() => chatClient.rooms.get(roomId, RoomOptionsDefaults)).toThrowErrorInfoWithCode(40000);

    void chatClient.rooms.release(roomId);
  });
});

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
  it('it should create a provider without error', () => {
    const chatClient = newChatClient() as unknown as ChatClient;
    const TestComponent = () => {
      return <div />;
    };
    const roomId = randomRoomId();
    const TestProvider = () => {
      return (
      <ChatClientProvider client={chatClient}>
        <ChatRoomProvider id={roomId} options={{reactions: RoomOptionsDefaults.reactions}}>
          <TestComponent/>
        </ChatRoomProvider>
      </ChatClientProvider>
    )};
    render(<TestProvider />);

    // Try to get the client to get a room with different options, should fail
    expect(() => chatClient.rooms.get(roomId, RoomOptionsDefaults)).toThrowErrorInfoWithCode(40000);

    // Now try it with the right options, should be fine
    expect(() => chatClient.rooms.get(roomId, {reactions: RoomOptionsDefaults.reactions})).toBeTruthy();
  });
});

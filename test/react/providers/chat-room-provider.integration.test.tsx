import { cleanup, configure, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RoomStatus } from '../../../src/core/room-status.ts';
import { ChatClientProvider } from '../../../src/react/providers/chat-client-provider.tsx';
import { ChatRoomProvider } from '../../../src/react/providers/chat-room-provider.tsx';
import { newChatClient } from '../../helper/chat.ts';
import { randomRoomName } from '../../helper/identifier.ts';

describe('ChatRoomProvider', () => {
  beforeEach(() => {
    configure({ reactStrictMode: true });
  });

  afterEach(() => {
    configure({ reactStrictMode: false });
    cleanup();
  });

  // This check ensures that a chat room is valid when being used in strict mode
  it('should attach the room in strict mode', async () => {
    const chatClient = newChatClient();
    const TestComponent = () => {
      return <div />;
    };
    const roomName = randomRoomName();

    const TestProvider = () => {
      return (
        <ChatClientProvider client={chatClient}>
          <ChatRoomProvider
            name={roomName}
            attach={true}
            release={false}
          >
            <TestComponent />
          </ChatRoomProvider>
        </ChatClientProvider>
      );
    };
    render(<TestProvider />);

    const room = await chatClient.rooms.get(roomName);
    await vi.waitFor(
      () => {
        expect(room.status).toBe(RoomStatus.Attached);
      },
      { timeout: 5000 },
    );
  });
});

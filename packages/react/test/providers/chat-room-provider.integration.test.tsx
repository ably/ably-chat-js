import { cleanup, configure, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RoomOptionsDefaults } from '../../../core/src/room-options.ts';
import { RoomStatus } from '../../../core/src/room-status.ts';
import { ChatClientProvider } from '../../src/providers/chat-client-provider.tsx';
import { ChatRoomProvider } from '../../src/providers/chat-room-provider.tsx';
import { newChatClient } from '../../../shared/testhelper/chat.ts';
import { randomRoomId } from '../../../shared/testhelper/identifier.ts';

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
    const roomId = randomRoomId();

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
    render(<TestProvider />);

    const room = await chatClient.rooms.get(roomId, { reactions: RoomOptionsDefaults.reactions });
    await vi.waitFor(
      () => {
        expect(room.status).toBe(RoomStatus.Attached);
      },
      { timeout: 5000 },
    );
  });
});

import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { RoomLifecycle } from '../../../src/core/room-status.ts';
import { RoomProvider, useRoom, UseRoomResponse } from '../../../src/react/index.ts';
import { ChatClientProvider } from '../../../src/react/providers/chat-client-provider.tsx';
import { newChatClient } from '../../helper/chat.ts';
import { randomRoomId } from '../../helper/identifier.ts';

const TestComponent: React.FC<{ callback?: (room: UseRoomResponse) => void }> = ({ callback }) => {
  const response = useRoom();
  if (callback) callback(response);
  return <></>;
};

vi.mock('ably');

describe('useRoom', () => {
  it('it should throw an error if used outside of RoomProvider', () => {
    expect(() => render(<TestComponent />)).toThrowErrorInfo({
      code: 40000,
      message: 'useRoom hook must be used within a chat RoomProvider',
    });
  });

  it('it should get the room from the context without error', () => {
    const chatClient = newChatClient();
    let called = false;
    const roomId = randomRoomId();
    const TestProvider = () => (
      <ChatClientProvider client={chatClient}>
        <RoomProvider
          id={roomId}
          attach={false}
          release={false}
        >
          <TestComponent
            callback={(response) => {
              expect(response.room.roomId).toBe(roomId);
              expect(response.attach).toBeTruthy();
              expect(response.detach).toBeTruthy();
              expect(response.roomStatus).toBe(RoomLifecycle.Initialized);
              // expect(response.connectionStatus).toBe(ConnectionLifecycle.Initialized);
              called = true;
            }}
          />
        </RoomProvider>
      </ChatClientProvider>
    );
    render(<TestProvider />);
    expect(called).toBe(true);
  });

  /** tests planned:
   *
   * - attach and detach functions work
   * - same room in the same tree should work with release=false, attach=false
   * - room status callbacks work
   * - room status state variable works correctly
   * - connection status callbacks are accessible (they should be tested elsewhere, here we just make sure they are passed through)
   * - multiple rooms with different providers
   */
});

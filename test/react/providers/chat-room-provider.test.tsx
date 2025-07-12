import { act, cleanup, render } from '@testing-library/react';
import React, { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatClient } from '../../../src/core/chat-client.js';
import { Room } from '../../../src/core/room.js';
import { RoomOptions } from '../../../src/core/room-options.js';
import { ChatClientProvider } from '../../../src/react/providers/chat-client-provider.js';
import { ChatRoomProvider } from '../../../src/react/providers/chat-room-provider.js';
import { makeTestLogger } from '../../helper/logger.js';

vi.mock('ably');

interface TestContext {
  mockRoom: Room;
  mockChatClient: ChatClient;
}

describe('ChatRoomProvider', () => {
  beforeEach<TestContext>((context) => {
    context.mockRoom = {
      attach: vi.fn(() => Promise.resolve()),
      detach: vi.fn(() => Promise.resolve()),
    } as unknown as Room;

    context.mockChatClient = {
      rooms: {
        get: vi.fn(() => Promise.resolve(context.mockRoom)),
        release: vi.fn(() => new Promise((resolve) => setTimeout(resolve, 50))), // Make release take some time
      },
      logger: makeTestLogger(),
      addReactAgent: vi.fn(() => {}),
    } as unknown as ChatClient;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('room release behavior', () => {
    it<TestContext>('should abort previous release when mounting with same room and options', (context) => {
      // Create a stable options ref
      const options = {};

      // Create a component that we can show/hide
      const TestComponent = () => (
        <StrictMode>
          <ChatClientProvider client={context.mockChatClient}>
            <ChatRoomProvider
              name="test-room"
              options={options}
            >
              <div>Test Content</div>
            </ChatRoomProvider>
          </ChatClientProvider>
        </StrictMode>
      );

      // Initial render
      render(<TestComponent />, { reactStrictMode: true });

      // The release should have been aborted, so release should not have been called
      expect(context.mockChatClient.rooms.release).not.toHaveBeenCalled();

      // Cleanup
      cleanup();
    });

    it<TestContext>('should proceed with release when not remounting', async (context) => {
      const { unmount } = render(
        <ChatClientProvider client={context.mockChatClient}>
          <ChatRoomProvider name="test-room">
            <div>Test Content</div>
          </ChatRoomProvider>
        </ChatClientProvider>,
      );

      // Wait for initial setup
      await act(async () => {
        await Promise.resolve();
      });

      // Unmount to trigger release
      unmount();

      // Wait for release to complete
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // The release should have been called
      expect(context.mockChatClient.rooms.release).toHaveBeenCalledWith('test-room');
    });

    it<TestContext>('should not abort release when mounting with different options', async (context) => {
      // Create a component that we can show/hide and change options
      const TestComponent = ({ show, options }: { show: boolean; options?: RoomOptions }) => {
        if (!show) return null;
        return (
          <ChatClientProvider client={context.mockChatClient}>
            <ChatRoomProvider
              name="test-room"
              options={options}
            >
              <div>Test Content</div>
            </ChatRoomProvider>
          </ChatClientProvider>
        );
      };

      // Initial render
      const { rerender } = render(<TestComponent show={true} />);

      // Wait for initial setup
      await act(async () => {
        await Promise.resolve();
      });

      // Hide the component to trigger release and immediately show it again with different options
      await act(async () => {
        rerender(<TestComponent show={false} />);
        // Immediately rerender with different options before the release promise resolves
        rerender(
          <TestComponent
            show={true}
            options={{ someOption: true } as RoomOptions}
          />,
        );
        await Promise.resolve();
      });

      // Wait for release to complete
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // The release should have proceeded since options changed
      expect(context.mockChatClient.rooms.release).toHaveBeenCalledWith('test-room');
    });
  });
});

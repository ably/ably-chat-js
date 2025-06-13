import { act,render } from '@testing-library/react';
import React from 'react';
import { afterEach,describe, expect, it, vi } from 'vitest';

import { ChatClient } from '../../../src/core/chat.js';
import { Room } from '../../../src/core/room.js';
import { RoomOptions } from '../../../src/core/room-options.js';
import { ChatClientProvider } from '../../../src/react/providers/chat-client-provider.js';
import { ChatRoomProvider } from '../../../src/react/providers/chat-room-provider.js';

vi.mock('ably');

describe('ChatRoomProvider', () => {
  const mockRoom = {
    attach: vi.fn(() => Promise.resolve()),
    detach: vi.fn(() => Promise.resolve()),
  } as unknown as Room;

  const mockChatClient = {
    rooms: {
      get: vi.fn(() => Promise.resolve(mockRoom)),
      release: vi.fn(() => new Promise(resolve => setTimeout(resolve, 50))), // Make release take some time
    },
    logger: {
      withContext: () => ({
        debug: vi.fn(() => {}),
        trace: vi.fn(() => {}),
        error: vi.fn(() => {}),
      }),
    },
    addReactAgent: vi.fn(() => {}),
  } as unknown as ChatClient;

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('room release behavior', () => {
    it('should abort previous release when mounting with same room and options', async () => {
      // Create a component that we can show/hide
      const TestComponent = ({ show }: { show: boolean }) => {
        if (!show) return null;
        return (
          <ChatClientProvider client={mockChatClient}>
            <ChatRoomProvider name="test-room">
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

      // Hide the component to trigger release and immediately show it again
      await act(async () => {
        rerender(<TestComponent show={false} />);
        // Immediately rerender before the release promise resolves
        rerender(<TestComponent show={true} />);
        await Promise.resolve();
      });

      // Wait a bit to ensure any release would have happened if not aborted
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // The release should have been aborted, so release should not have been called
      expect(mockChatClient.rooms.release).not.toHaveBeenCalled();
    });

    it('should proceed with release when not remounting', async () => {
      const { unmount } = render(
        <ChatClientProvider client={mockChatClient}>
          <ChatRoomProvider name="test-room">
            <div>Test Content</div>
          </ChatRoomProvider>
        </ChatClientProvider>
      );

      // Wait for initial setup
      await act(async () => {
        await Promise.resolve();
      });

      // Unmount to trigger release
      unmount();

      // Wait for release to complete
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // The release should have been called
      expect(mockChatClient.rooms.release).toHaveBeenCalledWith('test-room');
    });

    it('should not abort release when mounting with different options', async () => {
      // Create a component that we can show/hide and change options
      const TestComponent = ({ show, options }: { show: boolean; options?: RoomOptions }) => {
        if (!show) return null;
        return (
          <ChatClientProvider client={mockChatClient}>
            <ChatRoomProvider name="test-room" options={options}>
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
        rerender(<TestComponent show={true} options={{ someOption: true } as RoomOptions} />);
        await Promise.resolve();
      });

      // Wait for release to complete
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // The release should have proceeded since options changed
      expect(mockChatClient.rooms.release).toHaveBeenCalledWith('test-room');
    });
  });
}); 

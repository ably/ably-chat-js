import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { RoomOptionsDefaults } from '../../../core/src/room-options.ts';
import { useRoomContext } from '../../src/helper/use-room-context.ts';
import { ChatRoomProvider } from '../../src/index.ts';
import { ChatClientProvider } from '../../src/providers/chat-client-provider.tsx';
import { newChatClient } from '../../src/helper/chat.ts';

describe('useRoom', () => {
  afterEach(() => {
    cleanup();
  });

  it('should throw an error if used outside of ChatRoomProvider', () => {
    const chatClient = newChatClient();

    const TestThrowError: React.FC = () => {
      expect(() => useRoomContext('foo')).toThrowErrorInfo({
        code: 40000,
        message: 'foo hook must be used within a <ChatRoomProvider>',
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

  it('should return the context if used within ChatRoomProvider', () => {
    const chatClient = newChatClient();

    const TestUseRoom: React.FC = () => {
      const context = useRoomContext('foo');
      expect(context).toBeDefined();
      expect(context.roomId).toBe('foo');
      expect(context.options).toBe(RoomOptionsDefaults);
      return null;
    };

    const TestProvider = () => (
      <ChatClientProvider client={chatClient}>
        <ChatRoomProvider
          id="foo"
          options={RoomOptionsDefaults}
        >
          <TestUseRoom />
        </ChatRoomProvider>
      </ChatClientProvider>
    );

    render(<TestProvider />);
  });
});

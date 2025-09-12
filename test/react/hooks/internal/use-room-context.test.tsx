import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useRoomContext } from '../../../../src/react/hooks/internal/use-room-context.ts';
import { ChatRoomProvider } from '../../../../src/react/index.ts';
import { ChatClientProvider } from '../../../../src/react/providers/chat-client-provider.tsx';
import { newChatClient } from '../../../helper/chat.ts';

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
      expect(context.roomName).toBe('foo');
      expect(context.options).toBeUndefined();
      return null;
    };

    const TestProvider = () => (
      <ChatClientProvider client={chatClient}>
        <ChatRoomProvider name="foo">
          <TestUseRoom />
        </ChatRoomProvider>
      </ChatClientProvider>
    );

    render(<TestProvider />);
  });
});

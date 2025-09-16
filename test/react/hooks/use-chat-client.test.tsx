import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useChatClient } from '../../../src/react/hooks/use-chat-client.ts';
import { ChatClientProvider } from '../../../src/react/providers/chat-client-provider.tsx';
import { newChatClient } from '../../helper/chat.ts';

const TestComponent: React.FC<{ callback: (clientId: string) => void }> = ({ callback }) => {
  const { clientId } = useChatClient();
  callback(clientId);
  return <div />;
};

vi.mock('ably');

describe('useChatClient', () => {
  afterEach(() => {
    cleanup();
  });

  it('should provide the clientId', () => {
    let clientId: string | undefined;
    const TestComponent = () => {
      clientId = useChatClient().clientId;
      return <div />;
    };

    const chatClient = newChatClient();
    render(
      <ChatClientProvider client={chatClient}>
        <TestComponent />
      </ChatClientProvider>,
    );

    expect(clientId).toEqual(chatClient.clientId);
  });

  it('should throw an error if used outside of ChatClientProvider', () => {
    const TestThrowError: React.FC = () => {
      expect(() => useChatClient()).toThrowErrorInfo({
        code: 40000,
        message: 'useChatClient hook must be used within a chat client provider',
      });
      return null;
    };

    render(<TestThrowError />);
  });

  it('should provide the same chat client to nested components', () => {
    let clientId1: string | undefined;
    let clientId2: string | undefined;
    const TestComponentInner = () => {
      clientId1 = useChatClient().clientId;
      return <div />;
    };

    const TestComponentOuter = () => {
      clientId2 = useChatClient().clientId;
      return <TestComponentInner />;
    };

    const chatClient = newChatClient();
    render(
      <ChatClientProvider client={chatClient}>
        <TestComponentOuter />
      </ChatClientProvider>,
    );

    if (!clientId1 || !clientId2) {
      expect.fail('client1 or client2 is undefined');
    }

    expect(clientId1).toEqual(clientId2);
  });

  it('should handle context updates correctly', () => {
    const client1 = newChatClient();
    const client2 = newChatClient();
    const { rerender } = render(
      <ChatClientProvider client={client1}>
        <TestComponent
          callback={(clientId) => {
            expect(clientId).toEqual(client1.clientId);
          }}
        />
      </ChatClientProvider>,
    );

    rerender(
      <ChatClientProvider client={client2}>
        <TestComponent
          callback={(clientId) => {
            expect(clientId).toEqual(client2.clientId);
          }}
        />
      </ChatClientProvider>,
    );
  });
});

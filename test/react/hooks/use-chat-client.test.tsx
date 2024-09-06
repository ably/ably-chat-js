import { ChatClient } from '@ably/chat';
import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RealtimeWithOptions } from '../../../src/core/realtime-extensions.ts';
import { VERSION } from '../../../src/core/version.ts';
import { useChatClient } from '../../../src/react/hooks/use-chat-client.ts';
import { useRoom } from '../../../src/react/hooks/use-room.ts';
import { ChatClientProvider } from '../../../src/react/providers/chat-client-provider.tsx';
import { newChatClient } from '../../helper/chat.ts';

const TestComponent: React.FC<{ callback: (client: ChatClient) => void }> = ({ callback }) => {
  const chatClient = useChatClient();
  callback(chatClient);
  return <div />;
};

vi.mock('ably');

describe('useChatClient', () => {
  afterEach(() => {
    cleanup();
  });

  it('should throw an error if used outside of ChatClientProvider', () => {
    const TestThrowError: React.FC = () => {
      expect(() => useRoom()).toThrowErrorInfo({
        code: 40000,
        message: 'useChatClient hook must be used within a chat client provider',
      });
      return null;
    };

    render(<TestThrowError />);
  });

  it('should get the chat client from the context without error and with the correct agent', () => {
    const chatClient = newChatClient() as unknown as ChatClient;
    const TestProvider = () => (
      <ChatClientProvider client={chatClient}>
        <TestComponent
          callback={(client) => {
            expect(client).toBe(chatClient);
            const agents = (client.realtime as RealtimeWithOptions).options.agents;
            expect(agents).toEqual({ 'chat-js': VERSION, 'chat-react': VERSION });
          }}
        />
      </ChatClientProvider>
    );
    render(<TestProvider />);
  });

  it('should provide the same chat client to nested components', () => {
    let client1: ChatClient | undefined;
    let client2: ChatClient | undefined;
    const TestComponentInner = () => {
      client1 = useChatClient();
      return <div />;
    };

    const TestComponentOuter = () => {
      client2 = useChatClient();
      return <TestComponentInner />;
    };

    const chatClient = newChatClient() as unknown as ChatClient;
    render(
      <ChatClientProvider client={chatClient}>
        <TestComponentOuter />
      </ChatClientProvider>,
    );

    if (!client1 || !client2) {
      expect.fail('client1 or client2 is undefined');
    }

    expect(client1).toEqual(client2);
  });
  it('should handle context updates correctly', () => {
    const client1 = newChatClient() as unknown as ChatClient;
    const client2 = newChatClient() as unknown as ChatClient;
    const { rerender } = render(
      <ChatClientProvider client={client1}>
        <TestComponent
          callback={(client) => {
            expect(client).toBe(client1);
          }}
        />
      </ChatClientProvider>,
    );

    rerender(
      <ChatClientProvider client={client2}>
        <TestComponent
          callback={(client) => {
            expect(client).toBe(client2);
          }}
        />
      </ChatClientProvider>,
    );
  });

  it('should provide same context across disconnected components', () => {
    let client1: ChatClient | undefined;
    let client2: ChatClient | undefined;
    const TestComponentInner = () => {
      client2 = useChatClient();
      return <div />;
    };

    const TestComponentOuter = () => {
      client1 = useChatClient();
      return <TestComponentInner />;
    };

    const chatClient = newChatClient() as unknown as ChatClient;
    render(
      <ChatClientProvider client={chatClient}>
        <div>
          <TestComponentOuter />
          <TestComponentOuter />
        </div>
      </ChatClientProvider>,
    );

    if (!client1 || !client2) {
      expect.fail('client1 or client2 is undefined');
    }

    // Check if the context value from the two independent components is the same (global context)
    expect(client1).toBe(client2);
  });

  it('should handle multiple providers correctly', () => {
    let innerClient: ChatClient | undefined;
    let outerClient: ChatClient | undefined;

    const TestComponentInner = () => {
      innerClient = useChatClient();
      return <div />;
    };

    const TestComponentOuter = () => {
      outerClient = useChatClient();
      return <div />;
    };

    const chatClientInner = newChatClient() as unknown as ChatClient;
    const chatClientOuter = newChatClient() as unknown as ChatClient;

    render(
      <ChatClientProvider client={chatClientOuter}>
        <TestComponentOuter />
        <ChatClientProvider client={chatClientInner}>
          <TestComponentInner />
        </ChatClientProvider>
      </ChatClientProvider>,
    );

    if (!innerClient || !outerClient) {
      expect.fail('innerClient or outerClient is undefined');
    }

    // Check if the correct client was used in the correct component (inner component uses inner client and vice versa)
    expect(innerClient).toBe(chatClientInner);
    expect(outerClient).toBe(chatClientOuter);
  });
});

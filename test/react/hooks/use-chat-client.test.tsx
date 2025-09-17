import { cleanup, render } from '@testing-library/react';
import * as Ably from 'ably';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import EventEmitter from '../../../src/core/utils/event-emitter.ts';
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

  it('should handle context updates correctly', async () => {
    const client1 = newChatClient();
    const client2 = newChatClient();

    let clientId: string | undefined;
    const { rerender } = render(
      <ChatClientProvider client={client1}>
        <TestComponent
          callback={(id) => {
            clientId = id;
          }}
        />
      </ChatClientProvider>,
    );

    // Wait for the clientId
    await vi.waitFor(() => {
      expect(clientId).toEqual(client1.clientId);
    });

    rerender(
      <ChatClientProvider client={client2}>
        <TestComponent
          callback={(id) => {
            clientId = id;
          }}
        />
      </ChatClientProvider>,
    );

    // Wait for the clientId
    await vi.waitFor(() => {
      expect(clientId).toEqual(client2.clientId);
    });
  });

  it('should update the clientId whenever connection status becomes connected', async () => {
    const client = newChatClient();
    // Start the connection state as disconnected
    const connectionEmitter = (
      client.realtime.connection as unknown as {
        eventEmitter: EventEmitter<{
          ['connected']: Ably.ConnectionStateChange;
          ['disconnected']: Ably.ConnectionStateChange;
        }>;
      }
    ).eventEmitter;
    connectionEmitter.emit('disconnected', {
      current: 'disconnected',
      previous: 'initialized',
    });

    let clientId: string | undefined;
    const { rerender } = render(
      <ChatClientProvider client={client}>
        <TestComponent
          callback={(id) => {
            clientId = id;
          }}
        />
      </ChatClientProvider>,
    );

    // Wait for the clientId
    await vi.waitFor(() => {
      expect(clientId).toEqual(client.clientId);
    });

    // Now we're going to change the clientId on the client and simulate a connection change
    vi.spyOn(client.realtime.auth, 'clientId', 'get').mockReturnValue('some-other-clientId');
    connectionEmitter.emit('connected', {
      current: 'connected',
      previous: 'disconnected',
    });

    rerender(
      <ChatClientProvider client={client}>
        <TestComponent
          callback={(id) => {
            clientId = id;
          }}
        />
      </ChatClientProvider>,
    );

    // Wait for the clientId
    await vi.waitFor(() => {
      expect(clientId).toEqual('some-other-clientId');
    });
  });

  it('subscribe and unsubscribe connection listeners', async () => {
    const client = newChatClient();
    const off = vi.fn();
    let subscribed = false;
    vi.spyOn(client.connection, 'onStatusChange').mockImplementation(() => {
      subscribed = true;
      return { off };
    });

    const { unmount } = render(
      <ChatClientProvider client={client}>
        <TestComponent callback={() => {}} />
      </ChatClientProvider>,
    );

    // Wait for the subscription
    await vi.waitFor(() => {
      expect(subscribed).toEqual(true);
    });

    // Unmount
    unmount();

    // Wait for the clientId
    await vi.waitFor(() => {
      expect(off).toHaveBeenCalledTimes(1);
    });
  });
});

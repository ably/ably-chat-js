import { act, cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useChatClient } from '../../../src/react/hooks/use-chat-client.ts';
import { ChatClientProvider } from '../../../src/react/providers/chat-client-provider.tsx';
import { newChatClient } from '../../helper/chat.ts';
import { ablyRealtimeClientWithToken } from '../../helper/realtime-client.ts';

describe('useChatClient integration', () => {
  afterEach(() => {
    cleanup();
  });

  it('should update clientId when realtime client connects', async () => {
    // Create a realtime client with autoConnect false and a fixed clientId
    const realtimeClient = ablyRealtimeClientWithToken({
      autoConnect: false,
      clientId: 'test-client-id',
      logLevel: 4,
      logHandler: console.log,
    });

    // Initialize a chat client from the realtime client
    const chatClient = newChatClient(undefined, realtimeClient);

    // Track the clientId from the hook
    let clientId: string | undefined;

    const TestComponent = () => {
      const { clientId: hookClientId } = useChatClient();
      clientId = hookClientId;
      return <div />;
    };

    // Render the component with the chat client
    const { rerender } = render(
      <ChatClientProvider client={chatClient}>
        <TestComponent />
      </ChatClientProvider>,
    );

    // After initial render, clientId should be undefined (not connected yet)
    expect(clientId).toBeUndefined();

    // Connect the realtime client
    realtimeClient.connect();

    // Wait for connection to establish
    await new Promise<void>((resolve) => {
      realtimeClient.connection.once('connected', () => {
        resolve();
      });
    });

    // Re-render with act to ensure effects run
    act(() => {
      rerender(
        <ChatClientProvider client={chatClient}>
          <TestComponent />
        </ChatClientProvider>,
      );
    });

    // Check the clientId matches the token clientId
    expect(clientId).toBe('test-client-id');
  }, 10000);
});

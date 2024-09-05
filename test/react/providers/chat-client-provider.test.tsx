import { ChatClient } from '@ably/chat';
import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, it, vi } from 'vitest';

import { ChatClientProvider } from '../../../src/react/providers/chat-client-provider.tsx';
import { newChatClient } from '../../helper/chat.ts';

vi.mock('ably');

describe('useChatClient', () => {
  afterEach(() => {
    cleanup();
  });

  it('should create a provider without error', () => {
    const chatClient = newChatClient() as unknown as ChatClient;
    const TestComponent = () => {
      return <div />;
    };
    const TestProvider = () => (
      <ChatClientProvider client={chatClient}>
        <TestComponent />
      </ChatClientProvider>
    );
    render(<TestProvider />);
  });
});

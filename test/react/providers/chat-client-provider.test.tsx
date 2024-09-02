import { ChatClient } from '@ably/chat';
import { render } from '@testing-library/react';
import React from 'react';
import { describe, it, vi } from 'vitest';

import { ChatClientProvider } from '../../../src/react/providers/chat-client-provider.tsx';
import { newChatClient } from '../../helper/chat.ts';

vi.mock('ably');

describe('useChatClient', () => {
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

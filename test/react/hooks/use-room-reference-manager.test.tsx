import { render, renderHook } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useRoomReferenceManager } from '../../../src/react/hooks/use-room-reference-manager.js';
import { ChatClientProvider } from '../../../src/react/providers/chat-client-provider.js';
import { newChatClient } from '../../helper/chat.js';

vi.mock('ably');

describe('useRoomReferenceManager', () => {
  it('should throw an error when used outside of ChatClientProvider', () => {
    const TestComponent: React.FC = () => {
      expect(() => useRoomReferenceManager()).toThrowErrorInfo({
        code: 40000,
        message: 'useRoomReferenceManager must be used within a ChatClientProvider',
      });
      return null;
    };

    render(<TestComponent />);
  });

  it('should return the room reference manager when used within ChatClientProvider', () => {
    const chatClient = newChatClient();

    const WithProvider = ({ children }: { children: React.ReactNode }) => (
      <ChatClientProvider client={chatClient}>{children}</ChatClientProvider>
    );

    const { result } = renderHook(() => useRoomReferenceManager(), {
      wrapper: WithProvider,
    });

    expect(result.current).toBeDefined();
    expect(result.current.client).toBe(chatClient);
  });

  it('should return the same manager instance across multiple calls', () => {
    const chatClient = newChatClient();

    const WithProvider = ({ children }: { children: React.ReactNode }) => (
      <ChatClientProvider client={chatClient}>{children}</ChatClientProvider>
    );

    const { result, rerender } = renderHook(() => useRoomReferenceManager(), {
      wrapper: WithProvider,
    });

    const firstManager = result.current;

    rerender();

    const secondManager = result.current;

    expect(firstManager).toBe(secondManager);
  });

  it('should create a new manager when client changes', () => {
    const chatClient1 = newChatClient();
    const chatClient2 = newChatClient();

    let currentClient = chatClient1;

    const WithProvider = ({ children }: { children: React.ReactNode }) => (
      <ChatClientProvider client={currentClient}>{children}</ChatClientProvider>
    );

    const { result, rerender } = renderHook(() => useRoomReferenceManager(), {
      wrapper: WithProvider,
    });

    const firstManager = result.current;
    expect(firstManager.client).toBe(chatClient1);

    // Change the client
    currentClient = chatClient2;
    rerender();

    const secondManager = result.current;
    expect(secondManager.client).toBe(chatClient2);
    expect(firstManager).not.toBe(secondManager);
  });
});

import * as Ably from 'ably';
import React from 'react';

import { ChatClient } from '../../core/chat.js';
import { ChatClientContext } from '../contexts/chat-client-context.js';
import { DEFAULT_CHAT_CLIENT_ID } from '../providers/chat-client-provider.js';

/**
 * Hook to access the chat client provided the current {@link ChatClientProvider}.
 * This hook must be used within a {@link ChatClientProvider}.
 *
 * @throws {ErrorInfo} When the hook is not used within a {@link ChatClientProvider}.
 *
 * @returns {ChatClient} The {@link ChatClient} instance provided by the context.
 *
 */
export const useChatClient = (): ChatClient => {
  const context = React.useContext(ChatClientContext)[DEFAULT_CHAT_CLIENT_ID];
  if (!context) {
    throw new Ably.ErrorInfo('useChatClient hook must be used within a chat client provider', 40000, 400);
  }
  return context.client;
};

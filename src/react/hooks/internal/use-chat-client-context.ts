import * as Ably from 'ably';
import React from 'react';

import { ChatClient } from '../../../core/chat-client.js';
import { ErrorCode } from '../../../core/errors.js';
import { ChatClientContext } from '../../contexts/chat-client-context.js';
import { DEFAULT_CHAT_CLIENT_ID } from '../../providers/chat-client-provider.js';

/**
 * Hook to access the chat client provided by the current {@link ChatClientProvider}.
 * This hook must be used within a {@link ChatClientProvider}.
 * @throws An {@link Ably.ErrorInfo} When the hook is not used within a {@link ChatClientProvider}.
 * @returns The {@link ChatClient} instance provided by the context.
 */
export const useChatClientContext = (): ChatClient => {
  const context = React.useContext(ChatClientContext)[DEFAULT_CHAT_CLIENT_ID];
  if (!context) {
    throw new Ably.ErrorInfo(
      'unable to get chat client; useChatClient hook must be used within a chat client provider',
      ErrorCode.ReactHookMustBeUsedWithinProvider,
      400,
    );
  }
  return context.client;
};

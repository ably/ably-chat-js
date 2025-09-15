// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { type ChatClient } from '../../core/chat-client.js';
import { useChatClientContext } from './internal/use-chat-client-context.js';

/**
 * The response from the {@link useChatClient} hook.
 */
export interface UseChatClientResponse {
  /**
   * The current clientId.
   */
  readonly clientId: string;
}

/**
 * Hook to access the chat client provided the current {@link ChatClientProvider}.
 * This hook must be used within a {@link ChatClientProvider}.
 * @throws {ErrorInfo} When the hook is not used within a {@link ChatClientProvider}.
 * @returns A {@link UseChatClientResponse} containing information about the ChatClient.
 */
export const useChatClient = (): UseChatClientResponse => {
  const client = useChatClientContext();

  return {
    clientId: client.realtime.auth.clientId,
  };
};

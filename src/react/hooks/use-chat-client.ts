import { useEffect, useState } from 'react';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { type ChatClient } from '../../core/chat-client.js';
import { ConnectionStatus, ConnectionStatusChange } from '../../core/connection.js';
import { useChatClientContext } from './internal/use-chat-client-context.js';
import { useLogger } from './internal/use-logger.js';

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
  const logger = useLogger();
  const [clientId, setClientId] = useState(() => {
    logger.debug('useChatClient(); setting initial clientId', { clientId: client.clientId });
    return client.clientId;
  });

  // Right now, it's possible to change the clientId being used on then core SDK, but only by disconnecting
  // and then reconnecting. So to ensure our clientId remains up to date, check it every time the SDK connects.
  useEffect(() => {
    logger.debug('useChatClient(); subscribing to connection status changes', {
      clientId: client.clientId,
    });

    // Set the clientId again in case it's changed between original state and effects
    setClientId(client.clientId);

    const { off } = client.connection.onStatusChange((change: ConnectionStatusChange) => {
      if (change.current === ConnectionStatus.Connected) {
        logger.debug('useChatClient(); connection status is now connected', {
          clientId: client.clientId,
        });
        setClientId(client.clientId);
      }
    });

    return () => {
      logger.debug('useChatClient(); unsubscribing from connection status changes');
      off();
    };
  }, [client, logger]);

  return {
    clientId,
  };
};

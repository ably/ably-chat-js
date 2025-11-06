// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as Ably from 'ably';
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
   * The current clientId, if known.
   *
   * **Important** When using an Ably key for authentication, this value is determined immediately. If using a token,
   * the clientId is not known until the client has successfully connected to and authenticated with
   * the server. Use the `chatClient.connection.status` to check the connection status.
   */
  readonly clientId?: string;
}

/**
 * React hook to access the chat client provided by the current {@link ChatClientProvider}.
 *
 * This hook automatically tracks the clientId and updates when connection state changes,
 * ensuring the most current client ID is always available. The client ID may change
 * when the underlying Ably Realtime client reconnects with different authentication.
 *
 * **Note**: This hook must be used within a {@link ChatClientProvider} component tree.
 * @returns A {@link UseChatClientResponse} containing the current client ID
 * @throws An {@link Ably.ErrorInfo} When used outside of a {@link ChatClientProvider}
 * @example
 * ```tsx
 * import * as Ably from 'ably';
 * import React from 'react';
 * import { ChatClient } from '@ably/chat';
 * import { ChatClientProvider, useChatClient } from '@ably/chat/react';
 *
 * // Component that displays current user information
 * const UserInfo = () => {
 *   const { clientId } = useChatClient();
 *   return (<p>Connected as: {clientId}</p>);
 * };
 *
 * const chatClient: ChatClient; // existing ChatClient instance
 *
 * // App component with provider
 * const App = () => {
 *   return (
 *     <ChatClientProvider client={chatClient}>
 *       <UserInfo />
 *     </ChatClientProvider>
 *   );
 * };
 *
 * export default App;
 * ```
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

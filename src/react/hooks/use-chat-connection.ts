import * as Ably from 'ably';
import { useEffect, useState } from 'react';

import { ConnectionStatus, ConnectionStatusChange, ConnectionStatusListener } from '../../core/connection.js';
import { useChatClientContext } from './internal/use-chat-client-context.js';
import { useEventListenerRef } from './internal/use-event-listener-ref.js';
import { useLogger } from './internal/use-logger.js';

/**
 * The options for the {@link useChatConnection} hook.
 */
export interface UseChatConnectionOptions {
  /**
   * A callback that will be called whenever the connection status changes.
   * The listener is removed when the component unmounts.
   * @example
   * ```tsx
   * useChatConnection({
   *   onStatusChange: (change) => {
   *     console.log(`Connection changed from ${change.previous} to ${change.current}`);
   *   }
   * });
   * ```
   */
  onStatusChange?: ConnectionStatusListener;
}

/**
 * The response from the {@link useChatConnection} hook.
 */
export interface UseChatConnectionResponse {
  /**
   * The current status of the connection. Kept up to date by the hook.
   */
  currentStatus: ConnectionStatus;

  /**
   * An error that provides a reason why the connection has entered the new status, if applicable.
   * Kept up to date by the hook.
   */
  error?: Ably.ErrorInfo;
}

/**
 * React hook that provides the current connection status and error between the client and Ably, and
 * allows the user to listen to connection status changes overtime.
 *
 * The hook will automatically clean up listeners when the component unmounts and
 * update the connection state whenever the underlying chat client changes.
 *
 * **Note**: This hook must be used within a {@link ChatClientProvider} component tree.
 * @param options - Optional configuration for the hook
 * @returns A {@link UseChatConnectionResponse} containing the current connection status and error
 * @throws An {@link Ably.ErrorInfo} When used outside of a {@link ChatClientProvider}
 * @example
 * ```tsx
 * import * as Ably from 'ably';
 * import React from 'react';
 * import { ChatClient, ConnectionStatus } from '@ably/chat';
 * import { ChatClientProvider, useChatConnection } from '@ably/chat/react';
 *
 * // Component that displays connection status
 * const ConnectionStatus = () => {
 *   const { currentStatus, error } = useChatConnection({
 *     onStatusChange: (change) => {
 *       console.log(`Connection changed from ${change.previous} to ${change.current}`);
 *       if (change.error) {
 *         console.error('Connection error:', change.error);
 *       }
 *     }
 *   });
 *   return (
 *     <div>
 *       <div>
 *         Status: {currentStatus}
 *       </div>
 *       {error && (
 *         <div>
 *           Error: {error.message} (Code: {error.code})
 *         </div>
 *       )}
 *     </div>
 *   );
 * };
 *
 * const chatClient: ChatClient; // existing ChatClient instance
 *
 * // App component with provider setup
 * const App = () => {
 *   return (
 *     <ChatClientProvider client={chatClient}>
 *       <ConnectionStatus />
 *     </ChatClientProvider>
 *   );
 * };
 *
 * export default App;
 * ```
 */
export const useChatConnection = (options?: UseChatConnectionOptions): UseChatConnectionResponse => {
  const chatClient = useChatClientContext();
  const logger = useLogger();
  logger.trace('useChatConnection();', options);

  // Initialize states with the current values from chatClient
  const [currentStatus, setCurrentStatus] = useState<ConnectionStatus>(chatClient.connection.status);
  const [error, setError] = useState<Ably.ErrorInfo | undefined>(chatClient.connection.error);

  // Update the states when the chatClient changes
  useEffect(() => {
    setError(chatClient.connection.error);
    setCurrentStatus(chatClient.connection.status);
  }, [chatClient]);

  // Create stable references for the listeners
  const onStatusChangeRef = useEventListenerRef(options?.onStatusChange);

  // Apply the listener to the chatClient's connection status changes to keep the state update across re-renders
  useEffect(() => {
    logger.debug('useChatConnection(); applying internal listener');
    const { off } = chatClient.connection.onStatusChange((change: ConnectionStatusChange) => {
      // Update states with new values
      setCurrentStatus(change.current);
      setError(change.error);
    });
    // Cleanup listener on un-mount
    return () => {
      logger.debug('useChatConnection(); cleaning up listener');
      off();
    };
  }, [chatClient.connection, logger]);

  // Register the listener for the user-provided onStatusChange callback
  useEffect(() => {
    if (!onStatusChangeRef) return;
    logger.debug('useChatConnection(); applying client listener');
    const { off } = chatClient.connection.onStatusChange(onStatusChangeRef);

    return () => {
      logger.debug('useChatConnection(); cleaning up client listener');
      off();
    };
  }, [chatClient.connection, logger, onStatusChangeRef]);

  return {
    currentStatus,
    error,
  };
};

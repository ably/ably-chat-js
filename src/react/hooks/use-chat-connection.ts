import { ErrorInfo } from 'ably';
import { useEffect, useState } from 'react';

import {
  Connection,
  ConnectionStatus,
  ConnectionStatusChange,
  ConnectionStatusListener,
} from '../../core/connection.js';
import { useEventListenerRef } from '../helper/use-event-listener-ref.js';
import { useChatClient } from './use-chat-client.js';
import { useLogger } from './use-logger.js';

/**
 * The options for the {@link useChatConnection} hook.
 */
export interface UseChatConnectionOptions {
  /**
   * A callback that will be called whenever the connection status changes.
   * The listener is removed when the component unmounts.
   */
  onStatusChange?: ConnectionStatusListener;
}

/**
 * The response from the {@link useChatConnection} hook.
 */
export interface UseChatConnectionResponse {
  /**
   * The current status of the {@link connection}.
   */
  currentStatus: ConnectionStatus;

  /**
   * An error that provides a reason why the {@link connection} has entered the new status, if applicable.
   */
  error?: ErrorInfo;

  /**
   * The current Ably {@link Connection} instance.
   */
  connection: Connection;
}

/**
 * A hook that provides the current connection status and error, and allows the user to listen to connection status changes.
 *
 * @param options - The options for the hook
 * @returns The current connection status and error, as well as the {@link Connection} instance.
 */
export const useChatConnection = (options?: UseChatConnectionOptions): UseChatConnectionResponse => {
  const chatClient = useChatClient();
  const logger = useLogger();
  logger.trace('useChatConnection();', options);

  // Initialize states with the current values from chatClient
  const [currentStatus, setCurrentStatus] = useState<ConnectionStatus>(chatClient.connection.status);
  const [error, setError] = useState<ErrorInfo | undefined>(chatClient.connection.error);
  const [connection, setConnection] = useState<Connection>(chatClient.connection);

  // Update the states when the chatClient changes
  useEffect(() => {
    setConnection(chatClient.connection);
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
    connection,
  };
};

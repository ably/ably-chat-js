import { Connection, ConnectionLifecycle, ConnectionStatusChange, ConnectionStatusListener } from '@ably/chat';
import { ErrorInfo } from 'ably';
import { useEffect, useState } from 'react';

import { useChatClient } from './use-chat-client.js';

/**
 * The options for the useChatConnection hook.
 */
export interface UseChatConnectionOptions {
  /**
   * A callback that will be called whenever the connection status changes.
   */
  onStatusChange?: ConnectionStatusListener;
}

/**
 * The response from the useChatConnection hook.
 */
export interface UseChatConnectionResponse {
  /**
   * The current status of the connection.
   */
  currentStatus: ConnectionLifecycle;

  /**
   * An error that provides a reason why the connection has entered the new status, if applicable.
   */
  error?: ErrorInfo;

  /**
   * The current Ably connection instance.
   */
  connection: Connection;
}

/**
 * A hook that provides the current connection status and error, and allows the user to listen to connection status changes.
 *
 * @param options - The options for the hook
 * @returns The current connection status and error, as well as the connection instance.
 */
export const useChatConnection = (options?: UseChatConnectionOptions): UseChatConnectionResponse => {
  const chatClient = useChatClient();

  // Initialize states with the current values from chatClient
  const [currentStatus, setCurrentStatus] = useState<ConnectionLifecycle>(chatClient.connection.status.current);
  const [error, setError] = useState<ErrorInfo | undefined>(chatClient.connection.status.error);
  const [connection, setConnection] = useState<Connection>(chatClient.connection);

  // Update the states when the chatClient changes
  useEffect(() => {
    setConnection(chatClient.connection);
    setError(chatClient.connection.status.error);
    setCurrentStatus(chatClient.connection.status.current);
  }, [chatClient]);

  // Apply the listener to the chatClient's connection status changes to keep the state update across re-renders
  useEffect(() => {
    const { off } = chatClient.connection.status.onChange((change: ConnectionStatusChange) => {
      // Update states with new values
      setCurrentStatus(change.current);
      setError(change.error);
    });
    // Cleanup listener on un-mount
    return () => {
      off();
    };
  }, [chatClient.connection.status]);

  // Register the listener for the user-provided onStatusChange callback
  useEffect(() => {
    if (!options?.onStatusChange) return;
    const { onStatusChange } = options;
    const { off } = chatClient.connection.status.onChange(onStatusChange);

    return () => {
      off();
    };
  }, [chatClient.connection.status, options]);

  return {
    currentStatus,
    error,
    connection,
  };
};

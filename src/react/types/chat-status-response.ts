import { ConnectionStatus, ErrorInfo, RoomLifecycle } from '@ably/chat';

/**
 * Common status variables for chat features. Most hooks in this library
 * implement this interface.
 */
export interface ChatStatusResponse {
  /** Provides the connection status of the Ably connection. */
  readonly connectionStatus: ConnectionStatus;

  /** If there's a connection error it will be available here.  */
  readonly connectionError?: ErrorInfo;

  /** Provides the status of the room. */
  readonly roomStatus: RoomLifecycle;

  /** If there's an error with the room it will be available here. */
  readonly roomError?: ErrorInfo;
}

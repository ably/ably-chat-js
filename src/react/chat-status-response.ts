import { ConnectionStatus, ErrorInfo, RoomStatus } from '@ably/chat';

/**
 * Common status variables for chat features. Most hooks in this library
 * implement this interface.
 */
export interface ChatStatusResponse {
  /** Provides access to get or listen to the connection to Ably. */
  readonly connectionStatus: ConnectionStatus;

  /** If there's a connection error it will be available here.  */
  readonly connectionError?: ErrorInfo;

  /** Provides access to get or listen to the room status. */
  readonly roomStatus: RoomStatus;

  /** If there's an error with the room it will be available here. */
  readonly roomError?: ErrorInfo;
}

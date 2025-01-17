import * as Ably from 'ably';

import { ConnectionStatus } from '../../core/connection.js';
import { RoomStatus } from '../../core/room-status.js';

/**
 * Common status variables for chat features. Most hooks in this library
 * implement this interface.
 */
export interface ChatStatusResponse {
  /** Provides the connection status of the Ably connection. */
  readonly connectionStatus: ConnectionStatus;

  /** If there's a connection error it will be available here.  */
  readonly connectionError?: Ably.ErrorInfo;

  /** Provides the status of the room. */
  readonly roomStatus: RoomStatus;

  /** If there's an error with the room it will be available here. */
  readonly roomError?: Ably.ErrorInfo;
}

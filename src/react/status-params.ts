import { ConnectionStatusChange, RoomStatusChange } from '@ably/chat';
import * as Ably from 'ably';

export interface StatusParams {
  onRoomStatusChange?: (change: RoomStatusChange) => void;
  onConnectionStatusChange?: (change: ConnectionStatusChange) => void;
  onDiscontinuity?: (error?: Ably.ErrorInfo) => void;
}

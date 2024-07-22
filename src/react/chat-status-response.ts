import { ConnectionStatus, ErrorInfo, RoomStatus } from '@ably/chat';

export interface ChatStatusResponse {
  readonly connectionStatus: ConnectionStatus;
  readonly connectionError?: ErrorInfo;
  readonly roomStatus: RoomStatus;
  readonly roomError?: ErrorInfo;
}

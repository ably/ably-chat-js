import { useCallback } from 'react';

import { ConnectionStatusChange } from '../../core/connection.js';
import { Room } from '../../core/room.js';
import { RoomStatusChange } from '../../core/room-status.js';
import { useEventualRoom } from '../helper/use-eventual-room.js';
import { useRoomContext } from '../helper/use-room-context.js';
import { useRoomStatus } from '../helper/use-room-status.js';
import { ChatStatusResponse } from '../types/chat-status-response.js';
import { useChatConnection } from './use-chat-connection.js';
import { useRoomLogger } from './use-logger.js';

/**
 * The parameters for the {@link useRoom} hook.
 */
export interface UseRoomParams {
  /**
   * Callback for when the room status changes. The listener is removed when
   * the component unmounts.
   * @param change The change object.
   */
  onStatusChange?: (change: RoomStatusChange) => void;

  /**
   * Callback for when the connection status changes. The listener is removed
   * when the component unmounts.
   * @param change The change object.
   */
  onConnectionStatusChange?: (change: ConnectionStatusChange) => void;
}

/**
 * The return type for the {@link useRoom} hook.
 */
export interface UseRoomResponse extends ChatStatusResponse {
  /**
   * The unique identifier of the room.
   */
  readonly roomName: string;

  /** The room object. */
  room?: Room;

  /**
   * Shortcut to {@link Room.attach}. Not needed if the {@link ChatRoomProvider}
   * has `attach=true` set, which is the default.
   */
  attach: () => Promise<void>;

  /**
   * Shortcut to {@link Room.detach}. Not needed if the {@link ChatRoomProvider}
   * has `attach=true` or `release=true` set, which are the default values.
   */
  detach: () => Promise<void>;
}

/**
 * A hook that provides access to the current room.
 *
 * @param params Register optional callbacks, see {@link UseRoomParams}.
 * @returns {@link UseRoomResponse}
 */
export const useRoom = (params?: UseRoomParams): UseRoomResponse => {
  const context = useRoomContext('useRoom');
  const roomName = context.roomName;
  const logger = useRoomLogger();
  logger.debug('useRoom();');

  const { currentStatus: connectionStatus, error: connectionError } = useChatConnection({
    onStatusChange: params?.onConnectionStatusChange,
  });

  // room error and status callbacks
  const roomStatus = useRoomStatus({
    onRoomStatusChange: params?.onStatusChange,
  });

  const attach = useCallback(() => context.room.then((room: Room) => room.attach()), [context]);
  const detach = useCallback(() => context.room.then((room: Room) => room.detach()), [context]);

  return {
    roomName: roomName,
    room: useEventualRoom(),
    attach: attach,
    detach: detach,
    roomStatus: roomStatus.status,
    roomError: roomStatus.error,
    connectionStatus: connectionStatus,
    connectionError: connectionError,
  };
};

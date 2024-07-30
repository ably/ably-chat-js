import { ConnectionStatusChange, ErrorInfo, Room, RoomLifecycle, RoomStatusChange } from '@ably/chat';
import * as Ably from 'ably';
import { useContext, useEffect, useState } from 'react';

import { ChatStatusResponse } from '../chat-status-response.js';
import { RoomContext } from '../contexts/room-context.js';
import { useChatConnection } from './use-chat-connection.js';

/**
 * Parameters for the useRoom hook.
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
 * The return type for the useRoom hook.
 */
export interface UseRoomResponse extends ChatStatusResponse {
  /** The room object. */
  room: Room;

  /**
   * Shortcut to room.attach. Not needed if room provider has attach=true set,
   * which is the default behavior.
   */
  attach: () => Promise<void>;

  /**
   * Shortcut to room.detach. Not needed if room provider has attach=true
   * set, which is the default behavior.
   */
  detach: () => Promise<void>;
}

/**
 * Hook that provides access to the current room.
 *
 * @param params Register optional callbacks, see {@link UseRoomParams}.
 * @returns {@link UseRoomResponse}
 */
export const useRoom = (params?: UseRoomParams): UseRoomResponse => {
  const context = useContext(RoomContext);

  if (!context) {
    throw new Ably.ErrorInfo('useRoom hook must be used within a chat RoomProvider', 40000, 400);
  }

  const { currentStatus: connectionStatus, error: connectionError } = useChatConnection({
    onStatusChange: params?.onConnectionStatusChange,
  });

  const room = context.room;

  // room error and status callbacks
  const [roomStatus, setRoomStatus] = useState<{
    status: RoomLifecycle;
    error?: ErrorInfo;
  }>({
    status: room.status.current,
    error: room.status.error,
  });

  const onRoomStatusChange = params?.onStatusChange;
  useEffect(() => {
    const { off } = room.status.onChange((change) => {
      setRoomStatus({
        status: change.current,
        error: change.error,
      });
      if (onRoomStatusChange) {
        onRoomStatusChange(change);
      }
    });
    return () => {
      off();
    };
  }, [room, onRoomStatusChange]);

  return {
    room: room,
    attach: room.attach.bind(room),
    detach: room.detach.bind(room),
    roomStatus: roomStatus.status,
    roomError: roomStatus.error,
    connectionStatus: connectionStatus,
    connectionError: connectionError,
  };
};

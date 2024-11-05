import { ConnectionStatusChange, Room, RoomStatus, RoomStatusChange } from '@ably/chat';
import * as Ably from 'ably';
import { useCallback, useContext, useEffect, useState } from 'react';

import { ChatRoomContext } from '../contexts/chat-room-context.js';
import { useEventListenerRef } from '../helper/use-event-listener-ref.js';
import { ChatStatusResponse } from '../types/chat-status-response.js';
import { useChatConnection } from './use-chat-connection.js';
import { useLogger } from './use-logger.js';

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
  /** The room object. */
  room: Room;

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
 * Helper function to create a status object from a change event or the room
 * status. It makes sure error isn't set at all if it's undefined in the source.
 */
const makeStatusObject = (room: Room) => ({
  status: room.status,
  error: room.error,
});

/**
 * Helper function to create a status object from a change event or the room
 * status. It makes sure error isn't set at all if it's undefined in the source.
 */
const makeStatusObjectFromChangeEvent = (event: RoomStatusChange) => ({
  status: event.current,
  error: event.error,
});

/**
 * A hook that provides access to the current room.
 *
 * @param params Register optional callbacks, see {@link UseRoomParams}.
 * @returns {@link UseRoomResponse}
 */
export const useRoom = (params?: UseRoomParams): UseRoomResponse => {
  const context = useContext(ChatRoomContext);
  const logger = useLogger();
  logger.trace('useRoom();', { roomId: context?.room.roomId });

  if (!context) {
    logger.error('useRoom(); must be used within a ChatRoomProvider');
    throw new Ably.ErrorInfo('useRoom hook must be used within a ChatRoomProvider', 40000, 400);
  }

  const { currentStatus: connectionStatus, error: connectionError } = useChatConnection({
    onStatusChange: params?.onConnectionStatusChange,
  });

  const room = context.room;

  // room error and status callbacks
  const [roomStatus, setRoomStatus] = useState<{
    status: RoomStatus;
    error?: Ably.ErrorInfo;
  }>(makeStatusObject(room));

  // create stable references for the listeners
  const onRoomStatusChangeRef = useEventListenerRef(params?.onStatusChange);

  // Effect that keeps the roomStatus state up to date
  useEffect(() => {
    logger.debug('useRoom(); setting up room status listener', { roomId: room.roomId });
    const { off } = room.onStatusChange((change) => {
      setRoomStatus(makeStatusObjectFromChangeEvent(change));
    });

    // update react state if real state has changed since setting up the listener
    setRoomStatus((prev) => {
      if (room.status !== prev.status || room.error !== prev.error) {
        return makeStatusObject(room);
      }
      return prev;
    });

    return () => {
      logger.debug('useRoom(); removing room status listener', { roomId: room.roomId });
      off();
    };
  }, [room, logger]);

  // Effect that registers and removes the user-provided callback
  useEffect(() => {
    if (!onRoomStatusChangeRef) return;
    logger.debug('useRoom(); applying user-provided listener', { roomId: room.roomId });
    const { off } = room.onStatusChange(onRoomStatusChangeRef);
    return () => {
      logger.debug('useRoom(); removing user-provided listener', { roomId: room.roomId });
      off();
    };
  }, [room, onRoomStatusChangeRef, logger]);

  const attach = useCallback(() => room.attach(), [room]);
  const detach = useCallback(() => room.detach(), [room]);

  return {
    room: room,
    attach: attach,
    detach: detach,
    roomStatus: roomStatus.status,
    roomError: roomStatus.error,
    connectionStatus: connectionStatus,
    connectionError: connectionError,
  };
};

import { ConnectionStatusChange, Room, RoomLifecycle, RoomStatusChange } from '@ably/chat';
import * as Ably from 'ably';
import { useCallback, useEffect, useState } from 'react';

import { useEventualRoom } from '../helper/eventual-room.js';
import { wrapRoomPromise } from '../helper/room-promise.js';
import { useEventListenerRef } from '../helper/use-event-listener-ref.js';
import { useRoomContext } from '../helper/use-room-context.js';
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
  /**
   * The id of the room.
   */
  readonly roomId: string;

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
 * Helper function to create a status object from a change event or the room
 * status. It makes sure error isn't set at all if it's undefined in the source.
 */
function makeStatusObject(source: { current: RoomLifecycle; error?: Ably.ErrorInfo }) {
  return {
    status: source.current,
    error: source.error,
  };
}

/**
 * A hook that provides access to the current room.
 *
 * @param params Register optional callbacks, see {@link UseRoomParams}.
 * @returns {@link UseRoomResponse}
 */
export const useRoom = (params?: UseRoomParams): UseRoomResponse => {
  const context = useRoomContext('useRoom');
  const roomId = context.roomId;
  const logger = useLogger();
  logger.debug('useRoom();', { roomId: roomId });

  const { currentStatus: connectionStatus, error: connectionError } = useChatConnection({
    onStatusChange: params?.onConnectionStatusChange,
  });

  // room error and status callbacks
  const [roomStatus, setRoomStatus] = useState<{
    status: RoomLifecycle;
    error?: Ably.ErrorInfo;
  }>(
    makeStatusObject({
      current: RoomLifecycle.Initializing,
    }),
  );

  // create stable references for the listeners
  const onRoomStatusChangeRef = useEventListenerRef(params?.onStatusChange);

  // Effect that keeps the roomStatus state up to date
  useEffect(() => {
    const roomPromise = wrapRoomPromise(
      context.room,
      (room: Room) => {
        logger.debug('useRoom(); setting up room status listener', { roomId: roomId });
        const { off } = room.status.onChange((change) => {
          setRoomStatus(makeStatusObject(change));
        });

        return () => {
          logger.debug('useRoom(); removing room status listener', { roomId: roomId });
          off();
        };
      },
      logger,
      roomId,
    );

    return roomPromise.unmount();
  }, [context, roomId, logger]);

  // Effect that registers and removes the user-provided callback
  useEffect(() => {
    if (!onRoomStatusChangeRef) return;

    const roomPromise = wrapRoomPromise(
      context.room,
      (room: Room) => {
        logger.debug('useRoom(); setting up user-provided listener', { roomId: roomId });
        const { off } = room.status.onChange(onRoomStatusChangeRef);

        return () => {
          logger.debug('useRoom(); removing user-provided listener', { roomId: roomId });
          off();
        };
      },
      logger,
      roomId,
    );

    return roomPromise.unmount();
  }, [context, roomId, onRoomStatusChangeRef, logger]);

  // TODO: Can we even do this if the room isn't defined?
  // Would we have to do a queue/backlog of calls somehow?
  const attach = useCallback(() => context.room.then((room: Room) => room.attach()), [context]);
  const detach = useCallback(() => context.room.then((room: Room) => room.detach()), [context]);

  return {
    roomId: roomId,
    room: useEventualRoom(roomId, context.room),
    attach: attach,
    detach: detach,
    roomStatus: roomStatus.status,
    roomError: roomStatus.error,
    connectionStatus: connectionStatus,
    connectionError: connectionError,
  };
};

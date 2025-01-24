import { type ErrorInfo } from 'ably';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ConnectionStatus } from '../../core/connection.js';
import { OnlineStatus, OnlineStatusData } from '../../core/online-status.js';
import { Room } from '../../core/room.js';
import { RoomStatus } from '../../core/room-status.js';
import { wrapRoomPromise } from '../helper/room-promise.js';
import { useEventListenerRef } from '../helper/use-event-listener-ref.js';
import { useEventualRoomProperty } from '../helper/use-eventual-room.js';
import { useRoomContext } from '../helper/use-room-context.js';
import { useRoomStatus } from '../helper/use-room-status.js';
import { ChatStatusResponse } from '../types/chat-status-response.js';
import { StatusParams } from '../types/status-params.js';
import { useChatConnection } from './use-chat-connection.js';
import { useLogger } from './use-logger.js';

/**
 * The options for the {@link useOnlineStatus} hook.
 */
export interface UseOnlineStatusParams extends StatusParams {
  /**
   * Data to be sent when the user goes online. Any JSON serializable data can be provided.
   */
  onlineWithData?: OnlineStatusData;

  /**
   * Data to be sent when the user goes offline. Any JSON serializable data can be provided.
   */
  offlineWithData?: OnlineStatusData;
}

export interface UseOnlineStatusResponse extends ChatStatusResponse {
  /**
   * A shortcut to the {@link OnlineStatus.setOnlineStatus} method.
   */
  readonly setOnlineStatus: OnlineStatus['setOnlineStatus'];

  /**
   * Provides access to the underlying {@link OnlineStatus} instance of the room.
   */
  readonly onlineStatus?: OnlineStatus;

  /**
   * Indicates whether the current user is online in the room.
   */
  readonly isOnline: boolean;

  /**
   * Indicates if an error occurred while entering or leaving the room.
   */
  readonly error?: ErrorInfo;
}

/**
 * A set of connection states that are considered inactive and where presence operations should not be attempted.
 */
const INACTIVE_CONNECTION_STATES = new Set<ConnectionStatus>([ConnectionStatus.Suspended, ConnectionStatus.Failed]);

/**
 * A hook that provides access to the {@link OnlineStatus} instance in the room.
 * It will use the instance belonging to the room in the nearest {@link ChatRoomProvider} in the component tree.
 * On calling, the hook will set the user to `online` in the room with the provided data and `offline` when the component unmounts.
 * The {@link UseOnlineStatusResponse.isOnline} flag will indicate when the user is online in the room.
 *
 * @param params - Allows the registering of optional callbacks.
 * @returns UseOnlineStatusResponse - An object containing the {@link OnlineStatus} instance and methods to interact with it.
 */
export const useOnlineStatus = (params?: UseOnlineStatusParams): UseOnlineStatusResponse => {
  const { currentStatus: connectionStatus, error: connectionError } = useChatConnection({
    onStatusChange: params?.onConnectionStatusChange,
  });

  const context = useRoomContext('useOnlineStatus');
  const { status: roomStatus, error: roomError } = useRoomStatus(params);
  const logger = useLogger();
  logger.trace('useOnlineStatus();', { params, roomId: context.roomId });

  const [isOnline, setIsOnline] = useState(false);
  const [error, setError] = useState<ErrorInfo | undefined>();

  // store the roomStatus in a ref to ensure the correct value is used in the effect cleanup
  const roomStatusAndConnectionStatusRef = useRef({ roomStatus, connectionStatus });

  // create a stable reference for the onDiscontinuity listener
  const onDiscontinuityRef = useEventListenerRef(params?.onDiscontinuity);

  // we can't use the data param directly in a dependency array as it will cause an infinite loop
  const dataRef = useRef(params);
  useEffect(() => {
    dataRef.current = params;
  }, [params]);

  useEffect(() => {
    // Update the ref when roomStatus changes
    roomStatusAndConnectionStatusRef.current = { roomStatus, connectionStatus };
  }, [roomStatus, connectionStatus]);

  // set status as online in the room when the hook is mounted
  useEffect(() => {
    logger.debug('useOnlineStatus(); updating online status in the room', { roomId: context.roomId });
    return wrapRoomPromise(
      context.room,
      (room: Room) => {
        const canSetOnline = room.status === RoomStatus.Attached && !INACTIVE_CONNECTION_STATES.has(connectionStatus);

        // wait until the room is attached before attempting to set online, and ensure the connection is active
        if (!canSetOnline) {
          logger.debug('useOnlineStatus(); skipping updating of online status', {
            roomStatus,
            connectionStatus,
            roomId: context.roomId,
          });
          return () => {
            // no-op
          };
        }

        room.userStatus.onlineStatus
          .setOnlineStatus(dataRef.current?.onlineWithData)
          .then(() => {
            logger.debug('useOnlineStatus(); set user as online in the room', { roomId: context.roomId });
            setIsOnline(true);
            setError(undefined);
          })
          .catch((error: unknown) => {
            logger.error('useOnlineStatus(); error setting as online in room', { error, roomId: context.roomId });
            setError(error as ErrorInfo);
          });

        return () => {
          const canLeavePresence =
            room.status === RoomStatus.Attached &&
            !INACTIVE_CONNECTION_STATES.has(roomStatusAndConnectionStatusRef.current.connectionStatus);

          logger.debug('useOnlineStatus(); unmounting', {
            roomId: context.roomId,
            canLeavePresence,
            roomStatus,
            connectionStatus,
          });
          if (canLeavePresence) {
            room.userStatus.onlineStatus
              .setOfflineStatus(dataRef.current?.offlineWithData)
              .then(() => {
                logger.debug('useOnlineStatus(); set user offline in the room', { roomId: context.roomId });
                setIsOnline(false);
                setError(undefined);
              })
              .catch((error: unknown) => {
                logger.error('useOnlineStatus(); error setting as offline in the room', {
                  error,
                  roomId: context.roomId,
                });
                setError(error as ErrorInfo);
              });
          }
        };
      },
      logger,
      context.roomId,
    ).unmount();
  }, [context, connectionStatus, roomStatus, logger]);

  // if provided, subscribes the user provided onDiscontinuity listener
  useEffect(() => {
    if (!onDiscontinuityRef) return;
    return wrapRoomPromise(
      context.room,
      (room: Room) => {
        const { off } = room.userStatus.onDiscontinuity(onDiscontinuityRef);
        return () => {
          logger.debug('useOnlineStatus(); removing onDiscontinuity listener', { roomId: context.roomId });
          off();
        };
      },
      logger,
      context.roomId,
    ).unmount();
  }, [context, onDiscontinuityRef, logger]);

  // memoize the methods to avoid re-renders and ensure the same instance is used
  const setOnlineStatus = useCallback(
    (data?: OnlineStatusData) =>
      context.room.then((room: Room) => {
        return room.userStatus.onlineStatus.setOnlineStatus(data).then(() => {
          setIsOnline(true);
          setError(undefined);
        });
      }),

    [context],
  );

  return {
    onlineStatus: useEventualRoomProperty((room) => room.userStatus.onlineStatus),
    connectionStatus,
    connectionError,
    roomStatus,
    roomError,
    setOnlineStatus,
    isOnline,
    error,
  };
};

import { type ErrorInfo } from 'ably';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ConnectionStatus } from '../../core/connection.js';
import { Presence, PresenceData } from '../../core/presence.js';
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
import { useRoomLogger } from './use-logger.js';

/**
 * The options for the {@link usePresence} hook.
 */
export interface UsePresenceParams extends StatusParams {
  /**
   * The data to enter the room with. Any JSON serializable data can be provided.
   */
  enterWithData?: PresenceData;

  /**
   * The data to leave the room with. Any JSON serializable data can be provided.
   */
  leaveWithData?: PresenceData;
}

export interface UsePresenceResponse extends ChatStatusResponse {
  /**
   * A shortcut to the {@link Presence.update} method.
   */
  readonly update: Presence['update'];

  /**
   * Provides access to the underlying {@link Presence} instance of the room.
   */
  readonly presence?: Presence;

  /**
   * Indicates whether the current user is present in the room.
   */
  readonly isPresent: boolean;

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
 * A hook that provides access to the {@link Presence} instance in the room.
 * It will use the instance belonging to the room in the nearest {@link ChatRoomProvider} in the component tree.
 * On calling, the hook will `enter` the room with the provided data and `leave` the room when the component unmounts.
 * The {@link UsePresenceResponse.isPresent} flag will indicate when the user has become present in the room.
 *
 * @param params - Allows the registering of optional callbacks.
 * @returns UsePresenceResponse - An object containing the {@link Presence} instance and methods to interact with it.
 */
export const usePresence = (params?: UsePresenceParams): UsePresenceResponse => {
  const { currentStatus: connectionStatus, error: connectionError } = useChatConnection({
    onStatusChange: params?.onConnectionStatusChange,
  });

  const context = useRoomContext('usePresence');
  const { status: roomStatus, error: roomError } = useRoomStatus(params);
  const logger = useRoomLogger();
  logger.trace('usePresence();', { params });

  const [isPresent, setIsPresent] = useState(false);
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

  // enter the room when the hook is mounted
  useEffect(() => {
    logger.debug('usePresence(); entering room');
    return wrapRoomPromise(
      context.room,
      (room: Room) => {
        const canJoinPresence =
          room.status === RoomStatus.Attached && !INACTIVE_CONNECTION_STATES.has(connectionStatus);

        // wait until the room is attached before attempting to enter, and ensure the connection is active
        if (!canJoinPresence) {
          logger.debug('usePresence(); skipping enter room', { roomStatus, connectionStatus });
          return () => {
            // no-op
          };
        }

        room.presence
          .enter(dataRef.current?.enterWithData)
          .then(() => {
            logger.debug('usePresence(); entered room');
            setIsPresent(true);
            setError(undefined);
          })
          .catch((error: unknown) => {
            logger.error('usePresence(); error entering room', { error });
            setError(error as ErrorInfo);
          });

        return () => {
          const canLeavePresence =
            room.status === RoomStatus.Attached &&
            !INACTIVE_CONNECTION_STATES.has(roomStatusAndConnectionStatusRef.current.connectionStatus);

          logger.debug('usePresence(); unmounting', {
            canLeavePresence,
            roomStatus,
            connectionStatus,
          });
          if (canLeavePresence) {
            room.presence
              .leave(dataRef.current?.leaveWithData)
              .then(() => {
                logger.debug('usePresence(); left room');
                setIsPresent(false);
                setError(undefined);
              })
              .catch((error: unknown) => {
                logger.error('usePresence(); error leaving room', { error });
                setError(error as ErrorInfo);
              });
          }
        };
      },
      logger,
    ).unmount();
  }, [context, connectionStatus, roomStatus, logger]);

  // if provided, subscribes the user provided onDiscontinuity listener
  useEffect(() => {
    if (!onDiscontinuityRef) return;
    return wrapRoomPromise(
      context.room,
      (room: Room) => {
        const { off } = room.onDiscontinuity(onDiscontinuityRef);
        return () => {
          logger.debug('usePresence(); removing onDiscontinuity listener');
          off();
        };
      },
      logger,
    ).unmount();
  }, [context, onDiscontinuityRef, logger]);

  // memoize the methods to avoid re-renders and ensure the same instance is used
  const update = useCallback(
    (data?: PresenceData) =>
      context.room.then((room: Room) => {
        return room.presence.update(data).then(() => {
          setIsPresent(true);
          setError(undefined);
        });
      }),

    [context],
  );

  return {
    presence: useEventualRoomProperty((room) => room.presence),
    connectionStatus,
    connectionError,
    roomStatus,
    roomError,
    update,
    isPresent,
    error,
  };
};

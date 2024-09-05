import { ConnectionLifecycle, Presence, PresenceData, RoomLifecycle } from '@ably/chat';
import { type ErrorInfo } from 'ably';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useEventListenerRef } from '../helper/use-event-listener-ref.js';
import { ChatStatusResponse } from '../types/chat-status-response.js';
import { StatusParams } from '../types/status-params.js';
import { useChatConnection } from './use-chat-connection.js';
import { useLogger } from './use-logger.js';
import { useRoom } from './use-room.js';

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
   * Indicates whether the current user is present in the room.
   */
  readonly isPresent: boolean;

  /**
   * Indicates if an error occurred while entering or leaving the room.
   */
  readonly error?: ErrorInfo;

  /**
   * Provides access to the underlying {@link Presence} instance of the room.
   */
  readonly presence: Presence;
}

const INACTIVE_CONNECTION_STATES = new Set<ConnectionLifecycle>([
  ConnectionLifecycle.Suspended,
  ConnectionLifecycle.Failed,
]);

/**
 * A hook that provides access to the {@link Presence} instance in the room.
 * It will use the instance belonging to the room in the nearest {@link ChatRoomProvider} in the component tree.
 * On calling, the hook will enter the room with the provided data and leave the room when the component unmounts.
 * The {@link isPresent} flag will indicate when the user has become present in the room.
 *
 * @param params - Allows the registering of optional callbacks.
 * @returns UsePresenceResponse - An object containing the {@link Presence} instance and methods to interact with it.
 */
export const usePresence = (params?: UsePresenceParams): UsePresenceResponse => {
  const { currentStatus: connectionStatus, error: connectionError } = useChatConnection({
    onStatusChange: params?.onConnectionStatusChange,
  });
  const { room, roomError, roomStatus } = useRoom({
    onStatusChange: params?.onRoomStatusChange,
  });
  const logger = useLogger();
  logger.trace('usePresence();', { params, roomId: room.roomId });

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
    const canJoinPresence = roomStatus === RoomLifecycle.Attached && !INACTIVE_CONNECTION_STATES.has(connectionStatus);
    const canLeavePresence =
      roomStatusAndConnectionStatusRef.current.roomStatus === RoomLifecycle.Attached &&
      !INACTIVE_CONNECTION_STATES.has(roomStatusAndConnectionStatusRef.current.connectionStatus);

    // wait until the room is attached before attempting to enter, and ensure the connection is active
    if (!canJoinPresence) return;
    room.presence
      .enter(dataRef.current?.enterWithData)
      .then(() => {
        logger.debug('usePresence(); entered room', { roomId: room.roomId });
        setIsPresent(true);
        setError(undefined);
      })
      .catch((error: unknown) => {
        logger.error('usePresence(); error entering room', { error, roomId: room.roomId });
        setError(error as ErrorInfo);
      });

    return () => {
      // ensure we are still in an attached state before attempting to leave and the connection is active;
      // a presence.leave call will produce an exception otherwise.
      if (canLeavePresence) {
        room.presence
          .leave(dataRef.current?.leaveWithData)
          .then(() => {
            logger.debug('usePresence(); left room', { roomId: room.roomId });
            setIsPresent(false);
            setError(undefined);
          })
          .catch((error: unknown) => {
            logger.error('usePresence(); error leaving room', { error, roomId: room.roomId });
            setError(error as ErrorInfo);
          });
      }
    };
  }, [room, connectionStatus, roomStatus, logger]);

  // if provided, subscribes the user provided onDiscontinuity listener
  useEffect(() => {
    logger.debug('usePresence(); applying onDiscontinuity listener', { roomId: room.roomId });
    const { off } = room.presence.onDiscontinuity(onDiscontinuityRef);
    return () => {
      logger.debug('usePresence(); removing onDiscontinuity listener', { roomId: room.roomId });
      off();
    };
  }, [room, onDiscontinuityRef, logger]);

  // memoize the methods to avoid re-renders and ensure the same instance is used
  const update = useCallback(
    (data?: PresenceData) =>
      room.presence.update(data).then(() => {
        setIsPresent(true);
        setError(undefined);
      }),
    [room],
  );

  return {
    connectionStatus,
    connectionError,
    roomStatus,
    roomError,
    update,
    isPresent,
    error,
    presence: room.presence,
  };
};

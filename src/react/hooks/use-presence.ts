import * as Ably from 'ably';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ConnectionStatus } from '../../core/connection.js';
import { Presence, PresenceData, PresenceStateChange, PresenceStateChangeListener } from '../../core/presence.js';
import { Room } from '../../core/room.js';
import { RoomStatus } from '../../core/room-status.js';
import { Subscription } from '../../core/subscription.js';
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
   * The current presence state of this client.
   */
  readonly myPresenceState: {
    /**
     * Indicates if the user is currently present in the room.
     */
    present: boolean;

    /**
     * Indicates if an error occurred while trying to enter (on mount) or leave presence (on unmount).
     */
    error?: Ably.ErrorInfo;
  };
}

/**
 * A set of connection states that are considered inactive and where presence operations should not be attempted.
 */
const INACTIVE_CONNECTION_STATES = new Set<ConnectionStatus>([ConnectionStatus.Suspended, ConnectionStatus.Failed]);

/**
 * A hook that provides access to the {@link Presence} instance in the room.
 * It will use the instance belonging to the room in the nearest {@link ChatRoomProvider} in the component tree.
 * On calling, the hook will `enter` the room with the provided data and `leave` the room when the component unmounts.
 * The {@link UsePresenceResponse.myPresenceState} can be used to determine if the user is currently present in the room, and if any errors occurred while trying to enter or leave presence.
 * Presence automatically attempts to re-enter the room after a network issue, but if it fails, it will emit an error with code `91004`.
 * You will need to remount the component to re-attempt entering presence again.
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

  const [myPresenceState, setMyPresenceState] = useState<{
    present: boolean;
    error?: Ably.ErrorInfo;
  }>({
    present: false,
    error: undefined,
  });

  // store the roomStatus in a ref to ensure the correct value is used in the effect cleanup
  const roomStatusAndConnectionStatusRef = useRef({ roomStatus, connectionStatus });

  // create a stable reference for the onDiscontinuity listener
  const onDiscontinuityRef = useEventListenerRef(params?.onDiscontinuity);

  // we can't use the data param directly in a dependency array as it will cause an infinite loop
  const dataRef = useRef(params);
  useEffect(() => {
    dataRef.current = params;
  }, [params]);

  // We don't need to listen for channel status changes anymore as presence state is managed by presence.ts

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

        // Enter the room - state updates are handled by presence.ts
        room.presence
          .enter(dataRef.current?.enterWithData)
          .then(() => {
            logger.debug('usePresence(); entered room');
          })
          .catch((error: unknown) => {
            logger.error('usePresence(); error entering room', { error });
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
            // Leave the room - state updates are handled by presence.ts
            room.presence
              .leave(dataRef.current?.leaveWithData)
              .then(() => {
                logger.debug('usePresence(); left room');
              })
              .catch((error: unknown) => {
                logger.error('usePresence(); error leaving room', { error });
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

  // Subscribe to presence state changes
  useEffect(() => {
    logger.debug('usePresence(); subscribing to presence state changes');
    return wrapRoomPromise(
      context.room,
      (room: Room) => {
        // Subscribe to presence state changes
        const subscription = (
          room.presence as Presence & {
            onPresenceStateChange: (listener: PresenceStateChangeListener) => Subscription;
          }
        ).onPresenceStateChange((stateChange: PresenceStateChange) => {
          logger.debug('usePresence(); presence state changed', { stateChange });
          setMyPresenceState({
            ...stateChange.current,
            error: stateChange.error,
          });
        });

        return () => {
          logger.debug('usePresence(); unsubscribing from presence state changes');
          subscription.unsubscribe();
        };
      },
      logger,
    ).unmount();
  }, [context, logger]);

  // memoize the methods to avoid re-renders and ensure the same instance is used
  const update = useCallback(
    (data?: PresenceData) => context.room.then((room: Room) => room.presence.update(data)),

    [context],
  );
  return {
    presence: useEventualRoomProperty((room) => room.presence),
    connectionStatus,
    connectionError,
    roomStatus,
    roomError,
    update,
    myPresenceState,
  };
};

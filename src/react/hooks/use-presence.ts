import * as Ably from 'ably';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ConnectionStatus } from '../../core/connection.js';
import { ErrorCode } from '../../core/errors.js';
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

  /**
   * Controls whether to automatically enter presence on mount and leave on unmount.
   * @default true
   */
  autoEnter?: boolean;
}

export interface UsePresenceResponse extends ChatStatusResponse {
  /**
   * A shortcut to the {@link Presence.update} method.
   */
  readonly update: Presence['update'];

  /**
   * A shortcut to the {@link Presence.enter} method.
   */
  readonly enter: Presence['enter'];

  /**
   * A shortcut to the {@link Presence.leave} method.
   */
  readonly leave: Presence['leave'];

  /**
   * Provides access to the underlying {@link Presence} instance of the room.
   */
  readonly presence?: Presence;

  /**
   * The current presence state of this client.
   */
  readonly userPresenceState: {
    /**
     * Indicates whether the user is present in the room.
     */
    isPresent: boolean;

    /**
     * Indicates if an error occurred while trying to enter or leave presence.
     * This could also occur if the presence re-entry after a network issue fails.
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
 * The {@link UsePresenceResponse.userPresenceState} can be used to determine if the user is currently present in the room, and if any errors occurred while trying to enter or leave presence.
 * Presence automatically attempts to re-enter the room after a network issue, but if it fails, it will emit an error with code `91004`.
 * You will need to remount the component to re-attempt entering presence again.
 *
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

  const [userPresenceState, setUserPresenceState] = useState<{
    isPresent: boolean;
    error?: Ably.ErrorInfo;
  }>({
    isPresent: false,
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

  useEffect(() => {
    const onChannelStatusChange = (statusChange: Ably.ChannelStateChange) => {
      logger.debug('usePresence(); channel status change', { statusChange });
      if (statusChange.reason?.code === ErrorCode.PresenceAutoReentryFailed) {
        // After some network issue, presence will attempt to re-enter the room. This can fail, if so, it will
        // emit a 91004 error code.
        setUserPresenceState({
          isPresent: false,
          error: statusChange.reason,
        });
      }
    };
    logger.debug('usePresence(); subscribe to channel status changes');
    return wrapRoomPromise(
      context.room,
      (room: Room) => {
        room.channel.on('update', onChannelStatusChange);
        return () => {
          logger.debug('usePresence(); unsubscribe from channel status changes');
          room.channel.off('update', onChannelStatusChange);
        };
      },
      logger,
    ).unmount();
  }, [context, logger]);

  useEffect(() => {
    // Update the ref when roomStatus changes
    roomStatusAndConnectionStatusRef.current = { roomStatus, connectionStatus };
  }, [roomStatus, connectionStatus]);

  // enter the room when the hook is mounted if autoEnter is true (default)
  useEffect(() => {
    // Check if autoEnter is enabled (default to true if not specified)
    const shouldAutoEnter = dataRef.current?.autoEnter !== false;

    if (!shouldAutoEnter) {
      logger.debug('usePresence(); skipping auto enter due to autoEnter=false');
      return;
    }

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
            // Successfully entered the room, set isPresent and clear any error
            setUserPresenceState({
              isPresent: true,
              error: undefined,
            });
          })
          .catch((error: unknown) => {
            logger.error('usePresence(); error entering room', { error });
            // Failed to enter the room, set isPresent to false and store the error
            setUserPresenceState({
              isPresent: false,
              error: error as Ably.ErrorInfo,
            });
          });

        return () => {
          // Check if autoEnter is still enabled when unmounting
          const shouldAutoLeave = dataRef.current?.autoEnter !== false;

          if (!shouldAutoLeave) {
            logger.debug('usePresence(); skipping auto leave due to autoEnter=false');
            return;
          }

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
                setUserPresenceState({
                  isPresent: false,
                  error: undefined,
                });
              })
              .catch((error: unknown) => {
                logger.error('usePresence(); error leaving room', { error });
                setUserPresenceState((prevState) => ({
                  ...prevState,
                  error: error as Ably.ErrorInfo,
                }));
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
          setUserPresenceState({
            isPresent: true,
            error: undefined,
          });
        });
      }),

    [context],
  );

  const enter = useCallback(
    (data?: PresenceData) =>
      context.room.then((room: Room) => {
        return room.presence.enter(data).then(() => {
          setUserPresenceState({
            isPresent: true,
            error: undefined,
          });
        });
      }),

    [context],
  );

  const leave = useCallback(
    (data?: PresenceData) =>
      context.room.then((room: Room) => {
        return room.presence.leave(data).then(() => {
          setUserPresenceState({
            isPresent: false,
            error: undefined,
          });
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
    enter,
    leave,
    userPresenceState,
  };
};

import * as Ably from 'ably';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ConnectionStatus } from '../../core/connection.js';
import { Presence, PresenceData, PresenceStateChange, PresenceStateChangeListener } from '../../core/presence.js';
import { Room } from '../../core/room.js';
import { RoomStatus } from '../../core/room-status.js';
import { Subscription } from '../../core/subscription.js';
import { wrapRoomPromise } from '../helper/room-promise.js';
import { ChatStatusResponse } from '../types/chat-status-response.js';
import { StatusParams } from '../types/status-params.js';
import { useEventListenerRef } from './internal/use-event-listener-ref.js';
import { useRoomLogger } from './internal/use-logger.js';
import { useRoomContext } from './internal/use-room-context.js';
import { useRoomStatus } from './internal/use-room-status.js';
import { useChatConnection } from './use-chat-connection.js';

/**
 * The options for the {@link usePresence} hook.
 */
export interface UsePresenceParams extends StatusParams {
  /**
   * The initial data to enter the room with when auto-entering (autoEnterLeave=true). Any JSON serializable data can be provided.
   * This data is only used for the initial auto-enter when the component mounts. Changes to this value
   * after the first render are ignored. To update presence data after the initial enter, use the
   * `update` or `enter` methods returned by the hook.
   * @example
   * ```tsx
   * // This will cause the hook to auto-enter presence with the provided data
   * // autoEnterLeave is implicitly true
   * const { presence, update } = usePresence({
   *   initialData: { status: 'online', lastSeen: Date.now() }
   * });
   *
   * // Subsequent data updates must be done via calls to enter/update
   * await update({status: 'away'});
   * ```
   * @defaultValue undefined
   */
  initialData?: PresenceData;

  /**
   * Controls whether the hook should automatically enter presence when the component mounts and the room
   * becomes attached, and automatically leave presence when the component unmounts.
   *
   * Also controls whether the hook will automatically re-enter presence if the room is detached and then re-attached.
   *
   * **Important** If {@link UsePresenceResponse.leave} is called, then the hook will NOT auto-enter. To re-enable
   * auto-enter behavior, you must call {@link UsePresenceResponse.enter} or {@link UsePresenceResponse.update}.
   * When set to false, you have full manual control over entering and leaving presence.
   *
   * Defaults to true if not provided.
   * @defaultValue true
   */
  autoEnterLeave?: boolean;
}

export interface UsePresenceResponse extends ChatStatusResponse {
  /**
   * A shortcut to the {@link Presence.update} method.
   *
   *  This is a stable reference and will not be changed between renders for the same room.
   *
   * **Important** When called, if {@link UsePresenceParams.autoEnterLeave} is set to true, the hook will attempt to
   * auto-enter presence automatically when conditions are met.
   */
  readonly update: Presence['update'];

  /**
   * A shortcut to the {@link Presence.enter} method, which can be used to manually enter presence when
   * `autoEnterLeave` is false, or to explicitly re-enter presence with new data.
   *
   * This is a stable reference and will not be changed between renders for the same room.
   *
   * **Important** When called, if {@link UsePresenceParams.autoEnterLeave} is set to true, the hook will attempt to
   * auto-enter presence automatically when conditions are met.
   * @example
   * ```tsx
   * // Manual control over presence with conditional logic
   * const { enter, leave } = usePresence({ autoEnterLeave: false });
   *
   * useEffect(() => {
   *   if (effectCondition) {
   *     enter({ status: 'active' });
   *   }
   *
   *   return () => {
   *     if (effectCondition) {
   *       leave();
   *     }
   *   };
   * }, [effectCondition, enter, leave]);
   * ```
   */
  readonly enter: Presence['enter'];

  /**
   * A shortcut to the {@link Presence.leave} method.
   *
   * This is a stable reference and will not be changed between renders for the same room.
   *
   * **Important** When called, this will prevent the hook from automatically re-entering presence, even when `autoEnterLeave` is true.
   *
   * This is useful for manually controlling when presence is left.
   * @example
   * ```tsx
   * // Manual control over presence with conditional logic
   * const { enter, leave } = usePresence({ autoEnterLeave: false });
   *
   * useEffect(() => {
   *   if (effectCondition) {
   *     enter({ status: 'active' });
   *   }
   *
   *   return () => {
   *     if (effectCondition) {
   *       leave();
   *     }
   *   };
   * }, [effectCondition, enter, leave]);
   * ```
   * @example
   * ```tsx
   * // Enter presence automatically with some initial data
   * const { leave, enter } = usePresence({ initialData: { status: 'online' } });
   *
   * // Leave presence explicitly, disabling auto re-entry
   * await leave();
   *
   * // Re-enter presence again, re-enabling auto-entry if selected in the hook
   * await enter({ status: 'online again' })
   * ```
   */
  readonly leave: Presence['leave'];

  /**
   * The current presence state of this client.
   */
  readonly myPresenceState: {
    /**
     * Indicates if the user is currently present in the room.
     */
    present: boolean;

    /**
     * Indicates if an error occurred while trying to enter or leave presence.
     */
    error?: Ably.ErrorInfo;
  };
}

// Internal interface for presence with state change subscription
interface PresenceWithStateChangeListener extends Presence {
  onPresenceStateChange(listener: PresenceStateChangeListener): Subscription;
}

/**
 * A set of connection states that are considered inactive and where presence operations should not be attempted.
 */
const INACTIVE_CONNECTION_STATES = new Set<ConnectionStatus>([ConnectionStatus.Suspended, ConnectionStatus.Failed]);

/**
 * A hook that provides access to the {@link Presence} instance in the room.
 * It will use the instance belonging to the room in the nearest {@link ChatRoomProvider} in the component tree.
 *
 * By default (when `autoEnterLeave` is true or not provided), the hook will automatically `enter` the room
 * when the component mounts and the room is attached, and `leave` when the component unmounts. The hook will
 * also automatically re-enter presence after room detachment/reattachment cycles.
 *
 * When `autoEnterLeave` is false, you have full manual control over entering and leaving presence using the
 * returned `enter` and `leave` methods.
 *
 * The {@link UsePresenceResponse.myPresenceState} can be used to determine if the user is currently present
 * in the room, and if any errors occurred while trying to enter or leave presence.
 * @example
 * ```tsx
 * // Example hook usage with auto-entry of presence on mount and auto-leave on unmount
 * const MyComponent = () => {
 *   const { presence, myPresenceState, update } = usePresence({
 *     initialData: { status: 'online' },
 *     onConnectionStatusChange: (change) => console.log('Connection:', change.current),
 *     onDiscontinuity: (error) => console.error('Discontinuity:', error)
 *   });
 *
 *   return <div>Present: {myPresenceState.present}</div>;
 * };
 * ```
 * @example
 * ```tsx
 * // Example with full manual control (no auto-enter/leave)
 * const ManualPresenceComponent = () => {
 *   const { enter, leave, update, myPresenceState } = usePresence({
 *     autoEnterLeave: false,
 *     initialData: { status: 'available' }
 *   });
 *
 *   const handleJoin = () => enter({ status: 'online' });
 *   const handleLeave = () => leave();
 *   const handleUpdateStatus = () => update({ status: 'busy' });
 *
 *   return (
 *     <div>
 *       <button onClick={handleJoin}>Join</button>
 *       <button onClick={handleLeave}>Leave</button>
 *       <button onClick={handleUpdateStatus}>Update Status</button>
 *       <div>Present: {myPresenceState.present}</div>
 *     </div>
 *   );
 * };
 * ```
 * @example
 * ```tsx
 * // Example with auto-enter but taking manual control via leave
 * const MixedControlComponent = () => {
 *   const { leave, update, myPresenceState } = usePresence({
 *     initialData: { status: 'online' }
 *   });
 *
 *   const handleGoOffline = () => {
 *     // Calling leave() prevents auto re-entry until enter() or update() is called
 *     leave({ status: 'offline' });
 *   };
 *
 *   const handleUpdatePresence = () => {
 *     // Calling update() re-enables auto-enter behavior
 *     update({ status: 'back online' });
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={handleGoOffline}>Go Offline</button>
 *       <button onClick={handleUpdatePresence}>Update Presence</button>
 *       <div>Present: {myPresenceState.present}</div>
 *     </div>
 *   );
 * };
 * ```
 * @example
 * ```tsx
 * // Example with manual mount/unmount behavior using enter/leave explicitly
 * const ManualMountComponent = () => {
 *   const { enter, leave, myPresenceState } = usePresence({
 *     autoEnterLeave: false,
 *     initialData: { status: 'ready' }
 *   });
 *
 *   // Manual mount behavior - enter presence when component mounts
 *   useEffect(() => {
 *     enter({ status: 'active' });
 *
 *     // Manual unmount behavior - leave presence when component unmounts
 *     return () => {
 *       leave({ status: 'disconnecting' });
 *     };
 *   }, [enter, leave]);
 *
 *   return <div>Present: {myPresenceState.present}</div>;
 * };
 * ```
 * @param params - Configuration options for the hook behavior and optional callbacks.
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

  // Default to true for autoEnterLeave if not provided
  const shouldAutoEnterLeave = useMemo(() => params?.autoEnterLeave !== false, [params?.autoEnterLeave]);

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

  // Track the latest presence data - set initialData once on first render, then updated by manual calls
  const latestDataRef = useRef<PresenceData>(params?.initialData);

  // Track if leave() has been explicitly called - prevents auto re-enter
  const hasExplicitlyLeftRef = useRef<boolean>(false);

  // Track if we've ever successfully auto-entered (for first-time logic)
  const hasAutoEnteredRef = useRef<boolean>(false);

  // Track if room has been detached since last auto-enter (for recovery logic)
  const roomWasDetachedRef = useRef<boolean>(false);

  // If the context changes, then we'll assume auto-enter is required.
  useEffect(() => {
    hasAutoEnteredRef.current = false;
    roomWasDetachedRef.current = false;
  }, [context]);

  // Keep track of the room and connection statuses
  useEffect(() => {
    roomStatusAndConnectionStatusRef.current = { roomStatus, connectionStatus };

    // keep track of the room becoming detached
    if (roomStatus === RoomStatus.Detached) {
      roomWasDetachedRef.current = true;
    }
  }, [roomStatus, connectionStatus]);

  // Subscribe to presence state changes
  useEffect(() => {
    logger.debug('usePresence(); subscribing to presence state changes');
    return wrapRoomPromise(
      context.room,
      (room: Room) => {
        // Subscribe to presence state changes
        const subscription = (room.presence as PresenceWithStateChangeListener).onPresenceStateChange(
          (stateChange: PresenceStateChange) => {
            logger.debug('usePresence(); presence state changed', { stateChange });
            setMyPresenceState({
              ...stateChange.current,
              error: stateChange.error,
            });
          },
        );
        return () => {
          logger.debug('usePresence(); unsubscribing from presence state changes');
          subscription.unsubscribe();
        };
      },
      logger,
    ).unmount();
  }, [context, logger]);

  // enter the room when the hook is mounted (if autoEnterLeave is enabled)
  useEffect(() => {
    logger.debug('usePresence(); running auto-enter hook');
    if (!shouldAutoEnterLeave) {
      logger.debug('usePresence(); auto enter/leave disabled');
      return () => {
        // no-op
      };
    }

    return wrapRoomPromise(
      context.room,
      (room: Room) => {
        const canJoinPresence =
          room.status === RoomStatus.Attached && !INACTIVE_CONNECTION_STATES.has(connectionStatus);

        // Check if we should auto-enter: first time OR room was previously detached
        const shouldAutoEnter = !hasAutoEnteredRef.current || roomWasDetachedRef.current;

        // wait until the room is attached before attempting to enter, and ensure the connection is active
        // also check if we haven't explicitly left presence and if we should auto-enter
        if (!canJoinPresence || hasExplicitlyLeftRef.current || !shouldAutoEnter) {
          logger.debug('usePresence(); skipping enter room', {
            roomStatus,
            connectionStatus,
            hasExplicitlyLeft: hasExplicitlyLeftRef.current,
            shouldAutoEnter,
            hasAutoEntered: hasAutoEnteredRef.current,
            roomWasDetached: roomWasDetachedRef.current,
          });
          return () => {
            // no-op
          };
        }

        // Enter the room using latest data - state updates are handled by presence.ts
        logger.debug('usePresence(); entering room');
        room.presence
          .enter(latestDataRef.current)
          .then(() => {
            logger.debug('usePresence(); entered room');
            // Mark that we've successfully auto-entered and reset the detachment flag
            hasAutoEnteredRef.current = true;
            roomWasDetachedRef.current = false;
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
          if (canLeavePresence && !hasExplicitlyLeftRef.current) {
            // Only auto-leave if we haven't already explicitly left
            // Leave the room - state updates are handled by presence.ts
            room.presence
              .leave()
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
  }, [context, connectionStatus, roomStatus, logger, shouldAutoEnterLeave]);

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
    async (data?: PresenceData) => {
      latestDataRef.current = data;
      // Reset the explicit leave flag when update is called explicitly
      hasExplicitlyLeftRef.current = false;
      const room = await context.room;
      await room.presence.update(data);
    },
    [context],
  );

  const enter = useCallback(
    async (data?: PresenceData) => {
      latestDataRef.current = data;
      // Reset the explicit leave flag when enter is called explicitly
      hasExplicitlyLeftRef.current = false;
      const room = await context.room;
      await room.presence.enter(data);
    },
    [context],
  );

  const leave = useCallback(
    async (data?: PresenceData) => {
      // Mark that leave has been explicitly called
      hasExplicitlyLeftRef.current = true;
      const room = await context.room;
      await room.presence.leave(data);
    },
    [context],
  );

  return {
    connectionStatus,
    connectionError,
    roomStatus,
    roomError,
    update,
    enter,
    leave,
    myPresenceState,
  };
};

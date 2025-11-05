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
   * Updates the presence data for the current user in the chat room.
   * Emits an 'update' event to all subscribers. If the user is not already present, they will be entered automatically.
   *
   * **Note**:
   * - The room must be attached before calling this method.
   * - This method uses PUT-like semantics - the entire presence data is replaced with the new value.
   *
   * This is a stable reference and will not be changed between renders for the same room.
   *
   * **Important** When called, if {@link UsePresenceParams.autoEnterLeave} is set to true, the hook will attempt to
   * auto-enter presence automatically when conditions are met.
   * @param data - JSON-serializable data to replace the user's current presence data
   * @returns Promise that resolves when the presence data has been updated,
   *          or rejects with {@link chat-js!ErrorCode.RoomInInvalidState | RoomInInvalidState} if the room is not attached
   */
  readonly update: (data?: PresenceData) => Promise<void>;

  /**
   * A shortcut to the {@link Presence.enter} method, which can be used to manually enter presence when
   * `autoEnterLeave` is false, or to explicitly re-enter presence with new data.
   *
   * Enters the current user into the chat room presence set.
   * Emits an 'enter' event to all presence subscribers. Multiple calls will emit additional `update` events if the
   * user is already present.
   *
   * **Note**: The room must be attached before calling this method.
   *
   * This is a stable reference and will not be changed between renders for the same room.
   *
   * **Important** When called, if {@link UsePresenceParams.autoEnterLeave} is set to true, the hook will attempt to
   * auto-enter presence automatically when conditions are met.
   * @param data - Optional JSON-serializable data to associate with the user's presence
   * @returns Promise that resolves when the user has successfully entered,
   *          or rejects with {@link chat-js!ErrorCode.RoomInInvalidState | RoomInInvalidState} if the room is not attached
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
  readonly enter: (data?: PresenceData) => Promise<void>;

  /**
   * A shortcut to the {@link Presence.leave} method.
   *
   * Removes the current user from the chat room presence set.
   * Emits a 'leave' event to all subscribers. If the user is not present, this is a no-op.
   *
   * **Note**: The room must be attached before calling this method.
   *
   * This is a stable reference and will not be changed between renders for the same room.
   *
   * **Important** When called, this will prevent the hook from automatically re-entering presence, even when `autoEnterLeave` is true.
   *
   * This is useful for manually controlling when presence is left.
   * @param data - Optional final presence data to include with the leave event
   * @returns Promise that resolves when the user has left the presence set,
   *          or rejects with {@link chat-js!ErrorCode.RoomInInvalidState | RoomInInvalidState} if the room is not attached
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
  readonly leave: (data?: PresenceData) => Promise<void>;

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
const INACTIVE_CONNECTION_STATES = new Set<ConnectionStatus>([
  ConnectionStatus.Suspended,
  ConnectionStatus.Failed,
  ConnectionStatus.Closing,
  ConnectionStatus.Closed,
]);

/**
 * React hook that manages user presence in a chat room.
 *
 * This hook provides comprehensive presence functionality with both automatic and manual
 * control modes. It handles entering/leaving presence, updating presence data, and
 * tracking the current presence state with automatic recovery after disconnections.
 *
 * By default (`autoEnterLeave: true`), the hook automatically enters presence when the
 * component mounts and the room is attached, and leaves when unmounting. It also handles
 * automatic re-entry after room detachment/reattachment cycles.
 *
 * With `autoEnterLeave: false`, you have full manual control over presence lifecycle
 * using the returned `enter` and `leave` methods.
 *
 * **Important**: When using `autoEnterLeave`, avoid multiple instances of this hook within
 * the same ChatClientProvider, as they share the same underlying presence instance. For
 * multiple components updating presence data, either:
 * 1. Set `autoEnterLeave: false` and manage state manually
 * 2. Manage presence state at a higher level (e.g., context provider)
 *
 * **Note**: This hook must be used within a {@link ChatRoomProvider} component tree.
 * **Note**: Room must be attached and connection active for presence operations, typically the {@link ChatRoomProvider} handles this automatically.
 * @param params - Optional parameters for initial data, auto-enter/leave behavior, and status callbacks
 * @returns A {@link UsePresenceResponse} containing presence methods and current state
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
 * // Example with auto-enter but taking manual control via leave.
 * // This pattern is useful if you have multiple components in your app updating presence data.
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
    update: update,
    enter: enter,
    leave: leave,
    myPresenceState,
  };
};

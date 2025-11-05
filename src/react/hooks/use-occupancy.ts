// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as Ably from 'ably';
import { useEffect, useState } from 'react';

import { OccupancyListener } from '../../core/occupancy.js';
import { wrapRoomPromise } from '../helper/room-promise.js';
import { ChatStatusResponse } from '../types/chat-status-response.js';
import { Listenable } from '../types/listenable.js';
import { StatusParams } from '../types/status-params.js';
import { useEventListenerRef } from './internal/use-event-listener-ref.js';
import { useRoomLogger } from './internal/use-logger.js';
import { useRoomContext } from './internal/use-room-context.js';
import { useRoomStatus } from './internal/use-room-status.js';
import { useChatConnection } from './use-chat-connection.js';

/**
 * The options for the {@link useOccupancy} hook.
 */
export interface UseOccupancyParams extends StatusParams, Listenable<OccupancyListener> {
  /**
   * A listener that will be called whenever an occupancy event is received.
   * The listener is removed when the component unmounts.
   * @example
   * ```tsx
   * useOccupancy({
   *   listener: (occupancyEvent) => {
   *     console.log('Occupancy changed:', occupancyEvent.occupancy);
   *   }
   * });
   * ```
   */
  listener?: OccupancyListener;
}

/**
 * The response type from the {@link useOccupancy} hook.
 */
export interface UseOccupancyResponse extends ChatStatusResponse {
  /**
   * The current number of users connected to the room, kept up to date by the hook.
   */
  readonly connections: number;

  /**
   * The current number of users present in the room, kept up to date by the hook.
   */
  readonly presenceMembers: number;
}

/**
 * React hook that provides real-time room occupancy information.
 *
 * This hook automatically tracks the number of connections and presence members in a room,
 * updating the counts in real-time as users join and leave. It integrates with the nearest
 * {@link ChatRoomProvider} and handles cleanup when the component unmounts.
 *
 * The hook provides both the current occupancy metrics as state values and allows you to
 * register listeners for occupancy change events.
 *
 * **Note**: This hook must be used within a {@link ChatRoomProvider} component tree.
 * **Note**: Room must be attached to receive real-time occupancy updates, typically the {@link ChatRoomProvider} handles this automatically.
 * @param params - Optional parameters for event listeners and room status callbacks
 * @returns A {@link UseOccupancyResponse} containing current occupancy metrics and room status
 * @throws An {@link Ably.ErrorInfo} with {@link chat-js!ErrorCode.ReactHookMustBeUsedWithinProvider | ReactHookMustBeUsedWithinProvider} When used outside of a {@link ChatRoomProvider}
 * @example Basic usage
 * ```tsx
 * import React from 'react';
 * import { ChatClient, OccupancyEvent } from '@ably/chat';
 * import {
 *   ChatClientProvider,
 *   ChatRoomProvider,
 *   useOccupancy
 * } from '@ably/chat/react';
 *
 * // Component that displays occupancy information
 * const RoomOccupancy = () => {
 *   const {
 *     connections,
 *     presenceMembers,
 *     connectionStatus,
 *     roomStatus
 *   } = useOccupancy({
 *     listener: (occupancyEvent: OccupancyEvent) => {
 *       console.log('Occupancy changed:', occupancyEvent.occupancy);
 *     },
 *     onDiscontinuity: (error) => {
 *       console.error('Discontinuity detected:', error);
 *     }
 *   });
 *
 *   return (
 *     <div>
 *       <div>👥 Total Connections: {connections}</div>
 *       <div>🟢 Present Members: {presenceMembers}</div>
 *     </div>
 *   );
 * };
 *
 * const chatClient: ChatClient; // existing ChatClient instance
 *
 * // App component with providers
 * const App = () => {
 *   return (
 *     <ChatClientProvider client={chatClient}>
 *       <ChatRoomProvider name="public-lobby">
 *         <RoomOccupancy />
 *       </ChatRoomProvider>
 *     </ChatClientProvider>
 *   );
 * };
 *
 * export default App;
 * ```
 */
export const useOccupancy = (params?: UseOccupancyParams): UseOccupancyResponse => {
  const { currentStatus: connectionStatus, error: connectionError } = useChatConnection({
    onStatusChange: params?.onConnectionStatusChange,
  });
  const context = useRoomContext('useOccupancy');
  const { status: roomStatus, error: roomError } = useRoomStatus(params);

  const logger = useRoomLogger();
  logger.trace('useOccupancy();', { params });

  const [occupancyMetrics, setOccupancyMetrics] = useState<{ connections: number; presenceMembers: number }>({
    connections: 0,
    presenceMembers: 0,
  });

  // create stable references for the listeners
  const listenerRef = useEventListenerRef(params?.listener);
  const onDiscontinuityRef = useEventListenerRef(params?.onDiscontinuity);

  // if provided, subscribes the user provided discontinuity listener
  useEffect(() => {
    if (!onDiscontinuityRef) return;
    return wrapRoomPromise(
      context.room,
      (room) => {
        logger.debug('useOccupancy(); applying onDiscontinuity listener');
        const { off } = room.onDiscontinuity(onDiscontinuityRef);
        return () => {
          logger.debug('useOccupancy(); removing onDiscontinuity listener');
          off();
        };
      },
      logger,
    ).unmount();
  }, [context, onDiscontinuityRef, logger]);

  // subscribe to occupancy events internally, to update the state metrics
  useEffect(() => {
    const roomPromise = wrapRoomPromise(
      context.room,
      (room) => {
        logger.debug('useOccupancy(); applying internal listener');
        // Set the initial metrics from current(), or 0 if not available
        const currentOccupancy = room.occupancy.current;
        setOccupancyMetrics({
          connections: currentOccupancy?.connections ?? 0,
          presenceMembers: currentOccupancy?.presenceMembers ?? 0,
        });

        const { unsubscribe } = room.occupancy.subscribe((occupancyEvent) => {
          setOccupancyMetrics({
            connections: occupancyEvent.occupancy.connections,
            presenceMembers: occupancyEvent.occupancy.presenceMembers,
          });
        });
        return () => {
          logger.debug('useOccupancy(); cleaning up internal listener');
          unsubscribe();
        };
      },
      logger,
    );

    return roomPromise.unmount();
  }, [context, logger]);

  // if provided, subscribes the user provided listener to occupancy events
  useEffect(() => {
    if (!listenerRef) return;
    return wrapRoomPromise(
      context.room,
      (room) => {
        logger.debug('useOccupancy(); applying listener');
        const { unsubscribe } = room.occupancy.subscribe(listenerRef);
        return () => {
          logger.debug('useOccupancy(); cleaning up listener');
          unsubscribe();
        };
      },
      logger,
    ).unmount();
  }, [listenerRef, context, logger]);

  return {
    connectionStatus,
    connectionError,
    roomStatus,
    roomError,
    connections: occupancyMetrics.connections,
    presenceMembers: occupancyMetrics.presenceMembers,
  };
};

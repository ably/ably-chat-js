import { useEffect, useState } from 'react';

import { Occupancy, OccupancyListener } from '../../core/occupancy.js';
import { wrapRoomPromise } from '../helper/room-promise.js';
import { useEventListenerRef } from '../helper/use-event-listener-ref.js';
import { useEventualRoomProperty } from '../helper/use-eventual-room.js';
import { useRoomContext } from '../helper/use-room-context.js';
import { useRoomStatus } from '../helper/use-room-status.js';
import { ChatStatusResponse } from '../types/chat-status-response.js';
import { Listenable } from '../types/listenable.js';
import { StatusParams } from '../types/status-params.js';
import { useChatConnection } from './use-chat-connection.js';
import { useRoomLogger } from './use-logger.js';

/**
 * The options for the {@link useOccupancy} hook.
 */
export interface UseOccupancyParams extends StatusParams, Listenable<OccupancyListener> {
  /**
   * A listener that will be called whenever an occupancy event is received.
   * The listener is removed when the component unmounts.
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

  /**
   * Provides access to the underlying {@link Occupancy} instance of the room.
   */
  readonly occupancy?: Occupancy;
}

/**
 * A hook that provides access to the {@link Occupancy} instance of the room.
 * It will use the instance belonging to the nearest {@link ChatRoomProvider} in the component tree.
 *
 * @param params - Allows the registering of optional callbacks.
 * @returns UseOccupancyResponse
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
    return wrapRoomPromise(
      context.room,
      (room) => {
        logger.debug('useOccupancy(); applying internal listener');
        // Set the initial metrics from current(), or 0 if not available
        const currentOccupancy = room.occupancy.current();
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
    ).unmount();
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
    occupancy: useEventualRoomProperty((room) => room.occupancy),
    connectionStatus,
    connectionError,
    roomStatus,
    roomError,
    connections: occupancyMetrics.connections,
    presenceMembers: occupancyMetrics.presenceMembers,
  };
};

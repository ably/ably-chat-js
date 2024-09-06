import { Occupancy, OccupancyListener } from '@ably/chat';
import { useEffect, useState } from 'react';

import { useEventListenerRef } from '../helper/use-event-listener-ref.js';
import { ChatStatusResponse } from '../types/chat-status-response.js';
import { Listenable } from '../types/listenable.js';
import { StatusParams } from '../types/status-params.js';
import { useChatConnection } from './use-chat-connection.js';
import { useLogger } from './use-logger.js';
import { useRoom } from './use-room.js';

/**
 * The options for the {@link useOccupancy} hook.
 */
export interface UseOccupancyParams extends StatusParams, Listenable<OccupancyListener> {
  /**
   * A listener that will be called whenever an occupancy event is received.
   */
  listener?: OccupancyListener;
}

/**
 * The response type from the {@link useOccupancy} hook.
 */
export interface UseOccupancyResponse extends ChatStatusResponse {
  /**
   * Provides access to the underlying {@link Occupancy} instance of the room.
   */
  readonly occupancy: Occupancy;

  /**
   * Number of users connected to the room.
   */
  readonly connections: number;

  /**
   * Number of users present in the room.
   */
  readonly presenceMembers: number;
}

/**
 * A hook that provides access to the {@link Occupancy} instance of the room.
 * It will use the instance belonging to the nearest {@link ChatRoomProvider} in the component tree.
 *
 * @param params - Allows the registering of optional callbacks and setting the optional update interval.
 * @returns UseOccupancyResponse
 */
export const useOccupancy = (params?: UseOccupancyParams): UseOccupancyResponse => {
  const { currentStatus: connectionStatus, error: connectionError } = useChatConnection({
    onStatusChange: params?.onConnectionStatusChange,
  });
  const { room, roomError, roomStatus } = useRoom({
    onStatusChange: params?.onRoomStatusChange,
  });
  const logger = useLogger();
  logger.trace('useOccupancy();', { params, roomId: room.roomId });

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
    logger.debug('useOccupancy(); applying onDiscontinuity listener', { roomId: room.roomId });
    const { off } = room.occupancy.onDiscontinuity(onDiscontinuityRef);
    return () => {
      logger.debug('useOccupancy(); removing onDiscontinuity listener', { roomId: room.roomId });
      off();
    };
  }, [room, onDiscontinuityRef, logger]);

  // subscribe to occupancy events internally, to update the state metrics
  useEffect(() => {
    logger.debug('useOccupancy(); applying internal listener', { roomId: room.roomId });
    const { unsubscribe } = room.occupancy.subscribe((occupancyEvent) => {
      setOccupancyMetrics({
        connections: occupancyEvent.connections,
        presenceMembers: occupancyEvent.presenceMembers,
      });
    });
    return () => {
      logger.debug('useOccupancy(); cleaning up internal listener', { roomId: room.roomId });
      unsubscribe();
    };
  }, [room, logger]);

  // if provided, subscribes the user provided listener to occupancy events
  useEffect(() => {
    if (!listenerRef) return;
    logger.debug('useOccupancy(); applying listener', { roomId: room.roomId });
    const { unsubscribe } = room.occupancy.subscribe(listenerRef);
    return () => {
      logger.debug('useOccupancy(); cleaning up listener', { roomId: room.roomId });
      unsubscribe();
    };
  }, [listenerRef, room, logger]);

  return {
    connectionStatus,
    connectionError,
    roomStatus,
    roomError,
    occupancy: room.occupancy,
    connections: occupancyMetrics.connections,
    presenceMembers: occupancyMetrics.presenceMembers,
  };
};

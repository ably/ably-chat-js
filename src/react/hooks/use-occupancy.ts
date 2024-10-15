import { OccupancyListener } from '@ably/chat';
import { useEffect, useState } from 'react';

import { wrapRoomPromise } from '../helper/room-promise.js';
import { useEventListenerRef } from '../helper/use-event-listener-ref.js';
import { useRoomContext } from '../helper/use-room-context.js';
import { useRoomStatus } from '../helper/use-room-status.js';
import { ChatStatusResponse } from '../types/chat-status-response.js';
import { Listenable } from '../types/listenable.js';
import { StatusParams } from '../types/status-params.js';
import { useChatConnection } from './use-chat-connection.js';
import { useLogger } from './use-logger.js';

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

  const logger = useLogger();
  logger.trace('useOccupancy();', { params, roomId: context.roomId });

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
        logger.debug('useOccupancy(); applying onDiscontinuity listener', { roomId: context.roomId });
        const { off } = room.occupancy.onDiscontinuity(onDiscontinuityRef);
        return () => {
          logger.debug('useOccupancy(); removing onDiscontinuity listener', { roomId: context.roomId });
          off();
        };
      },
      logger,
      context.roomId,
    ).unmount();
  }, [context, onDiscontinuityRef, logger]);

  // subscribe to occupancy events internally, to update the state metrics
  useEffect(() => {
    return wrapRoomPromise(
      context.room,
      (room) => {
        logger.debug('useOccupancy(); applying internal listener', { roomId: context.roomId });
        const { unsubscribe } = room.occupancy.subscribe((occupancyEvent) => {
          setOccupancyMetrics({
            connections: occupancyEvent.connections,
            presenceMembers: occupancyEvent.presenceMembers,
          });
        });
        return () => {
          logger.debug('useOccupancy(); cleaning up internal listener', { roomId: context.roomId });
          unsubscribe();
        };
      },
      logger,
      context.roomId,
    ).unmount();
  }, [context, logger]);

  // if provided, subscribes the user provided listener to occupancy events
  useEffect(() => {
    if (!listenerRef) return;
    return wrapRoomPromise(
      context.room,
      (room) => {
        logger.debug('useOccupancy(); applying listener', { roomId: context.roomId });
        const { unsubscribe } = room.occupancy.subscribe(listenerRef);
        return () => {
          logger.debug('useOccupancy(); cleaning up listener', { roomId: context.roomId });
          unsubscribe();
        };
      },
      logger,
      context.roomId,
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

import { Occupancy, OccupancyListener } from '@ably/chat';
import { useEffect, useState } from 'react';

import { ChatStatusResponse } from '../types/chat-status-response.js';
import { Listenable } from '../types/listenable.js';
import { StatusParams } from '../types/status-params.js';
import { useChatConnection } from './use-chat-connection.js';
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

  const [occupancyMetrics, setOccupancyMetrics] = useState<{ connections: number; presenceMembers: number }>({
    connections: 0,
    presenceMembers: 0,
  });

  // if provided, subscribes the user provided discontinuity listener
  useEffect(() => {
    if (!params?.onDiscontinuity) return;
    const { off } = room.occupancy.onDiscontinuity(params.onDiscontinuity);
    return () => {
      off();
    };
  }, [room, params?.onDiscontinuity]);

  // subscribe to occupancy events, throttling the updates if an interval is provided
  useEffect(() => {
    const { unsubscribe } = room.occupancy.subscribe((occupancyEvent) => {
      setOccupancyMetrics({
        connections: occupancyEvent.connections,
        presenceMembers: occupancyEvent.presenceMembers,
      });
    });
    return () => {
      unsubscribe();
    };
  }, [params?.listener, room]);

  // if provided, subscribes the user provided listener to occupancy events
  useEffect(() => {
    if (!params?.listener) return;
    const { unsubscribe } = room.occupancy.subscribe(params.listener);
    return () => {
      unsubscribe();
    };
  }, [params?.listener, room]);

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

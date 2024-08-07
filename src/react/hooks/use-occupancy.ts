import { Occupancy, OccupancyListener } from '@ably/chat';
import { useEffect, useState } from 'react';

import { ChatStatusResponse } from '../chat-status-response.js';
import { Listenable } from '../listenable.js';
import { StatusParams } from '../status-params.js';
import { useChatConnection } from './use-chat-connection.js';
import { useRoom } from './use-room.js';

/**
 * The options for the {@link useOccupancy} hook.
 */
export interface UseOccupancyParams extends StatusParams, Listenable<OccupancyListener> {
  /**
   * This value determines how often the occupancy numbers are updated.
   */
  updateInterval?: number;
}

/**
 * The response type from the {@link useOccupancy} hook.
 */
export interface UseOccupancyResponse extends ChatStatusResponse {
  /**
   * Provides access to the underlying {@link Occupancy} instance of the chat room.
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
 * A hook that provides access to the {@link Occupancy} instance in the room.
 * It will use the instance belonging to the nearest {@link RoomProvider} in the component tree.
 *
 * @param params - Allows the registering of optional callbacks and occupancy update interval.
 * @returns UseOccupancyResponse
 */
export const useOccupancy = (params?: UseOccupancyParams): UseOccupancyResponse => {
  const { currentStatus: connectionStatus, error: connectionError } = useChatConnection({
    onStatusChange: params?.onConnectionStatusChange,
  });
  const { room, roomError, roomStatus } = useRoom({
    onStatusChange: params?.onRoomStatusChange,
  });

  const [connections, setConnections] = useState<number>(0);
  const [presenceMembers, setPresenceMembers] = useState<number>(0);

  const [occupancy, setOccupancy] = useState<Occupancy>(room.occupancy);

  // if provided, subscribes the user provided discontinuity listener
  useEffect(() => {
    if (!params?.onDiscontinuity) return;
    const { off } = room.occupancy.onDiscontinuity(params.onDiscontinuity);
    return () => {
      off();
    };
  }, [room, params]);

  // update the instance when the room changes
  useEffect(() => {
    setOccupancy(room.occupancy);
  }, [room]);

  // subscribe to occupancy events
  useEffect(() => {
    const { unsubscribe } = room.occupancy.subscribe((occupancyEvent) => {
      setConnections(occupancyEvent.connections);
      setPresenceMembers(occupancyEvent.presenceMembers);
    });
    return () => {
      unsubscribe();
    };
  }, [room]);

  return {
    connectionStatus,
    connectionError,
    roomStatus,
    roomError,
    occupancy,
    connections,
    presenceMembers,
  };
};

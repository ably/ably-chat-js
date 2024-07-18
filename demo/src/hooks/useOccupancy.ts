import { useCallback, useEffect, useState } from 'react';
import { OccupancyListener } from '@ably/chat';
import { useRoom } from './useRoom.ts';

/**
 * Listens to the occupancy events in the current room.
 * @returns The number of connections and presence members in the current room.
 */
export const useOccupancy = () => {
  const [occupancyMetrics, setOccupancyMetrics] = useState({ connections: 0, presenceMembers: 0 });
  const { room } = useRoom();

  const handler: OccupancyListener = useCallback((event) => {
    setOccupancyMetrics(event);
  }, []);

  useEffect(() => {
    if (!room) return;
    const { unsubscribe } = room.occupancy.subscribe(handler);
    return () => {
      unsubscribe();
    };
  }, [room, handler]);

  return { occupancyMetrics };
};

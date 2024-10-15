import { Room } from '@ably/chat';
import { useEffect, useRef, useState } from 'react';

import { useLogger } from '../hooks/use-logger.js';

export const useEventualRoom = (roomId: string, room: Promise<Room>): Room | undefined => {
  const [roomState, setRoomState] = useState<Room | undefined>();
  const logger = useLogger();
  const roomRef = useRef<Promise<Room>>(room);
  useEffect(() => {
    roomRef.current = room;
  });

  useEffect(() => {
    let unmounted = false;
    void roomRef.current
      .then((room: Room) => {
        if (unmounted) return;
        setRoomState(room);
      })
      .catch((error: unknown) => {
        logger.error('Failed to get room', { roomId, error });
      });

    return () => {
      unmounted = true;
    };
  }, [roomId, logger]);

  return roomState;
};

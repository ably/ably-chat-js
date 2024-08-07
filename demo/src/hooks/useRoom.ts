import { useContext, useLayoutEffect } from 'react';
import { RoomContext } from '../containers/RoomContext';

/**
 * Hook that provides access to the current room and the client ID.
 */
export const useRoom = () => {
  const context = useContext(RoomContext);

  if (!context) throw Error('useRoom: RoomContext not found.');

  useLayoutEffect(() => {
    // Attach to the room. Starts all features of the room.
    context.room.attach();

    return () => {
      // cleanup: detach the room. Stops all enabled features of the room.
      context.room.detach();
    };
  }, [context.room]);

  return {
    room: context.room,
    clientId: context.client.clientId,
  };
};

import { useContext, useLayoutEffect } from 'react';
import { RoomContext } from '../containers/RoomContext';

export const useRoom = () => {
  const context = useContext(RoomContext);

  if (!context) throw Error('Client is not setup!');

  useLayoutEffect(() => {
    context.room.attach();

    return () => {
      context.room.detach();
    };
  }, [context.room]);

  return {
    room: context.room,
    clientId: context.client.clientId,
  };
};

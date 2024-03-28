import { useContext } from 'react';
import {RoomContext } from '../containers/RoomContext';

export const useRoom = () => {
  const context = useContext(RoomContext);

  if (!context) throw Error('Client is not setup!');

  return {
    room: context.room,
    clientId: context.client.clientId,
  };
};

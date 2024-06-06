import { FC, ReactNode, useMemo } from 'react';
import { ChatClient } from '@ably-labs/chat';
import { RoomContext } from './RoomContext';

interface RoomProviderProps {
  client: ChatClient;
  roomId: string;
  children: ReactNode;
}
export const RoomProvider: FC<RoomProviderProps> = ({ client, roomId: roomId, children }) => {
  const value = useMemo(
    () => ({
      client,
      room: client.rooms.get(roomId),
    }),
    [client, roomId],
  );

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
};

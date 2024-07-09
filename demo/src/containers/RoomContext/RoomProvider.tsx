import { FC, ReactNode, useMemo } from 'react';
import { ChatClient, RoomOptionsDefaults } from '@ably-labs/chat';
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
      room: client.rooms.get(roomId, {
        presence: RoomOptionsDefaults.presence,
        reactions: RoomOptionsDefaults.reactions,
        typing: RoomOptionsDefaults.typing,
      }),
    }),
    [client, roomId],
  );

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
};

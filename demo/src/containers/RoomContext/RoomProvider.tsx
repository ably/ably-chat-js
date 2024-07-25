import { FC, ReactNode, useMemo } from 'react';
import { RoomOptionsDefaults } from '@ably/chat';
import { RoomContext } from './RoomContext';
import { useChatClient } from '@ably/chat/react';

interface RoomProviderProps {
  roomId: string;
  children: ReactNode;
}

export const RoomProvider: FC<RoomProviderProps> = ({ roomId: roomId, children }) => {
  const client = useChatClient();
  const value = useMemo(
    () => ({
      client,
      room: client.rooms.get(roomId, {
        presence: RoomOptionsDefaults.presence,
        reactions: RoomOptionsDefaults.reactions,
        typing: RoomOptionsDefaults.typing,
        occupancy: RoomOptionsDefaults.occupancy,
      }),
    }),
    [client, roomId],
  );

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
};

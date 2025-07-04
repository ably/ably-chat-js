import { ReactionInput } from '../ReactionInput';
import { FC, useEffect, useState } from 'react';
import { ConnectionStatus, RoomReaction, RoomReactionEvent } from '@ably/chat';
import { useChatConnection, useRoom, useRoomReactions } from '@ably/chat/react';

interface ReactionComponentProps {}

export const ReactionComponent: FC<ReactionComponentProps> = () => {
  const [isConnected, setIsConnected] = useState(true);
  const { currentStatus } = useChatConnection();
  const [roomReactions, setRoomReactions] = useState<RoomReaction[]>([]);
  const { roomName } = useRoom();
  const { send: sendReaction } = useRoomReactions({
    listener: (event: RoomReactionEvent) => {
      setRoomReactions([...roomReactions, event.reaction]);
    },
  });

  useEffect(() => {
    // clear reactions when the room changes
    if (roomName) {
      setRoomReactions([]);
    }
  }, [roomName]);

  useEffect(() => {
    // enable/disable the input based on the connection status
    setIsConnected(currentStatus === ConnectionStatus.Connected);
  }, [currentStatus]);

  return (
    <div>
      <div>
        <ReactionInput
          reactions={[]}
          onSend={sendReaction}
          disabled={!isConnected}
        ></ReactionInput>
      </div>
      <div>
        <div className="flex gap-2 px-2 py-3 border-t bg-white border-gray-300 mx-auto text-black">
          <span>Received reactions:</span>
          <div className="flex-1 flex items-center max-h-[24px] gap-1 overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-gray-300">
            {roomReactions.map((r, idx) => (
              <span
                key={idx}
                className="px-2 py-1 bg-white rounded text-blue-600"
              >
                {r.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

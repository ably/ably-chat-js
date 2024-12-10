import { ReactionInput } from '../ReactionInput';
import { FC, useEffect, useState } from 'react';
import { ConnectionStatus, Reaction } from '@ably/chat';
import { useChatConnection, useRoom, useRoomReactions } from '@ably/chat';

interface ReactionComponentProps {}

export const ReactionComponent: FC<ReactionComponentProps> = () => {
  const [isConnected, setIsConnected] = useState(true);
  const { currentStatus } = useChatConnection();
  const [roomReactions, setRoomReactions] = useState<Reaction[]>([]);
  const { roomId } = useRoom();
  const { send: sendReaction } = useRoomReactions({
    listener: (reaction: Reaction) => {
      setRoomReactions([...roomReactions, reaction]);
    },
  });

  useEffect(() => {
    // clear reactions when the room changes
    if (roomId) {
      setRoomReactions([]);
    }
  }, [roomId]);

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
        Received reactions:{' '}
        {roomReactions.map((r, idx) => (
          <span key={idx}>{r.type}</span>
        ))}{' '}
      </div>
    </div>
  );
};

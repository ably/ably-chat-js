import React from 'react';
import { Message, ReactionRefType } from '@ably/chat';

interface MessageReactionsSingleProps {
  message: Message;
  clientId: string;
  onReactionAdd: (message: Message, refType: ReactionRefType, emoji: string, score?: number) => void;
  onReactionRemove: (message: Message, refType: ReactionRefType, emoji: string) => void;
}

const emojis = ['👍', '❤️', '🔥', '🚀'];

export const MessageReactionsSingle: React.FC<MessageReactionsSingleProps> = ({
  message,
  clientId,
  onReactionAdd,
  onReactionRemove,
}) => {
  const single = message.reactions.single ?? {};

  const handleReactionClick = (emoji: string) => {
    if (single[emoji]?.clientIds.includes(clientId)) {
      onReactionRemove(message, ReactionRefType.Single, emoji);
    } else {
      onReactionAdd(message, ReactionRefType.Single, emoji);
    }
  };

  const currentEmojis = emojis.slice();
  for (const emoji in single) {
    if (!currentEmojis.includes(emoji)) {
      currentEmojis.push(emoji);
    }
  }

  return (
    <>
      {currentEmojis.map((emoji) => (
        <button
          key={emoji}
          onClick={(e) => {
            e.preventDefault();
            handleReactionClick(emoji);
          }}
        >
          {emoji} ({single[emoji]?.total || 0})
        </button>
      ))}
    </>
  );
};

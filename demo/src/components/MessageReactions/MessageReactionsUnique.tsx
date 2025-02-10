import React from 'react';
import { Message, ReactionRefType } from '@ably/chat';

interface MessageReactionsUniqueProps {
  message: Message;
  clientId: string;
  onReactionAdd: (message: Message, refType: ReactionRefType, emoji: string, score?: number) => void;
  onReactionRemove: (message: Message, refType: ReactionRefType, emoji: string) => void;
}

const emojis = ['👍', '❤️', '🔥', '🚀'];

export const MessageReactionsUnique: React.FC<MessageReactionsUniqueProps> = ({
  message,
  clientId,
  onReactionAdd,
  onReactionRemove,
}) => {
  const unique = message.reactions.unique ?? {};

  const handleReactionClick = (emoji: string) => {
    if (unique[emoji]?.clientIds.includes(clientId)) {
      onReactionRemove(message, ReactionRefType.Unique, emoji);
    } else {
      onReactionAdd(message, ReactionRefType.Unique, emoji);
    }
  };

  const currentEmojis = emojis.slice();
  if (unique) {
    for (const emoji in unique) {
      if (!currentEmojis.includes(emoji)) {
        currentEmojis.push(emoji);
      }
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
          {emoji} ({unique[emoji]?.total || 0})
        </button>
      ))}
    </>
  );
};

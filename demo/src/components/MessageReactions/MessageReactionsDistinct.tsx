import React from 'react';
import { Message, ReactionRefType } from '@ably/chat';

interface MessageReactionsDistinctProps {
  message: Message;
  clientId: string;
  onReactionAdd: (message: Message, refType: ReactionRefType, emoji: string, score?: number) => void;
  onReactionDelete: (message: Message, refType: ReactionRefType, emoji: string) => void;
}

const emojis = ['👍', '❤️', '🔥', '🚀'];

export const MessageReactionsDistinct: React.FC<MessageReactionsDistinctProps> = ({
  message,
  clientId,
  onReactionAdd,
  onReactionDelete: onReactionRemove,
}) => {
  const distinct = message.reactions.distinct ?? {};

  const handleReactionClick = (emoji: string) => {
    if (distinct[emoji]?.clientIds.includes(clientId)) {
      onReactionRemove(message, ReactionRefType.Distinct, emoji);
    } else {
      onReactionAdd(message, ReactionRefType.Distinct, emoji);
    }
  };

  const currentEmojis = emojis.slice();
  if (distinct) {
    for (const emoji in distinct) {
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
          {emoji} ({distinct[emoji]?.total || 0})
        </button>
      ))}
    </>
  );
};

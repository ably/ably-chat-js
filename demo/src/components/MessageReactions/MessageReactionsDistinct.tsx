import React from 'react';
import { Message, MessageReactionType, Messages } from '@ably/chat';

interface MessageReactionsDistinctProps {
  message: Message;
  clientId: string;
  onReactionAdd: Messages['reactions']['add'];
  onReactionDelete: Messages['reactions']['delete'];
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
      onReactionRemove(message, { type: MessageReactionType.Distinct, reaction: emoji });
    } else {
      onReactionAdd(message, { type: MessageReactionType.Distinct, reaction: emoji });
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

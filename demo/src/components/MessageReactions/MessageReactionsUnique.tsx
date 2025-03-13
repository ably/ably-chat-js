import React from 'react';
import { Message, MessageReactionType } from '@ably/chat';

interface MessageReactionsUniqueProps {
  message: Message;
  clientId: string;
  onReactionAdd: (message: Message, type: MessageReactionType, emoji: string, score?: number) => void;
  onReactionDelete: (message: Message, type: MessageReactionType, emoji: string) => void;
}

const emojis = ['👍', '❤️', '🔥', '🚀'];

export const MessageReactionsUnique: React.FC<MessageReactionsUniqueProps> = ({
  message,
  clientId,
  onReactionAdd,
  onReactionDelete: onReactionRemove,
}) => {
  const unique = message.reactions.unique ?? {};

  const handleReactionClick = (emoji: string) => {
    if (unique[emoji]?.clientIds.includes(clientId)) {
      onReactionRemove(message, MessageReactionType.Unique, emoji);
    } else {
      onReactionAdd(message, MessageReactionType.Unique, emoji);
    }
  };

  const currentEmojis = emojis.slice();
  for (const emoji in unique) {
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
          {emoji} ({unique[emoji]?.total || 0})
        </button>
      ))}
    </>
  );
};

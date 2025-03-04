import React from 'react';
import { Message, ReactionRefType } from '@ably/chat';

interface MessageReactionsMultipleProps {
  message: Message;
  onReactionAdd: (message: Message, refType: ReactionRefType, emoji: string, score?: number) => void;
  onReactionDelete: (message: Message, refType: ReactionRefType, emoji: string) => void;
}

const emojis = ['👍', '❤️', '🔥', '🚀'];

export const MessageReactionsMultiple: React.FC<MessageReactionsMultipleProps> = ({
  message,
  onReactionAdd,
  onReactionDelete: onReactionRemove,
}) => {
  const handleReactionClick = (emoji: string) => {
    onReactionAdd(message, ReactionRefType.Multiple, emoji);
  };

  const handleReactionRemoveClick = (emoji: string) => {
    onReactionRemove(message, ReactionRefType.Multiple, emoji);
  };

  const multiple = message.reactions.multiple ?? {};

  const currentEmojis = emojis.slice();
  for (const emoji in multiple) {
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
            if (e.type === 'contextmenu') {
              handleReactionRemoveClick(emoji);
            } else {
              handleReactionClick(emoji);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            handleReactionRemoveClick(emoji);
          }}
        >
          {emoji} ({multiple[emoji]?.total || 0})
        </button>
      ))}
    </>
  );
};

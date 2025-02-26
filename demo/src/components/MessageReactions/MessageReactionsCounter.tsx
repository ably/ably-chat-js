import React from 'react';
import { Message, ReactionRefType } from '@ably/chat';

interface MessageReactionsCounterProps {
  message: Message;
  onReactionAdd: (message: Message, refType: ReactionRefType, emoji: string, score?: number) => void;
  onReactionRemove: (message: Message, refType: ReactionRefType, emoji: string) => void;
}

const emojis = ['👍', '❤️', '🔥', '🚀'];

export const MessageReactionsCounter: React.FC<MessageReactionsCounterProps> = ({
  message,
  onReactionAdd,
  onReactionRemove,
}) => {
  const handleReactionClick = (emoji: string) => {
    onReactionAdd(message, ReactionRefType.Counter, emoji);
  };

  const handleReactionRemoveClick = (emoji: string) => {
    onReactionRemove(message, ReactionRefType.Counter, emoji);
  };

  const counter = message.reactions.counter ?? {};

  const currentEmojis = emojis.slice();
  for (const emoji in counter) {
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
          {emoji} ({counter[emoji]?.total || 0})
        </button>
      ))}
    </>
  );
};

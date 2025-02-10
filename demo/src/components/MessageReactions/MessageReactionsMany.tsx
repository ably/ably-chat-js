import React from 'react';
import { Message, ReactionRefType } from '@ably/chat';

interface MessageReactionsManyProps {
  message: Message;
  onReactionAdd: (message: Message, refType: ReactionRefType, emoji: string, score?: number) => void;
  onReactionRemove: (message: Message, refType: ReactionRefType, emoji: string) => void;
}

const emojis = ['👍', '❤️', '🔥', '🚀'];

export const MessageReactionsMany: React.FC<MessageReactionsManyProps> = ({
  message,
  onReactionAdd,
  onReactionRemove,
}) => {
  const handleReactionClick = (emoji: string) => {
    onReactionAdd(message, ReactionRefType.Many, emoji);
  };

  const handleReactionRemoveClick = (emoji: string) => {
    onReactionRemove(message, ReactionRefType.Many, emoji);
  };

  const currentEmojis = emojis.slice();
  if (message.reactions.many) {
    for (const emoji in message.reactions.many) {
      if (!currentEmojis.includes(emoji)) {
        currentEmojis.push(emoji);
      }
    }
  }

  const many = message.reactions.many ?? {};


    console.log("current emojis", currentEmojis)
  return (
    <>
    hello
      {currentEmojis.map((emoji) => (
        <button
          key={emoji}
          onClick={(e) => {
            e.preventDefault();
            if (e.type === 'contextmenu') {
              console.log("about to remove via onClick")
              handleReactionRemoveClick(emoji);
            } else {
              handleReactionClick(emoji);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            console.log("about to remove via right click onmenu")
            handleReactionRemoveClick(emoji);
          }}
        >
          {emoji} ({many[emoji]?.total || 0})
        </button>
      ))}
    </>
  );
};

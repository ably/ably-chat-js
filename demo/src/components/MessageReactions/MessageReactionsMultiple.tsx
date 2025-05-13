import React from 'react';
import { Message, MessageReactionType, Messages } from '@ably/chat';
import './styles.css';

interface MessageReactionsMultipleProps {
  message: Message;
  onReactionAdd: Messages['reactions']['add'];
  onReactionDelete: Messages['reactions']['delete'];
}

const emojis = ['👍', '❤️', '🔥', '🚀'];

export const MessageReactionsMultiple: React.FC<MessageReactionsMultipleProps> = ({
  message,
  onReactionAdd,
  onReactionDelete: onReactionRemove,
}) => {
  const handleReactionClick = (name: string) => {
    onReactionAdd(message, { type: MessageReactionType.Multiple, name: name });
  };

  const handleReactionRemoveClick = (name: string) => {
    onReactionRemove(message, { type: MessageReactionType.Multiple, name: name });
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
      {currentEmojis.map((name) => (
        <button
          key={name}
          onClick={(e) => {
            e.preventDefault();
            if (e.type === 'contextmenu') {
              handleReactionRemoveClick(name);
            } else {
              handleReactionClick(name);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            handleReactionRemoveClick(name);
          }}
          className="reaction-button"
        >
          {name} ({multiple[name]?.total || 0})
        </button>
      ))}
    </>
  );
};

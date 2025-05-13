import React from 'react';
import { Message, MessageReactionType, Messages } from '@ably/chat';
import './styles.css';

interface MessageReactionsUniqueProps {
  message: Message;
  clientId: string;
  onReactionAdd: Messages['reactions']['add'];
  onReactionDelete: Messages['reactions']['delete'];
}

const emojis = ['👍', '❤️', '🔥', '🚀'];

export const MessageReactionsUnique: React.FC<MessageReactionsUniqueProps> = ({
  message,
  clientId,
  onReactionAdd,
  onReactionDelete: onReactionRemove,
}) => {
  const unique = message.reactions.unique ?? {};

  const handleReactionClick = (name: string) => {
    if (unique[name]?.clientIds.includes(clientId)) {
      onReactionRemove(message, { type: MessageReactionType.Unique, name: name });
    } else {
      onReactionAdd(message, { type: MessageReactionType.Unique, name: name });
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
      {currentEmojis.map((name) => (
        <button
          key={name}
          onClick={(e) => {
            e.preventDefault();
            handleReactionClick(name);
          }}
          className="reaction-button"
        >
          {name} ({unique[name]?.total || 0})
        </button>
      ))}
    </>
  );
};

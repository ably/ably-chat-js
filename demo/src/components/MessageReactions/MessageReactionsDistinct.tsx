import React from 'react';
import { Message, MessageReactionType, Messages } from '@ably/chat';
import './styles.css';

interface MessageReactionsDistinctProps {
  message: Message;
  clientId?: string;
  onReactionSend: Messages['reactions']['send'];
  onReactionDelete: Messages['reactions']['delete'];
}

const emojis = ['👍', '❤️', '🔥', '🚀'];

export const MessageReactionsDistinct: React.FC<MessageReactionsDistinctProps> = ({
  message,
  clientId,
  onReactionSend,
  onReactionDelete: onReactionRemove,
}) => {
  const distinct = message.reactions.distinct ?? {};

  const handleReactionClick = (name: string) => {
    if (clientId && distinct[name]?.clientIds.includes(clientId)) {
      onReactionRemove(message.serial, { type: MessageReactionType.Distinct, name: name });
    } else if (clientId) {
      onReactionSend(message.serial, { type: MessageReactionType.Distinct, name: name });
    }
  };

  const currentEmojis = emojis.slice();
  for (const emoji in distinct) {
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
          {name} ({distinct[name]?.total || 0})
        </button>
      ))}
    </>
  );
};

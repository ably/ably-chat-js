import { Message } from '@ably/chat';
import React, { useCallback } from 'react';
import clsx from 'clsx';

function twoDigits(input: number): string {
  if (input === 0) {
    return '00';
  }
  if (input < 10) {
    return '0' + input;
  }
  return '' + input;
}

interface MessageProps {
  id: string;
  self?: boolean;
  message: Message;

  onMessageClick?(id: string): void;
}

export const MessageComponent: React.FC<MessageProps> = ({ id, self = false, message, onMessageClick }) => {
  const handleMessageClick = useCallback(() => {
    onMessageClick?.(id);
  }, [id, onMessageClick]);

  let displayCreatedAt: string;
  if (Date.now() - message.createdAt.getTime() < 1000 * 60 * 60 * 24) {
    // last 24h show the time
    displayCreatedAt = twoDigits(message.createdAt.getHours()) + ':' + twoDigits(message.createdAt.getMinutes());
  } else {
    // older, show full date
    displayCreatedAt =
      message.createdAt.getDate() +
      '/' +
      message.createdAt.getMonth() +
      '/' +
      message.createdAt.getFullYear() +
      ' ' +
      twoDigits(message.createdAt.getHours()) +
      ':' +
      twoDigits(message.createdAt.getMinutes());
  }

  return (
    <div
      className="chat-message"
      onClick={handleMessageClick}
    >
      <div className={clsx('flex items-end', { ['justify-end']: self, ['justify-start']: !self })}>
        <div
          className={clsx('flex flex-col text max-w-xs mx-2', {
            ['items-end order-1']: self,
            ['items-start order-2']: !self,
          })}
        >
          <div className="text-xs">
            <span>{message.clientId}</span> &middot;{' '}
            <span className="sent-at-time">
              <span className="short">{displayCreatedAt}</span>
              <span className="long">{message.createdAt.toLocaleString()}</span>
            </span>
          </div>
          <div
            className={clsx('px-4 py-2 rounded-lg inline-block', {
              ['rounded-br bg-blue-600 text-white']: self,
              ['rounded-bl justify-start bg-gray-300 text-gray-600']: !self,
            })}
          >
            {message.text}
          </div>
        </div>
      </div>
    </div>
  );
};

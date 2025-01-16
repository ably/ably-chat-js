import { Message } from '@ably/chat';
import React, { useCallback } from 'react';
import clsx from 'clsx';
import { FaPencil, FaTrash } from 'react-icons/fa6';

interface MessageProps {
  self?: boolean;
  message: Message;

  onMessageUpdate?(message: Message): void;

  onMessageDelete?(msg: Message): void;

  onMessageReact?(message: Message, reaction: string): void;
}

const shortDateTimeFormatter = new Intl.DateTimeFormat('default', {
  hour: '2-digit',
  minute: '2-digit',
});

const shortDateFullFormatter = new Intl.DateTimeFormat('default', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function shortDate(date: Date): string {
  if (Date.now() - date.getTime() < 1000 * 60 * 60 * 24) {
    return shortDateTimeFormatter.format(date);
  }
  return shortDateFullFormatter.format(date);
}

export const MessageComponent: React.FC<MessageProps> = ({
  self = false,
  message,
  onMessageUpdate,
  onMessageDelete,
  onMessageReact,
}) => {
  const handleMessageUpdate = useCallback(
    (e: React.UIEvent) => {
      e.stopPropagation();
      onMessageUpdate?.(message);
    },
    [message, onMessageUpdate],
  );

  const handleMessageDelete = useCallback(
    (e: React.UIEvent) => {
      e.stopPropagation();
      onMessageDelete?.(message);
    },
    [message, onMessageDelete],
  );

  const handleReaction = useCallback(
    (reaction: string) => {
      onMessageReact?.(message, reaction);
    },
    [message, onMessageReact],
  );

  const currentReactions = message.reactions;
  const reactionsWithCounts = ['👍', '🚀', '🔥', '❤️'].map((emoji) => {
    const count = currentReactions.get(emoji)?.count || 0;
    return { emoji, count};
  })

  const messageReactionsUI = (
    <span className="message-reactions">
      {reactionsWithCounts.map((rwc) => (
        <a
          key={rwc.emoji}
          onClick={(e) => {
            e.preventDefault();
            handleReaction(rwc.emoji);
          }}
          href="#"
        >
          {rwc.emoji}
          {rwc.count > 0 ? "(" + rwc.count + ")" : ""}
        </a>
      ))}
    </span>
  );
  const messageActionsUI = (
    <div
      className="buttons"
      role="group"
      aria-label="Message actions"
    >
      {!self && <>{messageReactionsUI} | </>}
      <FaPencil
        className="cursor-pointer text-gray-100 m-1 hover:text-gray-500 inline-block"
        onClick={handleMessageUpdate}
        aria-label="Edit message"
      ></FaPencil>
      <FaTrash
        className="cursor-pointer text-red-500 m-1 hover:text-red-700 inline-block"
        onClick={handleMessageDelete}
        aria-label="Delete message"
      />
      {self && <> | {messageReactionsUI} </>}
    </div>
  );

  return (
    <div className="chat-message">
      <div className={clsx('flex items-end', { ['justify-end']: self, ['justify-start']: !self })}>
        <div
          className={clsx('flex flex-col text max-w-xs mx-2 relative', {
            ['items-end order-1']: self,
            ['items-start order-2']: !self,
          })}
        >
          <div className="text-xs">
            <span>{message.clientId}</span> &middot;{' '}
            <span className="sent-at-time">
              <span className="short">{shortDate(message.createdAt)}</span>
              <span className="long">{message.createdAt.toLocaleString()}</span>
            </span>
            {message.isUpdated && message.updatedAt ? (
              <>
                {' '}
                &middot; Edited{' '}
                <span className="sent-at-time">
                  <span className="short">{shortDate(message.updatedAt)}</span>
                  <span className="long">{message.updatedAt.toLocaleString()}</span>
                </span>
                {message.updatedBy ? <span> by {message.updatedBy}</span> : ''}
              </>
            ) : (
              ''
            )}
          </div>
          <div
            className={clsx('px-4 py-2 rounded-lg inline-block', {
              ['rounded-br bg-blue-600 text-white ml-4']: self,
              ['rounded-bl justify-start bg-gray-300 text-gray-600 mr-4']: !self,
            })}
          >
            {message.text}
          </div>
          {messageActionsUI}
        </div>
      </div>
    </div>
  );
};

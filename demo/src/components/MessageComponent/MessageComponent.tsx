import { Message } from '@ably/chat';
import React, { useCallback } from 'react';
import clsx from 'clsx';
import { FaPencil, FaTrash } from 'react-icons/fa6';

interface MessageProps {
  self?: boolean;
  message: Message;

  onMessageUpdate?(message: Message): void;

  onMessageDelete?(msg: Message): void;

  onAddReaction?(message: Message, reaction: string, score?: number, unique?: boolean): void;
  
  onRemoveReaction?(message: Message, reaction: string): void;
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
  onAddReaction,
  onRemoveReaction,
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

  const currentReactions = message.reactions;
  const reactionsWithCounts = ['👍', '🚀', '🔥', '❤️'].map((emoji) => {
    const data = currentReactions.get(emoji);

    const clientIdArr : {clientId : string, total:  number, score : number}[] = [];
    if (data?.clientIds) {
      for (let clientId in data.clientIds) {
        clientIdArr.push({ clientId, score: data.clientIds[clientId].score, total: data.clientIds[clientId].total });
      }
    }
    if (data) {
      console.log("for emoji", emoji, "data", data, "clientIdArr", clientIdArr);
    }

    return { emoji, data, clientIdArr };
  })

  const messageReactionsUI = (
    <div className="message-reactions">
      {reactionsWithCounts.map((rwc) => (
        <div
        className="message-reaction"
          key={rwc.emoji}
        >
          <a href="#" onClick={(e) => {
            e.preventDefault();
            onAddReaction?.(message, rwc.emoji, 1, false);
          }}>{rwc.emoji}</a>
          {rwc.data?.score && rwc.data?.score > 0 ? "(" + rwc.data.score + ")" : ""}
          <div className="message-reaction-menu">
            <ul>
              <li><a href="#" onClick={(e) => {
                e.preventDefault();
                onAddReaction?.(message, rwc.emoji, 1, false);
              }}>Add reaction (default)</a></li>
              <li><a href="#" onClick={(e) => {
                e.preventDefault();
                onAddReaction?.(message, rwc.emoji, 1, true);
              }}>Add unique reaction</a></li>
              <li><a href="#" onClick={(e) => {
                e.preventDefault();
                let scoreStr = prompt("Enter score");
                if (!scoreStr) return;
                let score = parseInt(scoreStr);
                if (!score || score <= 0) return;
                onAddReaction?.(message, rwc.emoji, score, false);
              }}>Add reaction with score</a></li>
              <li><a href="#" onClick={(e) => {
                e.preventDefault();
                let scoreStr = prompt("Enter score");
                if (!scoreStr) return;
                let score = parseInt(scoreStr);
                if (!score || score <= 0) return;
                onAddReaction?.(message, rwc.emoji, score, true);
              }}>Add unique reaction with score</a></li>
              <li><a href="#" onClick={(e) => {
                e.preventDefault();
                onRemoveReaction?.(message, rwc.emoji);
              }}>Remove reaction</a></li>
            </ul>
            <div>
              <p>
                <strong>Score:</strong> {rwc.data?.score && rwc.data?.score > 0 ? "(" + rwc.data.score + ")" : "-"}.
                <strong>Total:</strong> {rwc.data?.total && rwc.data?.total > 0 ? "(" + rwc.data.total + ")" : "-"}.
              </p>
              {rwc.clientIdArr.length > 0 ? (
              <ul>
                {rwc.clientIdArr.map((clientIdData) => (
                  <li key={clientIdData.clientId}>
                    <strong>{clientIdData.clientId}</strong> - Score: {clientIdData.score} - Total: {clientIdData.total}
                  </li>
                ))}
              </ul>
              ) : ""}
            </div>
          </div>
        </div>
      ))}
    </div>
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

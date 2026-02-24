import { ChatMessageAction, Message, MessageReactionType, Messages } from '@ably/chat';
import { useChatClient } from '@ably/chat/react';
import React, { useCallback } from 'react';
import clsx from 'clsx';
import { FaPencil, FaTrash } from 'react-icons/fa6';
import { MessageReactionsUnique, MessageReactionsDistinct, MessageReactionsMultiple } from '../MessageReactions';
import { displayNameFromClaim } from '../../display-name.js';

interface MessageProps {
  self?: boolean;
  message: Message;

  reactionType?: MessageReactionType;

  onMessageUpdate?(message: Message): void;

  onMessageDelete?(msg: Message): void;

  onReactionSend?: Messages['reactions']['send'];

  onReactionDelete?: Messages['reactions']['delete'];
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
  reactionType = MessageReactionType.Distinct,
  onMessageUpdate,
  onMessageDelete,
  onReactionSend,
  onReactionDelete,
}) => {
  const { clientId } = useChatClient();

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

  let reactionsUI = <></>;

  if (onReactionSend && onReactionDelete) {
    switch (reactionType) {
      case MessageReactionType.Unique: {
        reactionsUI = (
          <MessageReactionsUnique
            message={message}
            clientId={clientId}
            onReactionSend={onReactionSend}
            onReactionDelete={onReactionDelete}
          />
        );
        break;
      }
      case MessageReactionType.Distinct: {
        reactionsUI = (
          <MessageReactionsDistinct
            message={message}
            clientId={clientId}
            onReactionSend={onReactionSend}
            onReactionDelete={onReactionDelete}
          />
        );
        break;
      }
      case MessageReactionType.Multiple: {
        reactionsUI = (
          <MessageReactionsMultiple
            message={message}
            onReactionSend={onReactionSend}
            onReactionDelete={onReactionDelete}
          />
        );
        break;
      }
    }
  }

  return (
    <div className="chat-message group">
      <div className={clsx('flex items-end', { 'justify-end': self, 'justify-start': !self })}>
        <div
          className={clsx('flex flex-col max-w-xs mx-2 relative', {
            'items-end order-1': self,
            'items-start order-2': !self,
          })}
        >
          <div className="text-xs text-gray-500">
            <span>{displayNameFromClaim(message.userClaim, message.clientId)}</span> &middot;{' '}
            <span className="group/time relative">
              <span className="group-hover/time:hidden">{shortDate(message.timestamp)}</span>
              <span className="hidden group-hover/time:inline">{message.timestamp.toLocaleString()}</span>
            </span>
            {message.action === ChatMessageAction.MessageUpdate && message.version.timestamp ? (
              <>
                {' '}
                &middot; Edited{' '}
                <span className="group/time relative">
                  <span className="group-hover/time:hidden">{shortDate(message.version.timestamp)}</span>
                  <span className="hidden group-hover/time:inline">{message.version.timestamp.toLocaleString()}</span>
                </span>
                {message.version.clientId ? <span> by {message.version.clientId}</span> : ''}
              </>
            ) : (
              ''
            )}
          </div>
          <div
            className={clsx('px-4 py-2 rounded-lg inline-block', {
              'rounded-br bg-blue-600 text-white': self,
              'rounded-bl justify-start bg-gray-300 text-gray-600': !self,
            })}
          >
            {message.action === ChatMessageAction.MessageDelete ? (
              <>
                This message was deleted.
                <a
                  href="#"
                  className="ml-1 text-blue-500 hover:text-blue-700"
                  onClick={(e) => {
                    e.preventDefault();
                    onMessageUpdate?.(message);
                  }}
                >
                  Edit
                </a>
              </>
            ) : (
              message.text
            )}
          </div>
          <div
            className="buttons hidden group-hover:flex space-x-1 mt-1"
            role="group"
            aria-label="Message actions"
          >
            <FaPencil
              className="cursor-pointer text-gray-400 hover:text-gray-600 m-1 inline-block"
              onClick={handleMessageUpdate}
              aria-label="Edit message"
            />
            <FaTrash
              className="cursor-pointer text-red-500 hover:text-red-700 m-1 inline-block"
              onClick={handleMessageDelete}
              aria-label="Delete message"
            />
            {reactionsUI}
          </div>
        </div>
      </div>
    </div>
  );
};

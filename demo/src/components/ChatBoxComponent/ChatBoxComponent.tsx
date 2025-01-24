import { MessageComponent } from '../MessageComponent';
import { useChatClient, useMessages } from '@ably/chat-react';
import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { Message, MessageEventPayload, MessageEvents, PaginatedResult } from '@ably/chat';
import { ErrorInfo } from 'ably';

interface ChatBoxComponentProps {}

export const ChatBoxComponent: FC<ChatBoxComponentProps> = () => {
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const chatClient = useChatClient();
  const clientId = chatClient.clientId;

  const { getPreviousMessages, deleteMessage, update } = useMessages({
    listener: (message: MessageEventPayload) => {
      switch (message.type) {
        case MessageEvents.Created: {
          setMessages((prevMessages) => {
            // if already exists do nothing
            const index = prevMessages.findIndex((m) => m.serial === message.message.serial);
            if (index !== -1) {
              return prevMessages;
            }

            // if the message is not in the list, add it
            const newArray = [...prevMessages, message.message];

            // and put it at the right place
            newArray.sort((a, b) => (a.before(b) ? -1 : 1));

            return newArray;
          });
          break;
        }
        case MessageEvents.Deleted: {
          setMessages((prevMessage) => {
            const updatedArray = prevMessage.filter((m) => {
              return m.serial !== message.message.serial;
            });

            // don't change state if deleted message is not in the current list
            if (prevMessage.length === updatedArray.length) {
              return prevMessage;
            }

            return updatedArray;
          });
          break;
        }
        case MessageEvents.Updated: {
          handleUpdatedMessage(message.message);
          break;
        }
        default: {
          console.error('Unknown message', message);
        }
      }
    },
    onDiscontinuity: (discontinuity) => {
      console.log('Discontinuity', discontinuity);
      // reset the messages when a discontinuity is detected,
      // this will trigger a re-fetch of the messages
      setMessages([]);

      // set our state to loading, because we'll need to fetch previous messages again
      setLoading(true);

      // Do a message backfill
      backfillPreviousMessages(getPreviousMessages);
    },
  });

  const backfillPreviousMessages = (getPreviousMessages: ReturnType<typeof useMessages>['getPreviousMessages']) => {
    if (getPreviousMessages) {
      getPreviousMessages({ limit: 50 })
        .then((result: PaginatedResult<Message>) => {
          setMessages(result.items.filter((m) => !m.isDeleted).reverse());
          setLoading(false);
        })
        .catch((error: ErrorInfo) => {
          console.error(`Failed to backfill previous messages: ${error.toString()}`, error);
        });
    }
  };

  const handleUpdatedMessage = (message: Message) => {
    setMessages((prevMessages) => {
      const index = prevMessages.findIndex((m) => m.serial === message.serial);
      if (index === -1) {
        return prevMessages;
      }

      // skip update if the received version is not newer
      if (!prevMessages[index].versionBefore(message)) {
        return prevMessages;
      }

      const updatedArray = [...prevMessages];
      updatedArray[index] = message;
      return updatedArray;
    });
  };

  const onUpdateMessage = useCallback(
    (message: Message) => {
      const newText = prompt('Enter new text');
      if (!newText) {
        return;
      }
      update(message, {
        text: newText,
        metadata: message.metadata,
        headers: message.headers,
      })
        .then((updatedMessage: Message) => {
          handleUpdatedMessage(updatedMessage);
        })
        .catch((error: unknown) => {
          console.warn('Failed to update message', error);
        });
    },
    [update],
  );

  const onDeleteMessage = useCallback(
    (message: Message) => {
      deleteMessage(message, { description: 'deleted by user' }).then((deletedMessage: Message) => {
        setMessages((prevMessages) => {
          return prevMessages.filter((m) => m.serial !== deletedMessage.serial);
        });
      });
    },
    [deleteMessage],
  );

  // Used to anchor the scroll to the bottom of the chat
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    console.debug('updating getPreviousMessages useEffect', { getPreviousMessages });
    backfillPreviousMessages(getPreviousMessages);
  }, [getPreviousMessages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!loading) {
      scrollToBottom();
    }
  }, [messages, loading]);

  return (
    <div className="chat-box">
      {loading && <div className="text-center m-auto">loading...</div>}
      {!loading && (
        <div
          id="messages"
          className="chat-window"
        >
          {messages.map((msg) => (
            <MessageComponent
              key={msg.serial}
              self={msg.clientId === clientId}
              message={msg}
              onMessageDelete={onDeleteMessage}
              onMessageUpdate={onUpdateMessage}
            ></MessageComponent>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}
    </div>
  );
};

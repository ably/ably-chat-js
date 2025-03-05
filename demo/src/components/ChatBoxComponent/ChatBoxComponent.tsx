import { MessageComponent } from '../MessageComponent';
import { useChatClient, useMessages } from '@ably/chat';
import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { Message, MessageEvent, MessageEvents, PaginatedResult } from '@ably/chat';
import { ErrorInfo } from 'ably';

interface ChatBoxComponentProps {}

export const ChatBoxComponent: FC<ChatBoxComponentProps> = () => {
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const chatClient = useChatClient();
  const clientId = chatClient.clientId;

  const { getPreviousMessages, deleteMessage, update } = useMessages({
    listener: (event: MessageEvent) => {
      const message = event.message;
      switch (event.type) {
        case MessageEvents.Created: {
          setMessages((prevMessages) => {
            // if already exists do nothing
            const index = prevMessages.findIndex((other) => message.isSameAs(other));
            if (index !== -1) {
              return prevMessages;
            }

            // if the message is not in the list, make a new list that contains it
            const newArray = [...prevMessages, message];

            // and put it at the right place
            newArray.sort((a, b) => (a.before(b) ? -1 : 1));

            return newArray;
          });
          break;
        }
        case MessageEvents.Updated:
        case MessageEvents.Deleted: {
          setMessages((prevMessages) => {
            const index = prevMessages.findIndex((other) => message.isSameAs(other));
            if (index === -1) {
              return prevMessages;
            }

            const newMessage = prevMessages[index].with(event);

            // if no change, do nothing
            if (newMessage === prevMessages[index]) {
              return prevMessages;
            }

            // copy array and replace the message
            const updatedArray = prevMessages.slice();
            updatedArray[index] = newMessage;
            return updatedArray;
          });
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
          setMessages(result.items.reverse());
          setLoading(false);
        })
        .catch((error: ErrorInfo) => {
          console.error(`Failed to backfill previous messages: ${error.toString()}`, error);
        });
    }
  };

  const handleRESTMessageUpdate = (updatedMessage: Message) => {
    setMessages((prevMessages) => {
      const index = prevMessages.findIndex((m) => m.serial === updatedMessage.serial);
      if (index === -1) {
        return prevMessages;
      }
      if (updatedMessage.version <= prevMessages[index].version) {
        return prevMessages;
      }
      const updatedArray = prevMessages.slice();
      updatedArray[index] = updatedMessage;
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
          handleRESTMessageUpdate(updatedMessage);
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
        handleRESTMessageUpdate(deletedMessage);
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
          {messages.map((msg) => {
            if (msg.isDeleted) {
              return (
                <div
                  key={msg.serial}
                  className="deleted-message"
                >
                  This message was deleted.
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      onUpdateMessage(msg);
                    }}
                  >
                    Edit
                  </a>
                  .
                </div>
              );
            }
            return (
              <MessageComponent
                key={msg.serial}
                self={msg.clientId === clientId}
                message={msg}
                onMessageDelete={onDeleteMessage}
                onMessageUpdate={onUpdateMessage}
              ></MessageComponent>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      )}
    </div>
  );
};

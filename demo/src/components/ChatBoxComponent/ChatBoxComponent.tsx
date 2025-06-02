import { MessageComponent } from '../MessageComponent';
import { useChatClient, useMessages } from '@ably/chat/react';
import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { Message, PaginatedResult, ChatMessageEventType } from '@ably/chat';
import type { ChatMessageEvent } from '@ably/chat';
import { ErrorInfo } from 'ably';
import { useReactionType } from '../MessageReactions';
import { MessageInput } from '../MessageInput';

interface ChatBoxComponentProps {}

export const ChatBoxComponent: FC<ChatBoxComponentProps> = () => {
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const chatClient = useChatClient();
  const clientId = chatClient.clientId;

  const { historyBeforeSubscribe, deleteMessage, update, sendReaction, deleteReaction } = useMessages({
    listener: (event: ChatMessageEvent) => {
      const message = event.message;
      switch (event.type) {
        case ChatMessageEventType.Created: {
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
        case ChatMessageEventType.Updated:
        case ChatMessageEventType.Deleted: {
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
    reactionsListener: (reaction) => {
      const messageSerial = reaction.summary.messageSerial;
      setMessages((prevMessages) => {
        const index = prevMessages.findIndex((m) => m.serial === messageSerial);
        if (index === -1) {
          return prevMessages;
        }

        const newMessage = prevMessages[index].with(reaction);

        // if no change, do nothing
        if (newMessage === prevMessages[index]) {
          return prevMessages;
        }

        // copy array and replace the message
        const updatedArray = prevMessages.slice();
        updatedArray[index] = newMessage;
        return updatedArray;
      });
    },
    onDiscontinuity: (discontinuity) => {
      console.log('Discontinuity', discontinuity);
      // reset the messages when a discontinuity is detected,
      // this will trigger a re-fetch of the messages
      setMessages([]);

      // set our state to loading, because we'll need to fetch previous messages again
      setLoading(true);

      // Do a message backfill
      backfillPreviousMessages(historyBeforeSubscribe);
    },
  });

  const backfillPreviousMessages = (
    historyBeforeSubscribe: ReturnType<typeof useMessages>['historyBeforeSubscribe'],
  ) => {
    if (historyBeforeSubscribe) {
      historyBeforeSubscribe({ limit: 50 })
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
      update(
        message,
        message.copy({
          text: newText,
          metadata: message.metadata,
          headers: message.headers,
        }),
      )
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
    console.debug('updating historyBeforeSubscribe useEffect', { historyBeforeSubscribe });
    backfillPreviousMessages(historyBeforeSubscribe);
  }, [historyBeforeSubscribe]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!loading) {
      scrollToBottom();
    }
  }, [messages, loading]);

  const reactionType = useReactionType();

  return (
    <div>
      {loading && <div className="text-center m-auto">loading...</div>}
      {!loading && (
        <div className="flex flex-col w-full h-[600px] item-left border-1 border-blue-500 rounded-lg overflow-hidden mx-auto font-sans">
          <div className="flex-1 p-4 overflow-y-auto space-y-2">
            {messages.map((msg) => (
              <MessageComponent
                key={msg.serial}
                self={msg.clientId === clientId}
                message={msg}
                reactionType={reactionType.type}
                onReactionSend={sendReaction}
                onReactionDelete={deleteReaction}
                onMessageDelete={onDeleteMessage}
                onMessageUpdate={onUpdateMessage}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
          <MessageInput />
        </div>
      )}
    </div>
  );
};

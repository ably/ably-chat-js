import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageComponent } from '../../components/MessageComponent';
import { MessageInput } from '../../components/MessageInput';
import { useChatClient, useChatConnection, useMessages, useRoomReactions, useTyping } from '@ably/chat/react';
import { ReactionInput } from '../../components/ReactionInput';
import { ConnectionStatusComponent } from '../../components/ConnectionStatusComponent/ConnectionStatusComponent.tsx';
import { ConnectionStatus, Message, MessageEventPayload, MessageEvents, PaginatedResult, Reaction } from '@ably/chat';

export const Chat = (props: { roomId: string; setRoomId: (roomId: string) => void }) => {
  const chatClient = useChatClient();
  const clientId = chatClient.clientId;
  const [messages, setMessages] = useState<Message[]>([]);
  const { currentStatus } = useChatConnection();
  const [loading, setLoading] = useState(true);

  const isConnected: boolean = currentStatus === ConnectionStatus.Connected;

  const backfillPreviousMessages = (getPreviousMessages: ReturnType<typeof useMessages>['getPreviousMessages']) => {
    chatClient.logger.debug('backfilling previous messages');
    if (getPreviousMessages) {
      getPreviousMessages({ limit: 50 })
        .then((result: PaginatedResult<Message>) => {
          chatClient.logger.debug('backfilled messages', result);
          setMessages(result.items.filter((m) => !m.isDeleted).reverse());
          setLoading(false);
        })
        .catch((error: unknown) => {
          chatClient.logger.error('Error fetching initial messages', error);
        });
    }
  };

  const handleUpdatedMessage = (message: Message) => {
    setMessages((prevMessages) => {
      const index = prevMessages.findIndex((m) => m.serial === message.serial);
      if (index === -1) {
        return prevMessages;
      }

      // skip update if the received action is not newer
      if (!prevMessages[index].actionBefore(message)) {
        return prevMessages;
      }

      const updatedArray = [...prevMessages];
      updatedArray[index] = message;
      return updatedArray;
    });
  };

  const {
    send: sendMessage,
    getPreviousMessages,
    deleteMessage,
    update,
  } = useMessages({
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
            for (let i = newArray.length - 1; i > 1; i--) {
              if (newArray[i].before(newArray[i - 1])) {
                const temp = newArray[i];
                newArray[i] = newArray[i - 1];
                newArray[i - 1] = temp;
              }
            }

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

  const { start, stop, currentlyTyping, error: typingError } = useTyping();
  const [roomReactions, setRoomReactions] = useState<Reaction[]>([]);

  const { send: sendReaction } = useRoomReactions({
    listener: (reaction: Reaction) => {
      setRoomReactions([...roomReactions, reaction]);
    },
  });

  // Used to anchor the scroll to the bottom of the chat
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatClient.logger.debug('updating getPreviousMessages useEffect', { getPreviousMessages });
    backfillPreviousMessages(getPreviousMessages);
  }, [getPreviousMessages]);

  const handleStartTyping = () => {
    start().catch((error: unknown) => {
      console.error('Failed to start typing indicator', error);
    });
  };

  const handleStopTyping = () => {
    stop().catch((error: unknown) => {
      console.error('Failed to stop typing indicator', error);
    });
  };

  /**
   * In a real app, changing the logged in user typically means navigating to
   * some sort of login page and then navigating back to the main app.
   *
   * There is no real login here. We just have to specify a clientId in the
   * request that we sent to get a valid token from our function at
   * demo/api/ably-token-request. This happens when the demo app loads the
   * first time and periodically to refresh the token (handled by ably-js).
   *
   * See demo/src/main.tsx to see how the clientId is initially set (random
   * and saved in sessionStorage for consistency between page refreshes). This
   * function sets the given clientId in sessionStorage and refreshes the page,
   * meaning the new clientId will be read and set on page load.
   *
   * In a live app if you need to re-authenticate with another clientId you
   * will need to stop everything including the Ably Pubsub Client and restart
   * with the new clientId. Neither libraries support changing the clientId
   * witohut reconnecting. Typically changing user is achieved by navigating to
   * a login page and back, unless the login page is part of the same single-
   * page app as the chat.
   *
   * Ably and Ably Chat also offer a feature called Presence where user profile
   * data can be attached (things like avatar URLs or display names). Editing a
   * profile through Presence is possible without dropping the connection and
   * it does not change the clientId. Read more about Presence in chat:
   * {@link https://ably.com/docs/chat/rooms/presence}.
   */
  function changeClientId() {
    const newClientId = prompt('Enter your new clientId');
    if (!newClientId) {
      return;
    }
    sessionStorage.setItem('ably-chat-demo-clientId', newClientId);
    window.location.reload();
  }

  function changeRoomId() {
    const newRoomId = prompt('Enter your new roomId');
    if (!newRoomId) {
      return;
    }

    // Clear the room messages
    setMessages([]);
    setLoading(true);
    setRoomReactions([]);
    props.setRoomId(newRoomId);
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!loading) {
      scrollToBottom();
    }
  }, [messages, loading]);

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
          console.warn('failed to update message', error);
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

  return (
    <div className="flex-1 p:2 sm:p-12 justify-between flex flex-col h-screen">
      <ConnectionStatusComponent />
      <div
        className="text-xs p-3"
        style={{ backgroundColor: '#333' }}
      >
        You are <strong>{clientId}</strong>.{' '}
        <a
          href="#"
          className="text-blue-600 dark:text-blue-500 hover:underline"
          onClick={changeClientId}
        >
          Change clientId
        </a>
        .
      </div>
      <div
        className="text-xs p-3"
        style={{ backgroundColor: '#333' }}
      >
        You are in room <strong>{props.roomId}</strong>.{' '}
        <a
          href="#"
          className="text-blue-600 dark:text-blue-500 hover:underline"
          onClick={changeRoomId}
        >
          Change roomId
        </a>
        .
      </div>
      {loading && <div className="text-center m-auto">loading...</div>}
      {!loading && (
        <div
          id="messages"
          className="w-96 flex flex-auto flex-col space-y-4 p-3 overflow-y-auto scrollbar-thumb-blue scrollbar-thumb-rounded scrollbar-track-blue-lighter scrollbar-w-2 scrolling-touch"
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
      {typingError && (
        <div className="text-red-600 dark:text-red-500 p-3">Typing indicator error: {typingError.message}</div>
      )}
      {!typingError && (
        <div className="typing-indicator-container">
          {new Array(...currentlyTyping)
            .filter((client) => client !== clientId)
            .map((client) => (
              <p key={client}>{client} is typing...</p>
            ))}
        </div>
      )}
      <div className="border-t-2 border-gray-200 px-4 pt-4 mb-2 sm:mb-0">
        <MessageInput
          disabled={!isConnected}
          onSend={sendMessage}
          onStartTyping={handleStartTyping}
          onStopTyping={handleStopTyping}
        />
      </div>
      <div>
        <ReactionInput
          reactions={[]}
          onSend={sendReaction}
          disabled={!isConnected}
        ></ReactionInput>
      </div>
      <div>
        Received reactions:{' '}
        {roomReactions.map((r, idx) => (
          <span key={idx}>{r.type}</span>
        ))}{' '}
      </div>
    </div>
  );
};

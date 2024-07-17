import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageComponent } from '../../components/MessageComponent';
import { MessageInput } from '../../components/MessageInput';
import { useMessages } from '../../hooks/useMessages';
import { useTypingIndicators } from '../../hooks/useTypingIndicators.ts';
import { useReactions } from '../../hooks/useReactions';
import { ReactionInput } from '../../components/ReactionInput';

export const Chat = () => {
  const { loading, clientId, messages, sendMessage } = useMessages();

  // Used to anchor the scroll to the bottom of the chat
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // define for typing indicator
  const { startTyping, stopTyping, subscribeToTypingIndicators } = useTypingIndicators();
  const [typingClients, setTypingClients] = useState<string[]>([]);
  const [value, setValue] = useState('');
  const { reactions, sendReaction } = useReactions();

  useEffect(() => {
    subscribeToTypingIndicators((typingClients) => {
      setTypingClients([...typingClients.currentlyTyping.values()]);
    });
  }, [subscribeToTypingIndicators]);

  const handleMessageSend = useCallback(
    (text: string) => {
      sendMessage(text);
    },
    [sendMessage],
  );

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!loading) {
      scrollToBottom();
    }
  }, [messages, loading]);

  return (
    <div className="flex-1 p:2 sm:p-12 justify-between flex flex-col h-screen">
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
      {loading && <div>loading...</div>}
      {!loading && (
        <div
          id="messages"
          className="w-96 flex flex-auto flex-col space-y-4 p-3 overflow-y-auto scrollbar-thumb-blue scrollbar-thumb-rounded scrollbar-track-blue-lighter scrollbar-w-2 scrolling-touch"
        >
          {messages.map((msg) => (
            <MessageComponent
              id={msg.timeserial}
              key={msg.timeserial}
              self={msg.clientId === clientId}
              message={msg}
            ></MessageComponent>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}
      <div className="typing-indicator-container">
        {typingClients
          .filter((client) => client !== clientId)
          .map((client) => (
            <p key={client}>{client} is typing...</p>
          ))}
        <div className="border-t-2 border-gray-200 px-4 pt-4 mb-2 sm:mb-0">
          <MessageInput
            value={value}
            disabled={loading}
            onValueChange={setValue}
            onSend={handleMessageSend}
            onStartTyping={startTyping}
            onStopTyping={stopTyping}
          />
        </div>
        <div>
          <ReactionInput
            reactions={[]}
            onSend={sendReaction}
          ></ReactionInput>
        </div>
        <div>
          Received reactions:{' '}
          {reactions.map((r, idx) => (
            <span key={idx}>{r.type}</span>
          ))}{' '}
        </div>
      </div>
    </div>
  );
};

import { useCallback, useEffect, useState } from 'react';
import { Message as MessageComponent } from '../../components/Message';
import { MessageInput } from '../../components/MessageInput';
import { useMessages } from '../../hooks/useMessages';
import { useTypingIndicators } from '../../hooks/useTypingIndicators.ts';

export const Chat = () => {
  const { loading, clientId, messages, sendMessage } = useMessages();

  // define for typing indicator
  const { startTyping, stopTyping, subscribeToTypingIndicators } = useTypingIndicators();
  const [typingClients, setTypingClients] = useState<string[]>([]);
  const [value, setValue] = useState('');

  useEffect(() => {
    subscribeToTypingIndicators((typingClients) => {
      setTypingClients([...typingClients.currentlyTypingClientIds.values()]);
    });
  }, [subscribeToTypingIndicators]);

  const handleMessageSend = useCallback(
    (text: string) => {
      sendMessage(text);
    },
    [sendMessage],
  );

  return (
      <div className="flex-1 p:2 sm:p-12 justify-between flex flex-col h-screen">
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
              >
                <div className="flex flex-col">
                  <div>{msg.content}</div>
                </div>
              </MessageComponent>
            ))}
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
      </div>
    </div>
  );
};

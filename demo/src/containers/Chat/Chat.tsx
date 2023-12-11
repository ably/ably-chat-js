import { Message } from '../../components/Message';
import { MessageInput } from '../../components/MessageInput';
import { useMessages } from '../../hooks/useMessages.ts';

export const Chat = () => {
  const { clientId, messages, sendMessage } = useMessages();

  return (
    <>
      <div className="flex-1 p:2 sm:p-12 justify-between flex flex-col h-screen">
        <div
          id="messages"
          className="w-96 flex flex-col space-y-4 p-3 overflow-y-auto scrollbar-thumb-blue scrollbar-thumb-rounded scrollbar-track-blue-lighter scrollbar-w-2 scrolling-touch"
        >
          {messages.map((msg) => (
            <Message
              key={msg.id}
              self={msg.client_id === clientId}
            >
              {msg.content}
            </Message>
          ))}
        </div>
        <div className="border-t-2 border-gray-200 px-4 pt-4 mb-2 sm:mb-0">
          <MessageInput onSend={sendMessage} />
        </div>
      </div>
    </>
  );
};

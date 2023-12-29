import { useCallback, useState } from 'react';
import { Message } from '@ably-labs/chat';
import { Message as MessageComponent } from '../../components/Message';
import { MessageInput } from '../../components/MessageInput';
import { useMessages } from '../../hooks/useMessages';

export const Chat = () => {
  const { loading, clientId, messages, sendMessage, editMessage, deleteMessage, addReaction, removeReaction } =
    useMessages();
  const [value, setValue] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);

  const handleMessageClick = useCallback(
    (id: string) => {
      const message = messages.find((message) => message.id === id) ?? null;
      const alreadySelected = selectedMessage?.id === id;
      setSelectedMessage(alreadySelected ? null : message);
      setValue(!alreadySelected && message?.client_id === clientId ? message?.content ?? '' : '');
    },
    [clientId, selectedMessage, messages],
  );

  const handleMessageSend = useCallback(
    (text: string) => {
      if (selectedMessage && selectedMessage?.client_id === clientId) {
        setSelectedMessage(null);
        editMessage(selectedMessage.id, text);
      } else {
        sendMessage(text);
      }
    },
    [clientId, selectedMessage, sendMessage, editMessage],
  );

  const handleDeleteMessage = useCallback(() => {
    if (!selectedMessage) return;
    deleteMessage(selectedMessage.id);
    setSelectedMessage(null);
    setValue('');
  }, [selectedMessage, deleteMessage]);

  const handleLikeReaction = useCallback(() => {
    if (!selectedMessage) return;
    addReaction(selectedMessage.id, 'like');
    setSelectedMessage(null);
    setValue('');
  }, [selectedMessage, addReaction]);

  const handleRemoveReaction = useCallback(() => {
    if (!selectedMessage) return;
    removeReaction(selectedMessage.reactions.mine[0].id);
    setSelectedMessage(null);
    setValue('');
  }, [selectedMessage, removeReaction]);

  return (
    <>
      <div className="flex-1 p:2 sm:p-12 justify-between flex flex-col h-screen">
        {selectedMessage && (
          <div className="flex flex-none space-x-4 p-2">
            {selectedMessage.client_id === clientId && (
              <button
                onClick={handleDeleteMessage}
                className="rounded-md px-3 py-1 transition duration-500 ease-in-out text-white bg-blue-500 hover:bg-blue-400 focus:outline-none"
              >
                Delete
              </button>
            )}
            {!selectedMessage.reactions.mine.length && (
              <button
                onClick={handleLikeReaction}
                className="rounded-md px-3 py-1 transition duration-500 ease-in-out text-white bg-blue-500 hover:bg-blue-400 focus:outline-none"
              >
                Like
              </button>
            )}
            {!!selectedMessage.reactions.mine.length && (
              <button
                onClick={handleRemoveReaction}
                className="rounded-md px-3 py-1 transition duration-500 ease-in-out text-white bg-blue-500 hover:bg-blue-400 focus:outline-none"
              >
                Unlike
              </button>
            )}
          </div>
        )}
        {loading && <div>loading...</div>}
        {!loading && (
          <div
            id="messages"
            className="w-96 flex flex-auto flex-col space-y-4 p-3 overflow-y-auto scrollbar-thumb-blue scrollbar-thumb-rounded scrollbar-track-blue-lighter scrollbar-w-2 scrolling-touch"
          >
            {messages.map((msg) => (
              <MessageComponent
                id={msg.id}
                key={msg.id}
                self={msg.client_id === clientId}
                onMessageClick={handleMessageClick}
              >
                <div className="flex flex-col">
                  <div>{msg.content}</div>
                  {!!msg.reactions.counts.like && (
                    <div className="flex flex-row-reverse mt-4 text-xs">{msg.reactions.counts.like} ❤️</div>
                  )}
                </div>
              </MessageComponent>
            ))}
          </div>
        )}
        <div className="border-t-2 border-gray-200 px-4 pt-4 mb-2 sm:mb-0">
          <MessageInput
            value={value}
            disabled={loading}
            onValueChange={setValue}
            onSend={handleMessageSend}
          />
        </div>
      </div>
    </>
  );
};

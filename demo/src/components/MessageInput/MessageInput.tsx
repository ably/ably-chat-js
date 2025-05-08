import { ChangeEventHandler, FC, FormEventHandler, useEffect, useRef, useState } from 'react';
import { useChatConnection, useMessages, useTyping } from '@ably/chat/react';
import { ConnectionStatus } from '@ably/chat';
import { TypingIndicatorPanel } from '../TypingIndicatorPanel';
import { SettingsModal } from '../SettingsModal';

interface MessageInputProps {}

export const MessageInput: FC<MessageInputProps> = ({}) => {
  const { send } = useMessages();
  const { keystroke, stop } = useTyping();
  const { currentStatus } = useChatConnection();
  const [shouldDisable, setShouldDisable] = useState(true);

  useEffect(() => {
    // disable the input if the connection is not established
    setShouldDisable(currentStatus !== ConnectionStatus.Connected);
  }, [currentStatus]);

  const handleStartTyping = () => {
    keystroke().catch((error: unknown) => {
      console.error('Failed to start typing indicator', error);
    });
  };
  const handleStopTyping = () => {
    stop().catch((error: unknown) => {
      console.error('Failed to stop typing indicator', error);
    });
  };

  const handleValueChange: ChangeEventHandler<HTMLInputElement> = ({ target }) => {
    // Typing indicators start method should be called with every keystroke since
    // they automatically stop if the user stops typing for a certain amount of time.
    //
    // The timeout duration can be configured when initializing the room.
    if (target.value && target.value.length > 0) {
      handleStartTyping();
    } else {
      // For good UX we should stop typing indicators as soon as the input field is empty.
      handleStopTyping();
    }
  };

  // Keep a reference to the input element to read it and reset it after sending the message
  const messageInputRef = useRef<HTMLInputElement | null>(null);

  const handleFormSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();

    // do nothing in case we don't have a ref to the input element
    if (!messageInputRef.current) {
      return;
    }

    // send the message and reset the input field
    send({ text: messageInputRef.current.value })
      .then(() => {
        if (messageInputRef.current) {
          messageInputRef.current.value = '';
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to send message', error);
      });

    // stop typing indicators
    handleStopTyping();
  };

  return (
    <div
      className="flex flex-col border-t border-gray-300 bg-gray-100"
      style={{ minHeight: '100px', maxHeight: '100px' }}
    >
      <TypingIndicatorPanel />
      <form
        onSubmit={handleFormSubmit}
        className="flex items-center px-2 mt-auto mb-2"
      >
        <input
          type="text"
          onChange={handleValueChange}
          disabled={shouldDisable}
          placeholder="Say something"
          className="flex-1 p-2 border border-gray-400 rounded outline-none bg-white text-black"
          ref={messageInputRef}
          autoFocus
        />
        <button
          type="submit"
          className="!bg-blue-500 text-white px-4 ml-2 h-10 flex items-center justify-center rounded hover:bg-blue-600 transition-colors"
        >
          Send
        </button>
        <SettingsModal className="ml-2 !bg-grey-900" />
      </form>
    </div>
  );
};

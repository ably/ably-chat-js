import { ChangeEventHandler, FC, FormEventHandler, useRef } from 'react';
import { Message, SendMessageParams } from '@ably/chat';

interface MessageInputProps {
  disabled: boolean;

  onSend(params: SendMessageParams): Promise<Message>;

  onStartTyping(): void;

  onStopTyping(): void;
}

export const MessageInput: FC<MessageInputProps> = ({ disabled, onSend, onStartTyping, onStopTyping }) => {
  const handleValueChange: ChangeEventHandler<HTMLInputElement> = ({ target }) => {
    // Typing indicators start method should be called with every keystroke since
    // they automatically stop if the user stops typing for a certain amount of time.
    //
    // The timeout duration can be configured when initializing the room.
    if (target.value && target.value.length > 0) {
      onStartTyping();
    } else {
      // For good UX we should stop typing indicators as soon as the input field is empty.
      onStopTyping();
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
    onSend({ text: messageInputRef.current.value })
      .then(() => {
        if (messageInputRef.current) {
          messageInputRef.current.value = '';
        }
      })
      .catch((error) => {
        console.error('Failed to send message', error);
      });

    // stop typing indicators
    onStopTyping();
  };

  return (
    <form
      onSubmit={handleFormSubmit}
      className="flex"
    >
      <input
        type="text"
        onChange={handleValueChange}
        disabled={disabled}
        placeholder="Say something"
        className="w-full focus:outline-none focus:placeholder-gray-400 text-gray-600 placeholder-gray-600 pl-2 pr-2 bg-gray-200 rounded-l-md py-1"
        ref={messageInputRef}
        autoFocus
      />
      <div className="items-center inset-y-0 flex">
        <button
          disabled={disabled}
          type="submit"
          className="inline-flex items-center justify-center rounded-r-md px-3 py-1 transition duration-500 ease-in-out text-white bg-blue-500 hover:bg-blue-400 focus:outline-none disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          Send
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-6 w-6 ml-2 transform rotate-90"
          >
            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path>
          </svg>
        </button>
      </div>
    </form>
  );
};

import { FC, ChangeEventHandler, FormEventHandler } from 'react';
import { useCounter } from '@ably/chat/react';

interface MessageInputProps {
  disabled: boolean;
  value: string;

  onValueChange(text: string): void;

  onSend(text: string): void;

  onStartTyping(): void;

  onStopTyping(): void;
}

export const MessageInput: FC<MessageInputProps> = ({
  value,
  disabled,
  onValueChange,
  onSend,
  onStartTyping,
  onStopTyping,
}) => {
  const { increment } = useCounter();
  const handleValueChange: ChangeEventHandler<HTMLInputElement> = ({ target }) => {
    onValueChange(target.value);
    if (target.value && target.value.length > 0) {
      onStartTyping();
    } else {
      onStopTyping();
    }
  };

  const handleFormSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onSend(value);
    onValueChange('');
    onStopTyping();
    increment();
  };

  return (
    <form
      onSubmit={handleFormSubmit}
      className="flex"
    >
      <input
        type="text"
        value={value}
        onChange={handleValueChange}
        disabled={disabled}
        placeholder="Type.."
        className="w-full focus:outline-none focus:placeholder-gray-400 text-gray-600 placeholder-gray-600 pl-2 pr-2 bg-gray-200 rounded-l-md py-1"
        autoFocus
      />
      <div className="items-center inset-y-0 flex">
        <button
          disabled={disabled}
          type="submit"
          className="inline-flex items-center justify-center rounded-r-md px-3 py-1 transition duration-500 ease-in-out text-white bg-blue-500 hover:bg-blue-400 focus:outline-none"
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

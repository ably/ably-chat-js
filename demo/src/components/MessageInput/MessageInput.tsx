import { useState, ChangeEventHandler, FormEventHandler } from 'react';

interface MessageInputProps {
  onSend(text: string): void;
}

export const MessageInput: React.FC<MessageInputProps> = ({ onSend }) => {
  const [value, setValue] = useState('');
  const handleValueChange: ChangeEventHandler<HTMLInputElement> = ({ target }) => {
    setValue(target.value);
  };

  const handleFormSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onSend(value);
    setValue('');
  };

  return (
    <form
      onSubmit={handleFormSubmit}
      className="relative flex"
    >
      <input
        type="text"
        value={value}
        onChange={handleValueChange}
        placeholder="Type.."
        className="w-full focus:outline-none focus:placeholder-gray-400 text-gray-600 placeholder-gray-600 pl-2 bg-gray-200 rounded-md py-1"
      />
      <div className="absolute right-0 items-center inset-y-0 hidden sm:flex">
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-md px-3 py-1 transition duration-500 ease-in-out text-white bg-blue-500 hover:bg-blue-400 focus:outline-none"
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

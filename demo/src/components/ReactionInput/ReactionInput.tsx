import { FC } from 'react';
import { SendReactionParams } from '@ably/chat';

interface ReactionInputProps {
  reactions: string[];

  onSendRoomReaction(params: SendReactionParams): void;

  disabled: boolean;
}

export const ReactionInput: FC<ReactionInputProps> = ({ reactions, onSendRoomReaction, disabled = false }) => {
  // set default reactions if empty or not set
  if (!reactions || reactions.length === 0) {
    reactions = ['👍', '❤️', '💥', '🚀', '👎', '💔'];
  }

  const buttons = reactions.map((reaction) => (
    <a
      key={reaction}
      onClick={(e) => {
        e.preventDefault();
        if (!disabled) {
          onSendRoomReaction({ name: reaction });
        }
      }}
      href="#"
      className={
        disabled
          ? 'cursor-not-allowed'
          : 'text-xl p-1 border border-blue-500 rounded hover:bg-blue-100 text-blue-500 transition-colors'
      }
    >
      {reaction}
    </a>
  ));

  return (
    <div className="flex justify-evenly items-center px-4 py-2 border-t border-gray-300 bg-white mx-auto">
      {buttons}
    </div>
  );
};

import { FC } from 'react';
import { SendRoomReactionsParams } from '@ably/chat';

interface ReactionInputProps {
  reactions: string[];

  onSend(params: SendRoomReactionsParams): void;

  disabled: boolean;
}

export const ReactionInput: FC<ReactionInputProps> = ({ reactions, onSend, disabled = false }) => {
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
          onSend({reactions: { [reaction]: 1}});
        }
      }}
      href="#"
      className={disabled ? 'cursor-not-allowed' : ''}
    >
      {reaction}
    </a>
  ));

  return <div className="reactions-picker">{buttons}</div>;
};

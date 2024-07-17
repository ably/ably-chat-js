import { FC } from 'react';

interface ReactionInputProps {
  reactions: string[];
  onSend(reaction: string): void;
}

export const ReactionInput: FC<ReactionInputProps> = ({ reactions, onSend }) => {
  // set default reactions if empty or not set
  if (!reactions || reactions.length === 0) {
    reactions = ['👍', '❤️', '💥', '🚀', '👎', '💔'];
  }

  const buttons = reactions.map((reaction) => (
    <a
      key={reaction}
      onClick={() => onSend(reaction)}
      href="#"
    >
      {reaction}
    </a>
  ));

  return <div className="reactions-picker">{buttons}</div>;
};

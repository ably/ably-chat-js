import { FC } from 'react';

interface ReactionInputProps {
  reactions: string[];
  onSend(reaction: string): void;
}

export const ReactionInput: FC<ReactionInputProps> = ({ reactions, onSend }) => {
  // set default reactions if empty or not set
  if (!reactions || reactions.length === 0) {
    reactions = ["👍", "❤️", "💥", "🚀", "👎", "💔"];
  }

  const buttons = reactions.map(r => <a key={r} onClick={ () => onSend(r) } href="#">{r}</a>)

  return (
    <div className="reactions-picker">
      { buttons }
    </div>
  );
};

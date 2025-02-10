import React from 'react';
import { useReactionType } from '../MessageReactions';
import { MessageReactionType } from '@ably/chat';

export const MessageReactionTypeSelector: React.FC = () => {
  const { type, setType } = useReactionType();

  return (
    <div>
      <p>Message reactions type</p>
      <select
        onChange={(e) => {
          setType(e.target.value as MessageReactionType);
        }}
        value={type}
      >
        <option value={MessageReactionType.Unique}>MessageReactionType.Unique</option>
        <option value={MessageReactionType.Distinct}>MessageReactionType.Distinct</option>
        <option value={MessageReactionType.Multiple}>MessageReactionType.Multiple</option>
      </select>
    </div>
  );
};

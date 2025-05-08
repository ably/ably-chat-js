import React from 'react';
import { useReactionType } from '../MessageReactions';
import { MessageReactionType } from '@ably/chat';

export const MessageReactionTypeSelector: React.FC = () => {
  const { type, setType } = useReactionType();

  return (
    <div className="flex flex-col">
      <p className="text-sm font-medium text-gray-700 mb-1">Message reactions type</p>
      <select
        onChange={(e) => {
          setType(e.target.value as MessageReactionType);
        }}
        value={type}
        className="text-black text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full"
      >
        <option value={MessageReactionType.Unique}>Unique</option>
        <option value={MessageReactionType.Distinct}>Distinct</option>
        <option value={MessageReactionType.Multiple}>Multiple</option>
      </select>
    </div>
  );
};

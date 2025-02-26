export { MessageReactionsSingle } from './MessageReactionsSingle';
export { MessageReactionsDistinct } from './MessageReactionsDistinct';
export { MessageReactionsCounter } from './MessageReactionsCounter';

import { ReactionRefType } from '@ably/chat';
import { useContext } from 'react';
import { ReactionTypeContext } from '../../containers/ReactionTypeProvider/reactionTypeProvider';

export function useReactionType() {
  const context = useContext(ReactionTypeContext);
  return context;
}

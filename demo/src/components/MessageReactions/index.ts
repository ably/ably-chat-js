export { MessageReactionsSingle } from './MessageReactionsSingle';
export { MessageReactionsDistinct } from './MessageReactionsDistinct';
export { MessageReactionsCounter } from './MessageReactionsCounter';

import { useContext } from 'react';
import { ReactionTypeContext } from '../../containers/ReactionTypeProvider/reactionTypeProvider';

export function useReactionType() {
  const context = useContext(ReactionTypeContext);
  return context;
}

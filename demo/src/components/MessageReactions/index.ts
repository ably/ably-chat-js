export { MessageReactionsUnique } from './MessageReactionsUnique';
export { MessageReactionsDistinct } from './MessageReactionsDistinct';
export { MessageReactionsMultiple } from './MessageReactionsMultiple';

import { useContext } from 'react';
import { ReactionTypeContext } from '../../containers/ReactionTypeProvider/reactionTypeProvider';

export function useReactionType() {
  const context = useContext(ReactionTypeContext);
  return context;
}

import { MessageReactionType } from '@ably/chat';
import { ReactNode, useState, createContext, useCallback } from 'react';

function getReactionTypeContext() {
  const doNothing: (type: MessageReactionType) => void = (_: MessageReactionType) => void 0;
  const context = createContext({ type: MessageReactionType.Distinct, setType: doNothing });
  return context;
}

export const ReactionTypeContext = getReactionTypeContext();

/**
 * Props for the {@link ReactionTypeProvider} component.
 */
export interface ReactionTypeProviderProps {
  /**
   * The child components to be rendered within this provider.
   */
  children?: ReactNode | ReactNode[] | null;
}

export const allowedMessageReactionTypes = [
  MessageReactionType.Unique as string,
  MessageReactionType.Distinct as string,
  MessageReactionType.Multiple as string,
];

/**
 * Returns a React component that provides a {@link ChatClient} in a React context to the component subtree.
 * Updates the context value when the client prop changes.
 *
 * @param {ChatClientProviderProps} props - The props for the {@link ChatClientProvider} component.
 *
 * @returns {ChatClientProvider} component.
 */
export const ReactionTypeProvider = ({ children }: ReactionTypeProviderProps) => {
  const stored = localStorage.getItem('activeReactionType');
  let current = MessageReactionType.Unique;
  if (stored && allowedMessageReactionTypes.indexOf(stored) !== -1) {
    current = stored as MessageReactionType;
  }

  const [reactionType, setReactionType] = useState<MessageReactionType>(current);

  const setFunc = useCallback(
    (rt: MessageReactionType) => {
      const shortcuts: Record<string, MessageReactionType> = {
        unique: MessageReactionType.Unique,
        distinct: MessageReactionType.Distinct,
        multiple: MessageReactionType.Multiple,
      };
      if (shortcuts[rt]) {
        rt = shortcuts[rt];
      }
      if (allowedMessageReactionTypes.indexOf(rt) === -1) {
        throw new Error('Invalid reaction type. Must be one of ' + allowedMessageReactionTypes.join(', '));
      }
      localStorage.setItem('activeReactionType', rt);
      setReactionType(rt);
    },
    [setReactionType],
  );

  const value = {
    type: reactionType,
    setType: setFunc,
  };

  return <ReactionTypeContext.Provider value={value}>{children}</ReactionTypeContext.Provider>;
};

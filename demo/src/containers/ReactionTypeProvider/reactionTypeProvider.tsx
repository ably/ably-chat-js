import { ReactionRefType } from '@ably/chat';
import { ReactNode, useState, createContext, useCallback } from 'react';

function getReactionTypeContext() {
    const doNothing : (refType : ReactionRefType) => void = (_:ReactionRefType) => void 0;
    const context = createContext({refType: ReactionRefType.Distinct, setRefType: doNothing});
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

export const allowedReactionRefTypes = [ReactionRefType.Single as string, ReactionRefType.Distinct as string, ReactionRefType.Counter as string];

/**
 * Returns a React component that provides a {@link ChatClient} in a React context to the component subtree.
 * Updates the context value when the client prop changes.
 *
 * @param {ChatClientProviderProps} props - The props for the {@link ChatClientProvider} component.
 *
 * @returns {ChatClientProvider} component.
 */
export const ReactionTypeProvider = ({ children }: ReactionTypeProviderProps) => {
    
    const stored = localStorage.getItem('messageReactionRefType');
    let current = ReactionRefType.Single;
    if (stored && allowedReactionRefTypes.indexOf(stored) !== -1) {
        current = stored as ReactionRefType;
    };

    const [ reactionType, setReactionType ] = useState<ReactionRefType>(current);

    const setFunc = useCallback((rt : ReactionRefType) => {
        const shortcuts : Record<string, ReactionRefType> = {
            "single": ReactionRefType.Single,
            "distinct": ReactionRefType.Distinct,
            "counter": ReactionRefType.Counter,
        };
        if (shortcuts[rt]) {
            rt = shortcuts[rt];
        }
        if (allowedReactionRefTypes.indexOf(rt) === -1) {
            throw new Error("Invalid reaction type. Must be one of " + allowedReactionRefTypes.join(", "));
        }
        localStorage.setItem('activeReactionType', rt);
        setReactionType(rt);
    }, [ setReactionType ]);

    const value = {
        refType: reactionType,
        setRefType: setFunc,
    }

    return <ReactionTypeContext.Provider value={value}>{children}</ReactionTypeContext.Provider>;
};

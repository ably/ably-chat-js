export { MessageReactionsUnique } from './MessageReactionsUnique';
export { MessageReactionsSingle } from './MessageReactionsSingle';
export { MessageReactionsMany } from './MessageReactionsMany';

import { ReactionRefType } from '@ably/chat';
import { useState } from 'react';

const allowedReactionTypes = [ReactionRefType.Many as string, ReactionRefType.Single as string, ReactionRefType.Unique as string];

// A quick way to configure between reaction types via the developer console
// In components, do const rt = useReactionType(); to get the current reaction type
// Any any point after any component using this has mounted, simply call setReactionType() with the preferred reaction type
// In dev console function shortcuts accepted as arguments are s, single, u, unique, m, many.
// `currentReactionType` is also globally available in the dev console for convenience
export function useReactionType() : ReactionRefType {
    const stored = localStorage.getItem('activeReactionType');
    let current = ReactionRefType.Single;
    if (stored && allowedReactionTypes.indexOf(stored) !== -1) {
        current = stored as ReactionRefType;
    };

    const [ reactionType, setReactionType ] = useState<ReactionRefType>(current);

    (window as any).setReactionType = (rt : ReactionRefType) => {
        const shortcuts : Record<string, ReactionRefType> = {
            "single": ReactionRefType.Single,
            "s": ReactionRefType.Single,
            "unique": ReactionRefType.Unique,
            "u": ReactionRefType.Unique,
            "many": ReactionRefType.Many,
            "m": ReactionRefType.Many,
        };
        if (shortcuts[rt]) {
            rt = shortcuts[rt];
        }
        if (allowedReactionTypes.indexOf(rt) === -1) {
            throw new Error("Invalid reaction type. Must be one of " + allowedReactionTypes.join(", "));
        }
        console.log("changing reaction type to", rt);
        localStorage.setItem('activeReactionType', rt);
        setReactionType(rt);
    };

    (window as any).currentReactionType = reactionType;

    return reactionType;
}
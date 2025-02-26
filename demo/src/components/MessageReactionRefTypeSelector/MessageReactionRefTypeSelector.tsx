import React from 'react';
import { allowedReactionRefTypes } from '../../containers/ReactionTypeProvider';
import { useReactionType } from '../MessageReactions';
import { ReactionRefType } from '@ably/chat';


export const MessageReactionRefTypeSelector: React.FC = () => {

    const { refType: selectedRefType, setRefType }= useReactionType();

    return (<div>
        <p>Message reactions RefType</p>
        <select onChange={(e) => { setRefType(e.target.value as ReactionRefType) }} value={selectedRefType}>
            {
                allowedReactionRefTypes.map((refType) => (
                    <option key={refType} value={refType}>{refType}</option>
                ))
            }
        </select>
    </div>);
};

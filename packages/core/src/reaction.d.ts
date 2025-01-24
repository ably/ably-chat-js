import { Headers } from './headers.js';
import { Metadata } from './metadata.js';
/**
 * {@link Headers} type for chat messages.
 */
export type ReactionHeaders = Headers;
/**
 * {@link Metadata} type for chat messages.
 */
export type ReactionMetadata = Metadata;
/**
 * Represents a room-level reaction.
 */
export interface Reaction {
    /**
     * The type of the reaction, for example "like" or "love".
     */
    readonly type: string;
    /**
     * Metadata of the reaction. If no metadata was set this is an empty object.
     */
    readonly metadata: ReactionMetadata;
    /**
     * Headers of the reaction. If no headers were set this is an empty object.
     */
    readonly headers: ReactionHeaders;
    /**
     * The timestamp at which the reaction was sent.
     */
    readonly createdAt: Date;
    /**
     * The clientId of the user who sent the reaction.
     */
    readonly clientId: string;
    /**
     * Whether the reaction was sent by the current user.
     */
    readonly isSelf: boolean;
}
/**
 * An implementation of the Reaction interface for room-level reactions.
 */
export declare class DefaultReaction implements Reaction {
    readonly type: string;
    readonly clientId: string;
    readonly createdAt: Date;
    readonly isSelf: boolean;
    readonly metadata: ReactionMetadata;
    readonly headers: ReactionHeaders;
    constructor(type: string, clientId: string, createdAt: Date, isSelf: boolean, metadata: ReactionMetadata, headers: ReactionHeaders);
}

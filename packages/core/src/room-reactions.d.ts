import * as Ably from 'ably';
import { ChannelManager } from './channel-manager.js';
import { DiscontinuityListener, EmitsDiscontinuities, HandlesDiscontinuity, OnDiscontinuitySubscriptionResponse } from './discontinuity.js';
import { ErrorCodes } from './errors.js';
import { RoomReactionEvents } from './events.js';
import { Logger } from './logger.js';
import { Reaction, ReactionHeaders, ReactionMetadata } from './reaction.js';
import { ContributesToRoomLifecycle } from './room-lifecycle-manager.js';
import EventEmitter from './utils/event-emitter.js';
/**
 * Params for sending a room-level reactions. Only `type` is mandatory.
 */
export interface SendReactionParams {
    /**
     * The type of the reaction, for example an emoji or a short string such as
     * "like".
     *
     * It is the only mandatory parameter to send a room-level reaction.
     */
    type: string;
    /**
     * Optional metadata of the reaction.
     *
     * The metadata is a map of extra information that can be attached to the
     * room reaction. It is not used by Ably and is sent as part of the realtime
     * message payload. Example use cases are custom animations or other effects.
     *
     * Do not use metadata for authoritative information. There is no server-side
     * validation. When reading the metadata treat it like user input.
     *
     */
    metadata?: ReactionMetadata;
    /**
     * Optional headers of the room reaction.
     *
     * The headers are a flat key-value map and are sent as part of the realtime
     * message's `extras` inside the `headers` property. They can serve similar
     * purposes as the metadata but they are read by Ably and can be used for
     * features such as
     * [subscription filters](https://faqs.ably.com/subscription-filters).
     *
     * Do not use the headers for authoritative information. There is no
     * server-side validation. When reading the headers treat them like user
     * input.
     *
     */
    headers?: ReactionHeaders;
}
/**
 * The listener function type for room-level reactions.
 *
 * @param reaction The reaction that was received.
 */
export type RoomReactionListener = (reaction: Reaction) => void;
/**
 * This interface is used to interact with room-level reactions in a chat room: subscribing to reactions and sending them.
 *
 * Get an instance via {@link Room.reactions}.
 */
export interface RoomReactions extends EmitsDiscontinuities {
    /**
     * Send a reaction to the room including some metadata.
     *
     * This method accepts parameters for a room-level reaction. It accepts an object
     *
     *
     * @param params an object containing {type, headers, metadata} for the room
     * reaction to be sent. Type is required, metadata and headers are optional.
     * @returns The returned promise resolves when the reaction was sent. Note
     * that it is possible to receive your own reaction via the reactions
     * listener before this promise resolves.
     */
    send(params: SendReactionParams): Promise<void>;
    /**
     * Subscribe to receive room-level reactions.
     *
     * @param listener The listener function to be called when a reaction is received.
     * @returns A response object that allows you to control the subscription.
     */
    subscribe(listener: RoomReactionListener): RoomReactionsSubscriptionResponse;
    /**
     * Unsubscribe all listeners from receiving room-level reaction events.
     */
    unsubscribeAll(): void;
    /**
     * Returns an instance of the Ably realtime channel used for room-level reactions.
     * Avoid using this directly unless special features that cannot otherwise be implemented are needed.
     *
     * @returns The Ably realtime channel.
     */
    get channel(): Ably.RealtimeChannel;
}
interface RoomReactionEventsMap {
    [RoomReactionEvents.Reaction]: Reaction;
}
/**
 * A response object that allows you to control the subscription to room-level reactions.
 */
export interface RoomReactionsSubscriptionResponse {
    /**
     * Unsubscribe the listener registered with {@link RoomReactions.subscribe} from reaction events.
     */
    unsubscribe: () => void;
}
/**
 * @inheritDoc
 */
export declare class DefaultRoomReactions extends EventEmitter<RoomReactionEventsMap> implements RoomReactions, HandlesDiscontinuity, ContributesToRoomLifecycle {
    private readonly _channel;
    private readonly _clientId;
    private readonly _logger;
    private readonly _discontinuityEmitter;
    /**
     * Constructs a new `DefaultRoomReactions` instance.
     * @param roomId The unique identifier of the room.
     * @param channelManager The ChannelManager instance.
     * @param clientId The client ID of the user.
     * @param logger An instance of the Logger.
     */
    constructor(roomId: string, channelManager: ChannelManager, clientId: string, logger: Logger);
    /**
     * Creates the realtime channel for room reactions.
     */
    private _makeChannel;
    /**
     * @inheritDoc Reactions
     */
    send(params: SendReactionParams): Promise<void>;
    /**
     * @inheritDoc Reactions
     */
    subscribe(listener: RoomReactionListener): RoomReactionsSubscriptionResponse;
    /**
     * @inheritDoc Reactions
     */
    unsubscribeAll(): void;
    private _forwarder;
    get channel(): Ably.RealtimeChannel;
    private _parseNewReaction;
    discontinuityDetected(reason?: Ably.ErrorInfo): void;
    onDiscontinuity(listener: DiscontinuityListener): OnDiscontinuitySubscriptionResponse;
    /**
     * @inheritdoc ContributesToRoomLifecycle
     */
    get attachmentErrorCode(): ErrorCodes;
    /**
     * @inheritdoc ContributesToRoomLifecycle
     */
    get detachmentErrorCode(): ErrorCodes;
}
export {};

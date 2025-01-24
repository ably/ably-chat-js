import * as Ably from 'ably';
import { ChannelManager } from './channel-manager.js';
import { DiscontinuityListener, EmitsDiscontinuities, HandlesDiscontinuity, OnDiscontinuitySubscriptionResponse } from './discontinuity.js';
import { ErrorCodes } from './errors.js';
import { TypingEvents } from './events.js';
import { Logger } from './logger.js';
import { ContributesToRoomLifecycle } from './room-lifecycle-manager.js';
import { TypingOptions } from './room-options.js';
import EventEmitter from './utils/event-emitter.js';
/**
 * This interface is used to interact with typing in a chat room including subscribing to typing events and
 * fetching the current set of typing clients.
 *
 * Get an instance via {@link Room.typing}.
 */
export interface Typing extends EmitsDiscontinuities {
    /**
     * Subscribe a given listener to all typing events from users in the chat room.
     *
     * @param listener A listener to be called when the typing state of a user in the room changes.
     * @returns A response object that allows you to control the subscription to typing events.
     */
    subscribe(listener: TypingListener): TypingSubscriptionResponse;
    /**
     * Unsubscribe all listeners from receiving typing events.
     */
    unsubscribeAll(): void;
    /**
     * Get the current typers, a set of clientIds.
     * @returns A Promise of a set of clientIds that are currently typing.
     */
    get(): Promise<Set<string>>;
    /**
     * Start indicates that the current user is typing. This will emit a typingStarted event to inform listening clients and begin a timer,
     * once the timer expires, a typingStopped event will be emitted. The timeout is configurable through the typingTimeoutMs parameter.
     * If the current user is already typing, it will reset the timer and being counting down again without emitting a new event.
     *
     * @returns A promise which resolves upon success of the operation and rejects with an ErrorInfo object upon its failure.
     */
    start(): Promise<void>;
    /**
     * Stop indicates that the current user has stopped typing. This will emit a typingStopped event to inform listening clients,
     * and immediately clear the typing timeout timer.
     *
     * @returns A promise which resolves upon success of the operation and rejects with an ErrorInfo object upon its failure.
     */
    stop(): Promise<void>;
    /**
     * Get the Ably realtime channel underpinning typing events.
     * @returns The Ably realtime channel.
     */
    channel: Ably.RealtimeChannel;
}
/**
 * Represents a typing event.
 */
export interface TypingEvent {
    /**
     * Get a set of clientIds that are currently typing.
     */
    get currentlyTyping(): Set<string>;
}
/**
 * A listener which listens for typing events.
 * @param event The typing event.
 */
export type TypingListener = (event: TypingEvent) => void;
/**
 * A response object that allows you to control the subscription to typing events.
 */
export interface TypingSubscriptionResponse {
    /**
     * Unsubscribe the listener registered with {@link Typing.subscribe} from typing events.
     */
    unsubscribe: () => void;
}
/**
 * Represents the typing events mapped to their respective event payloads.
 */
interface TypingEventsMap {
    [TypingEvents.Changed]: TypingEvent;
}
/**
 * @inheritDoc
 */
export declare class DefaultTyping extends EventEmitter<TypingEventsMap> implements Typing, HandlesDiscontinuity, ContributesToRoomLifecycle {
    private readonly _clientId;
    private readonly _channel;
    private readonly _logger;
    private readonly _discontinuityEmitter;
    private readonly _typingTimeoutMs;
    private _timerId;
    private _receivedEventNumber;
    private _triggeredEventNumber;
    private _currentlyTyping;
    private _retryTimeout;
    private _numRetries;
    /**
     * Constructs a new `DefaultTyping` instance.
     * @param roomId The unique identifier of the room.
     * @param options The options for typing in the room.
     * @param channelManager The channel manager for the room.
     * @param clientId The client ID of the user.
     * @param logger An instance of the Logger.
     */
    constructor(roomId: string, options: TypingOptions, channelManager: ChannelManager, clientId: string, logger: Logger);
    /**
     * Creates the realtime channel for typing indicators.
     */
    private _makeChannel;
    /**
     * @inheritDoc
     */
    get(): Promise<Set<string>>;
    /**
     * @inheritDoc
     */
    get channel(): Ably.RealtimeChannel;
    /**
     * Start the typing timeout timer. This will emit a typingStopped event if the timer expires.
     */
    private _startTypingTimer;
    /**
     * @inheritDoc
     */
    start(): Promise<void>;
    /**
     * @inheritDoc
     */
    stop(): Promise<void>;
    /**
     * @inheritDoc
     */
    subscribe(listener: TypingListener): TypingSubscriptionResponse;
    /**
     * @inheritDoc
     */
    unsubscribeAll(): void;
    /**
     * Subscribe to internal events. This will listen to presence events and convert them into associated typing events,
     * while also updating the currentlyTypingClientIds set.
     */
    private readonly _internalSubscribeToEvents;
    private _getAndEmit;
    onDiscontinuity(listener: DiscontinuityListener): OnDiscontinuitySubscriptionResponse;
    discontinuityDetected(reason?: Ably.ErrorInfo): void;
    get timeoutMs(): number;
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

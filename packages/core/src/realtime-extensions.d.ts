import * as Ably from 'ably';
import { PresenceEvents } from './events.js';
/**
 * An interface that mimics the EventEmitter interface used in ably-js
 * to allow listeners to be added.
 */
interface RealtimeChannelSubscriptions<EventType, CallbackType> {
    on(listener: Ably.messageCallback<CallbackType>): void;
    on(events: EventType[], listener: Ably.messageCallback<CallbackType>): void;
}
/**
 * Represents a RealtimeChannel with pure subscriptions that do not cause any side-effects.
 */
export interface RealtimeChannelWithPureSubscriptions {
    subscriptions: RealtimeChannelSubscriptions<string, Ably.InboundMessage>;
    presence: {
        subscriptions: RealtimeChannelSubscriptions<PresenceEvents, Ably.PresenceMessage>;
    };
}
/**
 * Represents the parameters for adding a listener to a channel without attaching it.
 */
interface RealtimePureSubscriptionParams<EventType, CallbackType> {
    channel: Ably.RealtimeChannel;
    events?: EventType[];
    listener: Ably.messageCallback<CallbackType>;
}
/**
 * Adds a listener for channel messages without the side-effect of attaching the channel.
 *
 * @param channel The channel to add the listener to.
 * @param events The events to listen for.
 * @param listener The listener to add.
 */
export declare const addListenerToChannelWithoutAttach: (params: RealtimePureSubscriptionParams<string, Ably.InboundMessage>) => void;
/**
 *  Adds a listener for channel presence messages without the side-effect of attaching the channel.
 *
 * @param channel The channel to add the listener to.
 * @param events The events to listen for.
 * @param listener The listener to add.
 */
export declare const addListenerToChannelPresenceWithoutAttach: (params: RealtimePureSubscriptionParams<PresenceEvents, Ably.PresenceMessage>) => void;
export {};

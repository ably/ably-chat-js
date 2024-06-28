import * as Ably from 'ably';

import { PresenceEvents } from './events.js';

/**
 * Exposes the agents option in the Ably Realtime client for typescript.
 *
 * @internal
 */
export interface RealtimeWithOptions extends Ably.Realtime {
  options: {
    agents?: Record<string, string | undefined>;
  };
}

/**
 * Exposes the channelOptions property in the Ably Realtime channel for typescript.
 *
 * @internal
 */
export interface RealtimeChannelWithOptions extends Ably.RealtimeChannel {
  channelOptions: Ably.ChannelOptions;
}

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
interface RealtimeChannelWithPureSubscriptions {
  subscriptions: RealtimeChannelSubscriptions<string, Ably.InboundMessage>;
  presence: {
    subscriptions: RealtimeChannelSubscriptions<PresenceEvents, Ably.PresenceMessage>;
  };
}

/**
 * Represents the parameters for adding a listener to a channel without attaching it.
 */
interface RealtimePureSubscriptionParams<EventType, CallbackType> {
  // The channel to add the listener to.
  channel: Ably.RealtimeChannel;

  // An optional list of events to listen for.
  events?: EventType[];

  // The listener to add.
  listener: Ably.messageCallback<CallbackType>;
}

/**
 * Adds a listener for channel messages without the side-effect of attaching the channel.
 *
 * @param channel The channel to add the listener to.
 * @param events The events to listen for.
 * @param listener The listener to add.
 */
export const addListenerToChannelWithoutAttach = (
  params: RealtimePureSubscriptionParams<string, Ably.InboundMessage>,
): void => {
  const subscriptions = (params.channel as unknown as RealtimeChannelWithPureSubscriptions).subscriptions;
  addListener(subscriptions, params.listener, params.events);
};

/**
 *  Adds a listener for channel presence messages without the side-effect of attaching the channel.
 *
 * @param channel The channel to add the listener to.
 * @param events The events to listen for.
 * @param listener The listener to add.
 */
export const addListenerToChannelPresenceWithoutAttach = (
  params: RealtimePureSubscriptionParams<PresenceEvents, Ably.PresenceMessage>,
): void => {
  const subscriptions = (params.channel as unknown as RealtimeChannelWithPureSubscriptions).presence.subscriptions;
  addListener(subscriptions, params.listener, params.events);
};

const addListener = <EventType, ListenerType>(
  subscription: RealtimeChannelSubscriptions<EventType, ListenerType>,
  listener: Ably.messageCallback<ListenerType>,
  events?: EventType[],
) => {
  if (events) {
    subscription.on(events, listener);
    return;
  }

  subscription.on(listener);
};

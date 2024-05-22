import * as Ably from 'ably';

type Listener = Ably.messageCallback<Ably.InboundMessage>;
type PresenceListener = Ably.messageCallback<Ably.PresenceMessage>;

export interface SubscriptionManager {
  subscribe(events: string[], listener: Listener): Promise<Ably.ChannelStateChange | null>;
  subscribe(listener: Listener): Promise<Ably.ChannelStateChange | null>;
  unsubscribe(listener: Listener): Promise<void>;
  presenceSubscribe(listener: PresenceListener): Promise<void>;
  presenceSubscribe(events: Ably.PresenceAction[] | Ably.PresenceAction, listener: PresenceListener): Promise<void>;
  presenceUnsubscribe(listener: PresenceListener): Promise<void>;
}

/**
 * The subscription manager is an internal class that wraps a Realtime channel.
 *
 * It ensures that when all subscriptions (messages and presence) are removed, the channel is implicitly
 * detached.
 */
export class DefaultSubscriptionManager implements SubscriptionManager {
  private readonly _channel: Ably.RealtimeChannel;
  private readonly _listeners: Set<Listener>;
  private readonly _presenceListeners: Set<PresenceListener>;

  constructor(channel: Ably.RealtimeChannel) {
    this._channel = channel;
    this._listeners = new Set();
    this._presenceListeners = new Set();
  }

  /**
   * Subscribes the given listener to given events on the channel, implicitly attaching the channel if it
   * is not already attached.
   */
  subscribe(...args: unknown[]): Promise<Ably.ChannelStateChange | null> {
    if (args.length < 1 && args.length > 2) {
      throw new Error('Invalid number of arguments');
    }

    if (args.length === 1) {
      const listener: Listener = args[0] as Listener;
      return this._channel.subscribe(listener);
    }

    const events: string[] = args[0] as string[];
    const listener: Listener = args[1] as Listener;
    this._listeners.add(listener);
    return this._channel.subscribe(events, listener);
  }

  /**
   * Unsubscribes the given listener from all events, implicitly detaching the channel if there
   * are no more listeners.
   */
  unsubscribe(listener: Listener): Promise<void> {
    if (!this._listeners.has(listener)) {
      return Promise.resolve();
    }

    this._listeners.delete(listener);
    this._channel.unsubscribe(listener);
    return this.detachChannelIfNotListening();
  }

  /**
   * Subscribes the given listener to presence events on the channel, implicitly attaching the channel if
   * it is not already attached.
   *
   * When subscribing to presence events, the promise resolves void when attach succeeds rather than
   * a channel state change.
   */
  presenceSubscribe(...args: unknown[]): Promise<void> {
    if (args.length < 1 && args.length > 2) {
      throw new Error('Invalid number of arguments');
    }

    if (args.length === 1) {
      const listener: PresenceListener = args[0] as PresenceListener;
      this._presenceListeners.add(listener);
      return this._channel.presence.subscribe(listener);
    }

    const events: Ably.PresenceAction[] | Ably.PresenceAction = args[0] as Ably.PresenceAction[] | Ably.PresenceAction;
    const listener: PresenceListener = args[1] as PresenceListener;
    this._presenceListeners.add(listener);
    return this._channel.presence.subscribe(events, listener);
  }

  /**
   * Unsubscribes the given presence listener from all events, implicitly detaching the channel if there
   * are no more listeners.
   */
  presenceUnsubscribe(listener: PresenceListener): Promise<void> {
    if (!this._presenceListeners.has(listener)) {
      return Promise.resolve();
    }

    this._presenceListeners.delete(listener);
    this._channel.presence.unsubscribe(listener);
    return this.detachChannelIfNotListening();
  }

  /**
   * Detaches the channel if there are no more listeners of any kind.
   */
  private detachChannelIfNotListening(): Promise<void> {
    if (this.hasListeners()) {
      return Promise.resolve();
    }

    return this._channel.detach();
  }

  private hasListeners(): boolean {
    return this._listeners.size + this._presenceListeners.size > 0;
  }

  get channel() {
    return this._channel;
  }
}

import Ably from 'ably';
import { DEFAULT_CHANNEL_OPTIONS } from './version.js';
import { SubscriptionManager, DefaultSubscriptionManager } from './SubscriptionManager.js';
import EventEmitter from './utils/EventEmitter.js';
import { RoomReactionEvents } from './events.js';

/**
 * Represents a room-level reaction.
 */
export interface Reaction {
  // type of the reaction, such as "like", "love", etc.
  type: string;

  // metadata of the reaction, if any was set
  metadata?: any;

  // timestamp of when this reaction was sent
  createdAt: Date;

  // clientId of the user who sent this reaction
  clientId: string;

  // true if the current user sent this reaction
  isSelf: boolean;
}

export type RoomReactionListener = (reaction: Reaction) => void;

/**
 * Object used to send and subscribe to room-level reactions.
 *
 * Get an instance via room.reactions.
 */
export interface RoomReactions {
  send(type: string): Promise<void>;
  send(type: string, metadata?: any): Promise<void>;

  subscribe(listener: RoomReactionListener): Promise<Ably.ChannelStateChange | null> | undefined;
  unsubscribe(listener: RoomReactionListener): Promise<void>;

  get realtimeChannelName(): string;
  get channel(): Ably.RealtimeChannel;
}

interface RoomReactionEventsMap {
  [RoomReactionEvents.reaction]: Reaction;
}

export class DefaultRoomReactions extends EventEmitter<RoomReactionEventsMap> implements RoomReactions {
  private readonly roomId: string;
  private readonly _managedChannel: SubscriptionManager;
  private readonly clientId: string;

  constructor(roomId: string, realtime: Ably.Realtime, clientId: string) {
    super();
    this.roomId = roomId;
    const channel = realtime.channels.get(this.realtimeChannelName, DEFAULT_CHANNEL_OPTIONS);
    this._managedChannel = new DefaultSubscriptionManager(channel);
    this.clientId = clientId;
  }

  /**
   * Send a room-level reaction with given type and metadata.
   * @param type A string representing the reaction type, for example "like" or an emoji.
   * @param metadata Any JSON serializable info to be associated with the reaction.
   * @returns The returned promise resolves when the reaction was sent. Note that it is possible to receive your own reaction via the reactions listener before this promise resolves.
   */
  send(type: string, metadata?: any): Promise<void> {
    const payload: any = { type: type };
    if (metadata) {
      payload.metadata = metadata;
    }
    return this._managedChannel.channel.publish(RoomReactionEvents.reaction, payload);
  }

  /**
   * Subscribe to receive room-level reactions. At the first subscription the SDK will automatically attach to
   * the room-level reactions Ably realtime channel. When the last listener is removed via unsubscribe() the SDK
   * automatically detaches from the channel.
   *
   * @param listener
   * @returns A promise that resolves when attachment completed or instantly if already attached.
   */
  subscribe(listener: RoomReactionListener) {
    const hasListeners = this.hasListeners();
    this.on(listener);
    if (!hasListeners) {
      return this.onFirstSubscribe();
    }
    return Promise.resolve(null);
  }

  // gets called when the first listener is added via subscribe
  private onFirstSubscribe() {
    return this._managedChannel.subscribe([RoomReactionEvents.reaction], this.forwarder);
  }

  // gets called when the last listener is removed via unsubscribe
  private onLastUnsubscribe() {
    return this._managedChannel.unsubscribe(this.forwarder);
  }

  // parses reactions from realtime channel into Reaction objects and forwards them to the EventEmitter
  private forwarder = (inbound: Ably.InboundMessage) => {
    const reaction = realtime2reaction(inbound, this.clientId);
    if (!reaction) {
      // ignore non-reactions
      return;
    }
    this.emit(RoomReactionEvents.reaction, reaction);
  };

  /**
   * Unsubscribe removes the given listener. If no other listeners remain the SDK detaches from the realtime channel.
   * @param listener
   * @returns Promise that resolves instantly for any but the last subscriber. When removing the last subscriber the promise resolves when detachment was successful.
   */
  unsubscribe(listener: RoomReactionListener) {
    this.off(listener);
    if (!this.hasListeners()) {
      // last unsubscribe, must do teardown work
      return this.onLastUnsubscribe();
    }
    return Promise.resolve();
  }

  get realtimeChannelName(): string {
    return this.roomId + '::$chat::$reactions';
  }

  get channel(): Ably.RealtimeChannel {
    return this._managedChannel.channel;
  }
}

function realtime2reaction(inbound: Ably.InboundMessage, clientId: string): Reaction | null {
  if (!inbound.data || !inbound.data.type || typeof inbound.data.type !== 'string') {
    // not a reaction if there's no type or type is not a string
    return null;
  }
  if (!inbound.clientId) {
    // not a reaction if we have no clientId
    return null;
  }

  const reaction: Reaction = {
    type: inbound.data.type,
    clientId: inbound.clientId!,
    createdAt: new Date(inbound.timestamp),
    isSelf: inbound.clientId === clientId,
  };

  if (inbound.data.metadata) {
    reaction.metadata = inbound.data.metadata;
  }

  return reaction;
}

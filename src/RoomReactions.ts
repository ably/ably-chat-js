import * as Ably from 'ably';

import { RoomReactionEvents } from './events.js';
import { Logger } from './logger.js';
import { SubscriptionManager } from './SubscriptionManager.js';
import EventEmitter from './utils/EventEmitter.js';

/**
 * Represents a room-level reaction.
 */
export interface Reaction {
  /**
   * The type of the reaction, for example "like" or "love".
   */
  readonly type: string;

  /**
   * metadata of the reaction, if any was set
   */
  readonly metadata?: any;

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
 * The listener function type for room-level reactions.
 *
 * @param reaction The reaction that was received.
 */
export type RoomReactionListener = (reaction: Reaction) => void;

/**
 * Object used to send and subscribe to room-level reactions.
 *
 * Get an instance via room.reactions.
 */
export interface RoomReactions {
  /**
   * Send a reaction to the room.
   *
   * @param type The reaction type, for example "like" or an emoji.
   */
  send(type: string): Promise<void>;

  /**
   * Send a reaction to the room including some metadata.
   *
   * @param type The reaction type, for example "like" or an emoji.
   * @param metadata Any JSON-serializable data that will be attached to the reaction.
   * @returns The returned promise resolves when the reaction was sent. Note that it is possible to receive your own reaction via the reactions listener before this promise resolves.
   */
  send(type: string, metadata?: any): Promise<void>;

  /**
   * Subscribe to receive room-level reactions. At the first subscription the SDK will automatically attach to
   * the room-level reactions Ably realtime channel. When the last listener is removed via unsubscribe() the SDK
   * automatically detaches from the channel.
   *
   * @param listener The listener function to be called when a reaction is received.
   * @returns A promise that resolves when attachment completed or instantly if already attached.
   */
  subscribe(listener: RoomReactionListener): Promise<Ably.ChannelStateChange | null>;

  /**
   * Unsubscribe removes the given listener. If no other listeners remain the SDK detaches from the realtime channel.
   *
   * @param listener The listener to remove.
   * @returns Promise that resolves instantly for any but the last subscriber. When removing the last subscriber the promise resolves when detachment was successful.
   */
  unsubscribe(listener: RoomReactionListener): Promise<void>;

  /**
   * Returns an instance of the Ably realtime channel used for room-level reactions.
   * Avoid using this directly unless special features that cannot otherwise be implemented are needed.
   *
   * @returns The Ably realtime channel instance.
   */
  get channel(): Ably.RealtimeChannel;
}

interface RoomReactionEventsMap {
  [RoomReactionEvents.reaction]: Reaction;
}

export class DefaultRoomReactions extends EventEmitter<RoomReactionEventsMap> implements RoomReactions {
  private readonly roomId: string;
  private readonly _managedChannel: SubscriptionManager;
  private readonly clientId: string;
  private readonly _logger: Logger;

  constructor(roomId: string, managedChannel: SubscriptionManager, clientId: string, logger: Logger) {
    super();
    this.roomId = roomId;
    this._managedChannel = managedChannel;
    this.clientId = clientId;
    this._logger = logger;
  }

  /**
   * @inheritDoc Reactions
   */
  send(type: string, metadata?: any): Promise<void> {
    const payload: any = { type: type };
    if (metadata) {
      payload.metadata = metadata;
    }
    return this._managedChannel.channel.publish(RoomReactionEvents.reaction, payload);
  }

  /**
   * @inheritDoc Reactions
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
    const reaction = realtimeMessageToReaction(inbound, this.clientId);
    if (!reaction) {
      // ignore non-reactions
      return;
    }
    this.emit(RoomReactionEvents.reaction, reaction);
  };

  /**
   * @inheritDoc Reactions
   */
  unsubscribe(listener: RoomReactionListener) {
    this.off(listener);
    if (!this.hasListeners()) {
      // last unsubscribe, must do teardown work
      return this.onLastUnsubscribe();
    }
    return Promise.resolve();
  }

  get channel(): Ably.RealtimeChannel {
    return this._managedChannel.channel;
  }
}

function realtimeMessageToReaction(inbound: Ably.InboundMessage, clientId: string): Reaction | null {
  if (!inbound.data || !inbound.data.type || typeof inbound.data.type !== 'string') {
    // not a reaction if there's no type or type is not a string
    return null;
  }
  if (!inbound.clientId) {
    // not a reaction if we have no clientId
    return null;
  }

  return new DefaultReaction(
    inbound.data.type,
    inbound.clientId!,
    new Date(inbound.timestamp),
    inbound.clientId === clientId,
    inbound.data.metadata,
  );
}

class DefaultReaction implements Reaction {
  constructor(
    public readonly type: string,
    public readonly clientId: string,
    public readonly createdAt: Date,
    public readonly isSelf: boolean,
    public readonly metadata: any,
  ) {
    // The object is frozen after constructing to enforce readonly at runtime too
    Object.freeze(this);
  }
}

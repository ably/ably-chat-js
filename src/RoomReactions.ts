import * as Ably from 'ably';

import { RoomReactionEvents } from './events.js';
import { Logger } from './logger.js';
import { DefaultReaction, Reaction } from './Reaction.js';
import { DefaultFeature, Feature } from './status.js';
import { SubscriptionManager } from './SubscriptionManager.js';
import EventEmitter from './utils/EventEmitter.js';

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

  /**
   * Get the current status of the feature.
   *
   * @returns an observable that emits the current status of the feature.
   */
  get status(): Feature;
}

interface RoomReactionEventsMap {
  [RoomReactionEvents.reaction]: Reaction;
}

export class DefaultRoomReactions extends EventEmitter<RoomReactionEventsMap> implements RoomReactions {
  private readonly roomId: string;
  private readonly _managedChannel: SubscriptionManager;
  private readonly clientId: string;
  private readonly _logger: Logger;
  private readonly _status: Feature;

  constructor(roomId: string, managedChannel: SubscriptionManager, clientId: string, logger: Logger) {
    super();
    this.roomId = roomId;
    this._managedChannel = managedChannel;
    this.clientId = clientId;
    this._logger = logger;
    this._status = new DefaultFeature(managedChannel.channel, 'Reactions', logger);
  }

  /**
   * @inheritDoc Reactions
   */
  send(type: string, metadata?: any): Promise<void> {
    this._logger.trace('RoomReactions.send();', { type, metadata });
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
    this._logger.trace(`RoomReactions.subscribe();`);
    const hasListeners = this.hasListeners();
    this.on(listener);
    if (!hasListeners) {
      this._logger.debug('RoomReactions.subscribe(); adding internal listener');
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
    const reaction = this.parseNewReaction(inbound, this.clientId);
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
    this._logger.trace(`RoomReactions.unsubscribe();`);
    this.off(listener);
    if (!this.hasListeners()) {
      // last unsubscribe, must do teardown work
      this._logger.debug('RoomReactions.unsubscribe(); removing internal listener');
      return this.onLastUnsubscribe();
    }
    return Promise.resolve();
  }

  get channel(): Ably.RealtimeChannel {
    return this._managedChannel.channel;
  }

  /**
   * @inheritDoc Reactions
   */
  get status(): Feature {
    return this._status;
  }

  parseNewReaction(inbound: Ably.InboundMessage, clientId: string): Reaction | undefined {
    if (!inbound.data || !inbound.data.type || typeof inbound.data.type !== 'string') {
      // not a reaction if there's no type or type is not a string
      this._logger.error('RoomReactions.realtimeMessageToReaction(); invalid reaction message with no type', inbound);
      return;
    }

    if (!inbound.clientId) {
      // not a reaction if we have no clientId
      this._logger.error(
        'RoomReactions.realtimeMessageToReaction(); invalid reaction message with no clientId',
        inbound,
      );
      return;
    }

    return new DefaultReaction(
      inbound.data.type,
      inbound.clientId!,
      new Date(inbound.timestamp),
      inbound.clientId === clientId,
      inbound.data.metadata,
    );
  }
}

import * as Ably from 'ably';

import { getChannel } from './channel.js';
import { RoomReactionEvents } from './events.js';
import { Logger } from './logger.js';
import { DefaultReaction, Reaction, ReactionHeaders, ReactionMetadata } from './Reaction.js';
import { addListenerToChannelWithoutAttach } from './realtimeextensions.js';
import EventEmitter from './utils/EventEmitter.js';

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
   * The key `ably-chat` is reserved and cannot be used. Ably may populate this
   * with different values in the future.
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
   * The key prefix `ably-chat` is reserved and cannot be used. Ably may add
   * headers prefixed with `ably-chat` in the future.
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
 * Object used to send and subscribe to room-level reactions.
 *
 * Get an instance via room.reactions.
 */
export interface RoomReactions {
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
   * @returns The Ably realtime channel instance.
   */
  get channel(): Ably.RealtimeChannel;
}

interface RoomReactionEventsMap {
  [RoomReactionEvents.reaction]: Reaction;
}

interface ReactionPayload {
  type: string;
  metadata?: ReactionMetadata;
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

export class DefaultRoomReactions extends EventEmitter<RoomReactionEventsMap> implements RoomReactions {
  private readonly roomId: string;
  private readonly _channel: Ably.RealtimeChannel;
  private readonly clientId: string;
  private readonly _logger: Logger;

  constructor(roomId: string, realtime: Ably.Realtime, clientId: string, logger: Logger) {
    super();
    this.roomId = roomId;
    this._channel = getChannel(`${roomId}::$chat::$reactions`, realtime);
    addListenerToChannelWithoutAttach({
      listener: this.forwarder.bind(this),
      events: [RoomReactionEvents.reaction],
      channel: this._channel,
    });

    this.clientId = clientId;
    this._logger = logger;
  }

  /**
   * @inheritDoc Reactions
   */
  send(params: SendReactionParams): Promise<void> {
    this._logger.trace('RoomReactions.send();', params);

    const { type, metadata, headers } = params;

    if (!type) {
      return Promise.reject(new Ably.ErrorInfo('unable to send reaction; type not set and it is required', 40001, 400));
    }

    if (metadata && metadata['ably-chat'] !== undefined) {
      return Promise.reject(
        new Ably.ErrorInfo("unable to send reaction; metadata cannot use reserved key 'ably-chat'", 40001, 400),
      );
    }

    if (headers) {
      for (const key of Object.keys(headers)) {
        if (key.startsWith('ably-chat')) {
          return Promise.reject(
            new Ably.ErrorInfo(
              "unable to send reaction; headers cannot have any key starting with reserved prefix 'ably-chat'",
              40001,
              400,
            ),
          );
        }
      }
    }

    const payload: ReactionPayload = {
      type: type,
      metadata: metadata ?? {},
    };

    const realtimeMessage: Ably.Message = {
      name: RoomReactionEvents.reaction,
      data: payload,
      extras: {
        headers: headers ?? {},
      },
    };

    return this._channel.publish(realtimeMessage);
  }

  /**
   * @inheritDoc Reactions
   */
  subscribe(listener: RoomReactionListener): RoomReactionsSubscriptionResponse {
    this._logger.trace(`RoomReactions.subscribe();`);
    this.on(listener);

    return {
      unsubscribe: () => {
        this.off(listener);
      },
    };
  }

  /**
   * @inheritDoc Reactions
   */
  unsubscribeAll() {
    this._logger.trace(`RoomReactions.unsubscribeAll();`);
    this.off();
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

  get channel(): Ably.RealtimeChannel {
    return this._channel;
  }

  parseNewReaction(inbound: Ably.InboundMessage, clientId: string): Reaction | undefined {
    const data = inbound.data as ReactionPayload | undefined;
    if (!data) {
      this._logger.error('RoomReactions.realtimeMessageToReaction(); invalid reaction message with no data', inbound);
      return;
    }

    if (!data.type || typeof data.type !== 'string') {
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

    const extras = inbound.extras as { headers?: ReactionHeaders } | undefined;

    return new DefaultReaction(
      data.type,
      inbound.clientId,
      new Date(inbound.timestamp),
      inbound.clientId === clientId,
      data.metadata ?? {},
      extras?.headers ?? {},
    );
  }
}

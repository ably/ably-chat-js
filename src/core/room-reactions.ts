import * as Ably from 'ably';

import { RoomReactionEvent, RoomReactionEventType, RoomReactionRealtimeEventType } from './events.js';
import { Logger } from './logger.js';
import { messageToEphemeral } from './realtime.js';
import { RoomReaction, RoomReactionHeaders, RoomReactionMetadata } from './room-reaction.js';
import { parseRoomReaction } from './room-reaction-parser.js';
import { Subscription } from './subscription.js';
import EventEmitter, { wrap } from './utils/event-emitter.js';

/**
 * Params for sending a room-level reactions. Only `name` is mandatory.
 */
export interface SendReactionParams {
  /**
   * The name of the reaction, for example an emoji or a short string such as
   * "like".
   *
   * It is the only mandatory parameter to send a room-level reaction.
   */
  name: string;

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
  metadata?: RoomReactionMetadata;

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
  headers?: RoomReactionHeaders;
}

/**
 * The listener function type for room-level reactions.
 *
 * @param event The reaction event that was received.
 */
export type RoomReactionListener = (event: RoomReactionEvent) => void;

/**
 * This interface is used to interact with room-level reactions in a chat room: subscribing to reactions and sending them.
 *
 * Get an instance via {@link Room.reactions}.
 */
export interface RoomReactions {
  /**
   * Send a reaction to the room including some metadata.
   *
   * This method accepts parameters for a room-level reaction. It accepts an object
   *
   * @param params an object containing {name, headers, metadata} for the room
   * reaction to be sent. Name is required, metadata and headers are optional.
   * @throws If the `Connection` is not in the `Connected` state.
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
  subscribe(listener: RoomReactionListener): Subscription;
}

interface RoomReactionEventsMap {
  [RoomReactionEventType.Reaction]: RoomReactionEvent;
}

interface ReactionPayload {
  name: string;
  metadata?: RoomReactionMetadata;
}

/**
 * @inheritDoc
 */
export class DefaultRoomReactions implements RoomReactions {
  private readonly _channel: Ably.RealtimeChannel;
  private readonly _connection: Ably.Connection;
  private readonly _clientId: string;
  private readonly _logger: Logger;
  private readonly _emitter = new EventEmitter<RoomReactionEventsMap>();

  /**
   * Constructs a new `DefaultRoomReactions` instance.
   * @param channel The Realtime channel instance.
   * @param connection The connection instance.
   * @param clientId The client ID of the user.
   * @param logger An instance of the Logger.
   */
  constructor(channel: Ably.RealtimeChannel, connection: Ably.Connection, clientId: string, logger: Logger) {
    this._channel = channel;
    this._connection = connection;
    this._clientId = clientId;
    this._logger = logger;

    this._applyChannelSubscriptions();
  }

  /**
   * Sets up channel subscriptions for room reactions.
   */
  private _applyChannelSubscriptions(): void {
    // attachOnSubscribe is set to false in the default channel options, so this call cannot fail
    void this._channel.subscribe([RoomReactionRealtimeEventType.Reaction], this._forwarder.bind(this));
  }

  /**
   * @inheritDoc Reactions
   */
  send(params: SendReactionParams): Promise<void> {
    this._logger.trace('RoomReactions.send();', params);

    const { name, metadata, headers } = params;

    if (!name) {
      return Promise.reject(new Ably.ErrorInfo('unable to send reaction; name not set and it is required', 40001, 400));
    }

    // CHA-ER3f
    if (this._connection.state !== 'connected') {
      return Promise.reject(new Ably.ErrorInfo('unable to send reaction; not connected to Ably', 40000, 400));
    }

    const payload: ReactionPayload = {
      name: name,
      metadata: metadata ?? {},
    };

    const realtimeMessage: Ably.Message = {
      name: RoomReactionRealtimeEventType.Reaction,
      data: payload,
      extras: {
        headers: headers ?? {},
      },
    };

    return this._channel.publish(messageToEphemeral(realtimeMessage));
  }

  /**
   * @inheritDoc Reactions
   */
  subscribe(listener: RoomReactionListener): Subscription {
    this._logger.trace(`RoomReactions.subscribe();`);
    const wrapped = wrap(listener);
    this._emitter.on(wrapped);

    return {
      unsubscribe: () => {
        this._logger.trace('RoomReactions.unsubscribe();');
        this._emitter.off(wrapped);
      },
    };
  }

  // parses reactions from realtime channel into Reaction objects and forwards them to the EventEmitter
  private _forwarder = (inbound: Ably.InboundMessage) => {
    const reaction = this._parseNewReaction(inbound, this._clientId);
    if (!reaction) {
      // ignore non-reactions
      return;
    }
    this._emitter.emit(RoomReactionEventType.Reaction, {
      type: RoomReactionEventType.Reaction,
      reaction,
    });
  };

  private _parseNewReaction(inbound: Ably.InboundMessage, clientId: string): RoomReaction | undefined {
    try {
      return parseRoomReaction(inbound, clientId);
    } catch (error: unknown) {
      this._logger.error(`failed to parse incoming reaction;`, {
        inbound,
        error: error as Ably.ErrorInfo,
      });
    }
  }
}

import * as Ably from 'ably';

import { getChannel } from './channel.js';
import {
  DiscontinuityEmitter,
  DiscontinuityListener,
  EmitsDiscontinuities,
  HandlesDiscontinuity,
  newDiscontinuityEmitter,
  OnDiscontinuitySubscriptionResponse,
} from './discontinuity.js';
import { ErrorCodes } from './errors.js';
import { RoomReactionEvents } from './events.js';
import { Logger } from './logger.js';
import { Reaction, ReactionHeaders, ReactionMetadata } from './reaction.js';
import { parseReaction } from './reaction-parser.js';
import { addListenerToChannelWithoutAttach } from './realtime-extensions.js';
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

/**
 * @inheritDoc
 */
export class DefaultRoomReactions
  extends EventEmitter<RoomReactionEventsMap>
  implements RoomReactions, HandlesDiscontinuity, ContributesToRoomLifecycle
{
  private readonly _channel: Ably.RealtimeChannel;
  private readonly _clientId: string;
  private readonly _logger: Logger;
  private readonly _discontinuityEmitter: DiscontinuityEmitter = newDiscontinuityEmitter();

  /**
   * Constructs a new `DefaultRoomReactions` instance.
   * @param roomId The unique identifier of the room.
   * @param realtime An instance of the Ably Realtime client.
   * @param clientId The client ID of the user.
   * @param logger An instance of the Logger.
   */
  constructor(roomId: string, realtime: Ably.Realtime, clientId: string, logger: Logger) {
    super();

    this._channel = this._makeChannel(roomId, realtime);
    this._clientId = clientId;
    this._logger = logger;
  }

  /**
   * Creates the realtime channel for room reactions.
   */
  private _makeChannel(roomId: string, realtime: Ably.Realtime): Ably.RealtimeChannel {
    const channel = getChannel(`${roomId}::$chat::$reactions`, realtime);
    addListenerToChannelWithoutAttach({
      listener: this._forwarder.bind(this),
      events: [RoomReactionEvents.Reaction],
      channel: channel,
    });
    return channel;
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

    const payload: ReactionPayload = {
      type: type,
      metadata: metadata ?? {},
    };

    const realtimeMessage: Ably.Message = {
      name: RoomReactionEvents.Reaction,
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
        this._logger.trace('RoomReactions.unsubscribe();');
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
  private _forwarder = (inbound: Ably.InboundMessage) => {
    const reaction = this._parseNewReaction(inbound, this._clientId);
    if (!reaction) {
      // ignore non-reactions
      return;
    }
    this.emit(RoomReactionEvents.Reaction, reaction);
  };

  get channel(): Ably.RealtimeChannel {
    return this._channel;
  }

  private _parseNewReaction(inbound: Ably.InboundMessage, clientId: string): Reaction | undefined {
    try {
      return parseReaction(inbound, clientId);
    } catch (error: unknown) {
      this._logger.error(`failed to parse incoming reaction;`, { inbound, error: error as Ably.ErrorInfo });
    }
  }

  discontinuityDetected(reason?: Ably.ErrorInfo): void {
    this._logger.warn('RoomReactions.discontinuityDetected();', { reason });
    this._discontinuityEmitter.emit('discontinuity', reason);
  }

  onDiscontinuity(listener: DiscontinuityListener): OnDiscontinuitySubscriptionResponse {
    this._logger.trace('RoomReactions.onDiscontinuity();');
    this._discontinuityEmitter.on(listener);

    return {
      off: () => {
        this._discontinuityEmitter.off(listener);
      },
    };
  }

  /**
   * @inheritdoc ContributesToRoomLifecycle
   */
  get attachmentErrorCode(): ErrorCodes {
    return ErrorCodes.ReactionsAttachmentFailed;
  }

  /**
   * @inheritdoc ContributesToRoomLifecycle
   */
  get detachmentErrorCode(): ErrorCodes {
    return ErrorCodes.ReactionsDetachmentFailed;
  }
}

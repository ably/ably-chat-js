import * as Ably from 'ably';

import { ClientIdResolver } from './client-id.js';
import { ErrorCode } from './errors.js';
import { RoomReactionEvent, RoomReactionEventType, RoomReactionRealtimeEventType } from './events.js';
import { Logger } from './logger.js';
import { messageToEphemeral } from './realtime.js';
import { subscribe } from './realtime-subscriptions.js';
import { RoomReactionHeaders, RoomReactionMetadata } from './room-reaction.js';
import { parseRoomReaction } from './room-reaction-parser.js';
import { Subscription } from './subscription.js';
import EventEmitter, { emitterHasListeners, wrap } from './utils/event-emitter.js';

/**
 * Params for sending a room-level reactions. Only `name` is mandatory.
 */
export interface SendReactionParams {
  /**
   * The name of the reaction, for example an emoji or a short string (e.g., "❤️", "👏", "confetti", "applause").
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
   * Sends a room-level reaction.
   *
   * Room reactions are ephemeral events that are not associated with specific messages.
   * They're commonly used for live interactions like floating emojis, applause, or other
   * real-time feedback in chat rooms. Unlike message reactions, room reactions are not
   * persisted and are only visible to users currently connected to the room.
   *
   * **Note**:
   * - The room should be attached to send room reactions.
   * - It is possible (though unlikely) to receive your own reaction via subscription before this promise resolves.
   * @param params - The reaction parameters
   * @returns Promise that resolves when the reaction has been sent, or rejects with:
   * - {@link ErrorCode.InvalidArgument} if name is not provided
   * - {@link ErrorCode.Disconnected} if not connected to Ably
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * const room = await chatClient.rooms.get('live-event');
   *
   * // Attach to the room to send room reactions
   * await room.attach();
   *
   * // Send a simple room reaction
   * try {
   *   await room.reactions.send({
   *     name: '❤️'
   *   });
   *   console.log('Heart reaction sent to room');
   * } catch (error) {
   *    console.error('Failed to send reaction:', error);
   * }
   * ```
   */
  send(params: SendReactionParams): Promise<void>;

  /**
   * Subscribes to room-level reaction events.
   *
   * Receives all room reactions sent by any user in the room. This is useful for
   * displaying floating reactions, triggering animations, or showing live audience
   * engagement in real-time. Room reactions are ephemeral and not persisted.
   *
   * **Note**: The room should be attached to receive reaction events.
   * @param listener - Callback invoked when a room reaction is received
   * @returns Subscription object with an unsubscribe method
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient, RoomReactionEvent } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * const room = await chatClient.rooms.get('webinar-room');
   *
   * // Subscribe to room reactions for live animations
   * const subscription = room.reactions.subscribe((event: RoomReactionEvent) => {
   *   const { reaction } = event;
   *
   *   console.log(`${reaction.clientId} sent ${reaction.name}`);
   *   console.log(`Sent at: ${reaction.createdAt.toISOString()}`);
   *
   *   // Handle different reaction types
   *   switch (reaction.name) {
   *     case '❤️':
   *       // Show floating heart animation
   *       showFloatingHeart(reaction.isSelf ? 'own' : 'other');
   *       break;
   *     case '👏':
   *       // Show applause indicator
   *       showApplauseAnimation(reaction.clientId);
   *       break;
   *     default:
   *       // Handle generic reactions
   *       showGenericReaction(reaction.name);
   *   }
   *
   *   // Check if reaction is from current user
   *   if (reaction.isSelf) {
   *     console.log('You sent a reaction:', reaction.name);
   *   }
   * });
   *
   * // Attach to the room to start receiving events
   * await room.attach();
   *
   * // Later, unsubscribe when done
   * subscription.unsubscribe();
   * ```
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
  private readonly _clientIdResolver: ClientIdResolver;
  private readonly _logger: Logger;
  private readonly _emitter = new EventEmitter<RoomReactionEventsMap>();
  private readonly _unsubscribeRoomReactionEvents: () => void;

  /**
   * Constructs a new `DefaultRoomReactions` instance.
   * @param channel The Realtime channel instance.
   * @param connection The connection instance.
   * @param clientIdResolver The client ID resolver.
   * @param logger An instance of the Logger.
   */
  constructor(
    channel: Ably.RealtimeChannel,
    connection: Ably.Connection,
    clientIdResolver: ClientIdResolver,
    logger: Logger,
  ) {
    this._channel = channel;
    this._connection = connection;
    this._clientIdResolver = clientIdResolver;
    this._logger = logger;

    // Create bound listener
    const roomReactionEventsListener = this._forwarder.bind(this);

    // Use subscription helper to create cleanup function
    this._unsubscribeRoomReactionEvents = subscribe(
      this._channel,
      [RoomReactionRealtimeEventType.Reaction],
      roomReactionEventsListener,
    );
  }

  /**
   * @inheritDoc
   */
  async send(params: SendReactionParams): Promise<void> {
    this._logger.trace('RoomReactions.send();', params);

    const { name, metadata, headers } = params;

    if (!name) {
      throw new Ably.ErrorInfo(
        'unable to send reaction; name not set and it is required',
        ErrorCode.InvalidArgument,
        400,
      );
    }

    // CHA-ER3f
    if (this._connection.state !== 'connected') {
      throw new Ably.ErrorInfo('unable to send reaction; not connected to Ably', ErrorCode.Disconnected, 400);
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
   * @inheritDoc
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
    const reaction = parseRoomReaction(inbound, this._clientIdResolver.get());
    this._emitter.emit(RoomReactionEventType.Reaction, {
      type: RoomReactionEventType.Reaction,
      reaction,
    });
  };

  /**
   * Disposes of the room reactions instance, removing all listeners and subscriptions.
   * This method should be called when the room is being released to ensure proper cleanup.
   * @internal
   */
  dispose(): void {
    // Remove room reaction event subscriptions using stored unsubscribe function
    this._unsubscribeRoomReactionEvents();

    // Remove user-level listeners
    this._emitter.off();
  }

  /**
   * Checks if there are any listeners registered by users.
   * @internal
   * @returns true if there are listeners, false otherwise.
   */
  hasListeners(): boolean {
    return emitterHasListeners(this._emitter);
  }
}

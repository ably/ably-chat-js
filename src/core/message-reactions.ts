import * as Ably from 'ably';

import { ChannelOptionsMerger } from './channel-manager.js';
import {
  ChatApi,
  DeleteMessageReactionParams as APIDeleteMessageReactionParams,
  SendMessageReactionParams as APISendMessageReactionParams,
} from './chat-api.js';
import {
  AnnotationTypeToReactionType,
  ChatMessageAction,
  MessageReactionEventType,
  MessageReactionRawEvent,
  MessageReactionSummaryEvent,
  MessageReactionType,
  ReactionAnnotationType,
} from './events.js';
import { Logger } from './logger.js';
import { Message } from './message.js';
import { subscribe } from './realtime-subscriptions.js';
import { InternalRoomOptions, MessagesOptions } from './room-options.js';
import { Serial, serialToString } from './serial.js';
import { Subscription } from './subscription.js';
import EventEmitter, { emitterHasListeners, wrap } from './utils/event-emitter.js';

/**
 * A listener for summary message reaction events.
 * @param event The message reaction summary event that was received. Use it
 *   with {@link Message.with} to keep an up-to-date reaction count.
 */
export type MessageReactionListener = (event: MessageReactionSummaryEvent) => void;

/**
 * A listener for individual message reaction events.
 * @param event The message reaction event that was received.
 */
export type MessageRawReactionListener = (event: MessageReactionRawEvent) => void;

/**
 * Parameters for sending a message reaction.
 */
export interface SendMessageReactionParams {
  /**
   * The reaction name to send; ie. the emoji.
   */
  name: string;

  /**
   * The type of reaction, must be one of {@link MessageReactionType}.
   * If not set, the default type will be used which is configured in the {@link MessagesOptions.defaultMessageReactionType} of the room.
   */
  type?: MessageReactionType;

  /**
   * The count of the reaction for type {@link MessageReactionType.Multiple}.
   * Defaults to 1 if not set. Not supported for other reaction types.
   * @defaultValue 1
   */
  count?: number;
}

/**
 * Parameters for deleting a message reaction.
 */
export interface DeleteMessageReactionParams {
  /**
   * The reaction name to delete; ie. the emoji. Required for all reaction types
   * except {@link MessageReactionType.Unique}.
   */
  name?: string;

  /**
   * The type of reaction, must be one of {@link MessageReactionType}.
   * If not set, the default type will be used which is configured in the {@link MessagesOptions.defaultMessageReactionType} of the room.
   */
  type?: MessageReactionType;
}

/**
 * Send, delete, and subscribe to message reactions.
 */
export interface MessageReactions {
  /**
   * Sends a reaction to a specific chat message.
   *
   * **Note** that the behavior depends on the reaction type configured for the room.
   * @param messageSerial - The unique identifier of the message to react to
   * @param params - The reaction parameters
   * @param params.name - The reaction name (e.g., emoji like "👍", "❤️", or custom names)
   * @param params.type - Optional reaction type (defaults to room's {@link MessageOptions.defaultMessageReactionType})
   * @param params.count - Count for Multiple type reactions (defaults to 1)
   * @returns Promise that resolves when the reaction has been sent
   * @throws {Ably.ErrorInfo} with status code 404 if the message does not exist.
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient, MessageReactionType } from '@ably/chat';
   *
   * const chatClient = // initialized ChatClient instance
   *
   * const room = await chatClient.rooms.get('sports-chat');
   *
   * // Send a simple reaction to a message
   * try {
   *   await room.messages.reactions.send(message.serial, {
   *     name: '👍'
   *   });
   *   console.log('Reaction sent successfully');
   * } catch (error) {
   *   console.error('Failed to send reaction:', error);
   * }
   *
   * // Send a distinct type reaction (can react with multiple different emojis)
   * await room.messages.reactions.send(message.serial, {
   *   name: '❤️',
   *   type: MessageReactionType.Distinct
   * });
   *
   * // Send a multiple type reaction with count (for vote-style reactions)
   * await room.messages.reactions.send(message.serial, {
   *   name: 'option-a',
   *   type: MessageReactionType.Multiple,
   *   count: 3  // User votes 3 times for option-a
   * });
   * ```
   */
  send(messageSerial: Serial, params: SendMessageReactionParams): Promise<void>;

  /**
   * Deletes a previously sent reaction from a chat message.
   *
   * The deletion behavior depends on the reaction type:
   * - **Unique**: Removes the client's single reaction (name not required)
   * - **Distinct**: Removes a specific reaction by name
   * - **Multiple**: Removes all instances of a reaction by name
   * @param messageSerial - The unique identifier of the message to remove the reaction from
   * @param params - Optional deletion parameters
   * @param params.name - The reaction name to delete (required for all types except Unique)
   * @param params.type - The reaction type (defaults to room's defaultMessageReactionType)
   * @returns Promise that resolves when the reaction has been deleted
   * @throws {Ably.ErrorInfo} with code 40400 if the message does not exist.
   * @throws {Ably.ErrorInfo} with code 40001 if trying to delete a non-Unique reaction without a name.
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient, MessageReactionType } from '@ably/chat';
   *
   * const chatClient = // initialized ChatClient instance
   *
   * const room = await chatClient.rooms.get('team-chat');
   *
   * // Delete a distinct reaction (specific emoji)
   * try {
   *   await room.messages.reactions.delete(message.serial, {
   *     name: '👍',
   *     type: MessageReactionType.Distinct
   *   });
   *   console.log('Thumbs up reaction removed');
   * } catch (error) {
   *   console.error('Failed to delete reaction:', error);
   * }
   *
   * // Delete a unique reaction (only one per user, name not needed)
   * await room.messages.reactions.delete(message.serial, {
   *   type: MessageReactionType.Unique
   * });
   *
   * // Delete all instances of a multiple reaction
   * await room.messages.reactions.delete(message.serial, {
   *   name: 'option-b',
   *   type: MessageReactionType.Multiple
   * });
   * ```
   */
  delete(messageSerial: Serial, params?: DeleteMessageReactionParams): Promise<void>;

  /**
   * Subscribes to chat message reaction summary events.
   *
   * Summary events provide aggregated reaction counts. Each summary event contains counts and
   * client lists for all reaction types on a message.
   *
   * **Note**: The room must be attached to receive reaction events.
   * @param listener - Callback invoked when reaction summaries are updated
   * @returns Subscription object with an unsubscribe method
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient, MessageReactionSummaryEvent } from '@ably/chat';
   *
   * const chatClient = // initialized ChatClient instance
   *
   * const room = await chatClient.rooms.get('product-reviews');
   * await room.attach();
   *
   * // Subscribe to reaction summaries
   * const subscription = room.messages.reactions.subscribe((event: MessageReactionSummaryEvent) => {
   *   const { summary } = event;
   *   if (summary.distinct) {
   *     Object.entries(summary.distinct).forEach(([reaction, data]) => {
   *       console.log(`${reaction}: ${data.total} reactions from ${data.clientIds.length} users`);
   *     });
   *   }
   *
   *   // Handle unique reactions (only one reaction per user)
   *   if (summary.unique) {
   *     Object.entries(summary.unique).forEach(([reaction, data]) => {
   *       const hasUserReacted = data.clientIds.includes(chatClient.clientId);
   *       console.log(`${reaction}: ${data.total} users (you: ${hasUserReacted})`);
   *     });
   *   }
   *
   *   // Handle multiple reactions (multiple types of reactions, no limit per type)
   *   if (summary.multiple) {
   *     Object.entries(summary.multiple).forEach(([reaction, data]) => {;
   *       console.log(`${reaction}: ${data.total} total votes`);
   *     });
   *   }
   * });
   *
   * // Clean up when done
   * subscription.unsubscribe();
   * ```
   */
  subscribe(listener: MessageReactionListener): Subscription;

  /**
   * Subscribes to individual chat message reaction events.
   *
   * Raw reaction events provide the individual updates for each reaction
   * added or removed. This is most useful for analytics, but is not recommended
   * for driving UI due to the high volume of events.
   *
   * **Note**: Requires `rawMessageReactions` to be enabled in room options.
   * @param listener - Callback invoked for each individual reaction event
   * @returns Subscription object with an unsubscribe method
   * @throws {Ably.ErrorInfo} with code 40001 if raw message reactions are not enabled
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient, MessageReactionRawEvent, MessageReactionEventType } from '@ably/chat';
   *
   * const chatClient = // initialized ChatClient instance
   *
   * // Enable raw reactions in room options
   * const room = await chatClient.rooms.get('live-stream', {
   *   messages: {
   *     rawMessageReactions: true
   *   }
   * });
   * await room.attach();
   *
   * // Subscribe to individual reaction events
   * const subscription = room.messages.reactions.subscribeRaw((event: MessageReactionRawEvent) => {
   *   const { type, reaction, timestamp } = event;
   *
   *   switch (type) {
   *     case MessageReactionEventType.Create:
   *       console.log(`${reaction.clientId} added ${reaction.name} to message ${reaction.messageSerial} at ${timestamp}`);
   *       break;
   *
   *     case MessageReactionEventType.Delete:
   *       console.log(`${reaction.clientId} removed ${reaction.name} from message ${reaction.messageSerial} at ${timestamp}`);
   *       break;
   *   }
   *
   *   // Handle multiple type reactions with counts
   *   if (reaction.count !== undefined) {
   *     console.log(`Reaction has count: ${reaction.count}`);
   *   }
   * });
   *
   * // Clean up when done
   * subscription.unsubscribe();
   * ```
   */
  subscribeRaw(listener: MessageRawReactionListener): Subscription;

  /**
   * Retrieves reaction information for a specific client on a message.
   *
   * Use this method when reaction summaries are clipped (too many reacting clients)
   * and you need to check if a specific client has reacted. This is particularly
   * useful for determining if the current user has reacted when they're not in
   * the summary's client list.
   * **Note**: This call occurs over REST, and so does not require the room to be attached.
   * @param messageSerial - The unique identifier of the message
   * @param clientId - The client ID to check (defaults to current client)
   * @returns Promise resolving to reaction data for the specified client
   * @throws {Ably.ErrorInfo} if the operation fails due to network issues
   * @throws {Ably.ErrorInfo} with status code 404 if the message does not exist.
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient } from '@ably/chat';
   *
   * const chatClient = // initialized ChatClient instance
   *
   * const room = await chatClient.rooms.get('large-event');
   * // Attach to receive reaction summaries via subscription
   * await room.attach();
   *
   * // Subscribe to reaction summaries and handle clipped results
   * room.messages.reactions.subscribe(async (event) => {
   *   const myClientId = chatClient.clientId;
   *
   *   // Check if user has reacted with 👍 when summary is clipped
   *   const thumbsUp = event.summary.unique?.['👍'];
   *
   *   if (thumbsUp?.clipped && !thumbsUp.clientIds.includes(myClientId)) {
   *     // Summary doesn't include all clients, fetch specific client data
   *     try {
   *       const clientReactions = await room.messages.reactions.clientReactions(
   *         event.summary.messageSerial,
   *         myClientId
   *       );
   *       if (clientReactions.unique?.['👍']) {
   *         console.log('Current user has given thumbs up');
   *       }
   *     } catch (error) {
   *       console.error('Failed to fetch client reactions:', error);
   *     }
   *   }
   * });
   * ```
   */
  clientReactions(messageSerial: Serial, clientId?: string): Promise<Message['reactions']>;
}

/**
 * Maps Ably PubSub annotation action to message reaction event type.
 */
const eventTypeMap: Record<string, MessageReactionEventType.Create | MessageReactionEventType.Delete> = {
  'annotation.create': MessageReactionEventType.Create,
  'annotation.delete': MessageReactionEventType.Delete,
};

/**
 * @inheritDoc
 */
export class DefaultMessageReactions implements MessageReactions {
  private _emitter = new EventEmitter<{
    [MessageReactionEventType.Create]: MessageReactionRawEvent;
    [MessageReactionEventType.Delete]: MessageReactionRawEvent;
    [MessageReactionEventType.Summary]: MessageReactionSummaryEvent;
  }>();

  private readonly _defaultType: MessageReactionType;
  private readonly _unsubscribeMessageEvents: () => void;
  private readonly _unsubscribeAnnotationEvents?: () => void;

  constructor(
    private readonly _logger: Logger,
    private readonly _options: MessagesOptions | undefined,
    private readonly _api: ChatApi,
    private readonly _roomName: string,
    private readonly _channel: Ably.RealtimeChannel,
  ) {
    // Use subscription helper to create cleanup function
    this._unsubscribeMessageEvents = subscribe(_channel, this._processMessageEvent.bind(this));

    if (this._options?.rawMessageReactions) {
      this._unsubscribeAnnotationEvents = subscribe(_channel.annotations, this._processAnnotationEvent.bind(this));
    }
    this._defaultType = this._options?.defaultMessageReactionType ?? MessageReactionType.Distinct;
  }

  private _processAnnotationEvent(event: Ably.Annotation) {
    this._logger.trace('MessageReactions._processAnnotationEvent();', { event });

    // If we don't know the reaction type, ignore it
    const reactionType = AnnotationTypeToReactionType[event.type];
    if (!reactionType) {
      this._logger.info('MessageReactions._processAnnotationEvent(); ignoring unknown reaction type', { event });
      return;
    }

    // If we don't know the event type, ignore it
    const eventType = eventTypeMap[event.action];
    if (!eventType) {
      this._logger.info('MessageReactions._processAnnotationEvent(); ignoring unknown reaction event type', { event });
      return;
    }

    const name = event.name ?? '';
    const reactionEvent: MessageReactionRawEvent = {
      type: eventType,
      timestamp: new Date(event.timestamp),
      reaction: {
        messageSerial: event.messageSerial,
        type: reactionType,
        name: name,
        clientId: event.clientId ?? '',
      },
    };

    if (event.count) {
      reactionEvent.reaction.count = event.count;
    } else if (eventType === MessageReactionEventType.Create && reactionType === MessageReactionType.Multiple) {
      reactionEvent.reaction.count = 1; // count defaults to 1 for multiple if not set
    }

    this._emitter.emit(eventType, reactionEvent);
  }

  private _processMessageEvent(event: Ably.InboundMessage) {
    this._logger.trace('MessageReactions._processMessageEvent();', { event });

    // only process summary events
    if (event.action !== ChatMessageAction.MessageAnnotationSummary.valueOf()) {
      return;
    }

    // As Chat uses mutable messages, we know that `serial` will be defined, so this cast is ok
    const serial = event.serial as unknown as string;

    // Set the reaction types from the summary
    const summary = event.annotations.summary;

    const unique = (summary[ReactionAnnotationType.Unique] ?? {}) as unknown as Ably.SummaryUniqueValues;
    const distinct = (summary[ReactionAnnotationType.Distinct] ?? {}) as unknown as Ably.SummaryDistinctValues;
    const multiple = (summary[ReactionAnnotationType.Multiple] ?? {}) as Ably.SummaryMultipleValues;

    this._emitter.emit(MessageReactionEventType.Summary, {
      type: MessageReactionEventType.Summary,
      summary: {
        messageSerial: serial,
        unique: unique,
        distinct: distinct,
        multiple: multiple,
      },
    });
  }

  /**
   * @inheritDoc
   */
  send(messageSerial: Serial, params: SendMessageReactionParams): Promise<void> {
    this._logger.trace('MessageReactions.send();', { messageSerial, params });
    const serial = serialToString(messageSerial);

    let { type, count } = params;
    if (!type) {
      type = this._defaultType;
    }
    if (type === MessageReactionType.Multiple && !count) {
      count = 1;
    }
    const apiParams: APISendMessageReactionParams = { type, name: params.name };
    if (count) {
      apiParams.count = count;
    }
    return this._api.sendMessageReaction(this._roomName, serial, apiParams);
  }

  /**
   * @inheritDoc
   */
  delete(messageSerial: Serial, params?: DeleteMessageReactionParams): Promise<void> {
    this._logger.trace('MessageReactions.delete();', { messageSerial, params });
    const serial = serialToString(messageSerial);

    let type = params?.type;
    if (!type) {
      type = this._defaultType;
    }
    if (type !== MessageReactionType.Unique && !params?.name) {
      throw new Ably.ErrorInfo(`cannot delete reaction of type ${type} without a name`, 40001, 400);
    }
    const apiParams: APIDeleteMessageReactionParams = { type };
    if (type !== MessageReactionType.Unique) {
      apiParams.name = params?.name;
    }
    return this._api.deleteMessageReaction(this._roomName, serial, apiParams);
  }

  /**
   * @inheritDoc
   */
  subscribe(listener: MessageReactionListener): Subscription {
    this._logger.trace('MessageReactions.subscribe();');

    const wrapped = wrap(listener);
    this._emitter.on(MessageReactionEventType.Summary, wrapped);
    return {
      unsubscribe: () => {
        this._emitter.off(wrapped);
      },
    };
  }

  /**
   * @inheritDoc
   */
  subscribeRaw(listener: MessageRawReactionListener): Subscription {
    this._logger.trace('MessageReactions.subscribeRaw();');

    if (!this._options?.rawMessageReactions) {
      throw new Ably.ErrorInfo('Raw message reactions are not enabled', 40001, 400);
    }
    const wrapped = wrap(listener);
    this._emitter.on([MessageReactionEventType.Create, MessageReactionEventType.Delete], wrapped);
    return {
      unsubscribe: () => {
        this._emitter.off(wrapped);
      },
    };
  }

  /**
   * Merges the channel options to add support for message reactions.
   * @param roomOptions The room options to merge for.
   * @returns A function that merges the channel options for the room with the ones required for presence.
   */
  static channelOptionMerger(roomOptions: InternalRoomOptions): ChannelOptionsMerger {
    return (options) => {
      // annotation publish is always required for message reactions
      if (!options.modes.includes('ANNOTATION_PUBLISH')) {
        options.modes.push('ANNOTATION_PUBLISH');
      }
      // annotation subscribe is only required if the room has raw message reactions
      if (roomOptions.messages.rawMessageReactions && !options.modes.includes('ANNOTATION_SUBSCRIBE')) {
        options.modes.push('ANNOTATION_SUBSCRIBE');
      }
      return options;
    };
  }

  clientReactions(messageSerial: Serial, clientId?: string): Promise<Message['reactions']> {
    this._logger.trace('MessageReactions.clientReactions();', { messageSerial, clientId });
    const serial = serialToString(messageSerial);
    return this._api.getClientReactions(this._roomName, serial, clientId);
  }

  /**
   * Disposes of the message reactions instance, removing all listeners and subscriptions.
   * This method should be called when the room is being released to ensure proper cleanup.
   * @internal
   */
  dispose(): void {
    this._logger.trace('DefaultMessageReactions.dispose();');

    // Remove all user-level listeners from the emitter
    this._emitter.off();

    // Unsubscribe from channel events using stored unsubscribe functions
    this._unsubscribeMessageEvents();

    // Unsubscribe from annotations if they were enabled
    this._unsubscribeAnnotationEvents?.();

    this._logger.debug('DefaultMessageReactions.dispose(); disposed successfully');
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

import * as Ably from 'ably';

import { AddMessageReactionParams, ChatApi, DeleteMessageReactionParams } from './chat-api.js';
import {
  ChatMessageActions,
  DistinctReactionSummary,
  MessageReactionEvents,
  MessageReactionRawEvent,
  MessageReactionSummaryEvent,
  MessageReactionType,
  MultipleReactionSummary,
  UniqueReactionSummary,
} from './events.js';
import { Logger } from './logger.js';
import { MessageOptions } from './room-options.js';
import { Subscription } from './subscription.js';
import EventEmitter from './utils/event-emitter.js';

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
 * Add, delete, and subscribe to message reactions.
 */
export interface MessagesReactions {
  /**
   * Add a message reactions
   * @param message The message to react to.
   * @param type The type of reaction reference.
   * @param reaction The reaction to add.
   * @param count The count of the reaction for types that support it, default 1.
   * @returns A promise that resolves when the reaction is added.
   */
  add(message: { serial: string }, type: MessageReactionType, reaction: string, count?: number): Promise<void>;

  /**
   * Delete a message reaction
   * @param message The message to remove the reaction from.
   * @param type The type of reaction reference.
   * @param reaction The specific reaction to remove. Required for all types except {@link MessageReactionType.Unique}.
   * @returns A promise that resolves when the reaction is deleted.
   */
  delete(message: { serial: string }, type: MessageReactionType, reaction?: string): Promise<void>;

  /**
   * Subscribe to message reaction summaries. Use this to keep message reaction
   * counts up to date efficiently in the UI.
   * @param listener The listener to call when a message reaction summary is received.
   * @returns A subscription object that should be used to unsubscribe.
   */
  subscribe(listener: MessageReactionListener): Subscription;

  /**
   * Subscribe to individual reaction events.
   * @remarks If you only need to keep track of reaction counts and clients, use
   *  {@link subscribe} instead.
   * @param listener The listener to call when a message reaction event is received.
   * @returns A subscription object that should be used to unsubscribe.
   */
  subscribeRaw(listener: MessageRawReactionListener): Subscription;
}

/**
 * @inheritDoc
 */
export class DefaultMessageReactions implements MessagesReactions {
  private _emitter = new EventEmitter<{
    [MessageReactionEvents.Create]: MessageReactionRawEvent;
    [MessageReactionEvents.Delete]: MessageReactionRawEvent;
    [MessageReactionEvents.Summary]: MessageReactionSummaryEvent;
  }>();

  constructor(
    private readonly _logger: Logger,
    private readonly _options: MessageOptions | undefined,
    private readonly _api: ChatApi,
    private readonly _roomID: string,
    private readonly _channel: Ably.RealtimeChannel,
  ) {
    void _channel.subscribe(this._processMessageEvent.bind(this));
    if (this._options?.rawMessageReactions) {
      void _channel.annotations.subscribe(this._processAnnotationEvent.bind(this));
    }
  }

  private _processAnnotationEvent(event: Ably.Annotation) {
    if (!event.messageSerial) {
      this._logger.debug(
        'DefaultMessageReactions._processAnnotationEvent(); received event with missing messageSerial',
        {
          event,
        },
      );
      return;
    }

    // unknown ref type
    if (!Object.values(MessageReactionType).includes(event.messageSerial as MessageReactionType)) {
      this._logger.debug('DefaultMessageReactions._processAnnotationEvent(); received event with unknown type', {
        event,
      });
      return;
    }
    const reactionType = event.type as MessageReactionType;

    const typeMap: Record<string, MessageReactionEvents.Create | MessageReactionEvents.Delete> = {
      'annotation.create': MessageReactionEvents.Create,
      'annotation.delete': MessageReactionEvents.Delete,
    };

    const eventType = typeMap[event.action];
    if (!eventType) {
      // unknown action
      this._logger.debug('DefaultMessageReactions._processAnnotationEvent(); received event with unknown action', {
        event,
      });
      return;
    }

    let name = event.name;
    if (!name) {
      if (eventType === MessageReactionEvents.Delete && reactionType === MessageReactionType.Unique) {
        // deletes of type unique are allowed to have no data
        name = '';
      } else {
        return;
      }
    }

    const reactionEvent: MessageReactionRawEvent = {
      type: eventType,
      messageSerial: event.messageSerial,
      reactionType: reactionType,
      reaction: name,
      clientId: event.clientId ?? '',
      timestamp: new Date(event.timestamp),
    };
    if (event.count) {
      reactionEvent.count = event.count;
    }
    this._emitter.emit(eventType, reactionEvent);
  }

  private _processMessageEvent(event: Ably.InboundMessage) {
    // only process summary events
    if (event.action !== ChatMessageActions.MessageAnnotationSummary) {
      return;
    }
    // they must have a serial
    if (!event.serial) {
      this._logger.debug('DefaultMessageReactions._processMessageEvent(); received summary without refSerial', {
        event,
      });
      return;
    }
    // they must have a version
    if (!event.version) {
      this._logger.debug('DefaultMessageReactions._processMessageEvent(); received summary without version', { event });
      return;
    }

    const summary = (event.summary ?? {}) as {
      [MessageReactionType.Unique]?: Record<string, UniqueReactionSummary>;
      [MessageReactionType.Distinct]?: Record<string, DistinctReactionSummary>;
      [MessageReactionType.Multiple]?: Record<string, MultipleReactionSummary>;
    };

    const single: Record<string, UniqueReactionSummary> = summary[MessageReactionType.Unique] ?? {};
    const distinct: Record<string, DistinctReactionSummary> = summary[MessageReactionType.Distinct] ?? {};
    const counter: Record<string, MultipleReactionSummary> = summary[MessageReactionType.Multiple] ?? {};

    this._emitter.emit(MessageReactionEvents.Summary, {
      type: MessageReactionEvents.Summary,
      timestamp: new Date(event.timestamp),
      messageSerial: event.serial,
      version: event.version,
      unique: single,
      distinct: distinct,
      multiple: counter,
    });
  }

  /**
   * @inheritDoc
   */
  add(message: { serial: string }, type: MessageReactionType, reaction: string, count?: number): Promise<void> {
    if (type === MessageReactionType.Multiple && !count) {
      count = 1;
    }
    const params: AddMessageReactionParams = { type, reaction };
    if (count) {
      params.count = count;
    }
    return this._api.addMessageReaction(this._roomID, message.serial, params);
  }

  /**
   * @inheritDoc
   */
  delete(message: { serial: string }, type: MessageReactionType, reaction?: string): Promise<void> {
    if (type !== MessageReactionType.Unique && !reaction) {
      throw new Ably.ErrorInfo(`cannot delete reaction of type ${type} without a reaction`, 40001, 400);
    }
    const params: DeleteMessageReactionParams = { type };
    if (type !== MessageReactionType.Unique) {
      params.reaction = reaction;
    }
    return this._api.deleteMessageReaction(this._roomID, message.serial, params);
  }

  /**
   * @inheritDoc
   */
  subscribe(listener: MessageReactionListener): Subscription {
    const unique = (event: MessageReactionSummaryEvent) => {
      listener(event);
    };
    this._emitter.on(MessageReactionEvents.Summary, unique);
    return {
      unsubscribe: () => {
        this._emitter.off(unique);
      },
    };
  }

  /**
   * @inheritDoc
   */
  subscribeRaw(listener: MessageRawReactionListener): Subscription {
    if (!this._options?.rawMessageReactions) {
      throw new Ably.ErrorInfo('Raw message reactions are not enabled', 40001, 400);
    }
    const unique = (event: MessageReactionRawEvent) => {
      listener(event);
    };
    this._emitter.on([MessageReactionEvents.Create, MessageReactionEvents.Delete], unique);
    return {
      unsubscribe: () => {
        this._emitter.off(unique);
      },
    };
  }
}

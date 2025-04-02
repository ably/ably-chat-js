import * as Ably from 'ably';

import {
  AddMessageReactionParams as APIAddMessageReactionParams,
  ChatApi,
  DeleteMessageReactionParams as APIDeleteMessageReactionParams,
} from './chat-api.js';
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

export interface AddMessageReactionParams {
  /**
   * The reaction to add; ie. the emoji.
   */
  reaction: string;

  /**
   * The type of reaction, must be one of {@link MessageReactionType}.
   * If not set, the default type will be used which is configured in the {@link MessageOptions.defaultMessageReactionType} of the room.
   */
  type?: MessageReactionType;

  /**
   * The count of the reaction for type {@link MessageReactionType.Multiple}.
   * Defaults to 1 if not set. Not supported for other reaction types.
   * @default 1
   */
  count?: number;
}

export interface DeleteMessageReactionParams {
  /**
   * The reaction to add; ie. the emoji. Required for all reaction types
   * except {@link MessageReactionType.Unique}.
   */
  reaction?: string;

  /**
   * The type of reaction, must be one of {@link MessageReactionType}.
   * If not set, the default type will be used which is configured in the {@link MessageOptions.defaultMessageReactionType} of the room.
   */
  type?: MessageReactionType;
}

/**
 * Add, delete, and subscribe to message reactions.
 */
export interface MessagesReactions {
  /**
   * Add a message reactions
   * @param message The message to react to.
   * @param params Describe the reaction to add.
   * @returns A promise that resolves when the reaction is added.
   */
  add(message: { serial: string }, params: AddMessageReactionParams): Promise<void>;

  /**
   * Delete a message reaction
   * @param message The message to remove the reaction from.
   * @param params The type of reaction annotation and the specific reaction to remove. The reaction to remove is required for all types except {@link MessageReactionType.Unique}.
   * @returns A promise that resolves when the reaction is deleted.
   */
  delete(message: { serial: string }, params?: DeleteMessageReactionParams): Promise<void>;

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

  private _defaultType: MessageReactionType;

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
    this._defaultType = this._options?.defaultMessageReactionType ?? MessageReactionType.Distinct;
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


    console.log("received summary type = ", typeof event.summary, "is map = ", event.summary instanceof Map, "value = ", event.summary);
    // todo: update when this is resolved https://github.com/ably/ably-js/pull/1953#discussion_r2024650969

    const summary = (event.summary ?? {}) as {
      [MessageReactionType.Unique]?: Record<string, UniqueReactionSummary>;
      [MessageReactionType.Distinct]?: Record<string, DistinctReactionSummary>;
      [MessageReactionType.Multiple]?: Record<string, MultipleReactionSummary>;
    };

    // const summary = event.summary ?? new Map<string, unknown>();

    const single: Record<string, UniqueReactionSummary> = summary[MessageReactionType.Unique] ?? {};
    const distinct: Record<string, DistinctReactionSummary> = summary[MessageReactionType.Distinct] ?? {};
    const counter: Record<string, MultipleReactionSummary> = summary[MessageReactionType.Multiple] ?? {};



    // const summary = event.summary ?? new Map<string, unknown>();
    
    // const single = (summary.get(MessageReactionType.Unique) as Record<string, UniqueReactionSummary>) ?? {};
    // const distinct = (summary.get(MessageReactionType.Distinct) as Record<string, DistinctReactionSummary>) ?? {};
    // const counter = (summary.get(MessageReactionType.Multiple) as Record<string, MultipleReactionSummary>) ?? {};


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
  add(message: { serial: string }, params: AddMessageReactionParams): Promise<void> {
    let { type, count } = params;
    if (!type) {
      type = this._defaultType;
    }
    if (type === MessageReactionType.Multiple && !count) {
      count = 1;
    }
    const apiParams: APIAddMessageReactionParams = { type, reaction: params.reaction };
    if (count) {
      apiParams.count = count;
    }
    return this._api.addMessageReaction(this._roomID, message.serial, apiParams);
  }

  /**
   * @inheritDoc
   */
  delete(message: { serial: string }, params: DeleteMessageReactionParams): Promise<void> {
    let type = params.type;
    if (!type) {
      type = this._defaultType;
    }
    if (type !== MessageReactionType.Unique && !params.reaction) {
      throw new Ably.ErrorInfo(`cannot delete reaction of type ${type} without a reaction`, 40001, 400);
    }
    const apiParams: APIDeleteMessageReactionParams = { type };
    if (type !== MessageReactionType.Unique) {
      apiParams.reaction = params.reaction;
    }
    return this._api.deleteMessageReaction(this._roomID, message.serial, apiParams);
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

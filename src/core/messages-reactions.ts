import * as Ably from 'ably';

import { ChannelOptionsMerger } from './channel-manager.js';
import {
  AddMessageReactionParams as APIAddMessageReactionParams,
  ChatApi,
  DeleteMessageReactionParams as APIDeleteMessageReactionParams,
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
import { InternalRoomOptions, MessageOptions } from './room-options.js';
import { Serial, serialToString } from './serial.js';
import { Subscription } from './subscription.js';
import EventEmitter, { wrap } from './utils/event-emitter.js';

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
 * Parameters for adding a message reaction.
 */
export interface AddMessageReactionParams {
  /**
   * The reaction name to add; ie. the emoji.
   */
  name: string;

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
   * @param messageSerial The serial of the message to react to
   * @param params Describe the reaction to add.
   * @returns A promise that resolves when the reaction is added.
   */
  send(messageSerial: Serial, params: AddMessageReactionParams): Promise<void>;

  /**
   * Delete a message reaction
   * @param messageSerial The serial of the message to remove the reaction from.
   * @param params The type of reaction annotation and the specific reaction to remove. The reaction to remove is required for all types except {@link MessageReactionType.Unique}.
   * @returns A promise that resolves when the reaction is deleted.
   */
  delete(messageSerial: Serial, params?: DeleteMessageReactionParams): Promise<void>;

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
 * Maps Ably PubSub annotation action to message reaction event type.
 */
const eventTypeMap: Record<string, MessageReactionEventType.Create | MessageReactionEventType.Delete> = {
  'annotation.create': MessageReactionEventType.Create,
  'annotation.delete': MessageReactionEventType.Delete,
};

/**
 * @inheritDoc
 */
export class DefaultMessageReactions implements MessagesReactions {
  private _emitter = new EventEmitter<{
    [MessageReactionEventType.Create]: MessageReactionRawEvent;
    [MessageReactionEventType.Delete]: MessageReactionRawEvent;
    [MessageReactionEventType.Summary]: MessageReactionSummaryEvent;
  }>();

  private readonly _defaultType: MessageReactionType;

  constructor(
    private readonly _logger: Logger,
    private readonly _options: MessageOptions | undefined,
    private readonly _api: ChatApi,
    private readonly _roomName: string,
    private readonly _channel: Ably.RealtimeChannel,
  ) {
    void _channel.subscribe(this._processMessageEvent.bind(this));
    if (this._options?.rawMessageReactions) {
      void _channel.annotations.subscribe(this._processAnnotationEvent.bind(this));
    }
    this._defaultType = this._options?.defaultMessageReactionType ?? MessageReactionType.Distinct;
  }

  private _processAnnotationEvent(event: Ably.Annotation) {
    this._logger.trace('MessagesReactions._processAnnotationEvent();', { event });

    if (!event.messageSerial) {
      this._logger.warn(
        'DefaultMessageReactions._processAnnotationEvent(); received event with missing messageSerial',
        {
          event,
        },
      );
      return;
    }

    const reactionType = AnnotationTypeToReactionType[event.type];

    // unknown reaction type, meaning we've received an unknown annotation type
    if (!reactionType) {
      this._logger.debug('DefaultMessageReactions._processAnnotationEvent(); received event with unknown type', {
        event,
      });
      return;
    }

    const eventType = eventTypeMap[event.action];
    if (!eventType) {
      // unknown action
      this._logger.warn('DefaultMessageReactions._processAnnotationEvent(); received event with unknown action', {
        event,
      });
      return;
    }

    let name = event.name;
    if (!name) {
      if (eventType === MessageReactionEventType.Delete && reactionType === MessageReactionType.Unique) {
        // deletes of type unique are allowed to have no data
        name = '';
      } else {
        return;
      }
    }

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
    this._logger.trace('MessagesReactions._processMessageEvent();', { event });

    // only process summary events
    if (event.action !== ChatMessageAction.MessageAnnotationSummary) {
      return;
    }
    if (!event.summary) {
      // This means the summary is now empty, which is valid.
      // Happens when there are no reactions such as after deleting the last reaction.
      event.summary = {};
    }

    // they must have a serial
    if (!event.serial) {
      this._logger.warn('DefaultMessageReactions._processMessageEvent(); received summary without serial', {
        event,
      });
      return;
    }

    const unique = (event.summary[ReactionAnnotationType.Unique] ?? {}) as unknown as Ably.SummaryUniqueValues;
    const distinct = (event.summary[ReactionAnnotationType.Distinct] ?? {}) as unknown as Ably.SummaryDistinctValues;
    const multiple = (event.summary[ReactionAnnotationType.Multiple] ?? {}) as Ably.SummaryMultipleValues;

    this._emitter.emit(MessageReactionEventType.Summary, {
      type: MessageReactionEventType.Summary,
      summary: {
        messageSerial: event.serial,
        unique: unique,
        distinct: distinct,
        multiple: multiple,
      },
    });
  }

  /**
   * @inheritDoc
   */
  send(messageSerial: Serial, params: AddMessageReactionParams): Promise<void> {
    this._logger.trace('MessagesReactions.add();', { messageSerial, params });
    const serial = serialToString(messageSerial);

    let { type, count } = params;
    if (!type) {
      type = this._defaultType;
    }
    if (type === MessageReactionType.Multiple && !count) {
      count = 1;
    }
    const apiParams: APIAddMessageReactionParams = { type, name: params.name };
    if (count) {
      apiParams.count = count;
    }
    return this._api.addMessageReaction(this._roomName, serial, apiParams);
  }

  /**
   * @inheritDoc
   */
  delete(messageSerial: Serial, params?: DeleteMessageReactionParams): Promise<void> {
    this._logger.trace('MessagesReactions.delete();', { messageSerial, params });
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
    this._logger.trace('MessagesReactions.subscribe();');

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
    this._logger.trace('MessagesReactions.subscribeRaw();');

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
   *
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
}

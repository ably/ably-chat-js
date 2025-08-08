import * as Ably from 'ably';

import { ChatApi } from './chat-api.js';
import { ChatMessageAction, ChatMessageEvent, ChatMessageEventType, RealtimeMessageName } from './events.js';
import { Logger } from './logger.js';
import {
  DefaultMessage,
  emptyMessageReactions,
  Message,
  MessageHeaders,
  MessageMetadata,
  MessageOperationMetadata,
} from './message.js';
import { parseMessage } from './message-parser.js';
import { DefaultMessageReactions, MessagesReactions } from './messages-reactions.js';
import { PaginatedResult } from './query.js';
import { on, once, subscribe } from './realtime-subscriptions.js';
import { messageFromRest } from './rest-types.js';
import { MessageOptions } from './room-options.js';
import { Serial, serialToString } from './serial.js';
import { Subscription } from './subscription.js';
import EventEmitter, { emitterHasListeners, wrap } from './utils/event-emitter.js';

/**
 * Event names and their respective payloads emitted by the messages feature.
 */
interface MessageEventsMap {
  [ChatMessageEventType.Created]: ChatMessageEvent;
  [ChatMessageEventType.Updated]: ChatMessageEvent;
  [ChatMessageEventType.Deleted]: ChatMessageEvent;
}

/**
 * Mapping of chat message actions to message events.
 */
const MessageActionsToEventsMap: Map<ChatMessageAction, ChatMessageEventType> = new Map<
  ChatMessageAction,
  ChatMessageEventType
>([
  [ChatMessageAction.MessageCreate, ChatMessageEventType.Created],
  [ChatMessageAction.MessageUpdate, ChatMessageEventType.Updated],
  [ChatMessageAction.MessageDelete, ChatMessageEventType.Deleted],
]);

/**
 * The order in which results should be returned when performing a paginated query (e.g. message history).
 */
export enum OrderBy {
  /**
   * Return results in ascending order (oldest first).
   */
  OldestFirst = 'oldestFirst',

  /**
   * Return results in descending order (newest first).
   */
  NewestFirst = 'newestFirst',
}

/**
 * Options for querying messages in a chat room.
 */
export interface QueryOptions {
  /**
   * The start of the time window to query from. If provided, the response will include
   * messages with timestamps equal to or greater than this value.
   * @defaultValue The beginning of time
   */
  start?: number;

  /**
   * The end of the time window to query from. If provided, the response will include
   * messages with timestamps less than this value.
   * @defaultValue Now
   */
  end?: number;

  /**
   * The maximum number of messages to return in the response.
   * @defaultValue 100
   */
  limit?: number;

  /**
   * The direction to query messages in.
   * If {@link OrderBy.OldestFirst}, the response will include messages from the start of the time window to the end.
   * If {@link OrderBy.NewestFirst}, the response will include messages from the end of the time window to the start.
   * If not provided, the default is {@link OrderBy.NewestFirst}.
   * @defaultValue {@link OrderBy.NewestFirst}
   */
  orderBy?: OrderBy;
}

/**
 * The parameters supplied to a message action like delete or update.
 */
export interface OperationDetails {
  /**
   * Optional description for the message action.
   */
  description?: string;

  /**
   * Optional metadata that will be added to the action. Defaults to empty.
   *
   */
  metadata?: MessageOperationMetadata;
}

/**
 * Parameters for updating a message.
 */
export interface UpdateMessageParams {
  /**
   * The new text of the message.
   */
  text: string;

  /**
   * Optional metadata of the message.
   */
  metadata?: MessageMetadata;

  /**
   * Optional headers of the message.
   */
  headers?: MessageHeaders;
}

/**
 * Parameters for deleting a message.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DeleteMessageParams extends OperationDetails {}

/**
 * Params for sending a text message. Only `text` is mandatory.
 */
export interface SendMessageParams {
  /**
   * The text of the message.
   */
  text: string;

  /**
   * Optional metadata of the message.
   *
   * The metadata is a map of extra information that can be attached to chat
   * messages. It is not used by Ably and is sent as part of the realtime
   * message payload. Example use cases are setting custom styling like
   * background or text colors or fonts, adding links to external images,
   * emojis, etc.
   *
   * Do not use metadata for authoritative information. There is no server-side
   * validation. When reading the metadata, treat it like user input.
   *
   */
  metadata?: MessageMetadata;

  /**
   * Optional headers of the message.
   *
   * The headers are a flat key-value map and are sent as part of the realtime
   * message's extras inside the `headers` property. They can serve similar
   * purposes as the metadata, but they are read by Ably and can be used for
   * features such as
   * [subscription filters](https://faqs.ably.com/subscription-filters).
   *
   * Do not use the headers for authoritative information. There is no
   * server-side validation. When reading the headers, treat them like user
   * input.
   *
   */
  headers?: MessageHeaders;
}

/**
 * A listener for message events in a chat room.
 * @param event The message event that was received.
 */
export type MessageListener = (event: ChatMessageEvent) => void;

/**
 * A response object that allows you to control a message subscription.
 */
export interface MessageSubscriptionResponse extends Subscription {
  /**
   * Get the previous messages that were sent to the room before the listener was subscribed.
   *
   * If the client experiences a discontinuity event (i.e. the connection was lost and could not be resumed), the starting point of
   * historyBeforeSubscribe will be reset.
   *
   * Calls to historyBeforeSubscribe will wait for continuity to be restored before resolving.
   *
   * Once continuity is restored, the subscription point will be set to the beginning of this new period of continuity. To
   * ensure that no messages are missed, you should call historyBeforeSubscribe after any period of discontinuity to
   * fill any gaps in the message history.
   *
   * ```typescript
   * const { historyBeforeSubscribe } = room.messages.subscribe(listener);
   * await historyBeforeSubscribe({ limit: 10 });
   * ```
   * @param params Options for the history query.
   * @returns A promise that resolves with the paginated result of messages, in newest-to-oldest order.
   */
  historyBeforeSubscribe(params: Omit<QueryOptions, 'orderBy'>): Promise<PaginatedResult<Message>>;
}

/**
 * This interface is used to interact with messages in a chat room: subscribing
 * to new messages, fetching history, or sending messages.
 *
 * Get an instance via {@link Room.messages}.
 */
export interface Messages {
  /**
   * Subscribe to new messages in this chat room.
   * @param listener callback that will be called
   * @returns A response object that allows you to control the subscription.
   */
  subscribe(listener: MessageListener): MessageSubscriptionResponse;

  /**
   * Get messages that have been previously sent to the chat room, based on the provided options.
   * @param options Options for the query.
   * @returns A promise that resolves with the paginated result of messages. This paginated result can
   * be used to fetch more messages if available.
   */
  history(options: QueryOptions): Promise<PaginatedResult<Message>>;

  /**
   * Get a message by its serial.
   * @param serial The serial of the message to get.
   * @returns A promise that resolves with the message.
   */
  get(serial: Serial): Promise<Message>;

  /**
   * Send a message in the chat room.
   *
   * This method uses the Ably Chat API endpoint for sending messages.
   *
   * Note that the Promise may resolve before OR after the message is received
   * from the realtime channel. This means you may see the message that was just
   * sent in a callback to `subscribe` before the returned promise resolves.
   * @param params an object containing {text, headers, metadata} for the message
   * to be sent. Text is required, metadata and headers are optional.
   * @returns A promise that resolves when the message was published.
   */
  send(params: SendMessageParams): Promise<Message>;

  /**
   * Delete a message in the chat room.
   *
   * This method uses the Ably Chat API REST endpoint for deleting messages.
   * It performs a `soft` delete, meaning the message is marked as deleted.
   *
   * Note that the Promise may resolve before OR after the message is deleted
   * from the realtime channel. This means you may see the message that was just
   * deleted in a callback to `subscribe` before the returned promise resolves.
   *
   * NOTE: The Message instance returned by this method is the state of the message as a result of the delete operation.
   * If you have a subscription to message events via `subscribe`, you should discard the message instance returned by
   * this method and use the event payloads from the subscription instead.
   *
   * Should you wish to restore a deleted message, and providing you have the appropriate permissions,
   * you can simply send an update to the original message.
   * Note: This is subject to change in future versions, whereby a new permissions model will be introduced
   * and a deleted message may not be restorable in this way.
   * @returns A promise that resolves when the message was deleted.
   * @param serial - A string or object that conveys the serial of the message to delete.
   * @param deleteMessageParams - Optional details to record about the delete action.
   * @returns A promise that resolves to the deleted message.
   */
  delete(serial: Serial, deleteMessageParams?: DeleteMessageParams): Promise<Message>;

  /**
   * Update a message in the chat room.
   *
   * Note that the Promise may resolve before OR after the updated message is
   * received from the realtime channel. This means you may see the update that
   * was just sent in a callback to `subscribe` before the returned promise
   * resolves.
   *
   * NOTE: The Message instance returned by this method is the state of the message as a result of the update operation.
   * If you have a subscription to message events via `subscribe`, you should discard the message instance returned by
   * this method and use the event payloads from the subscription instead.
   *
   * This method uses PUT-like semantics: if headers and metadata are omitted from the updateParams, then
   * the existing headers and metadata are replaced with the empty objects.
   * @param serial - A string or object that conveys the serial of the message to update.
   * @param updateParams - The parameters for updating the message.
   * @param details - Optional details to record about the update action.
   * @returns A promise of the updated message.
   */
  update(serial: Serial, updateParams: UpdateMessageParams, details?: OperationDetails): Promise<Message>;

  /**
   * Send, delete, and subscribe to message reactions.
   */
  reactions: MessagesReactions;
}

/**
 * @inheritDoc
 */
export class DefaultMessages implements Messages {
  private readonly _roomName: string;
  private readonly _options: MessageOptions;
  private readonly _channel: Ably.RealtimeChannel;
  private readonly _chatApi: ChatApi;
  private readonly _clientId: string;
  private readonly _listenerSubscriptionPoints: Map<
    MessageListener,
    Promise<{
      fromSerial: string;
    }>
  >;
  private readonly _pendingPromiseRejecters = new Set<(error: Error) => void>();
  private readonly _pendingAttachListeners = new Set<() => void>();
  private readonly _logger: Logger;
  private readonly _emitter = new EventEmitter<MessageEventsMap>();
  private readonly _unsubscribeMessageEvents: () => void;
  private readonly _offChannelAttached: () => void;
  private readonly _offChannelUpdate: () => void;
  private readonly _reactions: DefaultMessageReactions;

  /**
   * Constructs a new `DefaultMessages` instance.
   * @param roomName The unique identifier of the room.
   * @param options The room options for the messages.
   * @param channel An instance of the Realtime channel for the room.
   * @param chatApi An instance of the ChatApi.
   * @param clientId The client ID of the user.
   * @param logger An instance of the Logger.
   */
  constructor(
    roomName: string,
    options: MessageOptions,
    channel: Ably.RealtimeChannel,
    chatApi: ChatApi,
    clientId: string,
    logger: Logger,
  ) {
    this._roomName = roomName;
    this._options = options;
    this._channel = channel;
    this._chatApi = chatApi;
    this._clientId = clientId;
    this._logger = logger;
    this._listenerSubscriptionPoints = new Map<MessageListener, Promise<{ fromSerial: string }>>();

    this._reactions = new DefaultMessageReactions(this._logger, options, this._chatApi, this._roomName, this._channel);

    // Create bound listeners
    const messageEventsListener = this._processEvent.bind(this);
    const channelAttachedListener = (stateChange: Ably.ChannelStateChange) => {
      this._handleAttach(stateChange.resumed);
    };
    const channelUpdateListener = (stateChange: Ably.ChannelStateChange) => {
      if (stateChange.current === 'attached' && stateChange.previous === 'attached') {
        this._handleAttach(stateChange.resumed);
      }
    };

    // Use subscription helpers to create cleanup functions
    this._unsubscribeMessageEvents = subscribe(this._channel, [RealtimeMessageName.ChatMessage], messageEventsListener);
    this._offChannelAttached = on(this._channel, 'attached', channelAttachedListener);
    this._offChannelUpdate = on(this._channel, 'update', channelUpdateListener);
  }

  /**
   * @inheritdoc
   */
  get reactions(): MessagesReactions {
    return this._reactions;
  }

  /**
   * @inheritdoc
   */
  private async _getBeforeSubscriptionStart(
    listener: MessageListener,
    params: Omit<QueryOptions, 'orderBy'>,
  ): Promise<PaginatedResult<Message>> {
    this._logger.trace(`DefaultSubscriptionManager.getBeforeSubscriptionStart();`);

    const subscriptionPoint = this._listenerSubscriptionPoints.get(listener);

    if (subscriptionPoint === undefined) {
      this._logger.error(
        `DefaultSubscriptionManager.getBeforeSubscriptionStart(); listener has not been subscribed yet`,
      );
      throw new Ably.ErrorInfo(
        'cannot query history; listener has not been subscribed yet',
        40000,
        400,
      ) as unknown as Error;
    }

    // Get the subscription point of the listener
    const subscriptionPointParams = await subscriptionPoint;

    // Query messages from the subscription point to the start of the time window
    return this._chatApi.history(this._roomName, {
      ...params,
      orderBy: OrderBy.NewestFirst,
      ...subscriptionPointParams,
    });
  }

  /**
   * Handle the case where the channel experiences a detach and reattaches.
   * @param fromResume Whether the attach is from a resume operation.
   */
  private _handleAttach(fromResume: boolean) {
    this._logger.trace(`DefaultSubscriptionManager.handleAttach();`);

    // Do nothing if we have resumed as there is no discontinuity in the message stream
    if (fromResume) return;

    // Reset subscription points for all listeners
    const newSubscriptionStartResolver = this._subscribeAtChannelAttach();
    for (const [listener] of this._listenerSubscriptionPoints.entries()) {
      this._listenerSubscriptionPoints.set(listener, newSubscriptionStartResolver);
    }
  }

  /**
   * Create a promise that resolves with the attachSerial of the channel or the serial of the latest message.
   * @returns A promise that resolves to an object containing fromSerial and subscriptionPoint.
   */
  private async _resolveSubscriptionStart(): Promise<{
    fromSerial: string;
  }> {
    const channelWithProperties = this._getChannelProperties();

    // If we are attached, we can resolve with the channelSerial
    if (channelWithProperties.state === 'attached') {
      if (channelWithProperties.properties.channelSerial) {
        return { fromSerial: channelWithProperties.properties.channelSerial };
      }
      this._logger.error(`DefaultSubscriptionManager.handleAttach(); channelSerial is undefined`);
      throw new Ably.ErrorInfo('channel is attached, but channelSerial is not defined', 40000, 400) as unknown as Error;
    }

    return this._subscribeAtChannelAttach();
  }

  private _getChannelProperties(): Ably.RealtimeChannel & {
    properties: { attachSerial: string | undefined; channelSerial: string | undefined };
  } {
    // Get the attachSerial from the channel properties
    return this._channel as Ably.RealtimeChannel & {
      properties: {
        attachSerial: string | undefined;
        channelSerial: string | undefined;
      };
    };
  }

  private async _subscribeAtChannelAttach(): Promise<{ fromSerial: string }> {
    const channelWithProperties = this._getChannelProperties();
    return new Promise((resolve, reject) => {
      // Store the reject function so we can call it during disposal
      this._pendingPromiseRejecters.add(reject);

      const cleanup = () => {
        this._pendingPromiseRejecters.delete(reject);
      };

      // Check if the state is now attached
      if (channelWithProperties.state === 'attached') {
        // Get the attachSerial from the channel properties
        // AttachSerial should always be defined at this point, but we check just in case
        this._logger.debug('Messages._subscribeAtChannelAttach(); channel is attached already, using attachSerial', {
          attachSerial: channelWithProperties.properties.attachSerial,
        });
        cleanup();

        if (channelWithProperties.properties.attachSerial) {
          resolve({ fromSerial: channelWithProperties.properties.attachSerial });
        } else {
          this._logger.error(`DefaultSubscriptionManager.handleAttach(); attachSerial is undefined`);
          cleanup();
          reject(
            new Ably.ErrorInfo('channel is attached, but attachSerial is not defined', 40000, 400) as unknown as Error,
          );
        }
        return;
      }

      const offAttachedListener = once(channelWithProperties, 'attached', () => {
        // Get the attachSerial from the channel properties
        // AttachSerial should always be defined at this point, but we check just in case
        this._logger.debug('Messages._subscribeAtChannelAttach(); channel is now attached, using attachSerial', {
          attachSerial: channelWithProperties.properties.attachSerial,
        });
        cleanup();
        this._pendingAttachListeners.delete(offAttachedListener);

        if (channelWithProperties.properties.attachSerial) {
          resolve({ fromSerial: channelWithProperties.properties.attachSerial });
        } else {
          this._logger.error(`DefaultSubscriptionManager.handleAttach(); attachSerial is undefined`);
          reject(
            new Ably.ErrorInfo('channel is attached, but attachSerial is not defined', 40000, 400) as unknown as Error,
          );
        }
      });

      this._pendingAttachListeners.add(offAttachedListener);
    });
  }

  /**
   * @inheritdoc
   */
  async history(options: QueryOptions): Promise<PaginatedResult<Message>> {
    this._logger.trace('Messages.query();');
    return this._chatApi.history(this._roomName, options);
  }

  /**
   * @inheritdoc
   */
  get(serial: Serial): Promise<Message> {
    this._logger.trace('Messages.get();', { serial });
    return this._chatApi.getMessage(this._roomName, serialToString(serial));
  }

  /**
   * @inheritdoc
   */
  async send(params: SendMessageParams): Promise<Message> {
    this._logger.trace('Messages.send();', { params });

    const { text, metadata, headers } = params;

    const response = await this._chatApi.sendMessage(this._roomName, { text, headers, metadata });
    return new DefaultMessage({
      serial: response.serial,
      clientId: this._clientId,
      text: text,
      metadata: metadata ?? {},
      headers: headers ?? {},
      action: ChatMessageAction.MessageCreate,
      version: response.serial,
      createdAt: new Date(response.createdAt),
      timestamp: new Date(response.createdAt), // timestamp is the same as createdAt for new messages
      reactions: emptyMessageReactions(),
    });
  }

  /**
   * @inheritdoc
   */
  async delete(serial: Serial, params?: DeleteMessageParams): Promise<Message> {
    this._logger.trace('Messages.delete();', { params });

    serial = serialToString(serial);
    this._logger.debug('Messages.delete(); serial', { serial });
    const response = await this._chatApi.deleteMessage(this._roomName, serial, params);

    return messageFromRest(response.message);
  }

  /**
   * @inheritdoc
   */
  async update(serial: Serial, updateParams: UpdateMessageParams, details?: OperationDetails): Promise<Message> {
    this._logger.trace('Messages.update();', { updateParams, details });

    serial = serialToString(serial);
    this._logger.debug('Messages.update(); serial', { serial });
    const response = await this._chatApi.updateMessage(this._roomName, serial, {
      message: {
        text: updateParams.text,
        metadata: updateParams.metadata,
        headers: updateParams.headers,
      },
      ...details,
    });

    this._logger.debug('Messages.update(); message update successfully', { updateParams });
    return messageFromRest(response.message);
  }

  /**
   * @inheritdoc
   */
  subscribe(listener: MessageListener): MessageSubscriptionResponse {
    this._logger.trace('Messages.subscribe();');
    const wrapped = wrap(listener);
    this._emitter.on(
      [ChatMessageEventType.Created, ChatMessageEventType.Updated, ChatMessageEventType.Deleted],
      wrapped,
    );

    // Set the subscription point to a promise that resolves when the channel attaches or with the latest message
    const resolvedSubscriptionStart = this._resolveSubscriptionStart();

    // Add a handler for unhandled rejections in case the room is released before the subscription point is resolved
    resolvedSubscriptionStart.catch(() => {
      this._logger.debug('Messages.subscribe(); subscription point was not resolved before the room was released');
    });

    this._listenerSubscriptionPoints.set(wrapped, resolvedSubscriptionStart);

    return {
      unsubscribe: () => {
        // Remove the wrapped listener from the subscription points
        this._listenerSubscriptionPoints.delete(wrapped);
        this._logger.trace('Messages.unsubscribe();');
        this._emitter.off(wrapped);
      },
      historyBeforeSubscribe: (params: Omit<QueryOptions, 'orderBy'>) =>
        this._getBeforeSubscriptionStart(wrapped, params),
    };
  }

  private _processEvent(channelEventMessage: Ably.InboundMessage) {
    this._logger.trace('Messages._processEvent();', {
      channelEventMessage,
    });
    const { action } = channelEventMessage;
    const event = MessageActionsToEventsMap.get(action as ChatMessageAction);
    if (!event) {
      this._logger.debug('Messages._processEvent(); received unknown message action', { action });
      return;
    }
    // Send the message to the listeners
    const message = parseMessage(channelEventMessage);
    this._emitter.emit(event, { type: event, message: message });
  }

  /**
   * Disposes of the messages instance, removing all listeners and subscriptions.
   * This method should be called when the room is being released to ensure proper cleanup.
   * @internal
   */
  dispose(): void {
    this._logger.trace('DefaultMessages.dispose();');

    // Remove all user-level listeners from the emitter
    this._emitter.off();

    // Reject all pending subscription point promises to break circular references
    const disposalError = new Ably.ErrorInfo('room has been disposed', 40000, 400) as unknown as Error;
    for (const rejectFn of this._pendingPromiseRejecters) {
      try {
        rejectFn(disposalError);
      } catch {
        // Ignore errors from already resolved/rejected promises
      }
    }
    this._pendingPromiseRejecters.clear();

    // Clear all subscription points
    this._listenerSubscriptionPoints.clear();

    // Remove all pending attach listeners
    for (const offAttachedListener of this._pendingAttachListeners) {
      offAttachedListener();
    }
    this._pendingAttachListeners.clear();

    // Unsubscribe from channel events using stored unsubscribe functions
    this._unsubscribeMessageEvents();

    // Remove specific channel state listeners using stored unsubscribe functions
    this._offChannelAttached();
    this._offChannelUpdate();

    // Dispose of the reactions instance
    this._reactions.dispose();

    this._logger.debug('DefaultMessages.dispose(); disposed successfully');
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

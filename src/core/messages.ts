import * as Ably from 'ably';

import { messagesChannelName } from './channel.js';
import { ChannelManager } from './channel-manager.js';
import { ChatApi } from './chat-api.js';
import {
  DiscontinuityEmitter,
  DiscontinuityListener,
  EmitsDiscontinuities,
  HandlesDiscontinuity,
  newDiscontinuityEmitter,
  OnDiscontinuitySubscriptionResponse,
} from './discontinuity.js';
import { ErrorCodes } from './errors.js';
import { ChatMessageActions, MessageEvents, RealtimeMessageNames } from './events.js';
import { Logger } from './logger.js';
import {
  DefaultMessage,
  Message,
  MessageHeaders,
  MessageMetadata,
  MessageOperationMetadata,
  MessageReactionSummary,
} from './message.js';
import {
  MessageActionsToEventsMap,
  MessageEventsMap,
  MessageListener,
  MessageListenerObject,
} from './message-events.js';
import { parseMessage } from './message-parser.js';
import { PaginatedResult } from './query.js';
import { addListenerToChannelWithoutAttach } from './realtime-extensions.js';
import { ContributesToRoomLifecycle } from './room-lifecycle-manager.js';
import EventEmitter from './utils/event-emitter.js';

const ReactionEmojiV1 = 'reaction:emoji.v1';

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
   *
   * @defaultValue The beginning of time
   */
  start?: number;

  /**
   * The end of the time window to query from. If provided, the response will include
   * messages with timestamps less than this value.
   *
   * @defaultValue Now
   */
  end?: number;

  /**
   * The maximum number of messages to return in the response.
   *
   * @defaultValue 100
   */
  limit?: number;

  /**
   * The direction to query messages in.
   * If {@link OrderBy.OldestFirst}, the response will include messages from the start of the time window to the end.
   * If {@link OrderBy.NewestFirst}, the response will include messages from the end of the time window to the start.
   * If not provided, the default is {@link OrderBy.NewestFirst}.
   *
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
 * Params for updating a message. It accepts all parameters that sending a
 * message accepts.
 *
 * Note that updating a message replaces the whole previous message, so all
 * metadata and headers that should be kept must be set in the update request,
 * or they will be lost.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface UpdateMessageParams extends SendMessageParams {}

/**
 * A response object that allows you to control a message subscription.
 */
export interface MessageSubscriptionResponse {
  /**
   * Unsubscribe the listener registered with {@link Messages.subscribe} from message events.
   */
  unsubscribe: () => void;

  /**
   * Get the previous messages that were sent to the room before the listener was subscribed.
   * @param params Options for the history query.
   * @returns A promise that resolves with the paginated result of messages, in newest-to-oldest order.
   */
  getPreviousMessages(params: Omit<QueryOptions, 'orderBy'>): Promise<PaginatedResult<Message>>;
}

/**
 * This interface is used to interact with messages in a chat room: subscribing
 * to new messages, fetching history, or sending messages.
 *
 * Get an instance via {@link Room.messages}.
 */
export interface Messages extends EmitsDiscontinuities {
  /**
   * Subscribe to new messages in this chat room.
   * @param listener callback that will be called
   * @returns A response object that allows you to control the subscription.
   */
  subscribe(listener: MessageListener | MessageListenerObject): MessageSubscriptionResponse;

  /**
   * Unsubscribe all listeners from new messages in the chat room.
   */
  unsubscribeAll(): void;

  /**
   * Get messages that have been previously sent to the chat room, based on the provided options.
   *
   * @param options Options for the query.
   * @returns A promise that resolves with the paginated result of messages. This paginated result can
   * be used to fetch more messages if available.
   */
  get(options: QueryOptions): Promise<PaginatedResult<Message>>;

  /**
   * Send a message in the chat room.
   *
   * This method uses the Ably Chat API endpoint for sending messages.
   *
   * Note that the Promise may resolve before OR after the message is received
   * from the realtime channel. This means you may see the message that was just
   * sent in a callback to `subscribe` before the returned promise resolves.
   *
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
   * Should you wish to restore a deleted message, and providing you have the appropriate permissions,
   * you can simply send an update to the original message.
   * Note: This is subject to change in future versions, whereby a new permissions model will be introduced
   * and a deleted message may not be restorable in this way.
   *
   * @returns A promise that resolves when the message was deleted.
   * @param message - The message to delete.
   * @param deleteMessageParams - Optional details to record about the delete action.
   * @return A promise that resolves to the deleted message.
   */
  delete(message: Message, deleteMessageParams?: DeleteMessageParams): Promise<Message>;

  /**
   * Update a message in the chat room.
   *
   * Note that the Promise may resolve before OR after the updated message is
   * received from the realtime channel. This means you may see the update that
   * was just sent in a callback to `subscribe` before the returned promise
   * resolves.
   *
   * @param message The message to update.
   * @param update The new message content including headers and metadata. This
   * fully replaces the old content. Everything that's not set will be removed.
   * @param details Optional details to record about the update action.
   * @returns A promise of the updated message.
   */
  update(message: Message, update: UpdateMessageParams, details?: OperationDetails): Promise<Message>;

  /**
   * Message reactions
   */
  reactions : DefaultMessageReactions;

  /**
   * Get the underlying Ably realtime channel used for the messages in this chat room.
   *
   * @returns The realtime channel.
   */
  get channel(): Ably.RealtimeChannel;
}

export enum MessageReactionMode {
  Add = "add",
  Replace = "replace",
  Unique = "unique",
}

export class DefaultMessageReactions {
  private readonly _chatApi: ChatApi;

  constructor(chatApi: ChatApi) {
    this._chatApi = chatApi;
  }

  add(message : Message, reaction : string, score : number = 1, mode : MessageReactionMode = MessageReactionMode.Add) {
    return this._chatApi.addMessageReaction(message.roomId, message.serial, reaction, score, mode);
  }

  remove(message : Message, reaction : string) {
    return this._chatApi.removeMessageReaction(message.roomId, message.serial, reaction);
  }

  removeAll(message : Message) {
    return this._chatApi.removeAllMessageReactions(message.roomId, message.serial);
  }
}

/**
 * @inheritDoc
 */
export class DefaultMessages implements Messages, HandlesDiscontinuity, ContributesToRoomLifecycle {
  private readonly _roomId: string;
  private readonly _channel: Ably.RealtimeChannel;
  private readonly _chatApi: ChatApi;
  private readonly _clientId: string;
  private readonly _listenerSubscriptionPoints: Map<
    MessageListenerObject,
    Promise<{
      fromSerial: string;
    }>
  >;
  private readonly _logger: Logger;
  private readonly _discontinuityEmitter: DiscontinuityEmitter = newDiscontinuityEmitter();
  private _emitter = new EventEmitter<MessageEventsMap>();

  public reactions : DefaultMessageReactions;

  /**
   * Constructs a new `DefaultMessages` instance.
   * @param roomId The unique identifier of the room.
   * @param channelManager An instance of the ChannelManager.
   * @param chatApi An instance of the ChatApi.
   * @param clientId The client ID of the user.
   * @param logger An instance of the Logger.
   */
  constructor(roomId: string, channelManager: ChannelManager, chatApi: ChatApi, clientId: string, logger: Logger) {
    this._roomId = roomId;

    this._channel = this._makeChannel(roomId, channelManager);

    this._chatApi = chatApi;
    this._clientId = clientId;
    this._logger = logger;
    this._listenerSubscriptionPoints = new Map<MessageListenerObject, Promise<{ fromSerial: string }>>();

    this.reactions = new DefaultMessageReactions(chatApi);
  }

  /**
   * Creates the realtime channel for messages.
   */
  private _makeChannel(roomId: string, channelManager: ChannelManager): Ably.RealtimeChannel {
    const channel = channelManager.get(messagesChannelName(roomId));

    addListenerToChannelWithoutAttach({
      listener: this._processEvent.bind(this),
      // events: [RealtimeMessageNames.ChatMessage],
      channel: channel,
    });

    // Handles the case where channel attaches and resume state is false. This can happen when the channel is first attached,
    // or when the channel is reattached after a detach. In both cases, we reset the subscription points for all listeners.
    channel.on('attached', (message) => {
      this._handleAttach(message.resumed);
    });

    // Handles the case where an update message is received from a channel after a detach and reattach.
    channel.on('update', (message) => {
      if (message.current === 'attached' && message.previous === 'attached') {
        this._handleAttach(message.resumed);
      }
    });

    return channel;
  }

  /**
   * @inheritdoc Messages
   */
  private async _getBeforeSubscriptionStart(
    listener: MessageListenerObject,
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
    return this._chatApi.getMessages(this._roomId, {
      ...params,
      orderBy: OrderBy.NewestFirst,
      ...subscriptionPointParams,
    });
  }

  /**
   * Handle the case where the channel experiences a detach and reattaches.
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
      // Check if the state is now attached
      if (channelWithProperties.state === 'attached') {
        // Get the attachSerial from the channel properties
        // AttachSerial should always be defined at this point, but we check just in case
        this._logger.debug('Messages._subscribeAtChannelAttach(); channel is attached already, using attachSerial', {
          attachSerial: channelWithProperties.properties.attachSerial,
        });
        if (channelWithProperties.properties.attachSerial) {
          resolve({ fromSerial: channelWithProperties.properties.attachSerial });
        } else {
          this._logger.error(`DefaultSubscriptionManager.handleAttach(); attachSerial is undefined`);
          reject(
            new Ably.ErrorInfo('channel is attached, but attachSerial is not defined', 40000, 400) as unknown as Error,
          );
        }
      }

      channelWithProperties.once('attached', () => {
        // Get the attachSerial from the channel properties
        // AttachSerial should always be defined at this point, but we check just in case
        this._logger.debug('Messages._subscribeAtChannelAttach(); channel is now attached, using attachSerial', {
          attachSerial: channelWithProperties.properties.attachSerial,
        });
        if (channelWithProperties.properties.attachSerial) {
          resolve({ fromSerial: channelWithProperties.properties.attachSerial });
        } else {
          this._logger.error(`DefaultSubscriptionManager.handleAttach(); attachSerial is undefined`);
          reject(
            new Ably.ErrorInfo('channel is attached, but attachSerial is not defined', 40000, 400) as unknown as Error,
          );
        }
      });
    });
  }

  /**
   * @inheritdoc Messages
   */
  get channel(): Ably.RealtimeChannel {
    return this._channel;
  }

  /**
   * @inheritdoc Messages
   */
  async get(options: QueryOptions): Promise<PaginatedResult<Message>> {
    this._logger.trace('Messages.query();');
    return this._chatApi.getMessages(this._roomId, options);
  }

  /**
   * @inheritdoc Messages
   */
  async send(params: SendMessageParams): Promise<Message> {
    this._logger.trace('Messages.send();', { params });

    const { text, metadata, headers } = params;

    const response = await this._chatApi.sendMessage(this._roomId, { text, headers, metadata });
    return new DefaultMessage(
      response.serial,
      this._clientId,
      this._roomId,
      text,
      metadata ?? {},
      headers ?? {},
      ChatMessageActions.MessageCreate,
      response.serial,
      new Date(response.createdAt),
      new Date(response.createdAt), // timestamp is the same as createdAt for new messages
    );
  }

  async update(message: Message, update: UpdateMessageParams, details?: OperationDetails): Promise<Message> {
    this._logger.trace('Messages.update();', { message, update, details });

    const response = await this._chatApi.updateMessage(this._roomId, message.serial, {
      ...details,
      message: update,
    });

    const updatedMessage = new DefaultMessage(
      message.serial,
      message.clientId,
      this._roomId,
      update.text,
      update.metadata ?? {},
      update.headers ?? {},
      ChatMessageActions.MessageUpdate,
      response.version,
      new Date(message.createdAt),
      new Date(response.timestamp),
      {
        clientId: this._clientId,
        description: details?.description,
        metadata: details?.metadata,
      },
    );

    this._logger.debug('Messages.update(); message update successfully', { updatedMessage });
    return updatedMessage;
  }

  /**
   * @inheritdoc Messages
   */
  async delete(message: Message, params?: DeleteMessageParams): Promise<Message> {
    this._logger.trace('Messages.delete();', { params });

    const response = await this._chatApi.deleteMessage(this._roomId, message.serial, params);

    const deletedMessage: Message = new DefaultMessage(
      message.serial,
      message.clientId,
      this._roomId,
      message.text,
      message.metadata,
      message.headers,
      ChatMessageActions.MessageDelete,
      response.version,
      new Date(message.createdAt),
      new Date(response.timestamp),
      {
        clientId: this._clientId,
        description: params?.description,
        metadata: params?.metadata,
      },
    );

    this._logger.debug('Messages.delete(); message deleted successfully', { deletedMessage });
    return deletedMessage;
  }

  /**
   * @inheritdoc Messages
   */
  subscribe(listener: MessageListener | MessageListenerObject): MessageSubscriptionResponse {
    this._logger.trace('Messages.subscribe();', { listener });

    if (typeof listener === 'function') {
      return this.subscribe({ messages: listener });
    }

    const messagesListener = listener.messages;
    if (messagesListener) {
      this._emitter.on([MessageEvents.Created, MessageEvents.Updated, MessageEvents.Deleted], messagesListener);
    }

    const reactionsListener = listener.reactions;
    if (reactionsListener) {
      this._emitter.on(MessageEvents.ReactionCreated, reactionsListener);
    }

    const summariesListener = listener.summaries;
    if (summariesListener) {
      this._emitter.on(MessageEvents.ReactionSummary, summariesListener);
    }

    // Set the subscription point to a promise that resolves when the channel attaches or with the latest message
    const resolvedSubscriptionStart = this._resolveSubscriptionStart();

    // Add a handler for unhandled rejections incase the room is released before the subscription point is resolved
    resolvedSubscriptionStart.catch(() => {
      this._logger.debug('Messages.subscribe(); subscription point was not resolved before the room was released', {
        roomId: this._roomId,
      });
    });

    this._listenerSubscriptionPoints.set(listener, resolvedSubscriptionStart);

    return {
      unsubscribe: () => {
        // Remove the listener from the subscription points
        this._listenerSubscriptionPoints.delete(listener);
        this._logger.trace('Messages.unsubscribe();');
        if (messagesListener) {
          this._emitter.off(messagesListener);
        }
        if (reactionsListener) {
          this._emitter.off(reactionsListener);
        }
        if (summariesListener) {
          this._emitter.off(summariesListener);
        }
      },
      getPreviousMessages: (params: Omit<QueryOptions, 'orderBy'>) =>
        this._getBeforeSubscriptionStart(listener, params),
    };
  }

  /**
   * @inheritdoc Messages
   */
  unsubscribeAll(): void {
    this._logger.trace('Messages.unsubscribeAll();');
    this._emitter.off();
    this._listenerSubscriptionPoints.clear();
  }

  private _processEvent(channelEventMessage: Ably.InboundMessage) {
    this._logger.trace('Messages._processEvent();', {
      channelEventMessage,
    });
    const action = channelEventMessage.action;
    const messageEvent = MessageActionsToEventsMap.get(action as ChatMessageActions);

    console.log("processing event with action", action, "is message event", messageEvent, "and the raw event is", channelEventMessage);

    if (channelEventMessage.name === RealtimeMessageNames.ChatMessage && messageEvent) {
      this._logger.trace('Messages._processEvent(): detected chat message event', { messageEvent });
      // this is a chat messages
      const message = this._parseNewMessage(channelEventMessage);
      if (!message) {
        this._logger.trace('Messages._processEvent(): message could not be parsed, ignoring', { channelEventMessage });
        return;
      }
      this._emitter.emit(messageEvent, { type: messageEvent, message: message, messageSerial: message.serial });
      return;
    }

    // annotation create
    if ((action as unknown) === ChatMessageActions.MessageAnnotationCreate && // message reactions
      channelEventMessage.refType === ReactionEmojiV1) {
        this._logger.trace('Messages._processEvent(): detected new message reaction', { channelEventMessage });
        this._emitter.emit(MessageEvents.ReactionCreated, {
          type: MessageEvents.ReactionCreated,
          reaction: {
            reaction: channelEventMessage.data,
            refSerial: channelEventMessage.refSerial!,
            clientId: channelEventMessage.clientId!,
          },
          messageSerial: channelEventMessage.refSerial!,
        });
        return;
      }

    // todo: annotation remove
    if ((action as unknown) === ChatMessageActions.MessageAnnotationDelete) {
      if (channelEventMessage.refType === ReactionEmojiV1) {
        // reaction remove
      }
      return;
    }

    if (action === ChatMessageActions.MessageAnnotationSummary) {
      // reaction summaries (for annotation refType "reaction:emoji.v1")
      const emojis =
        ((channelEventMessage as any).summary?.data?.namespaces?.reaction?.emoji_v1 as unknown as Record<
          string,
          { total: string; score : string; clientIds: {total : string, score : string}[]; reaction: string }
        >) || {};

      console.log("processing reaction summary event with emojis", emojis);
      const reactions = new Map<string, MessageReactionSummary>();
      for (const emoji in emojis) {

        const clientIdData = emojis[emoji]?.clientIds;
        const clientIds : MessageReactionSummary["clientIds"] = {};
        if (clientIdData) {
          for (const client in clientIdData) {
            let score : number = 0;
            if (clientIdData[client]?.score) {
              score = parseInt(clientIdData[client].score);
              if (score < 0) { score = 0; }
            }
            let total : number = 0;
            if (clientIdData[client]?.total) {
              total = parseInt(clientIdData[client].total);
              if (total < 0) { total = 0; }
            }
            clientIds[client] = { score: score, total: total };
          }
        }

        reactions.set(emoji, {
          total: Number.parseInt(emojis[emoji]?.total as unknown as string) ?? 0,
          score: Number.parseInt(emojis[emoji]?.score as unknown as string) ?? 0,
          numClients: Object.keys(clientIds).length,
          clientIds: clientIds,
          reaction: emoji,
        });
      }

      console.log("about to trigger CHAT summary event with reactions" ,reactions);

      this._emitter.emit(MessageEvents.ReactionSummary, {
        type: MessageEvents.ReactionSummary,
        summary: {
          refSerial: channelEventMessage.refSerial!,
          reactions: reactions,
          timestamp: new Date(channelEventMessage.timestamp),
        },
        messageSerial: channelEventMessage.refSerial!,
      });
    }
  }

  /**
   * Validate the realtime message and convert it to a chat message.
   */
  private _parseNewMessage(channelEventMessage: Ably.InboundMessage): Message | undefined {
    try {
      return parseMessage(this._roomId, channelEventMessage);
    } catch (error: unknown) {
      this._logger.error(`failed to parse incoming message;`, { channelEventMessage, error: error as Ably.ErrorInfo });
    }
  }

  /**
   * @inheritdoc HandlesDiscontinuity
   */
  discontinuityDetected(reason?: Ably.ErrorInfo): void {
    this._logger.warn('Messages.discontinuityDetected();', { reason });
    this._discontinuityEmitter.emit('discontinuity', reason);
  }

  /**
   * @inheritdoc EmitsDiscontinuities
   */
  onDiscontinuity(listener: DiscontinuityListener): OnDiscontinuitySubscriptionResponse {
    this._logger.trace('Messages.onDiscontinuity();');
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
    return ErrorCodes.MessagesAttachmentFailed;
  }

  /**
   * @inheritdoc ContributesToRoomLifecycle
   */
  get detachmentErrorCode(): ErrorCodes {
    return ErrorCodes.MessagesDetachmentFailed;
  }
}

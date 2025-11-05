import * as Ably from 'ably';

import { ChatApi } from './chat-api.js';
import { ErrorCode } from './errors.js';
import { ChatMessageAction, ChatMessageEvent, ChatMessageEventType, RealtimeMessageName } from './events.js';
import { Logger } from './logger.js';
import { Message, MessageHeaders, MessageMetadata, MessageOperationMetadata } from './message.js';
import { parseMessage } from './message-parser.js';
import { DefaultMessageReactions, MessageReactions } from './message-reactions.js';
import { PaginatedResult } from './query.js';
import { on, once, subscribe } from './realtime-subscriptions.js';
import { messageFromRest } from './rest-types.js';
import { MessagesOptions } from './room-options.js';
import { assertValidSerial } from './serial.js';
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
 * Parameters for querying messages in a chat room.
 */
export interface HistoryParams {
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
   * Get the previous messages that were sent to the room before the listener was subscribed. This can be used to populate
   * a room on initial subscription or to refresh local state after a discontinuity event.
   *
   * **NOTE**:
   * - If the client experiences a discontinuity event (i.e. the connection was lost and could not be resumed), the starting point of
   * `historyBeforeSubscribe` will be reset.
   * - Calls to `historyBeforeSubscribe` will then wait for continuity to be restored before resolving.
   * - Once continuity is restored, the subscription point will be set to the beginning of this new period of continuity. To
   * ensure that no messages are missed (or updates/deletes), you should call `historyBeforeSubscribe` after any period of discontinuity to
   * re-populate your local state.
   * @example Populating messages on initial subscription
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient, ChatMessageEventType } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   * const room = await chatClient.rooms.get('general-chat');
   *
   * // Local message state
   * let localMessages: Message[] = [];
   *
   * const updateLocalMessageState = (messages: Message[], message:Message): void => {
   *   // Find existing message in local state
   *   const existingIndex = messages.findIndex(m => m.serial === message.serial);
   *   if (existingIndex === -1) {
   *     // New message, add to local state
   *     messages.push(message);
   *   } else {
   *     // Existing message, update local state
   *     messages[existingIndex] = messages[existingIndex].with(message);
   *   }
   *   // Messages should be ordered by serial
   *   messages.sort((a, b) => a.serial < b.serial ? -1 : (b.serial < a.serial ? 1 : 0));
   * };
   *
   *
   * // Subscribe a listener to message events
   * const subscription = room.messages.subscribe((event) => {
   *   console.log(`Message ${event.type}:`, event.message.text);
   *   updateLocalMessageState(localMessages, event.message);
   * });
   *
   * // Attach to the room to start receiving message events
   * await room.attach();
   *
   * // Get historical messages before subscription
   * try {
   *   const history = await subscription.historyBeforeSubscribe({ limit: 50 });
   *   console.log(`Retrieved ${history.items.length} historical messages`);
   *
   *   // Process historical messages
   *   history.items.forEach(message => {
   *     console.log(`Historical: ${message.text} from ${message.clientId}`);
   *     updateLocalMessageState(localMessages, message);
   *   });
   * } catch (error) {
   *   console.error('Failed to retrieve message history:', error);
   * }
   * ```
   * @example Handling discontinuities to refresh local state
   * ```typescript
   * // Subscribe a listener to message events as before
   * const { historyBeforeSubscribe } = // subscribed listener response
   *
   * // Subscribe to discontinuity events on the room
   * room.onDiscontinuity(async (reason) => {
   *   console.warn('Discontinuity detected:', reason);
   *   // Clear local state and re-fetch messages
   *   localMessages = []
   *   try {
   *     // Fetch messages before the new subscription point
   *     const history = await subscription.historyBeforeSubscribe({ limit: 100 });
   *
   *     // Merge each message into local state
   *     history.items.forEach(message => {
   *       updateLocalMessageState(localMessages, message);
   *     });
   *
   *     console.log(`Refreshed local state with ${localMessages.length} messages`);
   *   } catch (error) {
   *     console.error('Failed to refresh messages after discontinuity:', error);
   *   }
   * });
   *
   * // Attach to the room to start receiving events
   * await room.attach();
   * ```
   * @param params Parameters for the history query.
   * @returns A promise that resolves with the paginated result of messages, in newest-to-oldest order.
   */
  historyBeforeSubscribe(params: Omit<HistoryParams, 'orderBy'>): Promise<PaginatedResult<Message>>;
}

/**
 * This interface is used to interact with messages in a chat room: subscribing
 * to new messages, fetching history, or sending messages.
 *
 * Get an instance via {@link Room.messages}.
 */
export interface Messages {
  /**
   * Subscribe to chat message events in this room.
   *
   * This method allows you to listen for chat message events and provides access to
   * historical messages that occurred before the subscription was established.
   *
   * **Note**: The room must be attached for the listener to receive new message events.
   * @param listener - A callback function that will be invoked when chat message events occur.
   * @returns A {@link MessageSubscriptionResponse} object that provides:
   *          - `unsubscribe()`: Method to stop listening for message events
   *          - `historyBeforeSubscribe()`: Method to retrieve messages sent before subscription
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient, ChatMessageEvent } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * // Get a room and subscribe to messages
   * const room = await chatClient.rooms.get('general-chat');
   *
   * const subscription = room.messages.subscribe((event: ChatMessageEvent) => {
   *   console.log(`Message ${event.type}:`, event.message.text);
   *   console.log('From:', event.message.clientId);
   *   console.log('At:', event.message.timestamp);
   *   // Handle different event types
   * });
   *
   * // Attach to the room to start receiving events
   * await room.attach();
   *
   * // Later, unsubscribe when done
   * subscription.unsubscribe();
   * ```
   */
  subscribe(listener: MessageListener): MessageSubscriptionResponse;

  /**
   * Get messages that have been previously sent to the chat room.
   *
   * This method retrieves historical messages based on the provided query options,
   * allowing you to paginate through message history, filter by time ranges,
   * and control the order of results.
   *
   * **NOTE**: This method uses the Ably Chat REST API and so does not require the room
   * to be attached to be called.
   * @param params - Query parameters to filter and control the message retrieval
   * @returns A Promise that resolves to a {@link PaginatedResult} containing an array of {@link Message} objects
   *          and methods for pagination control, or rejects with {@link ErrorCode.InvalidArgument} when the query fails due to invalid parameters
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient, OrderBy } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * const room = await chatClient.rooms.get('project-updates');
   *
   * // Retrieve message history with pagination
   * try {
   *   let result = await room.messages.history({
   *     limit: 50,
   *     orderBy: OrderBy.NewestFirst
   *   });
   *
   *   console.log(`Retrieved ${result.items.length} messages`);
   *   result.items.forEach(message => {
   *     console.log(`${message.clientId}: ${message.text}`);
   *   });
   *
   *   // Paginate through additional pages if available
   *   while (result.hasNext()) {
   *     const nextPage = await result.next();
   *     if (nextPage) {
   *       console.log(`Next page has ${nextPage.items.length} messages`);
   *       nextPage.items.forEach(message => {
   *         console.log(`${message.clientId}: ${message.text}`);
   *       });
   *       result = nextPage;
   *     } else {
   *     break; // No more pages
   *     }
   *   }
   *   console.log('All message history retrieved');
   * } catch (error) {
   *   console.error('Failed to retrieve message history:', error);
   * }
   * ```
   */
  history(params: HistoryParams): Promise<PaginatedResult<Message>>;

  /**
   * Get a specific message by its unique serial identifier.
   *
   * This method retrieves a single message using its serial, which is a unique
   * identifier assigned to each message when it's created.
   *
   * **NOTE**: This method uses the Ably Chat REST API and so does not require the room
   * to be attached to be called.
   * @param serial - The unique serial identifier of the message to retrieve.
   * @returns A Promise that resolves to the {@link Message} object, or rejects with:
   * - {@link Ably.ErrorInfo} when the message is not found or network/server errors occur
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * const room = await chatClient.rooms.get('customer-support');
   *
   * // Get a specific message by its serial
   * const messageSerial = '01726585978590-001@abcdefghij:001';
   *
   * try {
   *   const message = await room.messages.get(messageSerial);
   *
   *   console.log(`Serial: ${message.serial}`);
   *   console.log(`From: ${message.clientId}`);
   *   console.log(`Text: ${message.text}`);
   *
   * } catch (error) {
   *   if (error.code === 40400) {
   *     console.error('Message not found:', messageSerial);
   *   } else {
   *     console.error('Failed to retrieve message:', error);
   *   }
   * }
   * ```
   */
  get(serial: string): Promise<Message>;

  /**
   * Send a message to the chat room.
   *
   * This method publishes a new message to the chat room using the Ably Chat API.
   * The message will be delivered to all subscribers in real-time.
   *
   * **Important**: The Promise may resolve before OR after the message is received
   * from the realtime channel. This means subscribers may see the message before
   * the send operation completes.
   *
   * **NOTE**: This method uses the Ably Chat REST API and so does not require the room
   * to be attached to be called.
   * @param params - Message parameters containing the text and optional metadata/headers
   * @returns A Promise that resolves to the sent {@link Message} object, or rejects with:
   * - {@link Ably.ErrorInfo} when the message fails to send due to network issues, authentication problems, or rate limiting
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * const room = await chatClient.rooms.get('general-chat');
   *
   * // Send a message with metadata and headers
   * try {
   *   const message = await room.messages.send({
   *     text: 'Hello, everyone! 👋',
   *     metadata: {
   *       priority: 'high',
   *       category: 'greeting'
   *     },
   *     headers: {
   *       'content-type': 'text',
   *       'language': 'en'
   *     }
   *   });
   *
   *   console.log(`Message sent successfully: ${message.serial}`);
   * } catch (error) {
   *   console.error('Failed to send message:', error);
   * }
   * ```
   */
  send(params: SendMessageParams): Promise<Message>;

  /**
   * Delete a message in the chat room.
   *
   * This method performs a "soft delete" on a message, marking it as deleted rather
   * than permanently removing it. The deleted message will still be visible in message
   * history but will be flagged as deleted. Subscribers will receive a deletion event
   * in real-time.
   *
   * **Important**: The Promise may resolve before OR after the deletion event is received
   * from the realtime channel. Subscribers may see the deletion event before this method
   * completes.
   *
   * **Note**:
   * - The returned Message instance represents the state after deletion. If you
   * have active subscriptions, use the event payloads from those subscriptions instead
   * of the returned instance for consistency.
   * - This method uses the Ably Chat REST API and so does not require the room
   * to be attached to be called.
   * @param serial - The unique identifier of the message to delete.
   * @param details - Optional details to record about the delete action.
   * @returns A Promise that resolves to the deleted {@link Message} object with
   *          `isDeleted` set to true and deletion metadata populated, or rejects with:
   * - {@link Ably.ErrorInfo} when the message is not found, user lacks permissions,
   *            or network/server errors occur
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient, Message } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * const room = await chatClient.rooms.get('public-chat');
   *
   * // Serial of the message to delete
   * const messageSerial = '01726585978590-001@abcdefghij:001';
   *
   * try {
   *   const deletedMessage = await room.messages.delete(messageSerial, {
   *     description: 'Inappropriate content removed by moderator',
   *     metadata: {
   *       reason: 'policy-violation',
   *       timestamp: Date.now()
   *     }
   *   });
   *
   *   console.log(`Deleted message: ${deletedMessage.text}`);
   * } catch (error) {
   *   if (error.code === 40400) {
   *     console.error('Message not found:', messageSerial);
   *   } else if (error.code === 40300) {
   *     console.error('Permission denied: Cannot delete this message');
   *   } else {
   *     console.error('Failed to delete message:', error);
   *   }
   * }
   * ```
   */
  delete(serial: string, details?: OperationDetails): Promise<Message>;

  /**
   * Update a message in the chat room.
   *
   * This method modifies an existing message's content, metadata, or headers.
   * The update creates a new version of the message while preserving the original
   * serial identifier. Subscribers will receive an update event in real-time.
   *
   * **Important**: The Promise may resolve before OR after the update event is received
   * from the realtime channel. Subscribers may see the update event before this method
   * completes.
   *
   * **Note**:
   * - This method uses PUT-like semantics. If metadata or headers are omitted
   * from updateParams, they will be replaced with empty objects, not merged with existing values.
   * - The returned Message instance represents the state after the update. If you
   * have active subscriptions, use the event payloads from those subscriptions instead
   * of the returned instance for consistency.
   * - This method uses the Ably Chat REST API and so does not require the room
   * to be attached to be called.
   * @param serial - The unique identifier of the message to update.
   * @param updateParams - The new message content and properties.
   * @param details - Optional details to record about the delete action.
   * @returns A Promise that resolves to the updated {@link Message} object with
   *          `isUpdated` set to true and update metadata populated, or rejects with:
   * - {@link Ably.ErrorInfo} when the message is not found, user lacks permissions,
   *           or network/server errors occur.
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * const room = await chatClient.rooms.get('team-updates');
   *
   * // Update a message with corrected text and tracking
   * const messageSerial = '01726585978590-001@abcdefghij:001';
   *
   * try {
   *   const updatedMessage = await room.messages.update(
   *     messageSerial,
   *     {
   *       text: 'Meeting is scheduled for 3 PM (corrected time)',
   *     },
   *     {
   *       description: 'Corrected meeting time',
   *       metadata: {
   *         editTimestamp: Date.now()
   *       }
   *     }
   *   );
   *
   *   console.log(`Updated text: ${updatedMessage.text}`);
   * } catch (error) {
   *   if (error.code === 40400) {
   *     console.error('Message not found:', messageSerial);
   *   } else if (error.code === 40300) {
   *     console.error('Permission denied: Cannot update this message');
   *   } else {
   *     console.error('Failed to update message:', error);
   *   }
   * }
   * ```
   */
  update(serial: string, updateParams: UpdateMessageParams, details?: OperationDetails): Promise<Message>;

  /**
   * Send, delete, and subscribe to message reactions.
   *
   * This property provides access to the message reactions functionality, allowing you to
   * add reactions to specific messages, remove reactions, and subscribe to reaction events
   * in real-time.
   */
  reactions: MessageReactions;
}

/**
 * @inheritDoc
 */
export class DefaultMessages implements Messages {
  private readonly _roomName: string;
  private readonly _options: MessagesOptions;
  private readonly _channel: Ably.RealtimeChannel;
  private readonly _chatApi: ChatApi;
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
   * @param logger An instance of the Logger.
   */
  constructor(
    roomName: string,
    options: MessagesOptions,
    channel: Ably.RealtimeChannel,
    chatApi: ChatApi,
    logger: Logger,
  ) {
    this._roomName = roomName;
    this._options = options;
    this._channel = channel;
    this._chatApi = chatApi;
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
  get reactions(): MessageReactions {
    return this._reactions;
  }

  /**
   * @inheritdoc
   */
  private async _getBeforeSubscriptionStart(
    listener: MessageListener,
    params: Omit<HistoryParams, 'orderBy'>,
  ): Promise<PaginatedResult<Message>> {
    this._logger.trace(`DefaultSubscriptionManager.getBeforeSubscriptionStart();`);

    const subscriptionPoint = this._listenerSubscriptionPoints.get(listener);

    if (subscriptionPoint === undefined) {
      this._logger.error(`DefaultSubscriptionManager.getBeforeSubscriptionStart(); listener has not been subscribed`);
      throw new Ably.ErrorInfo(
        'unable to query history; listener has not been subscribed',
        ErrorCode.ListenerNotSubscribed,
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
      throw new Ably.ErrorInfo(
        'unable to query messages; channel is attached but channelSerial is not defined',
        ErrorCode.ChannelSerialNotDefined,
        500,
      ) as unknown as Error;
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
            new Ably.ErrorInfo(
              'unable to query messages; channel is attached but attachSerial is not defined',
              ErrorCode.ChannelSerialNotDefined,
              500,
            ) as unknown as Error,
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
            new Ably.ErrorInfo(
              'unable to query messages; channel is attached but attachSerial is not defined',
              ErrorCode.ChannelSerialNotDefined,
              500,
            ) as unknown as Error,
          );
        }
      });

      this._pendingAttachListeners.add(offAttachedListener);
    });
  }

  /**
   * @inheritdoc
   */
  async history(options: HistoryParams): Promise<PaginatedResult<Message>> {
    this._logger.trace('Messages.query();');
    return this._chatApi.history(this._roomName, options);
  }

  /**
   * @inheritdoc
   */
  async get(serial: string): Promise<Message> {
    this._logger.trace('Messages.get();', { serial });
    return this._chatApi.getMessage(this._roomName, serial);
  }

  /**
   * @inheritdoc
   */
  async send(params: SendMessageParams): Promise<Message> {
    this._logger.trace('Messages.send();', { params });

    const { text, metadata, headers } = params;

    const response = await this._chatApi.sendMessage(this._roomName, { text, headers, metadata });
    return messageFromRest(response);
  }

  /**
   * @inheritdoc
   */
  async delete(serial: string, details?: OperationDetails): Promise<Message> {
    this._logger.trace('Messages.delete();', { serial, details });
    // Spec: CHA-M9f
    assertValidSerial(serial, 'delete message', 'serial');
    const response = await this._chatApi.deleteMessage(this._roomName, serial, details);

    return messageFromRest(response);
  }

  /**
   * @inheritdoc
   */
  async update(serial: string, updateParams: UpdateMessageParams, details?: OperationDetails): Promise<Message> {
    this._logger.trace('Messages.update();', { serial, updateParams, details });
    // Spec: CHA-M8g
    assertValidSerial(serial, 'update message', 'serial');
    const response = await this._chatApi.updateMessage(this._roomName, serial, {
      message: {
        text: updateParams.text,
        metadata: updateParams.metadata,
        headers: updateParams.headers,
      },
      ...details,
    });

    this._logger.debug('Messages.update(); message update successfully', { updateParams });
    return messageFromRest(response);
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
      historyBeforeSubscribe: async (params: Omit<HistoryParams, 'orderBy'>) =>
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
    const disposalError = new Ably.ErrorInfo(
      'unable to query messages; room has been disposed',
      ErrorCode.ResourceDisposed,
      400,
    ) as unknown as Error;
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

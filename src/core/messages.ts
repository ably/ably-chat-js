import * as Ably from 'ably';

import EventEmitter from '../utils/EventEmitter.js';
import { getChannel, messagesChannelName } from './channel.js';
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
import { MessageEvents } from './events.js';
import { Logger } from './logger.js';
import { DefaultMessage, Message, MessageHeaders, MessageMetadata } from './message.js';
import { PaginatedResult } from './query.js';
import { addListenerToChannelWithoutAttach } from './realtime-extensions.js';
import { ContributesToRoomLifecycle } from './room-lifecycle-manager.js';
import { DefaultTimeserial } from './timeserial.js';

/**
 * Event names and their respective payloads emitted by the messages feature.
 */
interface MessageEventsMap {
  [MessageEvents.Created]: MessageEventPayload;
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
   * If `forwards`, the response will include messages from the start of the time window to the end.
   * If `backwards`, the response will include messages from the end of the time window to the start.
   * If not provided, the default is `forwards`.
   *
   * @defaultValue forwards
   */
  direction?: 'forwards' | 'backwards';
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
   * validation. When reading the metadata treat it like user input.
   *
   * The key `ably-chat` is reserved and cannot be used. Ably may populate
   * this with different values in the future.
   */
  metadata?: MessageMetadata;

  /**
   * Optional headers of the message.
   *
   * The headers are a flat key-value map and are sent as part of the realtime
   * message's extras inside the `headers` property. They can serve similar
   * purposes as the metadata but they are read by Ably and can be used for
   * features such as
   * [subscription filters](https://faqs.ably.com/subscription-filters).
   *
   * Do not use the headers for authoritative information. There is no
   * server-side validation. When reading the headers treat them like user
   * input.
   *
   * The key prefix `ably-chat` is reserved and cannot be used. Ably may add
   * headers prefixed with `ably-chat` in the future.
   */
  headers?: MessageHeaders;
}

/**
 * Payload for a message event.
 */
export interface MessageEventPayload {
  /**
   * The type of the message event.
   */
  type: MessageEvents;

  /**
   * The message that was received.
   */
  message: Message;
}

/**
 * A listener for message events in a chat room.
 * @param event The message event that was received.
 */
export type MessageListener = (event: MessageEventPayload) => void;

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
   * @returns A promise that resolves with the paginated result of messages.
   */
  getPreviousMessages(params: Omit<QueryOptions, 'direction'>): Promise<PaginatedResult<Message>>;
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
  subscribe(listener: MessageListener): MessageSubscriptionResponse;

  /**
   * Unsubscribe all listeners from new messages in from chat room.
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
   * Get the underlying Ably realtime channel used for the messages in this chat room.
   *
   * @returns the realtime channel
   */
  get channel(): Ably.RealtimeChannel;
}

/**
 * @inheritDoc
 */
export class DefaultMessages
  extends EventEmitter<MessageEventsMap>
  implements Messages, HandlesDiscontinuity, ContributesToRoomLifecycle
{
  private readonly _roomId: string;
  private readonly _channel: Ably.RealtimeChannel;
  private readonly _chatApi: ChatApi;
  private readonly _clientId: string;
  private readonly _listenerSubscriptionPoints: Map<
    MessageListener,
    Promise<{
      fromSerial: string;
    }>
  >;
  private readonly _logger: Logger;
  private readonly _discontinuityEmitter: DiscontinuityEmitter = newDiscontinuityEmitter();

  /**
   * Constructs a new `DefaultMessages` instance.
   * @param roomId The unique identifier of the room.
   * @param realtime An instance of the Ably Realtime client.
   * @param chatApi An instance of the ChatApi.
   * @param clientId The client ID of the user.
   * @param logger An instance of the Logger.
   */
  constructor(roomId: string, realtime: Ably.Realtime, chatApi: ChatApi, clientId: string, logger: Logger) {
    super();
    this._roomId = roomId;
    this._channel = getChannel(messagesChannelName(roomId), realtime);
    addListenerToChannelWithoutAttach({
      listener: this._processEvent.bind(this),
      events: [MessageEvents.Created],
      channel: this._channel,
    });

    this._chatApi = chatApi;
    this._clientId = clientId;
    this._logger = logger;
    this._listenerSubscriptionPoints = new Map<MessageListener, Promise<{ fromSerial: string }>>();

    // Handles the case where channel attaches and resume state is false. This can happen when the channel is first attached,
    // or when the channel is reattached after a detach. In both cases, we reset the subscription points for all listeners.
    this._channel.on('attached', (message) => {
      this._handleAttach(message.resumed);
    });
    // Handles the case where an update message is received from a channel after a detach and reattach.
    this._channel.on('update', (message) => {
      if (message.current === 'attached' && message.previous === 'attached') {
        this._handleAttach(message.resumed);
      }
    });
  }

  /**
   * @inheritdoc Messages
   */
  private async _getBeforeSubscriptionStart(
    listener: MessageListener,
    params: Omit<QueryOptions, 'direction'>,
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

    // Check the end time does not occur after the fromSerial time
    const parseSerial = DefaultTimeserial.calculateTimeserial(subscriptionPointParams.fromSerial);
    if (params.end && params.end > parseSerial.timestamp) {
      this._logger.error(
        `DefaultSubscriptionManager.getBeforeSubscriptionStart(); end time is after the subscription point of the listener`,
        {
          endTime: params.end,
          subscriptionTime: parseSerial.timestamp,
        },
      );
      throw new Ably.ErrorInfo(
        'cannot query history; end time is after the subscription point of the listener',
        40000,
        400,
      ) as unknown as Error;
    }

    // Query messages from the subscription point to the start of the time window
    return this._chatApi.getMessages(this._roomId, {
      ...params,
      direction: 'backwards',
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
   * Create a promise that resolves with the attachSerial of the channel or the timeserial of the latest message.
   */
  private async _resolveSubscriptionStart(): Promise<{
    fromSerial: string;
  }> {
    const channelWithProperties = this._getChannelProperties();

    // If we are attached, we can resolve with the channelSerial
    if (this._channel.state === 'attached') {
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
    return new Promise((resolve, reject) => {
      // Check if the state is now attached
      if (this._channel.state === 'attached') {
        // Get the attachSerial from the channel properties
        const channelWithProperties = this._getChannelProperties();
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

      this._channel.once('attached', () => {
        // Get the attachSerial from the channel properties
        const channelWithProperties = this._getChannelProperties();
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
   * @throws {@link ErrorInfo} if metadata defines reserved keys.
   * @throws {@link ErrorInfo} if headers defines any headers prefixed with reserved words.
   */
  async send(params: SendMessageParams): Promise<Message> {
    this._logger.trace('Messages.send();');

    const { text, metadata, headers } = params;

    if (metadata && metadata['ably-chat'] !== undefined) {
      throw new Ably.ErrorInfo("unable to send message; metadata cannot use reserved key 'ably-chat'", 40001, 400);
    }

    if (headers) {
      for (const key of Object.keys(headers)) {
        if (key.startsWith('ably-chat')) {
          throw new Ably.ErrorInfo(
            "unable to send message; headers cannot have any key starting with reserved prefix 'ably-chat'",
            40001,
            400,
          );
        }
      }
    }

    const response = await this._chatApi.sendMessage(this._roomId, { text, headers, metadata });

    return new DefaultMessage(
      response.timeserial,
      this._clientId,
      this._roomId,
      text,
      new Date(response.createdAt),
      metadata ?? {},
      headers ?? {},
    );
  }

  /**
   * @inheritdoc Messages
   */
  subscribe(listener: MessageListener): MessageSubscriptionResponse {
    this._logger.trace('Messages.subscribe();');
    super.on([MessageEvents.Created], listener);

    // Set the subscription point to a promise that resolves when the channel attaches or with the latest message
    this._listenerSubscriptionPoints.set(listener, this._resolveSubscriptionStart());

    return {
      unsubscribe: () => {
        // Remove the listener from the subscription points
        this._listenerSubscriptionPoints.delete(listener);
        this._logger.trace('Messages.unsubscribe();');
        super.off(listener);
      },
      getPreviousMessages: (params: Omit<QueryOptions, 'direction'>) =>
        this._getBeforeSubscriptionStart(listener, params),
    };
  }

  /**
   * @inheritdoc Messages
   */
  unsubscribeAll(): void {
    this._logger.trace('Messages.unsubscribeAll();');
    super.off();
    this._listenerSubscriptionPoints.clear();
  }

  private _processEvent(channelEventMessage: Ably.InboundMessage) {
    this._logger.trace('Messages._processEvent();', {
      channelEventMessage,
    });
    const { name } = channelEventMessage;

    // Send the message to the listeners
    switch (name) {
      case MessageEvents.Created: {
        const message = this._parseNewMessage(channelEventMessage);
        if (!message) {
          return;
        }

        this.emit(MessageEvents.Created, { type: name, message: message });
        break;
      }
      default: {
        this._logger.warn('Messages._processEvent(); received unknown event', { name });
      }
    }
  }

  /**
   * Validate the realtime message and convert it to a chat message.
   */
  private _parseNewMessage(channelEventMessage: Ably.InboundMessage): Message | undefined {
    interface MessagePayload {
      data?: {
        text?: string;
        metadata?: MessageMetadata;
      };
      clientId?: string;
      timestamp?: number;
      extras?: {
        timeserial?: string;
        headers?: MessageHeaders;
      };
    }

    const messageCreatedMessage = channelEventMessage as MessagePayload;

    if (!messageCreatedMessage.data) {
      this._logger.error(`received incoming message without data`, channelEventMessage);
      return;
    }

    if (!messageCreatedMessage.clientId) {
      this._logger.error(`received incoming message without clientId`, channelEventMessage);
      return;
    }

    if (!messageCreatedMessage.timestamp) {
      this._logger.error(`received incoming message without timestamp`, channelEventMessage);
      return;
    }

    if (messageCreatedMessage.data.text === undefined) {
      this._logger.error(`received incoming message without text`, channelEventMessage);
      return;
    }

    if (!messageCreatedMessage.extras) {
      this._logger.error(`received incoming message without extras`, channelEventMessage);
      return;
    }

    if (!messageCreatedMessage.extras.timeserial) {
      this._logger.error(`received incoming message without timeserial`, channelEventMessage);
      return;
    }

    try {
      return new DefaultMessage(
        messageCreatedMessage.extras.timeserial,
        messageCreatedMessage.clientId,
        this._roomId,
        messageCreatedMessage.data.text,
        new Date(messageCreatedMessage.timestamp),
        messageCreatedMessage.data.metadata ?? {},
        messageCreatedMessage.extras.headers ?? {},
      );
    } catch (error: unknown) {
      this._logger.error(`failed to parse incoming message`, {
        channelEventMessage,
        error: error as Ably.ErrorInfo,
      });
      return;
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

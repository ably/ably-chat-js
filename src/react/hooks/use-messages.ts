import * as Ably from 'ably';
import { useCallback, useEffect, useState } from 'react';

import { ErrorCode } from '../../core/errors.js';
import { Message } from '../../core/message.js';
import type {
  DeleteMessageReactionParams,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  MessageReactions,
  SendMessageReactionParams,
} from '../../core/message-reactions.js'; // imported for typedoc links
import { MessageRawReactionListener, MessageReactionListener } from '../../core/message-reactions.js';
import {
  HistoryParams,
  MessageListener,
  Messages,
  MessageSubscriptionResponse,
  OperationDetails,
  SendMessageParams,
  UpdateMessageParams,
} from '../../core/messages.js';
import { PaginatedResult } from '../../core/query.js';
import { wrapRoomPromise } from '../helper/room-promise.js';
import { ChatStatusResponse } from '../types/chat-status-response.js';
import { Listenable } from '../types/listenable.js';
import { StatusParams } from '../types/status-params.js';
import { useEventListenerRef } from './internal/use-event-listener-ref.js';
import { useRoomLogger } from './internal/use-logger.js';
import { useRoomContext } from './internal/use-room-context.js';
import { useRoomStatus } from './internal/use-room-status.js';
import { useChatConnection } from './use-chat-connection.js';

/**
 * The response from the {@link useMessages} hook.
 */
export interface UseMessagesResponse extends ChatStatusResponse {
  /**
   * A shortcut to the {@link Messages.send} method.
   *
   * Send a message to the chat room using the Ably Chat API.
   *
   * **Important**: The Promise may resolve before OR after the message is received
   * from the realtime channel. This means subscribers may see the message before
   * the send operation completes.
   *
   * **NOTE**: This method uses the Ably Chat REST API and so does not require the room
   * to be attached to be called.
   *
   * This is a stable reference and will not be changed between renders for the same room.
   * @param params - Message parameters containing the text and optional metadata/headers
   * @returns A Promise that resolves to the sent {@link Message} object, or rejects with:
   * - {@link Ably.ErrorInfo} when the message fails to send due to network issues, authentication problems, or rate limiting
   * @example
   * ```tsx
   * const { sendMessage } = useMessages();
   *
   * const handleSendMessage = async () => {
   *   try {
   *     await sendMessage({
   *       text: 'Hello world!',
   *     });
   *   } catch (error) {
   *     console.error('Failed to send message:', error);
   *   }
   * };
   * ```
   */
  readonly sendMessage: (params: SendMessageParams) => Promise<Message>;

  /**
   * A shortcut to the {@link Messages.get} method.
   *
   * Get a specific message by its unique serial identifier.
   *
   * This method retrieves a single message using its serial, which is a unique
   * identifier assigned to each message when it's created.
   *
   * **NOTE**: This method uses the Ably Chat REST API and so does not require the room
   * to be attached to be called.
   *
   * This is a stable reference and will not be changed between renders for the same room.
   * @param serial - The unique serial identifier of the message to retrieve
   * @returns A Promise that resolves to the {@link Message} object, or rejects with:
   * - {@link Ably.ErrorInfo} when the message is not found or network/server errors occur
   * @example
   * ```tsx
   * const { getMessage } = useMessages();
   *
   * const handleGetMessage = async (messageSerial: string) => {
   *   try {
   *     const message = await getMessage(messageSerial);
   *     console.log('Retrieved message:', message.text);
   *     console.log('From:', message.clientId);
   *   } catch (error) {
   *     console.error('Failed to get message:', error);
   *   }
   * };
   * ```
   */
  readonly getMessage: (serial: string) => Promise<Message>;

  /**
   * A shortcut to the {@link Messages.update} method.
   *
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
   *
   * This is a stable reference and will not be changed between renders for the same room.
   * @param serial - The unique identifier of the message to update
   * @param updateParams - The new message content and properties
   * @param details - Optional details to record about the update action
   * @returns A Promise that resolves to the updated {@link Message} object with
   *          `isUpdated` set to true and update metadata populated, or rejects with:
   * - {@link Ably.ErrorInfo} when the message is not found, user lacks permissions,
   *           or network/server errors occur
   * @example
   * ```tsx
   * const { updateMessage } = useMessages();
   *
   * const handleUpdateMessage = async (serial: string, newText: string) => {
   *   try {
   *     await updateMessage(serial, {
   *       text: newText
   *     }, {
   *       description: 'User edited message'
   *     });
   *   } catch (error) {
   *     console.error('Failed to update message:', error);
   *   }
   * };
   * ```
   */
  readonly updateMessage: (
    serial: string,
    updateParams: UpdateMessageParams,
    details?: OperationDetails,
  ) => Promise<Message>;

  /**
   * A shortcut to the {@link Messages.history} method.
   *
   * Get messages that have been previously sent to the chat room.
   *
   * This method retrieves historical messages based on the provided query options,
   * allowing you to paginate through message history, filter by time ranges,
   * and control the order of results.
   *
   * **NOTE**: This method uses the Ably Chat REST API and so does not require the room
   * to be attached to be called.
   *
   * This is a stable reference and will not be changed between renders for the same room.
   * @param params - Query parameters to filter and control the message retrieval
   * @returns A Promise that resolves to a {@link PaginatedResult} containing an array of {@link Message} objects
   *          and methods for pagination control, or rejects with {@link ErrorCode.InvalidArgument} when the query fails due to invalid parameters
   * @example
   * ```tsx
   * const { history } = useMessages();
   *
   * const loadHistory = async () => {
   *   try {
   *     const result = await history({
   *       limit: 50,
   *       orderBy: OrderBy.NewestFirst
   *     });
   *     console.log('Previous messages:', result.items);
   *
   *     // Paginate through additional pages if available
   *     if (result.hasNext()) {
   *       const nextPage = await result.next();
   *       console.log('Next page:', nextPage?.items);
   *     }
   *   } catch (error) {
   *     console.error('Failed to load history:', error);
   *   }
   * };
   * ```
   */
  readonly history: (params: HistoryParams) => Promise<PaginatedResult<Message>>;

  /**
   * A shortcut to the {@link Messages.delete} method.
   *
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
   *
   * This is a stable reference and will not be changed between renders for the same room.
   * @param serial - The unique identifier of the message to delete
   * @param details - Optional details to record about the delete action
   * @returns A Promise that resolves to the deleted {@link Message} object with
   *          `isDeleted` set to true and deletion metadata populated, or rejects with:
   * - {@link Ably.ErrorInfo} when the message is not found, user lacks permissions,
   *            or network/server errors occur
   * @example
   * ```tsx
   * const { deleteMessage } = useMessages();
   *
   * const handleDeleteMessage = async (serial: string) => {
   *   try {
   *     await deleteMessage(serial, {
   *       description: 'User deleted message'
   *     });
   *   } catch (error) {
   *     console.error('Failed to delete message:', error);
   *   }
   * };
   * ```
   */
  readonly deleteMessage: (serial: string, details?: OperationDetails) => Promise<Message>;

  /**
   * A shortcut to the {@link MessageReactions.send} method.
   *
   * Sends a reaction to a specific chat message.
   *
   * **Note**:
   * - The behavior depends on the reaction type configured for the room.
   * - This method uses the Ably Chat REST API and so does not require the room
   * to be attached to be called.
   *
   * This is a stable reference and will not be changed between renders for the same room.
   * @param serial - The unique identifier of the message to react to
   * @param params - The reaction parameters including the reaction name
   * @returns A Promise that resolves when the reaction has been sent, or rejects with {@link Ably.ErrorInfo}
   * @example
   * ```tsx
   * const { sendReaction } = useMessages();
   *
   * const handleSendReaction = async (messageSerial: string, emoji: string) => {
   *   try {
   *     await sendReaction(messageSerial, {
   *       name: emoji
   *     });
   *   } catch (error) {
   *     console.error('Failed to send reaction:', error);
   *   }
   * };
   * ```
   */
  readonly sendReaction: (serial: string, params: SendMessageReactionParams) => Promise<void>;

  /**
   * A shortcut to the {@link MessageReactions.delete} method.
   *
   * Deletes a previously sent reaction from a chat message.
   *
   * The deletion behavior depends on the reaction type:
   * - **Unique**: Removes the client's single reaction (name not required)
   * - **Distinct**: Removes a specific reaction by name
   * - **Multiple**: Removes all instances of a reaction by name
   *
   * **Note**: This method uses the Ably Chat REST API and so does not require the room
   * to be attached to be called.
   *
   * This is a stable reference and will not be changed between renders for the same room.
   * @param serial - The unique identifier of the message to remove the reaction from
   * @param params - Optional parameters specifying which reaction to delete
   * @returns A Promise that resolves when the reaction has been deleted, or rejects with {@link Ably.ErrorInfo}
   * @example
   * ```tsx
   * const { deleteReaction } = useMessages();
   *
   * const handleDeleteReaction = async (messageSerial: string, emoji: string) => {
   *   try {
   *     await deleteReaction(messageSerial, {
   *       name: emoji
   *     });
   *   } catch (error) {
   *     console.error('Failed to delete reaction:', error);
   *   }
   * };
   * ```
   */
  readonly deleteReaction: (serial: string, params?: DeleteMessageReactionParams) => Promise<void>;

  /**
   * Retrieves the previous messages in the room.
   *
   * This method is available only if a {@link MessageListener} has been provided in the {@link UseMessagesParams}.
   * Calling will return a promise that resolves to a paginated response of the previous messages received in the room,
   * up until the listener was attached, in newest-to-oldest order.
   *
   * It is advised to call this method after any discontinuity event; to retrieve messages that may have been missed
   * before the listener was re-attached.
   *
   * See the {@link MessageSubscriptionResponse.historyBeforeSubscribe} documentation for more details.
   *
   * This is removed when the component unmounts or when the previously provided listener is removed.
   * @defaultValue - This will be undefined if no listener is provided in the {@link UseMessagesParams}.
   */
  readonly historyBeforeSubscribe?: MessageSubscriptionResponse['historyBeforeSubscribe'];
}

export interface UseMessagesParams extends StatusParams, Listenable<MessageListener> {
  /**
   * An optional listener that can be provided to receive new messages in the room.
   * The listener is removed when the component unmounts.
   * @example
   * ```tsx
   * useMessages({
   *   listener: (event) => {
   *     console.log(`Message ${event.type}:`, event.message.text);
   *   }
   * });
   * ```
   */
  listener?: MessageListener;

  /**
   * An optional listener that can be provided to receive reaction summaries to
   * messages in the room. The listener is removed when the component unmounts.
   * @example
   * ```tsx
   * useMessages({
   *   reactionsListener: (event) => {
   *     console.log('Reaction summary:', event.summary);
   *   }
   * });
   * ```
   */
  reactionsListener?: MessageReactionListener;

  /**
   * An optional listener that can be provided to receive individual reactions
   * to messages in the room. The listener is removed when the component
   * unmounts.
   * @example
   * ```tsx
   * useMessages({
   *   rawReactionsListener: (event) => {
   *     console.log('Raw reaction:', event.reaction.type);
   *   }
   * });
   * ```
   */
  rawReactionsListener?: MessageRawReactionListener;
}

/**
 *
 * A hook that provides access to the {@link Messages} instance in the room.
 *
 * If a listener is provided, it will subscribe to new messages in the room,
 * and will also set the {@link UseMessagesResponse.historyBeforeSubscribe}.
 *
 * **Note**:
 * - This hook must be used within a {@link ChatRoomProvider} component tree.
 * - Room must be attached to receive message events, typically the {@link ChatRoomProvider} handles this automatically.
 * @param params - Optional parameters for event listeners and room status callbacks
 * @returns A {@link UseMessagesResponse} containing message methods and room status
 * @throws An {@link Ably.ErrorInfo} with {@link chat-js!ErrorCode.ReactHookMustBeUsedWithinProvider | ReactHookMustBeUsedWithinProvider} When used outside of a {@link ChatRoomProvider}
 * @example Message listener and state management
 * ```tsx
 * import React, { useState } from 'react';
 * import { ChatClient, ChatMessageEventType, Message, ChatMessageEvent, MessageReactionSummaryEvent } from '@ably/chat';
 * import { ChatClientProvider, ChatRoomProvider, useMessages } from '@ably/chat/react';
 *
 * // Helper function to update local message state
 * const updateLocalMessageState = (messages: Message[], message: Message): Message[] => {
 *   // Find existing message in local state
 *   const existingIndex = messages.findIndex(m => m.serial === message.serial);
 *   let updatedMessages = [...messages];
 *
 *   if (existingIndex === -1) {
 *     // New message, add to local state
 *     updatedMessages.push(message);
 *   } else {
 *     // Update existing message using with() method
 *     updatedMessages[existingIndex] = updatedMessages[existingIndex].with(message);
 *   }
 *   // Sort by serial for deterministic ordering
 *   return updatedMessages.sort((a, b) => a.serial < b.serial ? -1 : (b.serial < a.serial ? 1 : 0));
 * };
 *
 * // Component that handles messages
 * const MessageHandler = () => {
 *   const [messages, setMessages] = useState<Message[]>([]);
 *
 *   const { sendMessage } = useMessages({
 *     listener: (event: ChatMessageEvent) => {
 *       console.log(`Message ${event.type}:`, event.message.text);
 *
 *       setMessages(prevMessages => {
 *         switch (event.type) {
 *           case ChatMessageEventType.Created:
 *           case ChatMessageEventType.Updated:
 *           case ChatMessageEventType.Deleted:
 *             return updateLocalMessageState(prevMessages, event.message);
 *           default:
 *             return prevMessages;
 *         }
 *       });
 *     },
 *     reactionsListener: (event: MessageReactionSummaryEvent) => {
 *       // Update message with new reaction data using with() method
 *       setMessages(prevMessages => {
 *         const messageIndex = prevMessages.findIndex(m => m.serial === event.messageSerial);
 *         if (messageIndex === -1) {
 *           // Message not found, return unchanged
 *           return prevMessages;
 *         }
 *
 *         // Update the specific message and return new array
 *         const updatedMessages = [...prevMessages];
 *         updatedMessages[messageIndex] = updatedMessages[messageIndex].with(event);
 *         return updatedMessages;
 *       });
 *     },
 *     onDiscontinuity: (error) => {
 *       console.error('Discontinuity detected:', error);
 *       // Clear local state and optionally re-fetch messages using historyBeforeSubscribe.
 *       setMessages([]);
 *     }
 *   });
 *
 *   return (
 *     <div>
 *       {messages.map(message => (
 *         <div key={message.serial}>
 *           <strong>{message.clientId}:</strong> {message.isDeleted ? <em>Deleted Message</em>: message.text}
 *             <div>
 *               {Object.entries(message.reactions.unique).map(([reaction, summary]) => (
 *                 <span key={`unique-${reaction}`}>{reaction} {summary.total}</span>
 *               ))}
 *               {Object.entries(message.reactions.distinct).map(([reaction, summary]) => (
 *                 <span key={`distinct-${reaction}`}>{reaction} {summary.total}</span>
 *               ))}
 *               {Object.entries(message.reactions.multiple).map(([reaction, summary]) => (
 *                 <span key={`multiple-${reaction}`}>{reaction} {summary.total}</span>
 *               ))}
 *             </div>
 *         </div>
 *       ))}
 *     </div>
 *   );
 * };
 *
 * const chatClient: ChatClient; // existing ChatClient instance
 *
 * const App = () => {
 *   return (
 *     <ChatClientProvider client={chatClient}>
 *       <ChatRoomProvider name="general-chat">
 *         <MessageHandler />
 *       </ChatRoomProvider>
 *     </ChatClientProvider>
 *   );
 * };
 * ```
 */
export const useMessages = (params?: UseMessagesParams): UseMessagesResponse => {
  const { currentStatus: connectionStatus, error: connectionError } = useChatConnection({
    onStatusChange: params?.onConnectionStatusChange,
  });
  const context = useRoomContext('useMessages');
  const { status: roomStatus, error: roomError } = useRoomStatus(params);

  const logger = useRoomLogger();
  logger.trace('useMessages();', { params });

  // we are storing the params in a ref so that we don't end up with an infinite loop should the user pass
  // in an unstable reference
  const listenerRef = useEventListenerRef(params?.listener);
  const reactionsListenerRef = useEventListenerRef(params?.reactionsListener);
  const rawReactionsListenerRef = useEventListenerRef(params?.rawReactionsListener);
  const onDiscontinuityRef = useEventListenerRef(params?.onDiscontinuity);

  const sendMessage = useCallback(
    async (params: SendMessageParams) => {
      const room = await context.room;
      return room.messages.send(params);
    },
    [context],
  );

  const getMessage = useCallback(
    async (serial: string) => {
      const room = await context.room;
      return room.messages.get(serial);
    },
    [context],
  );

  const deleteMessage = useCallback(
    async (serial: string, details?: OperationDetails) => {
      const room = await context.room;
      return room.messages.delete(serial, details);
    },
    [context],
  );

  const history = useCallback(
    async (params: HistoryParams) => {
      const room = await context.room;
      return room.messages.history(params);
    },
    [context],
  );

  const updateMessage = useCallback(
    async (serial: string, updateParams: UpdateMessageParams, details?: OperationDetails) => {
      const room = await context.room;
      return room.messages.update(serial, updateParams, details);
    },
    [context],
  );

  const sendReaction: Messages['reactions']['send'] = useCallback(
    async (serial: string, params: SendMessageReactionParams) => {
      const room = await context.room;
      return room.messages.reactions.send(serial, params);
    },
    [context],
  );

  const deleteReaction: Messages['reactions']['delete'] = useCallback(
    async (serial: string, params?: DeleteMessageReactionParams) => {
      const room = await context.room;
      return room.messages.reactions.delete(serial, params);
    },
    [context],
  );

  const [historyBeforeSubscribe, setHistoryBeforeSubscribe] =
    useState<MessageSubscriptionResponse['historyBeforeSubscribe']>();

  useEffect(() => {
    if (!listenerRef) return;

    return wrapRoomPromise(
      context.room,
      (room) => {
        let unmounted = false;
        logger.debug('useMessages(); applying listener');
        const sub = room.messages.subscribe(listenerRef);

        // set the historyBeforeSubscribe method if a listener is provided
        setHistoryBeforeSubscribe(() => {
          logger.debug('useMessages(); setting historyBeforeSubscribe state', {
            status: room.status,
            unmounted,
          });
          if (unmounted) {
            return;
          }

          return async (params: Omit<HistoryParams, 'orderBy'>) => {
            // If we've unmounted, then the subscription is gone and we can't call historyBeforeSubscribe
            // So return a dummy object that should be thrown away anyway
            logger.debug('useMessages(); historyBeforeSubscribe called');
            if (unmounted) {
              throw new Ably.ErrorInfo(
                'unable to query messages; component unmounted',
                ErrorCode.ReactComponentUnmounted,
                400,
              );
            }
            return sub.historyBeforeSubscribe(params);
          };
        });

        return () => {
          logger.debug('useMessages(); removing listener and historyBeforeSubscribe state');
          unmounted = true;
          sub.unsubscribe();
          setHistoryBeforeSubscribe(undefined);
        };
      },
      logger,
    ).unmount();
  }, [context, logger, listenerRef]);

  useEffect(() => {
    if (!onDiscontinuityRef) return;
    return wrapRoomPromise(
      context.room,
      (room) => {
        logger.debug('useMessages(); applying onDiscontinuity listener');
        const { off } = room.onDiscontinuity(onDiscontinuityRef);
        return () => {
          logger.debug('useMessages(); removing onDiscontinuity listener');
          off();
        };
      },
      logger,
    ).unmount();
  }, [context, logger, onDiscontinuityRef]);

  useEffect(() => {
    if (!reactionsListenerRef) return;
    return wrapRoomPromise(
      context.room,
      (room) => {
        logger.debug('useMessages(); applying reactions listener');
        const { unsubscribe } = room.messages.reactions.subscribe(reactionsListenerRef);
        return () => {
          logger.debug('useMessages(); removing reactions listener');
          unsubscribe();
        };
      },
      logger,
    ).unmount();
  }, [context, logger, reactionsListenerRef]);

  useEffect(() => {
    if (!rawReactionsListenerRef) return;
    return wrapRoomPromise(
      context.room,
      (room) => {
        logger.debug('useMessages(); applying raw reactions listener');
        const { unsubscribe } = room.messages.reactions.subscribeRaw(rawReactionsListenerRef);
        return () => {
          logger.debug('useMessages(); removing raw reactions listener');
          unsubscribe();
        };
      },
      logger,
    ).unmount();
  }, [context, logger, rawReactionsListenerRef]);

  return {
    connectionStatus,
    connectionError,
    roomStatus,
    roomError,
    sendMessage,
    getMessage,
    updateMessage,
    history,
    deleteMessage,
    sendReaction,
    deleteReaction,
    historyBeforeSubscribe,
  };
};

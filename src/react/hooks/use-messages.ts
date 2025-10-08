import * as Ably from 'ably';
import { useCallback, useEffect, useState } from 'react';

import type {
  DeleteMessageReactionParams,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  MessageReactions,
  SendMessageReactionParams,
} from '../../core/message-reactions.js'; // imported for typedoc links
import { MessageRawReactionListener, MessageReactionListener } from '../../core/message-reactions.js';
import {
  DeleteMessageParams,
  HistoryParams,
  MessageListener,
  Messages,
  MessageSubscriptionResponse,
  OperationDetails,
  SendMessageParams,
  UpdateMessageParams,
} from '../../core/messages.js';
import { Serial } from '../../core/serial.js';
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
   * This is a stable reference and will not be changed between renders for the same room.
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
  readonly sendMessage: Messages['send'];

  /**
   * A shortcut to the {@link Messages.get} method.
   *
   * This is a stable reference and will not be changed between renders for the same room.
   * @example
   * ```tsx
   * const { getMessage } = useMessages();
   *
   * const handleGetMessage = async (messageSerial: string) => {
   *   try {
   *     const message = await getMessage(messageSerial);
   *     console.log('Retrieved message:', message.text);
   *   } catch (error) {
   *     console.error('Failed to get message:', error);
   *   }
   * };
   * ```
   */
  readonly getMessage: Messages['get'];

  /**
   * A shortcut to the {@link Messages.update} method.
   *
   * This is a stable reference and will not be changed between renders for the same room.
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
  readonly updateMessage: Messages['update'];

  /**
   * A shortcut to the {@link Messages.history} method.
   *
   * This is a stable reference and will not be changed between renders for the same room.
   * @example
   * ```tsx
   * const { history } = useMessages();
   *
   * const loadHistory = async () => {
   *   try {
   *     const result = await history({
   *       limit: 50,
   *       direction: 'backwards'
   *     });
   *     console.log('Previous messages:', result.items);
   *   } catch (error) {
   *     console.error('Failed to load history:', error);
   *   }
   * };
   * ```
   */
  readonly history: Messages['history'];

  /**
   * A shortcut to the {@link Messages.delete} method.
   *
   * This is a stable reference and will not be changed between renders for the same room.
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
  readonly deleteMessage: Messages['delete'];

  /**
   * A shortcut to the {@link MessageReactions.send} method.
   *
   * This is a stable reference and will not be changed between renders for the same room.
   * @example
   * ```tsx
   * const { sendReaction } = useMessages();
   *
   * const handleSendReaction = async (messageSerial: string, emoji: string) => {
   *   try {
   *     await sendReaction(messageSerial, {
   *       type: emoji
   *     });
   *   } catch (error) {
   *     console.error('Failed to send reaction:', error);
   *   }
   * };
   * ```
   */
  readonly sendReaction: Messages['reactions']['send'];

  /**
   * A shortcut to the {@link MessageReactions.delete} method.
   *
   * This is a stable reference and will not be changed between renders for the same room.
   * @example
   * ```tsx
   * const { deleteReaction } = useMessages();
   *
   * const handleDeleteReaction = async (messageSerial: string, emoji: string) => {
   *   try {
   *     await deleteReaction(messageSerial, {
   *       type: emoji
   *     });
   *   } catch (error) {
   *     console.error('Failed to delete reaction:', error);
   *   }
   * };
   * ```
   */
  readonly deleteReaction: Messages['reactions']['delete'];

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
   * @param params - The query parameters to use when fetching the previous messages.
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
 *A hook that provides access to the {@link Messages} instance in the room.
 *
 *If a listener is provided, it will subscribe to new messages in the room,
 *and will also set the {@link UseMessagesResponse.historyBeforeSubscribe}.
 *
 ***Note**: This hook must be used within a {@link ChatRoomProvider} component tree.
 ***Note**: Room must be attached to receive message events, typically the {@link ChatRoomProvider} handles this automatically.
 * @param params - Optional parameters for event listeners and room status callbacks
 * @returns A {@link UseMessagesResponse} containing message methods and room status
 * @throws {Ably.ErrorInfo} When used outside of a {@link ChatRoomProvider}
 * @example Message listener and state management
 * ```tsx
 * import React, { useState } from 'react';
 * import { ChatClient, ChatMessageEventType, Message, ChatMessageEvent, MessageReactionSummaryEvent } from '@ably/chat';
 * import { ChatClientProvider, ChatRoomProvider, useMessages } from '@ably/chat/react';
 *
 * // Helper function to update local message state
 * const updateLocalMessageState = (messages: Message[], message: Message): Message[] => {
 *   // Find existing message in local state
 *   const existingIndex = messages.findIndex(m => m.equal(message));
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
 *   return updatedMessages.sort((a, b) => a.before(b) ? -1 : (b.before(a) ? 1 : 0));
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
 *         const messageIndex = prevMessages.findIndex(m => m.serial === event.summary.messageSerial);
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
    (params: SendMessageParams) => context.room.then((room) => room.messages.send(params)),
    [context],
  );

  const getMessage = useCallback((serial: Serial) => context.room.then((room) => room.messages.get(serial)), [context]);

  const deleteMessage = useCallback(
    (serial: Serial, deleteMessageParams?: DeleteMessageParams) =>
      context.room.then((room) => room.messages.delete(serial, deleteMessageParams)),
    [context],
  );

  const history = useCallback(
    (params: HistoryParams) => context.room.then((room) => room.messages.history(params)),
    [context],
  );

  const updateMessage = useCallback(
    (serial: Serial, updateParams: UpdateMessageParams, details?: OperationDetails) =>
      context.room.then((room) => room.messages.update(serial, updateParams, details)),
    [context],
  );

  const sendReaction: Messages['reactions']['send'] = useCallback(
    (serial: Serial, params: SendMessageReactionParams) =>
      context.room.then((room) => room.messages.reactions.send(serial, params)),
    [context],
  );

  const deleteReaction: Messages['reactions']['delete'] = useCallback(
    (serial: Serial, params?: DeleteMessageReactionParams) =>
      context.room.then((room) => room.messages.reactions.delete(serial, params)),
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

          return (params: Omit<HistoryParams, 'orderBy'>) => {
            // If we've unmounted, then the subscription is gone and we can't call historyBeforeSubscribe
            // So return a dummy object that should be thrown away anyway
            logger.debug('useMessages(); historyBeforeSubscribe called');
            if (unmounted) {
              return Promise.reject(new Ably.ErrorInfo('component unmounted', 40000, 400));
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

import * as Ably from 'ably';
import { useCallback, useEffect, useState } from 'react';

import {
  DeleteMessageParams,
  MessageListener,
  Messages,
  MessageSubscriptionResponse,
  OperationDetails,
  QueryOptions,
  SendMessageParams,
  UpdateMessageParams,
} from '../../core/messages.js';
import type {
  AddMessageReactionParams,
  DeleteMessageReactionParams,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  MessagesReactions,
} from '../../core/messages-reactions.js'; // imported for typedoc links
import { MessageRawReactionListener, MessageReactionListener } from '../../core/messages-reactions.js';
import { Serial } from '../../core/serial.js';
import { wrapRoomPromise } from '../helper/room-promise.js';
import { useEventListenerRef } from '../helper/use-event-listener-ref.js';
import { useEventualRoomProperty } from '../helper/use-eventual-room.js';
import { useRoomContext } from '../helper/use-room-context.js';
import { useRoomStatus } from '../helper/use-room-status.js';
import { ChatStatusResponse } from '../types/chat-status-response.js';
import { Listenable } from '../types/listenable.js';
import { StatusParams } from '../types/status-params.js';
import { useChatConnection } from './use-chat-connection.js';
import { useRoomLogger } from './use-logger.js';

/**
 * The response from the {@link useMessages} hook.
 */
export interface UseMessagesResponse extends ChatStatusResponse {
  /**
   * A shortcut to the {@link Messages.send} method.
   */
  readonly send: Messages['send'];

  /**
   * A shortcut to the {@link Messages.update} method.
   */
  readonly update: Messages['update'];

  /**
   * A shortcut to the {@link Messages.history} method.
   */
  readonly history: Messages['history'];

  /**
   * A shortcut to the {@link Messages.delete} method.
   */
  readonly deleteMessage: Messages['delete'];

  /**
   * A shortcut to the {@link MessagesReactions.send} method.
   */
  readonly sendReaction: Messages['reactions']['send'];

  /**
   * A shortcut to the {@link MessagesReactions.delete} method.
   */
  readonly deleteReaction: Messages['reactions']['delete'];

  /**
   * Provides access to the underlying {@link Messages} instance of the room.
   */
  readonly messages?: Messages;

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
   * This is removed when the component unmounts or when the previously provided listener is removed.
   *
   * @param options - The query options to use when fetching the previous messages.
   *
   * @defaultValue - This will be undefined if no listener is provided in the {@link UseMessagesParams}.
   */
  readonly historyBeforeSubscribe?: MessageSubscriptionResponse['historyBeforeSubscribe'];
}

export interface UseMessagesParams extends StatusParams, Listenable<MessageListener> {
  /**
   * An optional listener that can be provided to receive new messages in the room.
   * The listener is removed when the component unmounts.
   */
  listener?: MessageListener;

  /**
   * An optional listener that can be provided to receive reaction summaries to
   * messages in the room. The listener is removed when the component unmounts.
   */
  reactionsListener?: MessageReactionListener;

  /**
   * An optional listener that can be provided to receive individual reactions
   * to messages in the room. The listener is removed when the component
   * unmounts.
   */
  rawReactionsListener?: MessageRawReactionListener;
}

/**
 * A hook that provides access to the {@link Messages} instance in the room.
 * It will use the instance belonging to the room in the nearest {@link ChatRoomProvider} in the component tree.
 * If a listener is provided, it will subscribe to new messages in the room,
 * and will also set the {@link UseMessagesResponse.historyBeforeSubscribe}.
 *
 * @param params - Allows the registering of optional callbacks.
 * @returns UsePresenceResponse - An object containing the {@link Messages} instance and methods to interact with it.
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

  const send = useCallback(
    (params: SendMessageParams) => context.room.then((room) => room.messages.send(params)),
    [context],
  );
  const deleteMessage = useCallback(
    (serial: Serial, deleteMessageParams?: DeleteMessageParams) =>
      context.room.then((room) => room.messages.delete(serial, deleteMessageParams)),
    [context],
  );
  const history = useCallback(
    (options: QueryOptions) => context.room.then((room) => room.messages.history(options)),
    [context],
  );
  const update = useCallback(
    (serial: Serial, updateParams: UpdateMessageParams, details?: OperationDetails) =>
      context.room.then((room) => room.messages.update(serial, updateParams, details)),
    [context],
  );

  const sendReaction: Messages['reactions']['send'] = useCallback(
    (serial: Serial, params: AddMessageReactionParams) =>
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

          return (params: Omit<QueryOptions, 'orderBy'>) => {
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
    send,
    update,
    history,
    deleteMessage,
    sendReaction,
    deleteReaction,
    historyBeforeSubscribe,
    messages: useEventualRoomProperty((room) => room.messages),
  };
};

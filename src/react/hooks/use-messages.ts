import {
  DeleteMessageParams,
  Message,
  MessageListener,
  Messages,
  MessageSubscriptionResponse,
  OperationDetails,
  QueryOptions,
  SendMessageParams,
  UpdateMessageParams,
} from '@ably/chat';
import * as Ably from 'ably';
import { useCallback, useEffect, useState } from 'react';

import { wrapRoomPromise } from '../helper/room-promise.js';
import { useEventListenerRef } from '../helper/use-event-listener-ref.js';
import { useEventualRoomProperty } from '../helper/use-eventual-room.js';
import { useRoomContext } from '../helper/use-room-context.js';
import { useRoomStatus } from '../helper/use-room-status.js';
import { ChatStatusResponse } from '../types/chat-status-response.js';
import { Listenable } from '../types/listenable.js';
import { StatusParams } from '../types/status-params.js';
import { useChatConnection } from './use-chat-connection.js';
import { useLogger } from './use-logger.js';

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
   * A shortcut to the {@link Messages.get} method.
   */
  readonly get: Messages['get'];

  /**
   * A shortcut to the {@link Messages.delete} method.
   */
  readonly deleteMessage: Messages['delete'];

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
  readonly getPreviousMessages?: MessageSubscriptionResponse['getPreviousMessages'];
}

export interface UseMessagesParams extends StatusParams, Listenable<MessageListener> {
  /**
   * An optional listener that can be provided to receive new messages in the room.
   * The listener is removed when the component unmounts.
   */
  listener?: MessageListener;
}

/**
 * A hook that provides access to the {@link Messages} instance in the room.
 * It will use the instance belonging to the room in the nearest {@link ChatRoomProvider} in the component tree.
 * If a listener is provided, it will subscribe to new messages in the room,
 * and will also set the {@link UseMessagesResponse.getPreviousMessages}.
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

  const logger = useLogger();
  logger.trace('useMessages();', { params, roomId: context.roomId });

  // we are storing the params in a ref so that we don't end up with an infinite loop should the user pass
  // in an unstable reference
  const listenerRef = useEventListenerRef(params?.listener);
  const onDiscontinuityRef = useEventListenerRef(params?.onDiscontinuity);

  const send = useCallback(
    (params: SendMessageParams) => context.room.then((room) => room.messages.send(params)),
    [context],
  );
  const deleteMessage = useCallback(
    (message: Message, deleteMessageParams?: DeleteMessageParams) =>
      context.room.then((room) => room.messages.delete(message, deleteMessageParams)),
    [context],
  );
  const get = useCallback(
    (options: QueryOptions) => context.room.then((room) => room.messages.get(options)),
    [context],
  );
  const update = useCallback(
    (message: Message, update: UpdateMessageParams, details?: OperationDetails) =>
      context.room.then((room) => room.messages.update(message, update, details)),
    [context],
  );

  const [getPreviousMessages, setGetPreviousMessages] = useState<MessageSubscriptionResponse['getPreviousMessages']>();

  useEffect(() => {
    if (!listenerRef) return;

    return wrapRoomPromise(
      context.room,
      (room) => {
        let unmounted = false;
        logger.debug('useMessages(); applying listener', { roomId: context.roomId });
        const sub = room.messages.subscribe(listenerRef);

        // set the getPreviousMessages method if a listener is provided
        setGetPreviousMessages(() => {
          logger.debug('useMessages(); setting getPreviousMessages state', {
            roomId: context.roomId,
            status: room.status,
            unmounted,
          });
          if (unmounted) {
            return;
          }

          return (params: Omit<QueryOptions, 'orderBy'>) => {
            // If we've unmounted, then the subscription is gone and we can't call getPreviousMessages
            // So return a dummy object that should be thrown away anyway
            logger.debug('useMessages(); getPreviousMessages called', { roomId: context.roomId });
            if (unmounted) {
              return Promise.reject(new Ably.ErrorInfo('component unmounted', 40000, 400));
            }
            return sub.getPreviousMessages(params);
          };
        });

        return () => {
          logger.debug('useMessages(); removing listener and getPreviousMessages state', { roomId: context.roomId });
          unmounted = true;
          sub.unsubscribe();
          setGetPreviousMessages(undefined);
        };
      },
      logger,
      context.roomId,
    ).unmount();
  }, [context, logger, listenerRef]);

  useEffect(() => {
    if (!onDiscontinuityRef) return;
    return wrapRoomPromise(
      context.room,
      (room) => {
        logger.debug('useMessages(); applying onDiscontinuity listener', { roomId: context.roomId });
        const { off } = room.messages.onDiscontinuity(onDiscontinuityRef);
        return () => {
          logger.debug('useMessages(); removing onDiscontinuity listener', { roomId: context.roomId });
          off();
        };
      },
      logger,
      context.roomId,
    ).unmount();
  }, [context, logger, onDiscontinuityRef]);

  return {
    messages: useEventualRoomProperty((room) => room.messages),
    send,
    update,
    get,
    deleteMessage,
    getPreviousMessages,
    connectionStatus,
    connectionError,
    roomStatus,
    roomError,
  };
};

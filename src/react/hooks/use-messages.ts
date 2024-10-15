import {
  Message,
  MessageListener,
  Messages,
  MessageSubscriptionResponse,
  PaginatedResult,
  QueryOptions,
  SendMessageParams,
} from '@ably/chat';
import { useCallback, useEffect, useState } from 'react';

import { wrapRoomPromise } from '../helper/room-promise.js';
import { useEventListenerRef } from '../helper/use-event-listener-ref.js';
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
   * A shortcut to the {@link Messages.get} method.
   */
  readonly get: Messages['get'];

  /**
   * Retrieves the previous messages in the room.
   *
   * This method is available only if a {@link MessageListener} has been provided in the {@link UseMessagesParams}.
   * Calling will return a promise that resolves to a paginated response of the previous messages received in the room,
   * up until the listener was attached, in the oldest to newest order.
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
 * and will also set the {@link getPreviousMessages}.
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
  const get = useCallback(
    (options: QueryOptions) => context.room.then((room) => room.messages.get(options)),
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
            status: room.status.current,
            unmounted,
          });
          if (unmounted) {
            return;
          }

          return (params: Omit<QueryOptions, 'direction'>) => {
            // If we've unmounted, then the subscription is gone and we can't call getPreviousMessages
            // So return a dummy object that should be thrown away anyway
            logger.debug('useMessages(); getPreviousMessages called', { roomId: context.roomId });
            if (unmounted) {
              return Promise.reject(new Error('Component unmounted'));
              logger.debug('useMessages(); getPreviousMessages called after unmount', { roomId: context.roomId });
              return Promise.resolve({
                items: [],
                hasNext: () => false,
                isLast: () => true,
                next: () => undefined as unknown as Promise<PaginatedResult<Message>> | null,
                previous: () => undefined as unknown as Promise<PaginatedResult<Message>>,
                current: () => undefined as unknown as Promise<PaginatedResult<Message>>,
                first: () => undefined as unknown as Promise<PaginatedResult<Message>>,
              }) as Promise<PaginatedResult<Message>>;
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
    send,
    get,
    getPreviousMessages,
    connectionStatus,
    connectionError,
    roomStatus,
    roomError,
  };
};

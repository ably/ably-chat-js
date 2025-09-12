import { useCallback, useEffect } from 'react';

import { RoomReactionListener, RoomReactions, SendReactionParams } from '../../core/room-reactions.js';
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
 * The parameters for the {@link useRoomReactions} hook.
 */
export interface UseRoomReactionsParams extends StatusParams, Listenable<RoomReactionListener> {
  /**
   * A listener that will be called whenever a reaction is sent to the room.
   */
  listener?: RoomReactionListener;
}

/**
 * The response type from the {@link useRoomReactions} hook.
 */
export interface UseRoomReactionsResponse extends ChatStatusResponse {
  /**
   * A shortcut to the {@link RoomReactions.send} method.
   */
  readonly sendRoomReaction: RoomReactions['send'];
}

/**
 * A hook that provides access to the {@link RoomReactions} instance in the room.
 * It will use the instance belonging to the nearest {@link ChatRoomProvider} in the component tree.
 * @param params - Allows the registering of optional callbacks.
 * @returns UseRoomReactionsResponse
 */
export const useRoomReactions = (params?: UseRoomReactionsParams): UseRoomReactionsResponse => {
  const { currentStatus: connectionStatus, error: connectionError } = useChatConnection({
    onStatusChange: params?.onConnectionStatusChange,
  });

  const context = useRoomContext('useRoomReactions');
  const { status: roomStatus, error: roomError } = useRoomStatus(params);
  const logger = useRoomLogger();
  logger.trace('useRoomReactions();', { params });

  // create stable references for the listeners
  const listenerRef = useEventListenerRef(params?.listener);
  const onDiscontinuityRef = useEventListenerRef(params?.onDiscontinuity);

  // if provided, subscribes the user provided discontinuity listener
  useEffect(() => {
    if (!onDiscontinuityRef) return;
    return wrapRoomPromise(
      context.room,
      (room) => {
        logger.debug('useRoomReactions(); applying onDiscontinuity listener');
        const { off } = room.onDiscontinuity(onDiscontinuityRef);
        return () => {
          logger.debug('useRoomReactions(); removing onDiscontinuity listener');
          off();
        };
      },
      logger,
    ).unmount();
  }, [context, onDiscontinuityRef, logger]);

  // if provided, subscribe the user provided listener to room reactions
  useEffect(() => {
    if (!listenerRef) return;
    return wrapRoomPromise(
      context.room,
      (room) => {
        logger.debug('useRoomReactions(); applying listener');
        const { unsubscribe } = room.reactions.subscribe(listenerRef);
        return () => {
          logger.debug('useRoomReactions(); removing listener');
          unsubscribe();
        };
      },
      logger,
    ).unmount();
  }, [context, listenerRef, logger]);

  const sendRoomReaction = useCallback(
    (params: SendReactionParams) => context.room.then((room) => room.reactions.send(params)),
    [context],
  );

  return {
    connectionStatus,
    connectionError,
    roomStatus,
    roomError,
    sendRoomReaction,
  };
};

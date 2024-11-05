import { RoomReactionListener, RoomReactions, SendReactionParams } from '@ably/chat';
import { useCallback, useEffect } from 'react';

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
  readonly send: RoomReactions['send'];

  /**
   * Provides access to the underlying {@link RoomReactions} instance of the room.
   */
  readonly reactions?: RoomReactions;
}

/**
 * A hook that provides access to the {@link RoomReactions} instance in the room.
 * It will use the instance belonging to the nearest {@link ChatRoomProvider} in the component tree.
 *
 * @param params - Allows the registering of optional callbacks.
 * @returns UseRoomReactionsResponse
 */
export const useRoomReactions = (params?: UseRoomReactionsParams): UseRoomReactionsResponse => {
  const { currentStatus: connectionStatus, error: connectionError } = useChatConnection({
    onStatusChange: params?.onConnectionStatusChange,
  });

  const context = useRoomContext('useRoomReactions');
  const { status: roomStatus, error: roomError } = useRoomStatus(params);
  const logger = useLogger();
  logger.trace('useRoomReactions();', { params, roomId: context.roomId });

  // create stable references for the listeners
  const listenerRef = useEventListenerRef(params?.listener);
  const onDiscontinuityRef = useEventListenerRef(params?.onDiscontinuity);

  // if provided, subscribes the user provided discontinuity listener
  useEffect(() => {
    if (!onDiscontinuityRef) return;
    return wrapRoomPromise(
      context.room,
      (room) => {
        logger.debug('useRoomReactions(); applying onDiscontinuity listener', { roomId: context.roomId });
        const { off } = room.reactions.onDiscontinuity(onDiscontinuityRef);
        return () => {
          logger.debug('useRoomReactions(); removing onDiscontinuity listener', { roomId: context.roomId });
          off();
        };
      },
      logger,
      context.roomId,
    ).unmount();
  }, [context, onDiscontinuityRef, logger]);

  // if provided, subscribe the user provided listener to room reactions
  useEffect(() => {
    if (!listenerRef) return;
    return wrapRoomPromise(
      context.room,
      (room) => {
        logger.debug('useRoomReactions(); applying listener', { roomId: context.roomId });
        const { unsubscribe } = room.reactions.subscribe(listenerRef);
        return () => {
          logger.debug('useRoomReactions(); removing listener', { roomId: context.roomId });
          unsubscribe();
        };
      },
      logger,
      context.roomId,
    ).unmount();
  }, [context, listenerRef, logger]);

  const send = useCallback(
    (params: SendReactionParams) => context.room.then((room) => room.reactions.send(params)),
    [context],
  );

  return {
    reactions: useEventualRoomProperty((room) => room.reactions),
    connectionStatus,
    connectionError,
    roomStatus,
    roomError,
    send,
  };
};

import { RoomReactionListener, RoomReactions, SendReactionParams } from '@ably/chat';
import { useCallback, useEffect } from 'react';

import { ChatStatusResponse } from '../types/chat-status-response.js';
import { Listenable } from '../types/listenable.js';
import { StatusParams } from '../types/status-params.js';
import { useChatConnection } from './use-chat-connection.js';
import { useRoom } from './use-room.js';

/**
 * The options for the {@link useRoomReactions} hook.
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
   * Provides access to the underlying {@link RoomReactions} instance of the chat room.
   */
  readonly reactions: RoomReactions;
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
  const { room, roomError, roomStatus } = useRoom({
    onStatusChange: params?.onRoomStatusChange,
  });

  // if provided, subscribes the user provided discontinuity listener
  useEffect(() => {
    if (!params?.onDiscontinuity) return;
    const { off } = room.reactions.onDiscontinuity(params.onDiscontinuity);
    return () => {
      off();
    };
  }, [room, params]);

  // if provided, subscribe the user provided listener to room reactions
  useEffect(() => {
    if (!params?.listener) return;
    const { unsubscribe } = room.reactions.subscribe(params.listener);
    return () => {
      unsubscribe();
    };
  }, [room, params]);

  const send = useCallback((params: SendReactionParams) => room.reactions.send(params), [room.reactions]);

  return {
    connectionStatus,
    connectionError,
    roomStatus,
    roomError,
    send,
    reactions: room.reactions,
  };
};
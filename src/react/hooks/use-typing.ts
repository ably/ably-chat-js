import { ErrorCodes, errorInfoIs, Typing, TypingEvent, TypingListener } from '@ably/chat';
import * as Ably from 'ably';
import { useCallback, useEffect, useState } from 'react';

import { useEventListenerRef } from '../helper/use-event-listener-ref.js';
import { ChatStatusResponse } from '../types/chat-status-response.js';
import { Listenable } from '../types/listenable.js';
import { StatusParams } from '../types/status-params.js';
import { useChatConnection } from './use-chat-connection.js';
import { useLogger } from './use-logger.js';
import { useRoom } from './use-room.js';

/**
 * The parameters for the {@link useTyping} hook.
 */
export interface TypingParams extends StatusParams, Listenable<TypingListener> {
  /**
   * A listener that will be called whenever a typing event is sent to the room.
   * The listener is removed when the component unmounts.
   *
   */
  listener?: TypingListener;
}

export interface UseTypingResponse extends ChatStatusResponse {
  /**
   * A shortcut to the {@link Typing.start} method.
   */
  readonly start: Typing['start'];

  /**
   * A shortcut to the {@link Typing.stop} method.
   */
  readonly stop: Typing['stop'];

  /**
   * A state value representing the set of client IDs that are currently typing in the room.
   * It automatically updates based on typing events received from the room.
   */
  readonly currentlyTyping: TypingEvent['currentlyTyping'];

  /**
   * Provides access to the underlying {@link Typing} instance of the room.
   */
  readonly typingIndicators: Typing;

  /**
   * A state value representing the current error state of the hook, this will be an instance of {@link Ably.ErrorInfo} or `undefined`.
   * An error can occur during mount when initially fetching the current typing state; this does not mean that further
   * updates will not be received, and so the hook might recover from this state on its own.
   */
  readonly error?: Ably.ErrorInfo;
}

/**
 * A hook that provides access to the {@link Typing} instance in the room.
 * It will use the instance belonging to the room in the nearest {@link ChatRoomProvider} in the component tree.
 *
 * @param params - Allows the registering of optional callbacks.
 * @returns UseTypingResponse - An object containing the {@link Typing} instance and methods to interact with it.
 */
export const useTyping = (params?: TypingParams): UseTypingResponse => {
  const { currentStatus: connectionStatus, error: connectionError } = useChatConnection({
    onStatusChange: params?.onConnectionStatusChange,
  });
  const { room, roomError, roomStatus } = useRoom({
    onStatusChange: params?.onRoomStatusChange,
  });
  const logger = useLogger();
  logger.trace('useTyping();', { roomId: room.roomId });

  const [currentlyTyping, setCurrentlyTyping] = useState<Set<string>>(new Set());
  const [error, setError] = useState<Ably.ErrorInfo | undefined>();

  // Create a stable reference for the listeners
  const listenerRef = useEventListenerRef(params?.listener);
  const onDiscontinuityRef = useEventListenerRef(params?.onDiscontinuity);

  useEffect(() => {
    // Start with a clean slate - no errors and empty set
    setError(undefined);
    setCurrentlyTyping((prev) => {
      // keep reference constant if it's already empty
      if (prev.size === 0) return prev;
      return new Set<string>();
    });

    let mounted = true;

    const setErrorState = (error?: Ably.ErrorInfo) => {
      if (error === undefined) {
        logger.debug('useTyping(); clearing error state', { roomId: room.roomId });
      } else {
        logger.error('useTyping(); setting error state', { error, roomId: room.roomId });
      }
      setError(error);
    };

    room.typing
      .get()
      .then((currentlyTyping) => {
        if (!mounted) return;
        setCurrentlyTyping(currentlyTyping);
      })
      .catch((error: unknown) => {
        const errorInfo = error as Ably.ErrorInfo;
        if (!mounted || errorInfoIs(errorInfo, ErrorCodes.RoomIsReleased)) return;

        setErrorState(errorInfo);
      });

    const subscription = room.typing.subscribe((event) => {
      setErrorState(undefined);
      setCurrentlyTyping(event.currentlyTyping);
    });

    // cleanup function
    return () => {
      logger.debug('useTyping(); unsubscribing from typing events', { roomId: room.roomId });
      mounted = false;
      subscription.unsubscribe();
    };
  }, [room, logger]);

  // if provided, subscribes the user-provided onDiscontinuity listener
  useEffect(() => {
    if (!onDiscontinuityRef) return;
    logger.debug('useTyping(); applying onDiscontinuity listener', { roomId: room.roomId });
    const { off } = room.typing.onDiscontinuity(onDiscontinuityRef);
    return () => {
      logger.debug('useTyping(); removing onDiscontinuity listener', { roomId: room.roomId });
      off();
    };
  }, [room, onDiscontinuityRef, logger]);

  // if provided, subscribe the user-provided listener to TypingEvents
  useEffect(() => {
    if (!listenerRef) return;
    logger.debug('useTyping(); applying listener', { roomId: room.roomId });
    const { unsubscribe } = room.typing.subscribe(listenerRef);
    return () => {
      logger.debug('useTyping(); removing listener', { roomId: room.roomId });
      unsubscribe();
    };
  }, [room, listenerRef, logger]);

  // memoize the methods to avoid re-renders, and ensure the same instance is used
  const start = useCallback(() => room.typing.start(), [room.typing]);
  const stop = useCallback(() => room.typing.stop(), [room.typing]);

  return {
    connectionStatus,
    connectionError,
    roomStatus,
    roomError,
    error,
    start,
    stop,
    currentlyTyping,
    typingIndicators: room.typing,
  };
};

import { Typing, TypingEvent, TypingListener, TypingSubscriptionResponse } from '@ably/chat';
import * as Ably from 'ably';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ChatStatusResponse } from '../types/chat-status-response.js';
import { Listenable } from '../types/listenable.js';
import { StatusParams } from '../types/status-params.js';
import { useChatConnection } from './use-chat-connection.js';
import { useRoom } from './use-room.js';

/**
 * The options for the {@link useTyping} hook.
 */
export interface TypingParams extends StatusParams, Listenable<TypingListener> {
  /**
   * A listener that will be called whenever a typing event is sent to the room.
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
   * The set of client IDs that are currently typing in the room.
   */
  readonly currentlyTyping: TypingEvent['currentlyTyping'];

  /**
   * Provides access to the underlying {@link Typing} instance of the room.
   */
  readonly typingIndicators: Typing;

  /**
   * The current error state of the hook, this will be an instance of {@link Ably.ErrorInfo} or `undefined`.
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

  const [currentlyTyping, setCurrentlyTyping] = useState<Set<string>>(new Set());
  const [error, setError] = useState<Ably.ErrorInfo | undefined>();
  const errorRef = useRef<Ably.ErrorInfo | undefined>();

  const setErrorState = useCallback((error: Ably.ErrorInfo) => {
    errorRef.current = error;
    setError(error);
  }, []);

  const clearErrorState = useCallback(() => {
    errorRef.current = undefined;
    setError(undefined);
  }, []);

  useEffect(() => {
    const fetchAndSubscribe = async () => {
      let response: TypingSubscriptionResponse;
      try {
        // fetch current typers
        const currentTypers = await room.typing.get();
        setCurrentlyTyping(currentTypers);

        // clear previous errors
        clearErrorState();
      } catch (error: unknown) {
        // handle and set the error
        const errorInfo = error as Ably.ErrorInfo;
        setErrorState(errorInfo);
      } finally {
        // subscribe to typing events
        response = room.typing.subscribe((event) => {
          // clear error state if there was one
          if (errorRef.current) {
            clearErrorState();
          }
          // update typing state
          setCurrentlyTyping(event.currentlyTyping);
        });
      }

      // cleanup function
      return () => {
        response.unsubscribe();
      };
    };

    void fetchAndSubscribe();
  }, [room, setErrorState, clearErrorState]);

  // if provided, subscribes the user-provided onDiscontinuity listener
  useEffect(() => {
    if (!params?.onDiscontinuity) return;
    const { off } = room.typing.onDiscontinuity(params.onDiscontinuity);
    return () => {
      off();
    };
  }, [room, params?.onDiscontinuity]);

  // if provided, subscribe the user-provided listener to TypingEvents
  useEffect(() => {
    if (!params?.listener) return;
    const { unsubscribe } = room.typing.subscribe(params.listener);
    return () => {
      unsubscribe();
    };
  }, [room, params?.listener]);

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

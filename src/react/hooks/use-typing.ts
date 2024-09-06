import { Typing, TypingEvent, TypingListener } from '@ably/chat';
import * as Ably from 'ably';
import { useCallback, useEffect, useState } from 'react';

import { ChatStatusResponse } from '../types/chat-status-response.js';
import { Listenable } from '../types/listenable.js';
import { StatusParams } from '../types/status-params.js';
import { useChatConnection } from './use-chat-connection.js';
import { useLogger } from './use-logger.js';
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
 * Utility function to make working with promises inside effects easier.
 *
 * It returns an object with a `unsubscribe` function and a callback wrapper
 * function `cb`. `cb` should be used to wrap all callbacks passed to promises,
 * either in `.then()`, `.catch()`, or `.finally()` if you do not want your
 * code inside the callback to be run after `unsubscribe()` was called.
 *
 * Example usage inside an effect:
 * ```
 * useEffect(() => {
 *   const { unsubscribe, cb } = unsubscribable();
 *   somePromise.then(cb((value) => {
 *     console.log("never prints if unsubscribe is called");
 *   }));
 *   return () => { unsubscribe(); }
 * });
 * ```
 *
 * @returns An object with an `unsubscribe` function and a callback wrapper `cb`.
 */
function unsubscribable() {
  let subscribed = true;
  const unsubscribe = () => {
    subscribed = false;
  };
  function callbackWrapper<Arguments extends unknown[], Return>(callback: (...args: Arguments) => Return) {
    if (subscribed) {
      return callback;
    }
  }
  return {
    unsubscribe,
    cb: callbackWrapper,
  };
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

  useEffect(() => {
    // Start with a clean slate - no errors and empty set
    setError(undefined);
    setCurrentlyTyping((prev) => {
      // keep reference constant if it's already empty
      if (prev.size === 0) return prev;
      return new Set<string>();
    });

    const setErrorState = (error?: Ably.ErrorInfo) => {
      if (error === undefined) {
        logger.debug('useTyping(); clearing error state', { roomId: room.roomId });
      } else {
        logger.error('useTyping(); setting error state', { error, roomId: room.roomId });
      }
      setError(error);
    };

    const { unsubscribe, cb } = unsubscribable();

    room.typing
      .get()
      .then(
        cb((currentlyTyping) => {
          setCurrentlyTyping(currentlyTyping);
        }),
      )
      .catch(
        cb((error: unknown) => {
          setErrorState(error as Ably.ErrorInfo);
        }),
      );

    const subscription = room.typing.subscribe((event) => {
      setErrorState(undefined);
      setCurrentlyTyping(event.currentlyTyping);
    });

    // cleanup function
    return () => {
      logger.debug('useTyping(); unsubscribing from typing events', { roomId: room.roomId });
      unsubscribe();
      subscription.unsubscribe();
    };
  }, [room, logger]);

  // if provided, subscribes the user-provided onDiscontinuity listener
  useEffect(() => {
    if (!params?.onDiscontinuity) return;
    logger.debug('useTyping(); applying onDiscontinuity listener', { roomId: room.roomId });
    const { off } = room.typing.onDiscontinuity(params.onDiscontinuity);
    return () => {
      logger.debug('useTyping(); removing onDiscontinuity listener', { roomId: room.roomId });
      off();
    };
  }, [room, params?.onDiscontinuity, logger]);

  // if provided, subscribe the user-provided listener to TypingEvents
  useEffect(() => {
    if (!params?.listener) return;
    logger.debug('useTyping(); applying listener', { roomId: room.roomId });
    const { unsubscribe } = room.typing.subscribe(params.listener);
    return () => {
      logger.debug('useTyping(); removing listener', { roomId: room.roomId });
      unsubscribe();
    };
  }, [room, params?.listener, logger]);

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

import * as Ably from 'ably';
import { useCallback, useEffect, useState } from 'react';

import { ErrorCodes, errorInfoIs } from '../../core/errors.js';
import { TypingEventPayload } from '../../core/events.js';
import { RoomStatus } from '../../core/room-status.js';
import { Typing, TypingListener } from '../../core/typing.js';
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
  readonly currentlyTyping: TypingEventPayload['currentlyTyping'];

  /**
   * Provides access to the underlying {@link Typing} instance of the room.
   */
  readonly typingIndicators?: Typing;

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

  const context = useRoomContext('useTyping');
  const { status: roomStatus, error: roomError } = useRoomStatus(params);
  const logger = useLogger();
  logger.trace('useTyping();', { roomId: context.roomId });

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
        logger.debug('useTyping(); clearing error state', { roomId: context.roomId });
      } else {
        logger.error('useTyping(); setting error state', { error, roomId: context.roomId });
      }
      setError(error);
    };

    void context.room
      .then((room) => {
        // If we're not attached, we can't call typing.get() right now
        if (room.status === RoomStatus.Attached) {
          return room.typing
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
        } else {
          logger.debug('useTyping(); room not attached, setting currentlyTyping to empty', { roomId: context.roomId });
          setCurrentlyTyping(new Set());
        }
      })
      .catch();

    return wrapRoomPromise(
      context.room,
      (room) => {
        logger.debug('useTyping(); subscribing to typing events', { roomId: context.roomId });
        const { unsubscribe } = room.typing.subscribe((event) => {
          setErrorState(undefined);
          setCurrentlyTyping(event.currentlyTyping);
        });

        return () => {
          logger.debug('useTyping(); unsubscribing from typing events', { roomId: context.roomId });
          mounted = false;
          unsubscribe();
        };
      },
      logger,
      context.roomId,
    ).unmount();
  }, [context, logger]);

  // if provided, subscribes the user-provided onDiscontinuity listener
  useEffect(() => {
    if (!onDiscontinuityRef) return;
    return wrapRoomPromise(
      context.room,
      (room) => {
        logger.debug('useTyping(); applying onDiscontinuity listener', { roomId: context.roomId });
        const { off } = room.typing.onDiscontinuity(onDiscontinuityRef);
        return () => {
          logger.debug('useTyping(); removing onDiscontinuity listener', { roomId: context.roomId });
          off();
        };
      },
      logger,
      context.roomId,
    ).unmount();
  }, [context, onDiscontinuityRef, logger]);

  // if provided, subscribe the user-provided listener to TypingEvents
  useEffect(() => {
    if (!listenerRef) return;
    return wrapRoomPromise(
      context.room,
      (room) => {
        logger.debug('useTyping(); applying listener', { roomId: context.roomId });
        const { unsubscribe } = room.typing.subscribe(listenerRef);
        return () => {
          logger.debug('useTyping(); removing listener', { roomId: context.roomId });
          unsubscribe();
        };
      },
      logger,
      context.roomId,
    ).unmount();
  }, [context, listenerRef, logger]);

  // memoize the methods to avoid re-renders, and ensure the same instance is used
  const start = useCallback(() => context.room.then((room) => room.typing.start()), [context]);
  const stop = useCallback(() => context.room.then((room) => room.typing.stop()), [context]);

  return {
    typingIndicators: useEventualRoomProperty((room) => room.typing),
    connectionStatus,
    connectionError,
    roomStatus,
    roomError,
    error,
    start,
    stop,
    currentlyTyping,
  };
};

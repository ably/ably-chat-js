import * as Ably from 'ably';
import { useCallback, useEffect, useState } from 'react';

import { TypingSetEvent } from '../../core/events.js';
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
import { useRoomLogger } from './use-logger.js';

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
   * A shortcut to the {@link Typing.keystroke} method.
   */
  readonly keystroke: Typing['keystroke'];

  /**
   * A shortcut to the {@link Typing.stop} method.
   */
  readonly stop: Typing['stop'];

  /**
   * A state value representing the set of client IDs that are currently typing in the room.
   * It automatically updates based on typing events received from the room.
   */
  readonly currentlyTyping: TypingSetEvent['currentlyTyping'];

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
  const logger = useRoomLogger();
  logger.trace('useTyping();');

  const [currentlyTyping, setCurrentlyTyping] = useState<Set<string>>(new Set());

  // Create a stable reference for the listeners
  const listenerRef = useEventListenerRef(params?.listener);
  const onDiscontinuityRef = useEventListenerRef(params?.onDiscontinuity);

  useEffect(() => {
    // Start with a clean slate - empty set
    setCurrentlyTyping((prev) => {
      // keep reference constant if it's already empty
      if (prev.size === 0) return prev;
      return new Set<string>();
    });

    return wrapRoomPromise(
      context.room,
      (room) => {
        logger.debug('useTyping(); subscribing to typing events');
        const { unsubscribe } = room.typing.subscribe((event) => {
          setCurrentlyTyping(event.currentlyTyping);
        });

        // If we're not attached, we can't call typing.current() right now
        if (room.status === RoomStatus.Attached) {
          const typing = room.typing.current();
          logger.debug('useTyping(); room attached, getting initial typers', { typing });
          setCurrentlyTyping(typing);
        }

        return () => {
          logger.debug('useTyping(); unsubscribing from typing events');
          unsubscribe();
        };
      },
      logger,
    ).unmount();
  }, [context, logger]);

  // if provided, subscribes the user-provided onDiscontinuity listener
  useEffect(() => {
    if (!onDiscontinuityRef) return;
    return wrapRoomPromise(
      context.room,
      (room) => {
        logger.debug('useTyping(); applying onDiscontinuity listener');
        const { off } = room.onDiscontinuity(onDiscontinuityRef);
        return () => {
          logger.debug('useTyping(); removing onDiscontinuity listener');
          off();
        };
      },
      logger,
    ).unmount();
  }, [context, onDiscontinuityRef, logger]);

  // if provided, subscribe the user-provided listener to TypingEvents
  useEffect(() => {
    if (!listenerRef) return;
    return wrapRoomPromise(
      context.room,
      (room) => {
        logger.debug('useTyping(); applying listener');
        const { unsubscribe } = room.typing.subscribe(listenerRef);
        return () => {
          logger.debug('useTyping(); removing listener');
          unsubscribe();
        };
      },
      logger,
    ).unmount();
  }, [context, listenerRef, logger]);

  // memoize the methods to avoid re-renders, and ensure the same instance is used
  const keystroke = useCallback(() => context.room.then((room) => room.typing.keystroke()), [context]);
  const stop = useCallback(() => context.room.then((room) => room.typing.stop()), [context]);

  return {
    typingIndicators: useEventualRoomProperty((room) => room.typing),
    connectionStatus,
    connectionError,
    roomStatus,
    roomError,
    keystroke,
    stop,
    currentlyTyping,
  };
};

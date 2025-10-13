// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as Ably from 'ably';
import { useCallback, useEffect, useState } from 'react';

import { TypingSetEvent } from '../../core/events.js';
import { RoomStatus } from '../../core/room-status.js';
import { Typing, TypingListener } from '../../core/typing.js';
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
 * The parameters for the {@link useTyping} hook.
 */
export interface TypingParams extends StatusParams, Listenable<TypingListener> {
  /**
   * A listener that will be called whenever a typing event is sent to the room.
   * The listener is removed when the component unmounts.
   * @example
   * ```tsx
   * useTyping({
   *   listener: (typingEvent) => {
   *     console.log('Typing event:', Array.from(typingEvent.currentlyTyping));
   *   }
   * });
   * ```
   */
  listener?: TypingListener;
}

export interface UseTypingResponse extends ChatStatusResponse {
  /**
   * A shortcut to the {@link Typing.keystroke} method.
   *
   * Sends a typing started event to notify other users that the current user is typing.
   *
   * Events are throttled according to the `heartbeatThrottleMs` room option to prevent
   * excessive network traffic. If called within the throttle interval, the operation
   * becomes a no-op. Multiple rapid calls are serialized to maintain consistency.
   *
   * **Note**:
   * - The connection must be in the `connected` state.
   * - Calls to `keystroke()` and `stop()` are serialized and resolve in order.
   * - The most recent operation always determines the final typing state.
   * - The room must be attached to send typing events, typically the {@link ChatRoomProvider} handles this automatically.
   *
   * This is a stable reference and will not be changed between renders for the same room.
   * @example
   * ```tsx
   * const { keystroke } = useTyping();
   *
   * const handleKeyPress = async () => {
   *   try {
   *     await keystroke();
   *     console.log('Typing indicator sent');
   *   } catch (error) {
   *     console.error('Failed to send keystroke:', error);
   *   }
   * };
   * ```
   */
  readonly keystroke: Typing['keystroke'];

  /**
   * A shortcut to the {@link Typing.stop} method.
   *
   * Sends a typing stopped event to notify other users that the current user has stopped typing.
   *
   * If the user is not currently typing, this operation is a no-op. Multiple rapid calls
   * are serialized to maintain consistency, with the most recent operation determining
   * the final state.
   *
   * **Note**:
   * - The connection must be in the `connected` state.
   * - Calls to `keystroke()` and `stop()` are serialized and resolve in order.
   * - The room must be attached to send typing events, typically the {@link ChatRoomProvider} handles this automatically.
   *
   * This is a stable reference and will not be changed between renders for the same room.
   * @example
   * ```tsx
   * const { stop } = useTyping();
   *
   * const handleStopTyping = async () => {
   *   try {
   *     await stop();
   *     console.log('Stopped typing indicator');
   *   } catch (error) {
   *     console.error('Failed to stop typing:', error);
   *   }
   * };
   * ```
   */
  readonly stop: Typing['stop'];

  /**
   * A state value representing the set of client IDs that are currently typing in the room.
   * It automatically updates based on typing events received from the room.
   */
  readonly currentlyTyping: TypingSetEvent['currentlyTyping'];
}

/**
 *
 * React hook that provides typing indicator functionality for chat rooms.
 *
 * The hook automatically tracks the set of users currently typing and provides
 * this as state that updates in real-time as users start and stop typing.
 *
 * **Note**:
 * - This hook must be used within a {@link ChatRoomProvider} component tree.
 * - The `Room` must be attached to send and receive typing indicators, typically the {@link ChatRoomProvider} handles this automatically.
 * @param params - Optional parameters for event listeners and room status callbacks
 * @returns A {@link UseTypingResponse} containing typing methods and current state
 * @throws {Ably.ErrorInfo} When used outside of a {@link ChatRoomProvider}
 * @example Basic usage
 * ```tsx
 * import React, { useState } from 'react';
 * import { ChatClient, TypingSetEvent } from '@ably/chat';
 * import {
 *   ChatClientProvider,
 *   ChatRoomProvider,
 *   useTyping
 * } from '@ably/chat/react';
 *
 * // Component that handles typing indicators
 * const TypingIndicator = () => {
 *   const { keystroke, stop, currentlyTyping } = useTyping({
 *     listener: (typingEvent: TypingSetEvent) => {
 *       console.log('Currently typing users:', Array.from(typingEvent.currentlyTyping));
 *     },
 *   });
 *
 *   const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
 *     const value = e.target.value;
 *     if (value.length > 0) {
 *       try {
 *         await keystroke();
 *         console.log('Started typing');
 *       } catch (error) {
 *         console.error('Failed to send keystroke:', error);
 *       }
 *     } else {
 *       try {
 *         await stop();
 *         console.log('Stopped typing');
 *       } catch (error) {
 *         console.error('Failed to stop typing:', error);
 *       }
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       <input
 *         onChange={handleInputChange}
 *         placeholder="Type a message..."
 *       />
 *       <div>Currently typing: {Array.from(currentlyTyping).join(', ')}</div>
 *     </div>
 *   );
 * };
 *
 * const chatClient: ChatClient; // existing ChatClient instance
 *
 * const App = () => {
 *   return (
 *     <ChatClientProvider client={chatClient}>
 *       <ChatRoomProvider name="room-id">
 *         <TypingIndicator />
 *       </ChatRoomProvider>
 *     </ChatClientProvider>
 *   );
 * };
 *
 * export default App;
 * ```
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
    connectionStatus,
    connectionError,
    roomStatus,
    roomError,
    keystroke,
    stop,
    currentlyTyping,
  };
};

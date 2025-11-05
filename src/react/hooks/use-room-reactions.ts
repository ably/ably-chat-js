// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as Ably from 'ably';
import { useCallback, useEffect } from 'react';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
   * @example
   * ```tsx
   * useRoomReactions({
   *   listener: (reactionEvent) => {
   *     console.log('Room reaction received:', reactionEvent.reaction.name, " from ", reactionEvent.reaction.clientId);
   *   }
   * });
   * ```
   */
  listener?: RoomReactionListener;
}

/**
 * The response type from the {@link useRoomReactions} hook.
 */
export interface UseRoomReactionsResponse extends ChatStatusResponse {
  /**
   * A shortcut to the {@link RoomReactions.send} method.
   *
   * Sends a room-level reaction.
   *
   * Room reactions are ephemeral events that are not associated with specific messages.
   * They're commonly used for live interactions like floating emojis, applause, or other
   * real-time feedback in chat rooms. Unlike message reactions, room reactions are not
   * persisted and are only visible to users currently connected to the room.
   *
   * **Note**:
   * - Room must be attached to send room reactions, typically the {@link ChatRoomProvider} handles this automatically.
   * - It is possible (though unlikely) to receive your own reaction via subscription before this promise resolves.
   *
   * This is a stable reference and will not be changed between renders for the same room.
   * @param params - The reaction parameters
   * @returns Promise that resolves when the reaction has been sent, or rejects with:
   * - {@link chat-js!ErrorCode.InvalidArgument | InvalidArgument} if name is not provided
   * - {@link chat-js!ErrorCode.Disconnected | Disconnected} if not connected to Ably
   * @example
   * ```tsx
   * const { sendRoomReaction } = useRoomReactions();
   *
   * const celebrateSuccess = async () => {
   *   try {
   *     await sendRoomReaction({
   *       name: '🎉',
   *       metadata: { reason: 'milestone_reached' }
   *     });
   *   } catch (error) {
   *     console.error('Failed to send room reaction:', error);
   *   }
   * };
   * ```
   */
  readonly sendRoomReaction: (params: SendReactionParams) => Promise<void>;
}

/**
 * React hook that provides access to room reaction functionality.
 *
 * This hook allows you to send reactions to the room (not to specific messages) and
 * subscribe to room reaction events. Room reactions are ephemeral messages (not persisted) that
 * all room participants can see, such as applause, cheers, or other real-time feedback.
 *
 * **Note**:
 * - This hook must be used within a {@link ChatRoomProvider} component tree.
 * - Room must be attached to send and receive room reactions, typically the {@link ChatRoomProvider} handles this automatically.
 * @param params - Optional parameters for event listeners and room status callbacks
 * @returns A {@link UseRoomReactionsResponse} containing room reaction methods and status
 * @throws An {@link Ably.ErrorInfo} with {@link chat-js!ErrorCode.ReactHookMustBeUsedWithinProvider | ReactHookMustBeUsedWithinProvider} When used outside of a {@link ChatRoomProvider}
 * @example Basic usage
 * ```tsx
 * import React from 'react';
 * import { ChatClient, RoomReactionEvent } from '@ably/chat';
 * import {
 *   ChatClientProvider,
 *   ChatRoomProvider,
 *   useRoomReactions
 * } from '@ably/chat/react';
 *
 * // Component that handles room reactions
 * const RoomReactionHandler = () => {
 *   const { sendRoomReaction } = useRoomReactions({
 *     listener: (reactionEvent: RoomReactionEvent) => {
 *       console.log('Room reaction received:', reactionEvent.reaction.name, " from ", reactionEvent.reaction.clientId);
 *     }
 *   });
 *
 *   const handleSendRoomReaction = async (name: string) => {
 *     try {
 *       await sendRoomReaction({ name });
 *       console.log(`Sent ${name} reaction`);
 *     } catch (error) {
 *       console.error('Failed to send reaction:', error);
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={() => handleSendRoomReaction('👏')}>👏 Clap</button>
 *       <button onClick={() => handleSendRoomReaction('🎉')}>🎉 Celebrate</button>
 *     </div>
 *   );
 * };
 *
 * const chatClient: ChatClient; // existing ChatClient instance
 *
 * // App component with providers
 * const App = () => {
 *   return (
 *     <ChatClientProvider client={chatClient}>
 *       <ChatRoomProvider name="event-room">
 *         <RoomReactionHandler />
 *       </ChatRoomProvider>
 *     </ChatClientProvider>
 *   );
 * };
 *
 * export default App;
 * ```
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
    async (params: SendReactionParams) => {
      const room = await context.room;
      return room.reactions.send(params);
    },
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

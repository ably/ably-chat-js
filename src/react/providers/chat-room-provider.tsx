// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type * as Ably from 'ably';
// imported for docs linking
import React, { ReactNode, useEffect, useMemo, useState } from 'react';

import { Room } from '../../core/room.js';
import { RoomOptions } from '../../core/room-options.js';
import { ChatRoomContext, ChatRoomContextType } from '../contexts/chat-room-context.js';
import { useChatClientContext } from '../hooks/internal/use-chat-client-context.js';
import { useLogger } from '../hooks/internal/use-logger.js';
import { useRoomReferenceManager } from '../hooks/internal/use-room-reference-manager.js';

/**
 * Props for the {@link ChatRoomProvider} component.
 */
export interface ChatRoomProviderProps {
  /** The name of the room. */
  name: string;

  /**
   * Overriding options to use when creating the room. See {@link RoomOptions} for details.
   *
   * **Important**:
   * - The `options` should be memoized to prevent unnecessary room recreations. Passing a new object reference
   * on each render will cause the room to be released and recreated.
   * - Provided options are merged with the default options, so you only need to specify the options you want to change.
   * - Room options cannot be changed after the room is created. Different options
   * for the same room name will result in an error.
   * @example
   * ```tsx
   * const MyRoomComponent = () => {
   *   const [typing, setTyping] = useState(true);
   *
   *   const roomOptions = useMemo(() => ({
   *     typing: { timeoutMs: 5000 },
   *   }), []); // Stable reference - options don't change
   *
   *   return (
   *     <ChatRoomProvider name="my-room" options={roomOptions}>
   *       <MyChat />
   *     </ChatRoomProvider>
   *   );
   * };
   * ```
   */
  options?: RoomOptions;

  /** Children nodes. */
  children?: ReactNode | ReactNode[] | null;
}

/**
 * React Context Provider that makes a specific {@link Room} available to child components.
 *
 * The provider automatically handles room attachment/detachment and provides the room
 * instance to child components through room-specific hooks like {@link useMessages},
 * {@link usePresence}, {@link useTyping}, etc.
 *
 * Multiple providers for the same room (with same options) share the same underlying
 * room instance through reference counting, making it safe to have multiple components
 * using the same room simultaneously.
 *
 * When the first {@link ChatRoomProvider} for a room mounts, it creates
 * and attaches the room. When the last provider unmounts, it releases the room.
 * @param props - The props for the ChatRoomProvider component.
 * @param props.name The name of the room.
 * @param props.options Overriding options to use when creating the room.
 * @param props.children The child components to be rendered within this provider.
 * @returns A React element that provides the room context to its children
 * @throws An {@link Ably.ErrorInfo} with {@link chat-js!ErrorCode.ReactHookMustBeUsedWithinProvider | ReactHookMustBeUsedWithinProvider} When used outside of a {@link ChatRoomProvider}
 * @throws An {@link Ably.ErrorInfo} with {@link chat-js!ErrorCode.RoomExistsWithDifferentOptions | RoomExistsWithDifferentOptions} if room exists with different options
 * @example Basic usage
 * ```tsx
 * import * as Ably from 'ably';
 * import React, { useMemo } from 'react';
 * import { ChatClient } from '@ably/chat';
 * import {
 *   ChatClientProvider,
 *   ChatRoomProvider,
 *   useMessages,
 *   useRoom,
 * } from '@ably/chat/react';
 *
 * const chatClient: ChatClient; // existing ChatClient instance
 *
 * // Child component using room functionality
 * const ChatInterface = () => {
 *   const { roomName } = useRoom();
 *   const { sendMessage } = useMessages();
 *
 *   return (
 *     <div>
 *       <h2>Chat Room: {roomName}</h2>
 *       <button onClick={() => sendMessage({ text: 'Hello!' })}>
 *         Send Message
 *       </button>
 *     </div>
 *   );
 * };
 *
 * const BasicExample = () => {
 *   return (
 *     <ChatClientProvider client={chatClient}>
 *       <ChatRoomProvider name="general-chat">
 *         <ChatInterface />
 *       </ChatRoomProvider>
 *     </ChatClientProvider>
 *   );
 * };
 * ```
 * @example Providing custom room options
 * ```tsx
 * import { ChatClientProvider, ChatRoomProvider } from '@ably/chat/react';
 * import { ChatClient } from '@ably/chat';
 *
 * const chatClient: ChatClient; // existing ChatClient instance
 *
 * // Example with room options (properly memoized)
 * const CustomOptions = () => {
 *   // Memoize options to prevent room recreation
 *   const roomOptions = useMemo(() => ({
 *     typing: {
 *       timeoutMs: 10000 // 10 second typing timeout
 *     },
 *   }), []); // Empty dependency array = stable reference
 *
 *   return (
 *     <ChatClientProvider client={chatClient}>
 *       <ChatRoomProvider name="team-room" options={roomOptions}>
 *         <ChatInterface />
 *       </ChatRoomProvider>
 *     </ChatClientProvider>
 *   );
 * };
 * ```
 */
export const ChatRoomProvider = ({ name: roomName, options, children }: ChatRoomProviderProps): React.ReactElement => {
  const client = useChatClientContext();
  const clientLogger = useLogger();
  const logger = useMemo(() => clientLogger.withContext({ roomName }), [clientLogger, roomName]);
  const roomReferenceManager = useRoomReferenceManager();

  logger.debug(`ChatRoomProvider();`, { options });

  // Set the initial room promise, we do this in a function to avoid rooms.get being called
  // every time the component re-renders
  // In StrictMode this will be called twice one after the other, but that's ok
  const [value, setValue] = useState<ChatRoomContextType>(() => {
    logger.debug(`ChatRoomProvider(); initializing value`, { options });
    const room: Promise<Room> = client.rooms.get(roomName, options);
    room.catch(() => void 0);
    return { room: room, roomName: roomName, options: options, client: client };
  });

  // Create an effect that manages the room state using reference counting
  useEffect(() => {
    logger.debug(`ChatRoomProvider(); running lifecycle useEffect`);
    let unmounted = false;

    // Add reference and get the room
    const roomPromise = roomReferenceManager.addReference(roomName, options);

    // Update the context value with the new room promise
    setValue((prev: ChatRoomContextType) => {
      // If the room id and options haven't changed, then we don't need to do anything
      if (prev.client === client && prev.roomName === roomName && prev.options === options) {
        logger.debug(`ChatRoomProvider(); no change in room id or options`, { options });
        return prev;
      }

      logger.debug(`ChatRoomProvider(); updating value`, { options });
      return { room: roomPromise, roomName, options, client };
    });

    // Handle the room promise resolution
    void roomPromise
      .then(() => {
        if (unmounted) {
          logger.debug(`ChatRoomProvider(); unmounted before room resolved`);
          return;
        }
        logger.debug(`ChatRoomProvider(); room resolved`);
      })
      .catch(() => void 0);

    // Cleanup function
    return () => {
      unmounted = true;
      logger.debug(`ChatRoomProvider(); cleaning up lifecycle useEffect`);

      // Remove reference - this will handle release if it's the last reference
      roomReferenceManager.removeReference(roomName, options);
    };
  }, [roomName, options, logger, client, roomReferenceManager]);

  return <ChatRoomContext.Provider value={value}>{children}</ChatRoomContext.Provider>;
};

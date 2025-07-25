// imported for docs linking
import React, { ReactNode, useEffect, useMemo, useState } from 'react';

import { Room } from '../../core/room.js';
import { RoomOptions } from '../../core/room-options.js';
import { ChatRoomContext, ChatRoomContextType } from '../contexts/chat-room-context.js';
import { useChatClient } from '../hooks/use-chat-client.js';
import { useLogger } from '../hooks/use-logger.js';
import { useRoomReferenceManager } from '../hooks/use-room-reference-manager.js';

/**
 * Props for the {@link ChatRoomProvider} component.
 */
export interface ChatRoomProviderProps {
  /** The name of the room. */
  name: string;

  /**
   * Overriding options to use when creating the room.
   *
   * NOTE: This value is not memoized by the provider. It must be memoized in your component to prevent
   * re-renders of a parent component from causing the room to be recreated.
   */
  options?: RoomOptions;

  /** Children nodes. */
  children?: ReactNode | ReactNode[] | null;
}

/**
 * Provider for a {@link Room}. Must be wrapped in a {@link ChatClientProvider}.
 *
 * The provider automatically manages room attachment and release based on reference counting.
 * The first provider for a room will attach it, and the last provider to unmount will release it.
 * @param props The props object for the ChatRoomProvider.
 * @param props.name The name of the room.
 * @param props.options The room options.
 * @param props.children The child components to render.
 * @returns The ChatRoomProvider component.
 */
export const ChatRoomProvider = ({ name: roomName, options, children }: ChatRoomProviderProps): React.ReactElement => {
  const client = useChatClient();
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

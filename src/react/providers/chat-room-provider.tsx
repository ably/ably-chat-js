// imported for docs linking
import { Room, RoomOptions, type RoomOptionsDefaults } from '@ably/chat'; // eslint-disable-line @typescript-eslint/no-unused-vars
import React, { ReactNode, useEffect, useState } from 'react';

import { ChatRoomContext } from '../contexts/chat-room-context.js';
import { useChatClient } from '../hooks/use-chat-client.js';
import { useLogger } from '../hooks/use-logger.js';

/**
 * Props for the {@link ChatRoomProvider} component.
 */
export interface ChatRoomProviderProps {
  /** The id of the room. */
  id: string;

  /**
   * The options to use when creating the room. A convenient default value is
   * provided by {@link RoomOptionsDefaults}, but it must explicitly be set
   * here.
   *
   * {@link RoomOptionsDefaults} can also be used partially, for example:
   *
   * ```tsx
   * <ChatRoomProvider id="room-id" options={{
   *   presence: RoomOptionsDefaults.presence,
   *   reactions: RoomOptionsDefaults.reactions,
   * }} />
   * ```
   *
   * NOTE: This value is not memoized by the provider. It must be memoized in your component to prevent
   * re-renders of a parent component from causing the room to be recreated.
   */
  options: RoomOptions;

  /**
   * Set to `false` to disable auto-releasing the room when component unmounts,
   * to support multiple {@link ChatRoomProvider}s for the same room.
   *
   * If set to `false`, you must manually release the room using
   * `chatClient.rooms.release(id)` or have another {@link ChatRoomProvider} for
   * the same room and {@link release} set to `true`.
   *
   * @defaultValue `true`
   */
  release?: boolean;

  /**
   * Set to `false` to disable auto-attaching the room when component mounts
   * and auto-detaching when it unmounts.
   *
   * If set to `false`, you must manually attach and detach the room using
   * `room.attach()` and `room.detach()` or the provided shortcut functions
   * that {@link useRoom} provides.
   * Setting this flag to `false` is useful in the case where you have more providers for the same room,
   * and you need to control the attachment manually or by choosing which provider handles it.
   *
   * @defaultValue `true`
   */
  attach?: boolean;

  /** Children nodes. */
  children?: ReactNode | ReactNode[] | null;
}

/**
 * Provider for a {@link Room}. Must be wrapped in a {@link ChatClientProvider}.
 *
 * See {@link ChatRoomProviderProps} for the available props and configuring the
 * provider to automatically attach, detach and/or release the room.
 */
export const ChatRoomProvider: React.FC<ChatRoomProviderProps> = ({
  id: roomId,
  options,
  release = true,
  attach = true,
  children,
}) => {
  const client = useChatClient();
  const logger = useLogger();
  logger.trace(`ChatRoomProvider();`, { roomId, options, release, attach });

  const [value, setValue] = useState({ room: client.rooms.get(roomId, options) });

  useEffect(() => {
    const room = client.rooms.get(roomId, options);

    // Update state if room instance has changed.
    setValue((prev) => {
      if (prev.room === room) {
        return prev;
      }
      return { room };
    });

    if (attach) {
      // attachment error and/or room status is available via useRoom
      // or room.status, no need to do anything with the promise here
      logger.debug(`ChatRoomProvider(); attaching room`, { roomId });
      void room.attach().catch(() => {
        // Ignore, the error will be available via various room status properties
      });
    }
    return () => {
      // Releasing the room will implicitly detach if needed.
      if (release) {
        logger.debug(`ChatRoomProvider(); releasing room`, { roomId });
        void client.rooms.release(roomId);
      } else if (attach) {
        logger.debug(`ChatRoomProvider(); detaching room`, { roomId });
        void room.detach().catch(() => {
          // Ignore, the error will be available via various room status properties
        });
      }
    };
  }, [client, roomId, options, release, attach, logger]);

  return <ChatRoomContext.Provider value={value}>{children}</ChatRoomContext.Provider>;
};

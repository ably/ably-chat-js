// imported for docs linking
import { ChatClient, Logger, Room, RoomOptions, type RoomOptionsDefaults } from '@ably/chat'; // eslint-disable-line @typescript-eslint/no-unused-vars
import React, { ReactNode, useEffect, useRef, useState } from 'react';

import { ChatRoomContext, ChatRoomContextType } from '../contexts/chat-room-context.js';
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

interface RoomReleaseOp {
  id: string;
  options: RoomOptions;
  abort: AbortController;
}


let effectRunNum = 0;

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
  logger.debug(`ChatRoomProvider();`, { roomId, options, release, attach });

  const [value, setValue] = useState<ChatRoomContextType>(() => {
    logger.debug(`ChatRoomProvider(); initializing value`, { roomId, options });
    // const roomPromise = Promise.reject(new Error("room not yet initialised, state is setting up"));
    // roomPromise.catch(() => void 0); // fake catch not part of chain
    const roomPromise = client.rooms.get(roomId, options);
    return { room: roomPromise, roomId: roomId, options: options, efn: -1 };
  });

  useEffect(() => {
    const efn = effectRunNum;
    effectRunNum++;
    let mounted = true;
    const room = client.rooms.get(roomId, options);
    room.catch(() => void 0); // fake catch not part of chain
    setValue(prevRoom => {
      console.log("setting value for", roomId, "efn", efn, "prevRoom", prevRoom.room, "nowRoom", room, "ctxEfn", prevRoom.efn, "the check", prevRoom.room === room);
      if (prevRoom.room === room) {
        console.log("room: ", roomId, "efn",efn, "did not change state");
        return prevRoom;
      }
      console.log("room changed to: ", roomId, "efn",efn, "ctxEfn", prevRoom.efn);
      return { room: room, roomId, options, efn: efn }
    });

    let resolvedRoom: Room | undefined;
    if (attach) {      
      void room.then((room) => {
        console.log("room resolved to: ", roomId, "efn", efn, "mounted", mounted);
        if (!mounted) { return; }
        resolvedRoom = room;
        room.attach().catch();
      }).catch(() => void 0);
    }

    return () => {
      console.log("teardown of", roomId, "efn", efn);
      mounted = false;
      if (release) {
        client.rooms.release(roomId).catch();
      } else if (attach) {
        resolvedRoom?.detach().catch();
      }
    };
  }, [client, roomId, options, logger, release, attach]);

  return <ChatRoomContext.Provider value={value}>{children}</ChatRoomContext.Provider>;
};

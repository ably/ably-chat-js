import { RoomOptions, RoomOptionsDefaults } from '@ably/chat';
import React, { ReactNode, useEffect, useMemo } from 'react';

import { RoomContext } from '../contexts/room-context.js';
import { useChatClient } from '../hooks/use-chat-client.js';

/**
 * Props for the RoomProvider component.
 */
export interface RoomProviderProps {
  /** The id of the room. */
  id: string;

  /**
   * The options to use when creating the room.
   *
   * @defaultValue {@link RoomOptionsDefaults}
   */
  options?: RoomOptions;

  /**
   * Set to false to disable auto-releasing the room when component unmounts,
   * to support multiple RoomProviders for the same room.
   *
   * If set to false, you must manually release the room using
   * `chatClient.rooms.release(id)` or have another RoomProvider for the same
   * room and release set to true.
   *
   * @defaultValue true
   */
  release?: boolean;

  /**
   * Set to false to disable auto-attaching the room when component mounts and
   * auto-detaching when it unmounts.
   *
   * If set to false, you must manually attach and detach the room using
   * room.attach() and room.detach(). This is useful if you have more providers
   * for the same room and want to control the attachment manually.
   *
   * @defaultValue true
   */
  attach?: boolean;

  /** Children nodes. */
  children: ReactNode;
}

export const RoomProvider: React.FC<RoomProviderProps> = ({
  id: roomId,
  options,
  release = true,
  attach = true,
  children,
}) => {
  const client = useChatClient();
  if (options === undefined) {
    options = RoomOptionsDefaults;
  }

  const value = useMemo(() => {
    return { room: client.rooms.get(roomId, options) };
  }, [client, roomId, options]);

  useEffect(() => {
    if (attach) {
      // void attachment should not be a thing, errors should be propagated somewhere
      void value.room.attach();
    }
    return () => {
      if (attach) {
        void value.room.detach();
      }
      if (release) {
        void client.rooms.release(roomId);
      }
    };
  }, [client, roomId, options, release, attach, value]);

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
};

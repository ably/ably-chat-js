import { RoomOptions } from '@ably/chat';
import * as Ably from 'ably';
import React, { useEffect, useMemo } from "react";

import { ChatClientContext, ChatClientContextValue, SingleChatClientContext } from "../contexts/chat-client-context.js";
import { DEFAULT_CHAT_CLIENT_ID } from "./chat-client-provider.js";

/**
 * Properties for the ChatRoomProvider
 */
export interface ChatRoomProviderProps {
  /**
   * Child nodes to the provider.
   */
  children?: React.ReactNode | React.ReactNode[] | null;

  /**
   * The room id of the room that this provider encapsulates.
   */
  id: string;

  /**
   * Options for the room.
   */
  options: RoomOptions;
}

/**
 * Returns a React component that provides a `Room` in a React context to the component subtree.
 * Updates the context value when the `id` prop changes.
 *
 * @param {ChatClientProviderProps} props - The props for the ChatRoomProvider component.
 *
 * @returns {ChatRoomProvider} component.
 */
export const ChatRoomProvider = ({children, id, options}: ChatRoomProviderProps) => {
  const context = React.useContext(ChatClientContext);
  const defaultClientContext = context[DEFAULT_CHAT_CLIENT_ID] as unknown as SingleChatClientContext;

  if (defaultClientContext.rooms[id]) {
    throw new Ably.ErrorInfo('ChatRoomProvider(); cannot use more than one ChatRoomProvider with the same room id', 40000, 400);
  }

  const room = useMemo(() => {
    return defaultClientContext.client.rooms.get(id, options)
  }, [options, defaultClientContext.client.rooms, id])
  
  useEffect(() => {
    return () => {
      void defaultClientContext.client.rooms.release(id)
    }
  }, [defaultClientContext.client.rooms, id]);
  

  const newContextValue: ChatClientContextValue = {
    ...context,
    [DEFAULT_CHAT_CLIENT_ID]: {
      ...defaultClientContext,
      rooms: {
        ...defaultClientContext.rooms,
        [id]: room
      }
    }
  };

  return <ChatClientContext.Provider value={newContextValue}>{children}</ChatClientContext.Provider>;
}

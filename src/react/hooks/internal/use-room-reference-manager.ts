import * as Ably from 'ably';
import * as React from 'react';

import { ErrorCode } from '../../../core/errors.js';
import { ChatClientContext, ChatClientContextValue } from '../../contexts/chat-client-context.js';
import { RoomReferenceManager } from '../../helper/room-reference-manager.js';

// Symbol to store the room reference manager in the context without conflicting with the string index
export const ROOM_REFERENCE_MANAGER_KEY = Symbol('roomReferenceManager');

/**
 * Extended context value that includes the room reference manager.
 */
export interface ExtendedChatClientContextValue extends ChatClientContextValue {
  [ROOM_REFERENCE_MANAGER_KEY]?: RoomReferenceManager;
}

/**
 * Hook to access the room reference manager from the current ChatClientProvider.
 * @returns The room reference manager instance
 * @throws An {@link Ably.ErrorInfo} if used outside of a ChatClientProvider
 */
export const useRoomReferenceManager = (): RoomReferenceManager => {
  const context = React.useContext(ChatClientContext) as ExtendedChatClientContextValue;
  const manager = context[ROOM_REFERENCE_MANAGER_KEY];
  if (!manager) {
    throw new Ably.ErrorInfo(
      'unable to get room reference manager; useRoomReferenceManager must be used within a ChatClientProvider',
      ErrorCode.ReactHookMustBeUsedWithinProvider,
      400,
    );
  }
  return manager;
};

import * as Ably from 'ably';
import { useContext } from 'react';

import { ErrorCode } from '../../../core/errors.js';
import { ChatRoomContext, ChatRoomContextType } from '../../contexts/chat-room-context.js';

/**
 * A hook that returns the current ChatRoomContext. This should be used within a ChatRoomProvider.
 * @internal
 * @param callingHook The name of the hook that is calling this function, for logging purposes.
 * @throws An {@link Ably.ErrorInfo} if the hook is not used within a ChatRoomProvider.
 * @returns The ChatRoomContext.
 */
export const useRoomContext = (callingHook: string): ChatRoomContextType => {
  const context = useContext(ChatRoomContext);
  if (!context) {
    throw new Ably.ErrorInfo(
      `unable to get room context; ${callingHook} hook must be used within a <ChatRoomProvider>`,
      ErrorCode.ReactHookMustBeUsedWithinProvider,
      400,
    );
  }

  return context;
};

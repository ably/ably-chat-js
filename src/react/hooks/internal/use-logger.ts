import { useMemo } from 'react';

import { Logger } from '../../../core/logger.js';
import { useChatClientContext } from './use-chat-client-context.js';
import { useRoomContext } from './use-room-context.js';
/**
 * A hook that provides access to the {@link Logger} instance of the {@link ChatClient}.
 * It will use the instance belonging to the {@link ChatClient} in the nearest {@link ChatClientProvider} in the component tree.
 * @internal
 * @returns Logger - The logger instance.
 */
export const useLogger = (): Logger => {
  const chatClient = useChatClientContext();
  return useMemo(() => (chatClient as unknown as { logger: Logger }).logger, [chatClient]);
};

/**
 * A hook that returns a logger with the room context pre-applied.
 * @internal
 * @returns Logger - The logger instance.
 */
export const useRoomLogger = (): Logger => {
  const roomContext = useRoomContext('useRoomLogger');
  const chatClient = useChatClientContext();

  return useMemo(
    () => (chatClient as unknown as { logger: Logger }).logger.withContext({ roomName: roomContext.roomName }),
    [chatClient, roomContext],
  );
};

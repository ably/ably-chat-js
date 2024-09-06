import { Logger } from '@ably/chat';
import { useMemo } from 'react';

import { useChatClient } from './use-chat-client.js';

/**
 * A hook that provides access to the {@link Logger} instance of the {@link ChatClient}.
 * It will use the instance belonging to the {@link ChatClient} in the nearest {@link ChatClientProvider} in the component tree.
 * @internal
 *
 * @returns Logger - The logger instance.
 */
export const useLogger = (): Logger => {
  const chatClient = useChatClient();
  return useMemo(() => chatClient.logger, [chatClient]);
};

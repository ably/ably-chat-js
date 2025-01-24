import Ably from 'ably';

import { ChatClient } from '../../core/src/chat.ts';
import { ClientOptions, normalizeClientOptions } from '../../core/src/config.js';
import { testLoggingLevel } from './logger.js';
import { ablyRealtimeClientWithToken } from './realtime-client.js';

export const newChatClient = (options?: ClientOptions, realtimeClient?: Ably.Realtime): ChatClient => {
  const normalizedOptions = normalizeClientOptions({
    ...options,
    logLevel: options?.logLevel ?? testLoggingLevel(),
  });
  realtimeClient = realtimeClient ?? ablyRealtimeClientWithToken();

  return new ChatClient(realtimeClient, normalizedOptions);
};

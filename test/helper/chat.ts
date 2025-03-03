import * as Ably from 'ably';

import { ChatClient } from '../../src/core/chat.ts';
import { ChatClientOptions, normalizeClientOptions } from '../../src/core/config.js';
import { testLoggingLevel } from './logger.js';
import { ablyRealtimeClientWithToken } from './realtime-client.js';

export const newChatClient = (options?: ChatClientOptions, realtimeClient?: Ably.Realtime): ChatClient => {
  const normalizedOptions = normalizeClientOptions({
    ...options,
    logLevel: options?.logLevel ?? testLoggingLevel(),
  });
  realtimeClient = realtimeClient ?? ablyRealtimeClientWithToken();

  return new ChatClient(realtimeClient, normalizedOptions);
};

import * as Ably from 'ably';

import { ChatClient } from '../../src/core/chat-client.ts';
import { ChatClientOptions, normalizeClientOptions } from '../../src/core/config.js';
import { testLoggingLevel, testLogHandler } from './logger.js';
import { ablyRealtimeClientWithToken } from './realtime-client.js';

export const newChatClient = (options?: ChatClientOptions, realtimeClient?: Ably.Realtime): ChatClient => {
  const normalizedOptions = normalizeClientOptions({
    ...options,
    logLevel: options?.logLevel ?? testLoggingLevel(),
    logHandler: options?.logHandler ?? testLogHandler(),
  });
  realtimeClient = realtimeClient ?? ablyRealtimeClientWithToken();

  return new ChatClient(realtimeClient, normalizedOptions);
};

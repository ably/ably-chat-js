import * as Ably from 'ably';
import { expect, vi } from 'vitest';

import { ChatClient } from '../../src/core/chat-client.ts';
import { ChatClientOptions, normalizeClientOptions } from '../../src/core/config.js';
import { testLoggingLevel, testLogHandler } from './logger.js';
import { ablyRealtimeClientWithToken } from './realtime-client.js';

export const newChatClient = (
  options?: ChatClientOptions,
  realtimeClient?: Ably.Realtime,
  extraClaims?: Record<string, string>,
): ChatClient => {
  if (realtimeClient && extraClaims) {
    throw new Error(
      'Cannot provide both realtimeClient and extraClaims; extraClaims are only used when creating a new client',
    );
  }
  const normalizedOptions = normalizeClientOptions({
    ...options,
    logLevel: options?.logLevel ?? testLoggingLevel(),
    logHandler: options?.logHandler ?? testLogHandler(),
  });
  realtimeClient = realtimeClient ?? ablyRealtimeClientWithToken(undefined, extraClaims);

  return new ChatClient(realtimeClient, normalizedOptions);
};

// waitForClientId waits until a given ChatClient has a known clientId, which
// in the case of token auth is after successful connection.
export const waitForClientId = async (chat: ChatClient): Promise<string> => {
  await vi.waitFor(
    () => {
      expect(chat.clientId).toBeDefined();
    },
    { timeout: 3000 },
  );
  return chat.clientId as unknown as string;
};

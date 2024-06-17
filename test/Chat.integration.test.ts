import { describe, expect, it } from 'vitest';

import { RealtimeWithOptions } from '../src/realtimeextensions.js';
import { newChatClient } from './helper/chat.js';
import { testClientOptions } from './helper/options.js';

describe('Chat', () => {
  it('should set the agent string', () => {
    const chat = newChatClient(testClientOptions());
    expect((chat.realtime as RealtimeWithOptions).options.agents).toEqual({ chat: 'chat-js/0.0.1' });
  });

  it('should mix in the client options', () => {
    const chat = newChatClient(testClientOptions({ typingTimeoutMs: 1000 }));
    expect(chat.clientOptions.typingTimeoutMs).toBe(1000);
  });
});

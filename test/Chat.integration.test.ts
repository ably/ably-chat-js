import { describe, expect, it } from 'vitest';

import { DefaultClientOptions } from '../src/config.js';
import { RealtimeWithOptions } from '../src/realtimeextensions.js';
import { newChatClient } from './helper/chat.js';

describe('Chat', () => {
  it('should set the agent string', () => {
    const chat = newChatClient(DefaultClientOptions);
    expect((chat.realtime as RealtimeWithOptions).options.agents).toEqual({ chat: 'chat-js/0.0.1' });
  });
});

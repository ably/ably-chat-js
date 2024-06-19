import { describe, expect, it } from 'vitest';

import { RealtimeWithOptions } from '../src/realtimeextensions.js';
import { newChatClient } from './helper/chat.js';
import { testClientOptions } from './helper/options.js';
import { ablyRealtimeClient } from './helper/realtimeClient.js';

describe('Chat', () => {
  it('should set the agent string', () => {
    const chat = newChatClient(testClientOptions());
    expect((chat.realtime as RealtimeWithOptions).options.agents).toEqual({ 'chat-js': '0.0.1' });
  });

  it('should mix in the client options', () => {
    const chat = newChatClient(testClientOptions({ typingTimeoutMs: 1000 }));
    expect(chat.clientOptions.typingTimeoutMs).toBe(1000);
  });

  it('should work using basic auth', async () => {
    const chat = newChatClient(undefined, ablyRealtimeClient({}));

    // Send a message, and expect it to succeed
    await chat.rooms.get('test').messages.send('my message');

    // Request occupancy, and expect it to succeed
    await chat.rooms.get('test').occupancy.get();

    // Request history, and expect it to succeed
    await chat.rooms.get('test').messages.query({ limit: 1 });
  });
});

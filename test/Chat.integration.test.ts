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
    const chat = newChatClient({}, ablyRealtimeClient({}));

    // Send a message, and expect it to succeed
    const message = await chat.rooms.get('test').messages.send('my message');
    expect(message).toEqual(expect.objectContaining({ content: 'my message', clientId: chat.clientId }));

    // Request occupancy, and expect it to succeed
    const occupancy = await chat.rooms.get('test').occupancy.get();
    expect(occupancy).toEqual(expect.objectContaining({ connections: 0, presenceMembers: 0 }));

    // Request history, and expect it to succeed
    const history = (await chat.rooms.get('test').messages.query({ limit: 1 })).items;
    expect(history).toEqual(
      expect.arrayContaining([expect.objectContaining({ content: 'my message', clientId: chat.clientId })]),
    );
  });

  it('should work using msgpack', async () => {
    const chat = newChatClient(undefined, ablyRealtimeClient({ useBinaryProtocol: true }));

    // Send a message, and expect it to succeed
    const message = await chat.rooms.get('test').messages.send('my message');
    expect(message).toEqual(expect.objectContaining({ content: 'my message', clientId: chat.clientId }));

    // Request occupancy, and expect it to succeed
    const occupancy = await chat.rooms.get('test').occupancy.get();
    expect(occupancy).toEqual(expect.objectContaining({ connections: 0, presenceMembers: 0 }));

    // Request history, and expect it to succeed
    const history = (await chat.rooms.get('test').messages.query({ limit: 1 })).items;
    expect(history).toEqual(
      expect.arrayContaining([expect.objectContaining({ content: 'my message', clientId: chat.clientId })]),
    );
  });
});

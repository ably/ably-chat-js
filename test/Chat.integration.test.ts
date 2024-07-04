import { describe, expect, it } from 'vitest';

import { ChatClient } from '../src/Chat.js';
import { ConnectionStatus } from '../src/ConnectionStatus.js';
import { LogLevel } from '../src/logger.js';
import { RealtimeWithOptions } from '../src/realtimeextensions.js';
import { newChatClient } from './helper/chat.js';
import { testClientOptions } from './helper/options.js';
import { ablyRealtimeClient } from './helper/realtimeClient.js';
import { getRandomRoom } from './helper/room.js';

const waitForConnectionStatus = (chat: ChatClient, status: ConnectionStatus) => {
  return new Promise<void>((resolve, reject) => {
    const { off } = chat.connection.onChange((change) => {
      if (change.status === status) {
        off();
        resolve();
      }
    });

    // Set a timeout to reject the promise if the status is not reached
    setInterval(() => {
      off();
      reject(new Error(`Connection status ${status} not reached`));
    }, 5000);
  });
};

describe('Chat', () => {
  it('should set the agent string', () => {
    const chat = newChatClient(testClientOptions());
    expect((chat.realtime as RealtimeWithOptions).options.agents).toEqual({ 'chat-js': '0.0.1' });
  });

  it('should mix in the client options', () => {
    const chat = newChatClient(testClientOptions({ logLevel: LogLevel.warn }));
    expect(chat.clientOptions.logLevel).toBe(LogLevel.warn);
  });

  it('should work using basic auth', async () => {
    const chat = newChatClient({}, ablyRealtimeClient({}));
    const room = getRandomRoom(chat);

    // Send a message, and expect it to succeed
    const message = await room.messages.send({ text: 'my message' });
    expect(message).toEqual(expect.objectContaining({ text: 'my message', clientId: chat.clientId }));

    // Request occupancy, and expect it to succeed
    const occupancy = await room.occupancy.get();
    expect(occupancy).toEqual(expect.objectContaining({ connections: 0, presenceMembers: 0 }));

    // Request history, and expect it to succeed
    const history = (await room.messages.get({ limit: 1 })).items;
    expect(history).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: 'my message', clientId: chat.clientId })]),
    );
  });

  it('should work using msgpack', async () => {
    const chat = newChatClient(undefined, ablyRealtimeClient({ useBinaryProtocol: true }));
    const room = getRandomRoom(chat);

    // Send a message, and expect it to succeed
    const message = await room.messages.send({ text: 'my message' });
    expect(message).toEqual(expect.objectContaining({ text: 'my message', clientId: chat.clientId }));

    // Request occupancy, and expect it to succeed
    const occupancy = await room.occupancy.get();
    expect(occupancy).toEqual(expect.objectContaining({ connections: 0, presenceMembers: 0 }));

    // Request history, and expect it to succeed
    const history = (await room.messages.get({ limit: 1 })).items;
    expect(history).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: 'my message', clientId: chat.clientId })]),
    );
  });

  it('should have a connection state', async () => {
    const realtime = ablyRealtimeClient();
    const chat = newChatClient(undefined, realtime);

    await waitForConnectionStatus(chat, ConnectionStatus.Connected);

    // Fail the connection by disconnecting
    realtime.close();

    // Wait for the connection to fail
    await waitForConnectionStatus(chat, ConnectionStatus.Failed);
  });
});

import * as Ably from 'ably';
import { describe, expect, it } from 'vitest';

import { ChatClient } from '../../src/core/chat.ts';
import { ConnectionStatus } from '../../src/core/connection.ts';
import { LogLevel } from '../../src/core/logger.ts';
import { RealtimeWithOptions } from '../../src/core/realtime-extensions.ts';
import { CHANNEL_OPTIONS_AGENT_STRING_REACT, VERSION } from '../../src/core/version.ts';
import { newChatClient } from '../helper/chat.ts';
import { testClientOptions } from '../helper/options.ts';
import { ablyRealtimeClient } from '../helper/realtime-client.ts';
import { getRandomRoom } from '../helper/room.ts';

const waitForConnectionStatus = (chat: ChatClient, state: ConnectionStatus) => {
  return new Promise<void>((resolve, reject) => {
    const { off } = chat.connection.onStatusChange((change) => {
      if (change.current === state) {
        off();
        resolve();
      }
    });

    // Set a timeout to reject the promise if the status is not reached
    setInterval(() => {
      off();
      reject(new Error(`Connection state ${state} not reached`));
    }, 5000);
  });
};

describe('Chat', () => {
  it('should set the agent string on client instantiation', () => {
    const chat = newChatClient(testClientOptions());
    expect((chat.realtime as RealtimeWithOptions).options.agents).toEqual({ 'chat-js': VERSION });
  });

  it('should add a new agent string', () => {
    const chat = newChatClient(testClientOptions());
    chat.addReactAgent();
    expect((chat.realtime as RealtimeWithOptions).options.agents).toEqual({
      'chat-js': VERSION,
      'chat-react': VERSION,
    });
  });

  it('should set react channel agents', async () => {
    const chat = newChatClient(testClientOptions());
    chat.addReactAgent();

    const room = await chat.rooms.get('room');

    const channelOptions = (room.channel as unknown as { channelOptions: Ably.ChannelOptions }).channelOptions;
    expect(channelOptions.params).toEqual(
      expect.objectContaining({
        agent: CHANNEL_OPTIONS_AGENT_STRING_REACT,
      }),
    );
  });

  it('should mix in the client options', () => {
    const chat = newChatClient(testClientOptions({ logLevel: LogLevel.Warn }));
    expect(chat.clientOptions.logLevel).toBe(LogLevel.Warn);
  });

  it('should work using basic auth', async () => {
    const chat = newChatClient({}, ablyRealtimeClient({}));
    const room = await getRandomRoom(chat);

    // Send a message, and expect it to succeed
    const message = await room.messages.send({ text: 'my message' });
    expect(message).toEqual(expect.objectContaining({ text: 'my message', clientId: chat.clientId }));

    // Request occupancy, and expect it to succeed
    const occupancy = await room.occupancy.get();
    expect(occupancy).toEqual(expect.objectContaining({ connections: 1, presenceMembers: 0 }));

    // Request history, and expect it to succeed
    await new Promise((resolve) => setTimeout(resolve, 3000)); // wait for cassandra
    const history = await room.messages.history({ limit: 1 });
    expect(history.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: 'my message', clientId: chat.clientId })]),
    );
  });

  it('should work using msgpack', async () => {
    const chat = newChatClient(undefined, ablyRealtimeClient({ useBinaryProtocol: true }));
    const room = await getRandomRoom(chat);

    // Send a message, and expect it to succeed
    const message = await room.messages.send({ text: 'my message' });
    expect(message).toEqual(expect.objectContaining({ text: 'my message', clientId: chat.clientId }));

    // Request occupancy, and expect it to succeed
    const occupancy = await room.occupancy.get();
    expect(occupancy).toEqual(expect.objectContaining({ connections: 1, presenceMembers: 0 }));

    // Request history, and expect it to succeed
    await new Promise((resolve) => setTimeout(resolve, 3000)); // wait for persistence - this will not be necessary in the future
    const history = await room.messages.history({ limit: 1 });
    expect(history.items).toEqual(
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

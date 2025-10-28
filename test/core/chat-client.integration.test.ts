import * as Ably from 'ably';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatClient } from '../../src/core/chat-client.ts';
import { ConnectionStatus } from '../../src/core/connection.ts';
import { LogLevel } from '../../src/core/logger.ts';
import { RealtimeWithOptions } from '../../src/core/realtime-extensions.ts';
import { Room } from '../../src/core/room.ts';
import { CHANNEL_OPTIONS_AGENT_STRING, CHANNEL_OPTIONS_AGENT_STRING_REACT, VERSION } from '../../src/core/version.ts';
import { newChatClient } from '../helper/chat.ts';
import { testClientOptions } from '../helper/options.ts';
import { ablyRealtimeClient } from '../helper/realtime-client.ts';
import { getRandomRoom } from '../helper/room.ts';

const waitForConnectionStatus = async (chat: ChatClient, state: ConnectionStatus) =>
  new Promise<void>((resolve, reject) => {
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

describe('Chat', () => {
  let connectSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    const chat = newChatClient(testClientOptions());
    // Spy on the connectWs method to check if the agent string is sent
    const cm = (
      chat.realtime as unknown as {
        connection: { connectionManager: { connectWs: (...args: unknown[]) => void } };
      }
    ).connection.connectionManager;

    connectSpy = vi.spyOn(cm, 'connectWs');
  });

  afterEach(() => {
    connectSpy.mockRestore();
  });

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

  it('should add an agent/version pair', () => {
    const chat = newChatClient(testClientOptions());
    chat.addAgentWithVersion('test-agent', '1.0.0');
    expect((chat.realtime as RealtimeWithOptions).options.agents).toEqual({
      'test-agent': '1.0.0',
      'chat-js': VERSION,
    });
  });

  it('should send agent string with room attach', async () => {
    const chat = newChatClient(testClientOptions());
    expect((chat.realtime as RealtimeWithOptions).options.agents).toEqual({ 'chat-js': VERSION });
    const room = await getRandomRoom(chat);
    await room.attach();

    const params = connectSpy.mock.calls[0]?.[0] as { options: { agents: Record<string, string> } };
    expect(params.options.agents).toEqual({ 'chat-js': VERSION });
  }, 20000);

  it('should set react channel agents', async () => {
    const chat = newChatClient(testClientOptions());
    chat.addReactAgent();

    const room = await chat.rooms.get('room');

    const channelOptions = (room.channel as unknown as { channelOptions: Ably.ChannelOptions }).channelOptions;
    expect(channelOptions.params).toEqual(
      expect.objectContaining({
        agent: `${CHANNEL_OPTIONS_AGENT_STRING} ${CHANNEL_OPTIONS_AGENT_STRING_REACT}`,
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

    // Attach to the room
    await room.attach();

    // Request occupancy, and expect it to succeed
    await vi.waitFor(async () => {
      const occupancy = await room.occupancy.get();
      return occupancy.connections === 1 && occupancy.presenceMembers === 0;
    }, 10000);

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

    // Attach to the room
    await room.attach();

    // Request occupancy, and expect it to succeed
    await vi.waitFor(async () => {
      const occupancy = await room.occupancy.get();
      return occupancy.connections === 1 && occupancy.presenceMembers === 0;
    }, 10000);

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

    // Closed the connection by disconnecting
    realtime.close();

    // Wait for the connection to fail
    await waitForConnectionStatus(chat, ConnectionStatus.Closed);
  });

  it('should garbage collect chat client after disposal', { timeout: 10000 }, async () => {
    // Check GC is available and fail the test if it's not
    expect(globalThis.gc).toBeDefined();

    // Create a chat client
    let chat: ChatClient | undefined = newChatClient();

    // Create a room and attach it (as requested)
    let room: Room | undefined = await getRandomRoom(chat);
    await room.attach();

    // Add mock listeners to the chat clients connection
    const connectionListener = vi.fn();
    chat.connection.onStatusChange(connectionListener);

    // Add mock listeners to the room to ensure it's properly used
    const messagesListener = vi.fn();
    room.messages.subscribe(messagesListener);

    // Create weak references to the chat client and its key components
    const chatRef = new WeakRef(chat);
    const connectionRef = new WeakRef(chat.connection);
    const roomsRef = new WeakRef(chat.rooms);
    const roomRef = new WeakRef(room);
    const messagesRef = new WeakRef(room.messages);

    // Verify all references are initially alive
    expect(chatRef.deref()).toBeDefined();
    expect(connectionRef.deref()).toBeDefined();
    expect(roomsRef.deref()).toBeDefined();
    expect(roomRef.deref()).toBeDefined();

    // Release the room first (required before disposing the chat client)
    await chat.rooms.release(room.name);

    // Set room to undefined to remove our strong reference
    room = undefined;

    // Dispose of the chat client
    await chat.dispose();

    // Set chat to undefined to remove our strong reference
    chat = undefined;

    // Wait for the chat client and its components to be garbage collected
    await vi.waitFor(
      () => {
        globalThis.gc?.();

        expect(chatRef.deref()).toBeUndefined();
        expect(connectionRef.deref()).toBeUndefined();
        expect(messagesRef.deref()).toBeUndefined();
        expect(roomsRef.deref()).toBeUndefined();
        expect(roomRef.deref()).toBeUndefined();
      },
      { timeout: 9000, interval: 250 },
    );
  });

  it('should garbage collect chat client after disposal without attaching', { timeout: 10000 }, async () => {
    // Check GC is available and fail the test if it's not
    expect(globalThis.gc).toBeDefined();

    // Create a chat client
    let chat: ChatClient | undefined = newChatClient();

    // Create a room and attach it (as requested)
    let room: Room | undefined = await getRandomRoom(chat);

    // Add mock listeners to the chat clients connection
    const connectionListener = vi.fn();
    chat.connection.onStatusChange(connectionListener);

    // Add mock listeners to the room to ensure it's properly used
    const messagesListener = vi.fn();
    room.messages.subscribe(messagesListener);

    // Create weak references to the chat client and its key components
    const chatRef = new WeakRef(chat);
    const connectionRef = new WeakRef(chat.connection);
    const roomsRef = new WeakRef(chat.rooms);
    const roomRef = new WeakRef(room);
    const messagesRef = new WeakRef(room.messages);

    // Verify all references are initially alive
    expect(chatRef.deref()).toBeDefined();
    expect(connectionRef.deref()).toBeDefined();
    expect(roomsRef.deref()).toBeDefined();
    expect(roomRef.deref()).toBeDefined();

    // Release the room first (required before disposing the chat client)
    await chat.rooms.release(room.name);

    // Set room to undefined to remove our strong reference
    room = undefined;

    // Dispose of the chat client
    await chat.dispose();

    // Set chat to undefined to remove our strong reference
    chat = undefined;

    // Wait for the chat client and its components to be garbage collected
    await vi.waitFor(
      async () => {
        globalThis.gc?.();

        // Wait 100ms
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Force GC again, to ensure reclamation
        globalThis.gc?.();

        expect(chatRef.deref()).toBeUndefined();
        expect(connectionRef.deref()).toBeUndefined();
        expect(messagesRef.deref()).toBeUndefined();
        expect(roomsRef.deref()).toBeUndefined();
        expect(roomRef.deref()).toBeUndefined();
      },
      { timeout: 9000, interval: 250 },
    );
  });

  it('should garbage collect chat client after disposal without creating a room', { timeout: 10000 }, async () => {
    // Check GC is available and fail the test if it's not
    expect(globalThis.gc).toBeDefined();

    // Create a chat client
    let chat: ChatClient | undefined = newChatClient();

    // Add mock listeners to the chat clients connection
    const connectionListener = vi.fn();
    chat.connection.onStatusChange(connectionListener);

    // Create weak references to the chat client and its key components
    const chatRef = new WeakRef(chat);
    const connectionRef = new WeakRef(chat.connection);
    const roomsRef = new WeakRef(chat.rooms);

    // Verify all references are initially alive
    expect(chatRef.deref()).toBeDefined();
    expect(connectionRef.deref()).toBeDefined();
    expect(roomsRef.deref()).toBeDefined();

    // Dispose of the chat client
    await chat.dispose();

    // Set chat to undefined to remove our strong reference
    chat = undefined;

    // Wait for the chat client and its components to be garbage collected
    await vi.waitFor(
      async () => {
        globalThis.gc?.();

        // Wait 100ms
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Force GC again, to ensure reclamation (and avoid the deref causing any strong references)
        globalThis.gc?.();

        expect(chatRef.deref()).toBeUndefined();
        expect(connectionRef.deref()).toBeUndefined();
        expect(roomsRef.deref()).toBeUndefined();
      },
      { timeout: 9000, interval: 250 },
    );
  });
});

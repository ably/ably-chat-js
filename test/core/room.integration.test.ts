import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatClient } from '../../src/core/chat-client.ts';
import { DefaultRoom, Room } from '../../src/core/room.ts';
import { RoomStatus } from '../../src/core/room-status.ts';
import { newChatClient } from '../helper/chat.ts';
import { getRandomRoom } from '../helper/room.ts';

interface TestContext {
  chat: ChatClient;
  room: Room;
}

describe('Room', () => {
  beforeEach<TestContext>(async (context) => {
    context.chat = newChatClient();
    context.room = await getRandomRoom(context.chat);
  });

  it<TestContext>('should be attachable', async ({ room }) => {
    await room.attach();

    // We should be attached
    expect(room.status).toEqual(RoomStatus.Attached);

    // If we check the underlying channels, they should be attached too
    const messagesChannel = room.channel;
    expect(messagesChannel.state).toEqual('attached');

    const reactionsChannel = room.channel;
    expect(reactionsChannel.state).toEqual('attached');

    const typingChannel = room.channel;
    expect(typingChannel.state).toEqual('attached');

    const presenceChannel = room.channel;
    expect(presenceChannel.state).toEqual('attached');

    const occupancyChannel = room.channel;
    expect(occupancyChannel.state).toEqual('attached');
  });

  it<TestContext>('should be detachable', async ({ room }) => {
    await room.attach();
    await room.detach();

    // We should be detached
    expect(room.status).toEqual(RoomStatus.Detached);

    // If we check the underlying channels, they should be detached too
    const messagesChannel = room.channel;
    expect(messagesChannel.state).toEqual('detached');

    const reactionsChannel = room.channel;
    expect(reactionsChannel.state).toEqual('detached');

    const typingChannel = room.channel;
    expect(typingChannel.state).toEqual('detached');

    const presenceChannel = room.channel;
    expect(presenceChannel.state).toEqual('detached');

    const occupancyChannel = room.channel;
    expect(occupancyChannel.state).toEqual('detached');
  });

  it<TestContext>('should be releasable', async ({ room }) => {
    await room.attach();

    // We should be attached
    expect(room.status).toEqual(RoomStatus.Attached);

    // Release the room
    await (room as DefaultRoom).release();

    // We should be released
    expect(room.status).toEqual(RoomStatus.Released);
  });

  it<TestContext>('releasing a room multiple times is idempotent', async ({ room }) => {
    await room.attach();

    // We should be attached
    expect(room.status).toEqual(RoomStatus.Attached);

    // Release the room multiple times
    await (room as DefaultRoom).release();
    await (room as DefaultRoom).release();
    await (room as DefaultRoom).release();

    // We should be released
    expect(room.status).toEqual(RoomStatus.Released);
  });

  it<TestContext>('should garbage collect room and features after release', async ({ chat }) => {
    // Check GC is available and fail the test if it's not
    expect(globalThis.gc).toBeDefined();

    // Create a room and attach it
    let room: Room | undefined = await getRandomRoom(chat, {
      occupancy: {
        enableEvents: true,
      },
    });
    await room.attach();

    // Add mock listeners for all the room features and events
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const listener3 = vi.fn();
    const listener4 = vi.fn();
    const listener5 = vi.fn();
    const listener6 = vi.fn();
    const listener7 = vi.fn();
    room.messages.subscribe(listener1);
    room.presence.subscribe(listener2);
    room.typing.subscribe(listener3);
    room.reactions.subscribe(listener4);
    room.occupancy.subscribe(listener5);
    room.onStatusChange(listener6);
    room.onDiscontinuity(listener7);

    // Create weak references to the room and all its features
    const roomRef = new WeakRef(room);
    const messagesRef = new WeakRef(room.messages);
    const presenceRef = new WeakRef(room.presence);
    const typingRef = new WeakRef(room.typing);
    const reactionsRef = new WeakRef(room.reactions);
    const occupancyRef = new WeakRef(room.occupancy);

    // Verify all references are initially alive
    expect(roomRef.deref()).toBeDefined();
    expect(messagesRef.deref()).toBeDefined();
    expect(presenceRef.deref()).toBeDefined();
    expect(typingRef.deref()).toBeDefined();
    expect(reactionsRef.deref()).toBeDefined();
    expect(occupancyRef.deref()).toBeDefined();

    // Release the room
    await chat.rooms.release(room.name);

    // Set room to undefined to remove our strong reference
    room = undefined;

    // Wait for the room and features to be garbage collected
    await vi.waitFor(
      () => {
        globalThis.gc?.();

        expect(roomRef.deref()).toBeUndefined();
        expect(messagesRef.deref()).toBeUndefined();
        expect(presenceRef.deref()).toBeUndefined();
        expect(typingRef.deref()).toBeUndefined();
        expect(reactionsRef.deref()).toBeUndefined();
        expect(occupancyRef.deref()).toBeUndefined();
      },
      { timeout: 3000, interval: 250 },
    );
  });
});

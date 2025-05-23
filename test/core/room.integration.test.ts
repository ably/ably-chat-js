import { beforeEach, describe, expect, it } from 'vitest';

import { ChatClient } from '../../src/core/chat.ts';
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
});

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
  beforeEach<TestContext>((context) => {
    context.chat = newChatClient();
    context.room = getRandomRoom(context.chat);
  });

  it<TestContext>('should be attachable', async ({ room }) => {
    await room.attach();

    // We should be attached
    expect(room.status.status).toEqual(RoomStatus.Attached);

    // If we check the underlying channels, they should be attached too
    const messagesChannel = await room.messages.channel;
    expect(messagesChannel.state).toEqual('attached');

    const reactionsChannel = await room.reactions.channel;
    expect(reactionsChannel.state).toEqual('attached');

    const typingChannel = await room.typing.channel;
    expect(typingChannel.state).toEqual('attached');

    const presenceChannel = await room.presence.channel;
    expect(presenceChannel.state).toEqual('attached');

    const occupancyChannel = await room.occupancy.channel;
    expect(occupancyChannel.state).toEqual('attached');
  });

  it<TestContext>('should be detachable', async ({ room }) => {
    await room.attach();
    await room.detach();

    // We should be detached
    expect(room.status.status).toEqual(RoomStatus.Detached);

    // If we check the underlying channels, they should be detached too
    const messagesChannel = await room.messages.channel;
    expect(messagesChannel.state).toEqual('detached');

    const reactionsChannel = await room.reactions.channel;
    expect(reactionsChannel.state).toEqual('detached');

    const typingChannel = await room.typing.channel;
    expect(typingChannel.state).toEqual('detached');

    const presenceChannel = await room.presence.channel;
    expect(presenceChannel.state).toEqual('detached');

    const occupancyChannel = await room.occupancy.channel;
    expect(occupancyChannel.state).toEqual('detached');
  });

  it<TestContext>('should be releasable', async ({ room }) => {
    await room.attach();

    // We should be attached
    expect(room.status.status).toEqual(RoomStatus.Attached);

    // Release the room
    await (room as DefaultRoom).release();

    // We should be released
    expect(room.status.status).toEqual(RoomStatus.Released);
  });

  it<TestContext>('releasing a room multiple times is idempotent', async ({ room }) => {
    await room.attach();

    // We should be attached
    expect(room.status.status).toEqual(RoomStatus.Attached);

    // Release the room multiple times
    await (room as DefaultRoom).release();
    await (room as DefaultRoom).release();
    await (room as DefaultRoom).release();

    // We should be released
    expect(room.status.status).toEqual(RoomStatus.Released);
  });
});

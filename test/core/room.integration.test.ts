import { beforeEach, describe, expect, it } from 'vitest';

import { ChatClient } from '../../src/core/chat.ts';
import { DefaultRoom, Room } from '../../src/core/room.ts';
import { RoomLifecycle } from '../../src/core/room-status.ts';
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
    expect(room.status.current).toEqual(RoomLifecycle.Attached);

    // If we check the underlying channels, they should be attached too
    expect((await room.messages.channelPromise).state).toEqual('attached');
    expect((await room.reactions.channelPromise).state).toEqual('attached');
    expect((await room.typing.channelPromise).state).toEqual('attached');
    expect((await room.presence.channelPromise).state).toEqual('attached');
    expect((await room.occupancy.channelPromise).state).toEqual('attached');
  });

  it<TestContext>('should be detachable', async ({ room }) => {
    await room.attach();
    await room.detach();

    // We should be detached
    expect(room.status.current).toEqual(RoomLifecycle.Detached);

    // If we check the underlying channels, they should be detached too
    expect((await room.messages.channelPromise).state).toEqual('detached');
    expect((await room.reactions.channelPromise).state).toEqual('detached');
    expect((await room.typing.channelPromise).state).toEqual('detached');
    expect((await room.presence.channelPromise).state).toEqual('detached');
    expect((await room.occupancy.channelPromise).state).toEqual('detached');
  });

  it<TestContext>('should be releasable', async ({ room }) => {
    await room.attach();

    // We should be attached
    expect(room.status.current).toEqual(RoomLifecycle.Attached);

    // Release the room
    await (room as DefaultRoom).release();

    // We should be released
    expect(room.status.current).toEqual(RoomLifecycle.Released);
  });

  it<TestContext>('releasing a room multiple times is idempotent', async ({ room }) => {
    await room.attach();

    // We should be attached
    expect(room.status.current).toEqual(RoomLifecycle.Attached);

    // Release the room multiple times
    await (room as DefaultRoom).release();
    await (room as DefaultRoom).release();
    await (room as DefaultRoom).release();

    // We should be released
    expect(room.status.current).toEqual(RoomLifecycle.Released);
  });
});

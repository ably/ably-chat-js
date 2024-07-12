import * as Ably from 'ably';
import { describe, expect, it } from 'vitest';

import { RoomLifecycle } from '../../src/core/room-status.ts';
import { newChatClient } from '../helper/chat.ts';
import { waitForRoomStatus } from '../helper/room.ts';

describe('Rooms', () => {
  it('throws an error if you create the same room with different options', async () => {
    const chat = newChatClient();
    chat.rooms.get('test', { typing: { timeoutMs: 1000 } });
    await expect(async () => {
      chat.rooms.get('test', { typing: { timeoutMs: 2000 } });
      return Promise.resolve();
    }).rejects.toBeErrorInfoWithCode(40000);
  });

  it('gets the same room if you create it with the same options', () => {
    const chat = newChatClient();
    const room1 = chat.rooms.get('test', { typing: { timeoutMs: 1000 } });
    const room2 = chat.rooms.get('test', { typing: { timeoutMs: 1000 } });
    expect(room1).toBe(room2);
  });

  it('releases a room', async () => {
    // Create a room, then release, then create another room with different options
    const chat = newChatClient();
    const room1 = chat.rooms.get('test', { typing: { timeoutMs: 1000 } });
    await chat.rooms.release('test');
    const room = chat.rooms.get('test', { typing: { timeoutMs: 2000 } });
    expect(room.options().typing?.timeoutMs).toBe(2000);
    expect(room).not.toBe(room1);
  });

  it('releases a failed room', async () => {
    // Create a room, fail it, then release.
    const chat = newChatClient();
    const room = chat.rooms.get('test', { typing: { timeoutMs: 1000 } });

    // Make sure our room is attached
    await room.attach();

    const channelFailable = room.messages.channel as Ably.RealtimeChannel & {
      notifyState(state: 'failed'): void;
    };
    channelFailable.notifyState('failed');

    // Wait for room to enter failed state
    await waitForRoomStatus(room.status, RoomLifecycle.Failed);

    // Release the room
    await chat.rooms.release('test');
  });
});

import * as Ably from 'ably';
import { describe, expect, it } from 'vitest';

import { LogLevel } from '../../src/core/logger.ts';
import { RoomStatus } from '../../src/core/room-status.ts';
import { AllFeaturesEnabled } from '../../src/index.ts';
import { newChatClient } from '../helper/chat.ts';
import { waitForRoomStatus } from '../helper/room.ts';

describe('Rooms', () => {
  it('throws an error if you create the same room with different options', async () => {
    const chat = newChatClient({ logLevel: LogLevel.Silent });
    await chat.rooms.get('test', { typing: { heartbeatThrottleMs: 5000 } });
    await expect(chat.rooms.get('test', { typing: { heartbeatThrottleMs: 6000 } })).rejects.toBeErrorInfoWithCode(
      40000,
    );
  });

  it('gets the same room if you create it with the same options', async () => {
    const chat = newChatClient();
    const room1 = await chat.rooms.get('test', {
      typing: { heartbeatThrottleMs: 5000 },
    });
    const room2 = await chat.rooms.get('test', {
      typing: { heartbeatThrottleMs: 5000 },
    });
    expect(room1).toBe(room2);
  });

  it('releases a room', async () => {
    // Create a room, then release, then create another room with different options
    const chat = newChatClient();
    const room1 = await chat.rooms.get('test', {
      typing: { heartbeatThrottleMs: 5000 },
    });
    await chat.rooms.release('test');
    const room = await chat.rooms.get('test', {
      typing: { heartbeatThrottleMs: 5000 },
    });
    expect(room.options().typing?.heartbeatThrottleMs).toBe(5000);
    expect(room).not.toBe(room1);
  });

  it('releases and recreates a room in cycle', async () => {
    // Create a room, then release, then create another room with different options
    // We include presence options here because that invokes a change to channel modes - which would flag up
    // an error if we were doing releases in the wrong order etc
    const chat = newChatClient();
    const room1 = await chat.rooms.get('test', {
      typing: { heartbeatThrottleMs: 5000 },
      presence: AllFeaturesEnabled.presence,
    });
    await room1.attach();
    await chat.rooms.release('test');

    const room2 = await chat.rooms.get('test', {
      typing: { heartbeatThrottleMs: 5000 },
      presence: AllFeaturesEnabled.presence,
    });
    await room2.attach();
    await chat.rooms.release('test');

    await chat.rooms.get('test', {
      typing: { heartbeatThrottleMs: 5000 },
      presence: AllFeaturesEnabled.presence,
    });
    await chat.rooms.release('test');
  });

  it('releases a failed room', async () => {
    // Create a room, fail it, then release.
    const chat = newChatClient();
    const room = await chat.rooms.get('test', {
      typing: { heartbeatThrottleMs: 5000 },
    });

    // Make sure our room is attached
    await room.attach();

    const channelFailable = room.messages.channel as Ably.RealtimeChannel & {
      notifyState(state: 'failed'): void;
    };
    channelFailable.notifyState('failed');

    // Wait for room to enter failed state
    await waitForRoomStatus(room, RoomStatus.Failed);

    // Release the room
    await chat.rooms.release('test');
  });

  it('does not release a non-existent room', async () => {
    const chat = newChatClient();
    await expect(chat.rooms.release('test')).resolves.toBeUndefined();
  });

  it('returns the client options', () => {
    expect(newChatClient({ logLevel: LogLevel.Silent }).rooms.clientOptions).toEqual(
      expect.objectContaining({
        logLevel: LogLevel.Silent,
      }),
    );
  });
});

import * as Ably from 'ably';
import { describe, expect, it } from 'vitest';

import { LogLevel } from '../../src/core/logger.ts';
import { RoomStatus } from '../../src/core/room-status.ts';
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
    });
    await room1.attach();
    await chat.rooms.release('test');

    const room2 = await chat.rooms.get('test', {
      typing: { heartbeatThrottleMs: 5000 },
    });
    await room2.attach();
    await chat.rooms.release('test');

    await chat.rooms.get('test', {
      typing: { heartbeatThrottleMs: 5000 },
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

    const channelFailable = room.channel as Ably.RealtimeChannel & {
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

  describe('dispose', () => {
    it('disposes successfully when no rooms exist', async () => {
      const chat = newChatClient({ logLevel: LogLevel.Silent });
      await expect(chat.rooms.dispose()).resolves.toBeUndefined();
      expect(chat.rooms.count).toBe(0);
    });

    it('disposes a single room', async () => {
      const chat = newChatClient({ logLevel: LogLevel.Silent });
      const room = await chat.rooms.get('test-room');

      expect(chat.rooms.count).toBe(1);

      await chat.rooms.dispose();

      expect(chat.rooms.count).toBe(0);
      expect(room.status).toBe(RoomStatus.Released);
    });

    it('disposes multiple rooms', async () => {
      const chat = newChatClient({ logLevel: LogLevel.Silent });
      const room1 = await chat.rooms.get('test-room-1');
      const room2 = await chat.rooms.get('test-room-2');
      const room3 = await chat.rooms.get('test-room-3');

      expect(chat.rooms.count).toBe(3);

      await chat.rooms.dispose();

      expect(chat.rooms.count).toBe(0);
      expect(room1.status).toBe(RoomStatus.Released);
      expect(room2.status).toBe(RoomStatus.Released);
      expect(room3.status).toBe(RoomStatus.Released);
    });

    it('disposes attached rooms', async () => {
      const chat = newChatClient({ logLevel: LogLevel.Silent });
      const room1 = await chat.rooms.get('test-room-attached-1');
      const room2 = await chat.rooms.get('test-room-attached-2');

      // Attach the rooms
      await room1.attach();
      await room2.attach();

      expect(room1.status).toBe(RoomStatus.Attached);
      expect(room2.status).toBe(RoomStatus.Attached);
      expect(chat.rooms.count).toBe(2);

      await chat.rooms.dispose();

      expect(chat.rooms.count).toBe(0);
      expect(room1.status).toBe(RoomStatus.Released);
      expect(room2.status).toBe(RoomStatus.Released);
    });

    it('disposes failed rooms', async () => {
      const chat = newChatClient({ logLevel: LogLevel.Silent });
      const room = await chat.rooms.get('test-failed-room');

      // Attach the room first
      await room.attach();
      expect(room.status).toBe(RoomStatus.Attached);

      // Fail the room
      const channelFailable = room.channel as Ably.RealtimeChannel & {
        notifyState(state: 'failed'): void;
      };
      channelFailable.notifyState('failed');

      // Wait for room to enter failed state
      await waitForRoomStatus(room, RoomStatus.Failed);
      expect(room.status).toBe(RoomStatus.Failed);
      expect(chat.rooms.count).toBe(1);

      await chat.rooms.dispose();

      expect(chat.rooms.count).toBe(0);
      expect(room.status).toBe(RoomStatus.Released);
    });

    it('disposes rooms with mixed states', async () => {
      const chat = newChatClient({ logLevel: LogLevel.Silent });
      const initializedRoom = await chat.rooms.get('test-initialized');
      const attachedRoom = await chat.rooms.get('test-attached');

      // Attach one room, leave the other initialized
      await attachedRoom.attach();

      expect(initializedRoom.status).toBe(RoomStatus.Initialized);
      expect(attachedRoom.status).toBe(RoomStatus.Attached);
      expect(chat.rooms.count).toBe(2);

      await chat.rooms.dispose();

      expect(chat.rooms.count).toBe(0);
      expect(initializedRoom.status).toBe(RoomStatus.Released);
      expect(attachedRoom.status).toBe(RoomStatus.Released);
    });

    it('should prevent creating new rooms after dispose', async () => {
      const chat = newChatClient({ logLevel: LogLevel.Silent });

      // Create and dispose rooms
      await chat.rooms.get('test-room-1');
      await chat.rooms.get('test-room-2');
      expect(chat.rooms.count).toBe(2);

      await chat.rooms.dispose();
      expect(chat.rooms.count).toBe(0);

      // Should not be able to create new rooms after dispose
      await expect(chat.rooms.get('test-room-new')).rejects.toBeErrorInfoWithCode(40000);
    });

    it('should fail when trying to get rooms after dispose', async () => {
      const chat = newChatClient({ logLevel: LogLevel.Silent });

      await chat.rooms.dispose();

      // Any attempt to get a room should fail
      await expect(chat.rooms.get('any-room')).rejects.toBeErrorInfo({
        code: 40000,
        statusCode: 400,
        message: 'cannot get room, rooms instance has been disposed',
      });

      // Multiple calls should all fail
      await expect(chat.rooms.get('another-room')).rejects.toBeErrorInfoWithCode(40000);
      await expect(
        chat.rooms.get('yet-another-room', { typing: { heartbeatThrottleMs: 1000 } }),
      ).rejects.toBeErrorInfoWithCode(40000);
    });
  });
});

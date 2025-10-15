import * as Ably from 'ably';
import { describe, expect, it, vi } from 'vitest';

import { ErrorCode } from '../../../src/core/errors.js';
import { Room } from '../../../src/core/room.js';
import { RoomReferenceManager } from '../../../src/react/helper/room-reference-manager.js';
import { newChatClient } from '../../helper/chat.js';
import { randomRoomName } from '../../helper/identifier.js';

vi.mock('ably');

describe('RoomReferenceManager', () => {
  it('should create a manager with the correct client', () => {
    const client = newChatClient();
    const logger = client.logger;
    const manager = new RoomReferenceManager(client, logger);

    expect(manager.client).toBe(client);
  });

  it('should return 0 reference count for non-existent room', () => {
    const client = newChatClient();
    const logger = client.logger;
    const manager = new RoomReferenceManager(client, logger);
    const roomName = randomRoomName();

    expect(manager.getReferenceCount(roomName)).toBe(0);
  });

  it('should add first reference and attach room', async () => {
    const client = newChatClient();
    const logger = client.logger;
    const manager = new RoomReferenceManager(client, logger);
    const roomName = randomRoomName();

    // Mock the room that will be returned
    const mockRoom = await client.rooms.get(roomName);
    vi.spyOn(mockRoom, 'attach').mockResolvedValue();

    const room = await manager.addReference(roomName);

    expect(room).toBe(mockRoom);
    expect(manager.getReferenceCount(roomName)).toBe(1);
    expect(mockRoom.attach).toHaveBeenCalled();
  });

  it('should increment reference count for existing room', async () => {
    const client = newChatClient();
    const logger = client.logger;
    const manager = new RoomReferenceManager(client, logger);
    const roomName = randomRoomName();

    // Mock the room that will be returned
    const mockRoom = await client.rooms.get(roomName);
    vi.spyOn(mockRoom, 'attach').mockResolvedValue();

    // Add first reference
    const room1 = await manager.addReference(roomName);
    expect(manager.getReferenceCount(roomName)).toBe(1);

    // Add second reference
    const room2 = await manager.addReference(roomName);
    expect(room1).toBe(room2); // Should return the same room instance
    expect(manager.getReferenceCount(roomName)).toBe(2);
    expect(mockRoom.attach).toHaveBeenCalledTimes(1); // Should only attach once
  });

  it('should handle different options as different rooms', async () => {
    const client = newChatClient();
    const logger = client.logger;
    const manager = new RoomReferenceManager(client, logger);
    const roomName1 = randomRoomName();
    const roomName2 = randomRoomName();

    const options1 = { occupancy: { enableEvents: true } };
    const options2 = { occupancy: { enableEvents: false } };

    // Mock rooms for different options
    const mockRoom1 = await client.rooms.get(roomName1, options1);
    const mockRoom2 = await client.rooms.get(roomName2, options2);
    vi.spyOn(mockRoom1, 'attach').mockResolvedValue();
    vi.spyOn(mockRoom2, 'attach').mockResolvedValue();

    const room1 = await manager.addReference(roomName1, options1);
    const room2 = await manager.addReference(roomName2, options2);

    expect(room1).toBe(mockRoom1);
    expect(room2).toBe(mockRoom2);
    expect(manager.getReferenceCount(roomName1, options1)).toBe(1);
    expect(manager.getReferenceCount(roomName2, options2)).toBe(1);
  });

  it('should handle same room name with different options by releasing old room', async () => {
    const client = newChatClient();
    const logger = client.logger;
    const manager = new RoomReferenceManager(client, logger);
    const roomName = randomRoomName();

    const options1 = { occupancy: { enableEvents: true } };
    const options2 = { occupancy: { enableEvents: false } };

    // Mock release method to actually remove the room from the client's internal map
    vi.spyOn(client.rooms, 'release').mockImplementation((name: string) => {
      // Remove the room from the client's internal rooms map to simulate real behavior
      const roomsInternal = (client.rooms as unknown as { _rooms: Map<string, unknown> })._rooms;
      roomsInternal.delete(name);
      return Promise.resolve();
    });

    // First, add a reference with options1
    await manager.addReference(roomName, options1);
    expect(manager.getReferenceCount(roomName, options1)).toBe(1);

    // Now try to add a reference with different options
    // This should now throw an error since the room is actively being used
    await expect(manager.addReference(roomName, options2)).rejects.toBeErrorInfo({
      code: ErrorCode.RoomExistsWithDifferentOptions,
      message: `unable to get room reference; room "${roomName}" is already in use with different options`,
    });

    // Original room should still exist and be unchanged
    expect(manager.getReferenceCount(roomName, options1)).toBe(1);
    expect(manager.getReferenceCount(roomName, options2)).toBe(0);

    // Release should not have been called
    expect(client.rooms.release).not.toHaveBeenCalled();
  });

  it('should handle adding reference with no options after room with options', async () => {
    const client = newChatClient();
    const logger = client.logger;
    const manager = new RoomReferenceManager(client, logger);
    const roomName = randomRoomName();

    const options1 = { occupancy: { enableEvents: true } };

    // Mock release method to actually remove the room from the client's internal map
    vi.spyOn(client.rooms, 'release').mockImplementation((name: string) => {
      // Remove the room from the client's internal rooms map to simulate real behavior
      const roomsInternal = (client.rooms as unknown as { _rooms: Map<string, unknown> })._rooms;
      roomsInternal.delete(name);
      return Promise.resolve();
    });

    // First, add a reference with options
    await manager.addReference(roomName, options1);
    expect(manager.getReferenceCount(roomName, options1)).toBe(1);

    // Now try to add a reference with no options
    // This should now throw an error since the room is actively being used
    await expect(manager.addReference(roomName)).rejects.toBeErrorInfo({
      code: ErrorCode.RoomExistsWithDifferentOptions,
      message: `unable to get room reference; room "${roomName}" is already in use with different options`,
    });

    // Original room should still exist and be unchanged
    expect(manager.getReferenceCount(roomName, options1)).toBe(1);
    expect(manager.getReferenceCount(roomName)).toBe(0);

    // Release should not have been called
    expect(client.rooms.release).not.toHaveBeenCalled();
  });

  it('should handle options change with multiple references', async () => {
    const client = newChatClient();
    const logger = client.logger;
    const manager = new RoomReferenceManager(client, logger);
    const roomName = randomRoomName();

    const options1 = { occupancy: { enableEvents: true } };
    const options2 = { occupancy: { enableEvents: false } };

    // Mock release method to actually remove the room from the client's internal map
    vi.spyOn(client.rooms, 'release').mockImplementation((name: string) => {
      // Remove the room from the client's internal rooms map to simulate real behavior
      const roomsInternal = (client.rooms as unknown as { _rooms: Map<string, unknown> })._rooms;
      roomsInternal.delete(name);
      return Promise.resolve();
    });

    // Add multiple references with options1
    await manager.addReference(roomName, options1);
    await manager.addReference(roomName, options1);
    expect(manager.getReferenceCount(roomName, options1)).toBe(2);

    // Now try to add a reference with different options
    // This should now throw an error since the room is actively being used with multiple references
    await expect(manager.addReference(roomName, options2)).rejects.toBeErrorInfo({
      code: ErrorCode.RoomExistsWithDifferentOptions,
      message: `unable to get room reference; room "${roomName}" is already in use with different options`,
    });

    // Original room should still exist and be unchanged
    expect(manager.getReferenceCount(roomName, options1)).toBe(2);
    expect(manager.getReferenceCount(roomName, options2)).toBe(0);

    // Release should not have been called
    expect(client.rooms.release).not.toHaveBeenCalled();
  });

  it('should generate same key for options with same values but different property order', () => {
    const client = newChatClient();
    const logger = client.logger;
    const manager = new RoomReferenceManager(client, logger);
    const roomName = randomRoomName();

    // These two options objects have the same values but properties in different order
    const options1 = {
      occupancy: { enableEvents: true },
      typing: { heartbeatThrottleMs: 5000 },
      presence: { enableEvents: false },
      messages: { rawMessageReactions: true },
    };

    const options2 = {
      messages: { rawMessageReactions: true },
      presence: { enableEvents: false },
      occupancy: { enableEvents: true },
      typing: { heartbeatThrottleMs: 5000 },
    };

    // Both should be treated as the same room
    expect(manager.getReferenceCount(roomName, options1)).toBe(0);
    expect(manager.getReferenceCount(roomName, options2)).toBe(0);

    // After adding a reference with options1, getting count with options2 should be the same
    void manager.addReference(roomName, options1);

    // These should both return 1 since the options are semantically identical
    expect(manager.getReferenceCount(roomName, options1)).toBe(1);
    expect(manager.getReferenceCount(roomName, options2)).toBe(1);
  });

  it('should generate same key for options with same values but different property order including arrays', () => {
    const client = newChatClient();
    const logger = client.logger;
    const manager = new RoomReferenceManager(client, logger);
    const roomName = randomRoomName();

    // These two options objects have the same values but properties in different order
    const options1 = {
      occupancy: { enableEvents: true },
      typing: { heartbeatThrottleMs: 5000 },
      presence: { enableEvents: false },
      messages: { rawMessageReactions: true },
      foo: [1, 2],
    };

    const options2 = {
      messages: { rawMessageReactions: true },
      presence: { enableEvents: false },
      occupancy: { enableEvents: true },
      typing: { heartbeatThrottleMs: 5000 },
      foo: [2, 1],
    };

    // Both should be treated as the same room
    expect(manager.getReferenceCount(roomName, options1)).toBe(0);
    expect(manager.getReferenceCount(roomName, options2)).toBe(0);

    // After adding a reference with options1, getting count with options2 should be the same
    void manager.addReference(roomName, options1);
    void manager.addReference(roomName, options2);

    // These should both return 1 since the options are semantically identical
    expect(manager.getReferenceCount(roomName, options1)).toBe(2);
    expect(manager.getReferenceCount(roomName, options2)).toBe(2);
  });

  it('should treat same room name with different options as separate references', () => {
    const client = newChatClient();
    const logger = client.logger;
    const manager = new RoomReferenceManager(client, logger);
    const roomName = randomRoomName();

    const options1 = { occupancy: { enableEvents: true } };
    const options2 = { occupancy: { enableEvents: false } };

    // Different options should result in different reference counts
    expect(manager.getReferenceCount(roomName, options1)).toBe(0);
    expect(manager.getReferenceCount(roomName, options2)).toBe(0);
    expect(manager.getReferenceCount(roomName)).toBe(0); // No options
  });

  it('should remove reference and not release when count > 0', async () => {
    const client = newChatClient();
    const logger = client.logger;
    const manager = new RoomReferenceManager(client, logger);
    const roomName = randomRoomName();

    // Add two references properly
    const mockRoom = await client.rooms.get(roomName);
    vi.spyOn(mockRoom, 'attach').mockResolvedValue();
    vi.spyOn(client.rooms, 'release');

    await manager.addReference(roomName);
    await manager.addReference(roomName);
    expect(manager.getReferenceCount(roomName)).toBe(2);

    manager.removeReference(roomName);
    expect(manager.getReferenceCount(roomName)).toBe(1);

    // Should not release immediately when count > 0
    expect(client.rooms.release).not.toHaveBeenCalled();
  });

  it('should schedule delayed release when count reaches 0', async () => {
    const client = newChatClient();
    const logger = client.logger;
    const manager = new RoomReferenceManager(client, logger);
    const roomName = randomRoomName();

    // Add and immediately remove a reference
    const mockRoom = await client.rooms.get(roomName);
    vi.spyOn(mockRoom, 'attach').mockResolvedValue();
    vi.spyOn(client.rooms, 'release').mockResolvedValue();

    await manager.addReference(roomName);
    expect(manager.getReferenceCount(roomName)).toBe(1);

    manager.removeReference(roomName);
    expect(manager.getReferenceCount(roomName)).toBe(0);

    // Should not release immediately
    expect(client.rooms.release).not.toHaveBeenCalled();

    // Wait for the delayed release
    await vi.waitFor(() => {
      expect(client.rooms.release).toHaveBeenCalledWith(roomName);
    });
  });

  it('should abort pending release when reference is added again', async () => {
    const client = newChatClient();
    const logger = client.logger;
    const manager = new RoomReferenceManager(client, logger);
    const roomName = randomRoomName();

    // Mock the room
    const mockRoom = await client.rooms.get(roomName);
    vi.spyOn(mockRoom, 'attach').mockResolvedValue();
    vi.spyOn(client.rooms, 'release').mockResolvedValue();

    // Add reference
    await manager.addReference(roomName);
    expect(manager.getReferenceCount(roomName)).toBe(1);

    // Remove reference (should schedule release)
    manager.removeReference(roomName);
    expect(manager.getReferenceCount(roomName)).toBe(0);

    // Add reference again quickly (should abort release)
    await manager.addReference(roomName);
    expect(manager.getReferenceCount(roomName)).toBe(1);

    // Wait longer than the release delay to ensure release was aborted
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Release should have been aborted
    expect(client.rooms.release).not.toHaveBeenCalled();
  });

  it('should handle removeReference with no existing reference', () => {
    const client = newChatClient();
    const logger = client.logger;
    const manager = new RoomReferenceManager(client, logger);
    const roomName = randomRoomName();

    // This should not throw
    expect(() => {
      manager.removeReference(roomName);
    }).not.toThrow();

    expect(manager.getReferenceCount(roomName)).toBe(0);
  });

  it('should handle room attach failure gracefully', async () => {
    const client = newChatClient();
    const logger = client.logger;
    const manager = new RoomReferenceManager(client, logger);
    const roomName = randomRoomName();

    // Mock room attach to fail
    const mockRoom = await client.rooms.get(roomName);
    const attachError = new Ably.ErrorInfo('Attach failed', 50000, 500);
    vi.spyOn(mockRoom, 'attach').mockRejectedValue(attachError);

    // Should still return the room even if attach fails
    const room = await manager.addReference(roomName);
    expect(room).toBe(mockRoom);
    expect(manager.getReferenceCount(roomName)).toBe(1);
  });

  it('should handle room release failure gracefully', async () => {
    const client = newChatClient();
    const logger = client.logger;
    const manager = new RoomReferenceManager(client, logger);
    const roomName = randomRoomName();

    // Mock room and release to fail
    const mockRoom = await client.rooms.get(roomName);
    vi.spyOn(mockRoom, 'attach').mockResolvedValue();
    const releaseError = new Ably.ErrorInfo('Release failed', 50000, 500);
    vi.spyOn(client.rooms, 'release').mockRejectedValue(releaseError);

    // Add and remove reference
    await manager.addReference(roomName);
    manager.removeReference(roomName);

    // Wait for the delayed release (should not throw)
    await vi.waitFor(() => {
      expect(client.rooms.release).toHaveBeenCalledWith(roomName);
    });

    // The error should be caught and not propagated
    expect(manager.getReferenceCount(roomName)).toBe(0);
  });

  it('should wait for pending release to complete before adding new reference', async () => {
    const client = newChatClient();
    const logger = client.logger;
    const manager = new RoomReferenceManager(client, logger);
    const roomName = randomRoomName();

    // Create a controlled promise to simulate delayed release
    let controlledReleaseResolve: (() => void) | undefined;
    const controlledDelayPromise = new Promise<void>((resolve) => {
      controlledReleaseResolve = resolve;
    });

    // Mock client.rooms.release to wait for our controlled delay
    vi.spyOn(client.rooms, 'release').mockImplementation(async (name: string) => {
      // Simulate the client's internal room removal
      const roomsInternal = (client.rooms as unknown as { _rooms: Map<string, unknown> })._rooms;
      roomsInternal.delete(name);

      // Wait for the controlled delay
      await controlledDelayPromise;
      return;
    });

    // First, add a reference with some options
    const options1 = { occupancy: { enableEvents: true } };
    await manager.addReference(roomName, options1);
    expect(manager.getReferenceCount(roomName, options1)).toBe(1);

    // Remove the reference to trigger a delayed release
    manager.removeReference(roomName, options1);
    expect(manager.getReferenceCount(roomName, options1)).toBe(0);

    // Wait a bit for the delayed release to be scheduled
    await new Promise((resolve) => setTimeout(resolve, 150)); // Wait longer than the 100ms delay

    // Now try to add a reference with different options
    // This should wait for the pending release to complete
    const options2 = { occupancy: { enableEvents: false } };
    const addReferencePromise = manager.addReference(roomName, options2);

    // Verify the promise hasn't resolved yet (should be waiting for release)
    let promiseResolved = false;
    void addReferencePromise.then(() => {
      promiseResolved = true;
    });

    // Give it a moment - it should still be waiting
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(promiseResolved).toBe(false);

    // Now release the controlled delay to allow the release to complete
    if (controlledReleaseResolve) {
      controlledReleaseResolve();
    }

    // The addReference should now complete
    const room = await addReferencePromise;
    expect(room).toBeDefined();
    expect(promiseResolved).toBe(true);

    // Verify final reference counts
    expect(manager.getReferenceCount(roomName, options2)).toBe(1);
    expect(manager.getReferenceCount(roomName, options1)).toBe(0);
  });

  it('should allow different options when room is scheduled for release', async () => {
    const client = newChatClient();
    const logger = client.logger;
    const manager = new RoomReferenceManager(client, logger);
    const roomName = randomRoomName();

    const options1 = { occupancy: { enableEvents: true } };
    const options2 = { occupancy: { enableEvents: false } };

    // Mock release method to actually remove the room from the client's internal map
    vi.spyOn(client.rooms, 'release').mockImplementation((name: string) => {
      // Remove the room from the client's internal rooms map to simulate real behavior
      const roomsInternal = (client.rooms as unknown as { _rooms: Map<string, unknown> })._rooms;
      roomsInternal.delete(name);
      return Promise.resolve();
    });

    // First, add and then remove a reference to schedule it for release
    await manager.addReference(roomName, options1);
    expect(manager.getReferenceCount(roomName, options1)).toBe(1);

    // Remove the reference, which should schedule it for delayed release
    manager.removeReference(roomName, options1);
    expect(manager.getReferenceCount(roomName, options1)).toBe(0);

    // Now try to add a reference with different options
    // This should be allowed since the room is scheduled for release (refcount = 0)
    const room2 = await manager.addReference(roomName, options2);
    expect(room2).toBeDefined();

    // Old room should have been released
    await vi.waitFor(() => {
      expect(client.rooms.release).toHaveBeenCalledWith(roomName);
    });

    // New room should have reference count of 1
    expect(manager.getReferenceCount(roomName, options2)).toBe(1);
    // Old room should have reference count of 0
    expect(manager.getReferenceCount(roomName, options1)).toBe(0);
  });

  it('should handle concurrent addReference calls when room creation is delayed - success case', async () => {
    const client = newChatClient();
    const logger = client.logger;
    const manager = new RoomReferenceManager(client, logger);
    const roomName = randomRoomName();

    // Create a controlled promise to simulate delayed room creation
    let resolveRoomCreation: ((room: Room) => void) | undefined;
    const delayedRoomPromise = new Promise<Room>((resolve) => {
      resolveRoomCreation = resolve;
    });

    // Mock client.rooms.get to return a delayed promise
    const mockRoom = await client.rooms.get(roomName);
    vi.spyOn(mockRoom, 'attach').mockResolvedValue();
    vi.spyOn(client.rooms, 'get').mockReturnValue(delayedRoomPromise);

    // Start the first addReference call (won't resolve immediately)
    const firstAddPromise = manager.addReference(roomName);

    // Start the second addReference call immediately (should wait for first to resolve)
    const secondAddPromise = manager.addReference(roomName);

    // Both promises should not have resolved yet
    let firstResolved = false;
    let secondResolved = false;
    void firstAddPromise.then(() => {
      firstResolved = true;
    });
    void secondAddPromise.then(() => {
      secondResolved = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(firstResolved).toBe(false);
    expect(secondResolved).toBe(false);

    // Now resolve the room creation
    if (resolveRoomCreation) {
      resolveRoomCreation(mockRoom);
    }

    // Both calls should now resolve with the same room
    const [room1, room2] = await Promise.all([firstAddPromise, secondAddPromise]);
    expect(room1).toBe(mockRoom);
    expect(room2).toBe(mockRoom);
    expect(room1).toBe(room2);

    // Reference count should be 2 (both calls incremented it)
    expect(manager.getReferenceCount(roomName)).toBe(2);

    // Room should have been attached only once
    expect(mockRoom.attach).toHaveBeenCalledTimes(1);

    // client.rooms.get should have been called only once
    expect(client.rooms.get).toHaveBeenCalledTimes(1);
  });

  it('should handle concurrent addReference calls when room creation is delayed - error case', async () => {
    const client = newChatClient();
    const logger = client.logger;
    const manager = new RoomReferenceManager(client, logger);
    const roomName = randomRoomName();

    // Create a controlled promise to simulate delayed room creation failure
    let rejectRoomCreation: ((error: Ably.ErrorInfo) => void) | undefined;
    const delayedRoomPromise = new Promise<Room>((_, reject) => {
      rejectRoomCreation = reject;
    });

    // Mock client.rooms.get to return a delayed promise that will reject
    vi.spyOn(client.rooms, 'get').mockReturnValue(delayedRoomPromise);

    // Start the first addReference call (won't resolve immediately)
    const firstAddPromise = manager.addReference(roomName);

    // Start the second addReference call immediately (should wait for first to resolve)
    const secondAddPromise = manager.addReference(roomName);

    // Both promises should not have resolved yet
    let firstResolved = false;
    let secondResolved = false;

    void firstAddPromise.catch(() => {
      firstResolved = true;
    });
    void secondAddPromise.catch(() => {
      secondResolved = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(firstResolved).toBe(false);
    expect(secondResolved).toBe(false);

    // Now reject the room creation
    const testError = new Ably.ErrorInfo('Room creation failed', 50000, 500);
    if (rejectRoomCreation) {
      rejectRoomCreation(testError);
    }

    // Both calls should now reject with the same error
    await expect(firstAddPromise).rejects.toBe(testError);
    await expect(secondAddPromise).rejects.toBe(testError);

    // Reference count should be 0 (entry should have been cleaned up)
    expect(manager.getReferenceCount(roomName)).toBe(0);

    // client.rooms.get should have been called only once
    expect(client.rooms.get).toHaveBeenCalledTimes(1);
  });
});

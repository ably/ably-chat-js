import * as Ably from 'ably';
import { describe, expect, it, vi } from 'vitest';

import { Logger } from '../../../src/core/logger.js';
import { RoomReferenceManager } from '../../../src/react/helper/room-reference-manager.js';
import { newChatClient } from '../../helper/chat.js';
import { randomRoomName } from '../../helper/identifier.js';

vi.mock('ably');

describe('RoomReferenceManager', () => {
  it('should create a manager with the correct client', () => {
    const client = newChatClient();
    const logger = (client as unknown as { logger: Logger }).logger;
    const manager = new RoomReferenceManager(client, logger);

    expect(manager.client).toBe(client);
  });

  it('should return 0 reference count for non-existent room', () => {
    const client = newChatClient();
    const logger = (client as unknown as { logger: Logger }).logger;
    const manager = new RoomReferenceManager(client, logger);
    const roomName = randomRoomName();

    expect(manager.getReferenceCount(roomName)).toBe(0);
  });

  it('should add first reference and attach room', async () => {
    const client = newChatClient();
    const logger = (client as unknown as { logger: Logger }).logger;
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
    const logger = (client as unknown as { logger: Logger }).logger;
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
    const logger = (client as unknown as { logger: Logger }).logger;
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

  it('should handle same room name with different options as separate references', async () => {
    const client = newChatClient();
    const logger = (client as unknown as { logger: Logger }).logger;
    const manager = new RoomReferenceManager(client, logger);
    const roomName = randomRoomName();

    const options1 = { occupancy: { enableEvents: true } };
    const options2 = { occupancy: { enableEvents: false } };

    // Mock rooms for different options
    const mockRoom1 = await client.rooms.get(roomName, options1);
    const mockRoom2 = await client.rooms.get(roomName, options2);
    const mockRoom3 = await client.rooms.get(roomName); // No options
    vi.spyOn(mockRoom1, 'attach').mockResolvedValue();
    vi.spyOn(mockRoom2, 'attach').mockResolvedValue();
    vi.spyOn(mockRoom3, 'attach').mockResolvedValue();

    // Add references with different options
    const room1 = await manager.addReference(roomName, options1);
    const room2 = await manager.addReference(roomName, options2);
    const room3 = await manager.addReference(roomName); // No options

    // Should be different room instances
    expect(room1).toBe(mockRoom1);
    expect(room2).toBe(mockRoom2);
    expect(room3).toBe(mockRoom3);
    expect(room1).not.toBe(room2);
    expect(room1).not.toBe(room3);
    expect(room2).not.toBe(room3);

    // Should have separate reference counts
    expect(manager.getReferenceCount(roomName, options1)).toBe(1);
    expect(manager.getReferenceCount(roomName, options2)).toBe(1);
    expect(manager.getReferenceCount(roomName)).toBe(1);

    // Each should have been attached once
    expect(mockRoom1.attach).toHaveBeenCalledTimes(1);
    expect(mockRoom2.attach).toHaveBeenCalledTimes(1);
    expect(mockRoom3.attach).toHaveBeenCalledTimes(1);
  });

  it('should treat same room name with different options as separate references', () => {
    const client = newChatClient();
    const logger = (client as unknown as { logger: Logger }).logger;
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
    const logger = (client as unknown as { logger: Logger }).logger;
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
    const logger = (client as unknown as { logger: Logger }).logger;
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
    const logger = (client as unknown as { logger: Logger }).logger;
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
    const logger = (client as unknown as { logger: Logger }).logger;
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
    const logger = (client as unknown as { logger: Logger }).logger;
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
    const logger = (client as unknown as { logger: Logger }).logger;
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
});

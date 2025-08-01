import { dequal } from 'dequal';
import { expect, vi } from 'vitest';

import { OccupancyEvent, PresenceEventType } from '../../src/core/events.ts';
import { PresenceEvent } from '../../src/core/presence.ts';

/**
 * Waits for an expected occupancy event to appear in the provided occupancy events array.
 * @param occupancyEvents The array of occupancy events to search through.
 * @param expectedOccupancy The expected occupancy event to wait for.
 * @param timeoutMs The timeout in milliseconds to wait for the event.
 * @returns A promise that resolves when the expected occupancy is found.
 */
export const waitForExpectedInbandOccupancy = (
  occupancyEvents: OccupancyEvent[],
  expectedOccupancy: OccupancyEvent,
  timeoutMs: number,
): Promise<void> =>
  vi.waitFor(
    () => {
      const occupancy = occupancyEvents.find(
        (occupancy) =>
          occupancy.occupancy.connections === expectedOccupancy.occupancy.connections &&
          occupancy.occupancy.presenceMembers === expectedOccupancy.occupancy.presenceMembers,
      );

      expect(occupancy).toBeDefined();
    },
    { timeout: timeoutMs, interval: 1000 },
  );

/**
 * Waits for the length of an array to match the expected count.
 * @param array The array to check the length of.
 * @param expectedCount The expected length of the array.
 * @param timeoutMs The timeout in milliseconds to wait for the array length to match the expected count.
 */
export const waitForArrayLength = async (array: unknown[], expectedCount: number, timeoutMs = 3000): Promise<void> => {
  await vi.waitFor(
    () => {
      expect(array.length).toBe(expectedCount);
    },
    { timeout: timeoutMs, interval: 100 },
  );
};

/**
 * Waits for an expected presence event to appear in the provided presence events array.
 * @param event The expected presence event to wait for.
 * @param event.clientId The client ID of the expected presence event.
 * @param event.data The data of the expected presence event.
 * @param event.type The type of the expected presence event.
 * @param presenceEvents The array of presence events to search through.
 * @returns A promise that resolves when the expected presence event is found.
 */
export const waitForExpectedPresenceEvent = (
  event: { clientId: string; data: unknown; type: PresenceEventType },
  presenceEvents: PresenceEvent[],
): Promise<void> =>
  vi.waitFor(
    () => {
      const matchingEvent = presenceEvents.find(
        (presenceEvent) =>
          dequal(presenceEvent.member.data, event.data) &&
          presenceEvent.member.clientId === event.clientId &&
          presenceEvent.type === event.type,
      );

      expect(matchingEvent).toBeDefined();

      // Has to be added to satisfy the type checker
      if (!matchingEvent) {
        return;
      }

      presenceEvents.splice(presenceEvents.indexOf(matchingEvent), 1);
    },
    { timeout: 20000, interval: 100 },
  );

import { expect, vi } from 'vitest';

import { OccupancyEvent } from '../../src/core/occupancy.ts';

export function waitForExpectedInbandOccupancy(
  occupancyEvents: OccupancyEvent[],
  expectedOccupancy: OccupancyEvent,
  timeoutMs: number,
): Promise<void> {
  return vi.waitFor(
    () => {
      const occupancy = occupancyEvents.find(
        (occupancy) =>
          occupancy.connections === expectedOccupancy.connections &&
          occupancy.presenceMembers === expectedOccupancy.presenceMembers,
      );

      expect(occupancy).toBeDefined();
    },
    { timeout: timeoutMs, interval: 1000 },
  );
}

export const waitForArrayLength = async (array: unknown[], expectedCount: number, timeoutMs = 3000): Promise<void> => {
  await vi.waitFor(
    () => {
      expect(array.length).toBe(expectedCount);
    },
    { timeout: timeoutMs, interval: 100 },
  );
};

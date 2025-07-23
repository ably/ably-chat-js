import { dequal } from 'dequal';
import { expect, vi } from 'vitest';

import { OccupancyEvent, PresenceEventType } from '../../src/core/events.ts';
import { PresenceEvent } from '../../src/core/presence.ts';

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

export const waitForArrayLength = async (array: unknown[], expectedCount: number, timeoutMs = 3000): Promise<void> => {
  await vi.waitFor(
    () => {
      expect(array.length).toBe(expectedCount);
    },
    { timeout: timeoutMs, interval: 100 },
  );
};

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

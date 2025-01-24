import { OccupancyEvent } from '../../core/src/occupancy.ts';

export function waitForExpectedInbandOccupancy(
  occupancyEvents: OccupancyEvent[],
  expectedOccupancy: OccupancyEvent,
  timeoutMs: number,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      const occupancy = occupancyEvents.find(
        (occupancy) =>
          occupancy.connections === expectedOccupancy.connections &&
          occupancy.presenceMembers === expectedOccupancy.presenceMembers,
      );

      if (occupancy) {
        clearInterval(interval);
        resolve();
      }
    }, 1000);

    setTimeout(() => {
      clearInterval(interval);
      resolve();
    }, timeoutMs);
  });
}

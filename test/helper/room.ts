import { vi } from 'vitest';

import { RoomStatus, Status } from '../../src/RoomStatus.ts';

// Wait 3 seconds for the room to reach the expected status
export const waitForRoomStatus = async (status: Status, expectedStatus: RoomStatus) => {
  return vi.waitUntil(() => status.currentStatus === expectedStatus, 3000);
};

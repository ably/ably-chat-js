import * as Ably from 'ably';

/**
 * Represents the occupancy data of a chat room.
 */
export interface OccupancyData {
  /**
   * The number of connections to the chat room.
   */
  connections: number;

  /**
   * The number of presence members in the chat room - members who have entered presence.
   */
  presenceMembers: number;
}

/**
 * Represents the structure of an occupancy message payload.
 */
interface OccupancyPayload {
  data?: {
    metrics?: {
      connections?: number;
      presenceMembers?: number;
    };
  };
}

/**
 * Parses occupancy data from an Ably message, using fallback values of 0 for invalid data.
 * @param message The Ably message containing occupancy data
 * @returns Parsed occupancy data with fallback values for invalid fields
 */
export const parseOccupancyMessage = (message: Ably.InboundMessage): OccupancyData => {
  const payload = message as OccupancyPayload;
  let connections = 0;
  let presenceMembers = 0;

  // Check if data is a valid object
  if (!payload.data || typeof payload.data !== 'object') {
    return { connections, presenceMembers };
  }

  const { metrics } = payload.data;

  // Check if metrics is undefined or null
  if (!metrics || typeof metrics !== 'object') {
    return { connections, presenceMembers };
  }

  // Parse connections
  if (typeof metrics.connections === 'number' && Number.isInteger(metrics.connections)) {
    connections = metrics.connections;
  }

  // Parse presenceMembers
  if (typeof metrics.presenceMembers === 'number' && Number.isInteger(metrics.presenceMembers)) {
    presenceMembers = metrics.presenceMembers;
  }

  return { connections, presenceMembers };
};

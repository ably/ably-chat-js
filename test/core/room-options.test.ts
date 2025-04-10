import { describe, expect, it } from 'vitest';

import { normalizeRoomOptions, RoomOptions } from '../../src/core/room-options.ts';

describe('normalizeRoomOptions', () => {
  it('should return default options when no options provided', () => {
    const result = normalizeRoomOptions(undefined, false);

    expect(result).toEqual({
      typing: {
        heartbeatThrottleMs: 10000,
      },
      occupancy: {
        enableEvents: false,
      },
      presence: {
        enableEvents: true,
      },
      isReactClient: false,
    });
  });

  it('should properly set isReactClient flag', () => {
    const result = normalizeRoomOptions(undefined, true);
    expect(result.isReactClient).toBe(true);
  });

  it('should merge provided typing options with defaults', () => {
    const options: RoomOptions = {
      typing: {
        heartbeatThrottleMs: 5000,
      },
    };

    const result = normalizeRoomOptions(options, false);

    expect(result.typing).toEqual({
      heartbeatThrottleMs: 5000,
    });
    expect(result.presence).toEqual({
      enableEvents: true,
    });
  });

  it('should merge provided occupancy options with defaults', () => {
    const options: RoomOptions = {
      occupancy: {
        enableEvents: true,
      },
    };

    const result = normalizeRoomOptions(options, false);

    expect(result.occupancy).toEqual({
      enableEvents: true,
    });
  });

  it('should merge provided presence options with defaults', () => {
    const options: RoomOptions = {
      presence: {
        enableEvents: false,
      },
    };

    const result = normalizeRoomOptions(options, false);

    expect(result.presence).toEqual({
      enableEvents: false,
    });
  });

  it('should handle partial options without affecting other defaults', () => {
    const options: RoomOptions = {
      typing: {
        heartbeatThrottleMs: 3000,
      },
      presence: {
        enableEvents: false,
      },
    };

    const result = normalizeRoomOptions(options, false);

    expect(result).toEqual({
      typing: {
        heartbeatThrottleMs: 3000,
      },
      occupancy: {
        enableEvents: false, // Default preserved
      },
      presence: {
        enableEvents: false,
      },
      isReactClient: false,
    });
  });
});

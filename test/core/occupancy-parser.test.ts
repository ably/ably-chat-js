import * as Ably from 'ably';
import { describe, expect, it } from 'vitest';

import { parseOccupancyMessage } from '../../src/core/occupancy-parser.js';

describe('parseOccupancyMessage', () => {
  describe('invalid data', () => {
    describe.each([
      {
        description: 'message.data is undefined',
        message: {} as Ably.InboundMessage,
        expectedConnections: 0,
        expectedPresenceMembers: 0,
      },
      {
        description: 'message.data is null',
        message: { data: null } as Ably.InboundMessage,
        expectedConnections: 0,
        expectedPresenceMembers: 0,
      },
      {
        description: 'message.data is a string',
        message: { data: 'invalid-data' } as Ably.InboundMessage,
        expectedConnections: 0,
        expectedPresenceMembers: 0,
      },
      {
        description: 'message.data is a number',
        message: { data: 123 } as Ably.InboundMessage,
        expectedConnections: 0,
        expectedPresenceMembers: 0,
      },
      {
        description: 'message.data is a boolean',
        message: { data: true } as Ably.InboundMessage,
        expectedConnections: 0,
        expectedPresenceMembers: 0,
      },
      {
        description: 'message.data is an empty object',
        message: { data: {} } as Ably.InboundMessage,
        expectedConnections: 0,
        expectedPresenceMembers: 0,
      },
      {
        description: 'message.data.metrics is undefined',
        message: { data: { metrics: undefined } } as Ably.InboundMessage,
        expectedConnections: 0,
        expectedPresenceMembers: 0,
      },
      {
        description: 'message.data.metrics is null',
        message: { data: { metrics: null } } as Ably.InboundMessage,
        expectedConnections: 0,
        expectedPresenceMembers: 0,
      },
      {
        description: 'message.data.metrics is a string',
        message: { data: { metrics: 'invalid' } } as Ably.InboundMessage,
        expectedConnections: 0,
        expectedPresenceMembers: 0,
      },
    ])(
      'should return zero values for invalid data',
      ({ description, message, expectedConnections, expectedPresenceMembers }) => {
        it(`should return zero values when ${description}`, () => {
          const result = parseOccupancyMessage(message);

          expect(result).toEqual({
            connections: expectedConnections,
            presenceMembers: expectedPresenceMembers,
          });
        });
      },
    );
  });

  describe('invalid metrics', () => {
    describe.each([
      {
        description: 'connections is undefined',
        message: {
          data: {
            metrics: {
              presenceMembers: 5,
            },
          },
        } as Ably.InboundMessage,
        expectedConnections: 0,
        expectedPresenceMembers: 5,
      },
      {
        description: 'connections is null',
        message: {
          data: {
            metrics: {
              connections: null,
              presenceMembers: 5,
            },
          },
        } as Ably.InboundMessage,
        expectedConnections: 0,
        expectedPresenceMembers: 5,
      },
      {
        description: 'connections is a string',
        message: {
          data: {
            metrics: {
              connections: 'invalid',
              presenceMembers: 5,
            },
          },
        } as Ably.InboundMessage,
        expectedConnections: 0,
        expectedPresenceMembers: 5,
      },
      {
        description: 'connections is a float',
        message: {
          data: {
            metrics: {
              connections: 3.14,
              presenceMembers: 5,
            },
          },
        } as Ably.InboundMessage,
        expectedConnections: 0,
        expectedPresenceMembers: 5,
      },
      {
        description: 'connections is a boolean',
        message: {
          data: {
            metrics: {
              connections: true,
              presenceMembers: 5,
            },
          },
        } as Ably.InboundMessage,
        expectedConnections: 0,
        expectedPresenceMembers: 5,
      },
      {
        description: 'presenceMembers is undefined',
        message: {
          data: {
            metrics: {
              connections: 3,
            },
          },
        } as Ably.InboundMessage,
        expectedConnections: 3,
        expectedPresenceMembers: 0,
      },
      {
        description: 'presenceMembers is null',
        message: {
          data: {
            metrics: {
              connections: 3,
              presenceMembers: null,
            },
          },
        } as Ably.InboundMessage,
        expectedConnections: 3,
        expectedPresenceMembers: 0,
      },
      {
        description: 'presenceMembers is a string',
        message: {
          data: {
            metrics: {
              connections: 3,
              presenceMembers: 'invalid',
            },
          },
        } as Ably.InboundMessage,
        expectedConnections: 3,
        expectedPresenceMembers: 0,
      },
      {
        description: 'presenceMembers is a float',
        message: {
          data: {
            metrics: {
              connections: 3,
              presenceMembers: 2.5,
            },
          },
        } as Ably.InboundMessage,
        expectedConnections: 3,
        expectedPresenceMembers: 0,
      },
      {
        description: 'presenceMembers is a boolean',
        message: {
          data: {
            metrics: {
              connections: 3,
              presenceMembers: false,
            },
          },
        } as Ably.InboundMessage,
        expectedConnections: 3,
        expectedPresenceMembers: 0,
      },
      {
        description: 'both connections and presenceMembers are invalid',
        message: {
          data: {
            metrics: {
              connections: 'invalid',
              presenceMembers: 2.5,
            },
          },
        } as Ably.InboundMessage,
        expectedConnections: 0,
        expectedPresenceMembers: 0,
      },
    ])(
      'should handle invalid metric values with fallbacks',
      ({ description, message, expectedConnections, expectedPresenceMembers }) => {
        it(`should use fallback values when ${description}`, () => {
          const result = parseOccupancyMessage(message);

          expect(result).toEqual({
            connections: expectedConnections,
            presenceMembers: expectedPresenceMembers,
          });
        });
      },
    );
  });

  describe('correct data', () => {
    describe.each([
      {
        description: 'valid occupancy data with positive values',
        message: {
          data: {
            metrics: {
              connections: 5,
              presenceMembers: 3,
            },
          },
        } as Ably.InboundMessage,
        expectedConnections: 5,
        expectedPresenceMembers: 3,
      },
      {
        description: 'valid occupancy data with zero values',
        message: {
          data: {
            metrics: {
              connections: 0,
              presenceMembers: 0,
            },
          },
        } as Ably.InboundMessage,
        expectedConnections: 0,
        expectedPresenceMembers: 0,
      },
      {
        description: 'valid occupancy data with large values',
        message: {
          data: {
            metrics: {
              connections: 1000000,
              presenceMembers: 999999,
            },
          },
        } as Ably.InboundMessage,
        expectedConnections: 1000000,
        expectedPresenceMembers: 999999,
      },
      {
        description: 'valid occupancy data with additional unknown properties',
        message: {
          data: {
            metrics: {
              connections: 5,
              presenceMembers: 3,
              someOtherProperty: 'ignored',
              anotherProperty: 42,
            },
            extraData: 'ignored',
          },
          extraField: 'also ignored',
          id: 'test-id',
          timestamp: 1234567890,
          action: 'test-action',
          serial: 'test-serial',
        } as unknown as Ably.InboundMessage,
        expectedConnections: 5,
        expectedPresenceMembers: 3,
      },
    ])(
      'should parse valid occupancy data correctly',
      ({ description, message, expectedConnections, expectedPresenceMembers }) => {
        it(`should parse ${description}`, () => {
          const result = parseOccupancyMessage(message);

          expect(result).toEqual({
            connections: expectedConnections,
            presenceMembers: expectedPresenceMembers,
          });
        });
      },
    );

    describe('edge cases', () => {
      it('should handle negative numbers as valid', () => {
        const message = {
          data: {
            metrics: {
              connections: -5,
              presenceMembers: -3,
            },
          },
        } as Ably.InboundMessage;

        const result = parseOccupancyMessage(message);

        expect(result).toEqual({
          connections: -5, // Note: negative numbers are still integers, so they pass validation
          presenceMembers: -3,
        });
      });

      it('should handle Number.MAX_SAFE_INTEGER', () => {
        const message = {
          data: {
            metrics: {
              connections: Number.MAX_SAFE_INTEGER,
              presenceMembers: Number.MAX_SAFE_INTEGER,
            },
          },
        } as Ably.InboundMessage;

        const result = parseOccupancyMessage(message);

        expect(result).toEqual({
          connections: Number.MAX_SAFE_INTEGER,
          presenceMembers: Number.MAX_SAFE_INTEGER,
        });
      });

      it('should handle numbers that are too large to be safe integers', () => {
        const unsafeNumber = Number.MAX_SAFE_INTEGER + 1;
        const message = {
          data: {
            metrics: {
              connections: unsafeNumber,
              presenceMembers: unsafeNumber,
            },
          },
        } as Ably.InboundMessage;

        const result = parseOccupancyMessage(message);

        // These are still integers and numbers, so they should pass validation
        expect(result).toEqual({
          connections: unsafeNumber,
          presenceMembers: unsafeNumber,
        });
      });

      it('should handle Infinity and -Infinity as invalid', () => {
        const message = {
          data: {
            metrics: {
              connections: Infinity,
              presenceMembers: -Infinity,
            },
          },
        } as Ably.InboundMessage;

        const result = parseOccupancyMessage(message);

        expect(result).toEqual({
          connections: 0, // Infinity is not an integer
          presenceMembers: 0, // -Infinity is not an integer
        });
      });

      it('should handle NaN as invalid', () => {
        const message = {
          data: {
            metrics: {
              connections: Number.NaN,
              presenceMembers: Number.NaN,
            },
          },
        } as Ably.InboundMessage;

        const result = parseOccupancyMessage(message);

        expect(result).toEqual({
          connections: 0, // NaN is not an integer
          presenceMembers: 0, // NaN is not an integer
        });
      });
    });
  });
});

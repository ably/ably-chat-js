import * as Ably from 'ably';
import { describe, expect, it, vi } from 'vitest';

import { ephemeralMessage, messageToEphemeral } from '../../src/core/realtime.ts';

vi.mock('ably');

describe('realtime', () => {
  describe('messageToEphemeral', () => {
    it('should convert a message without extras to ephemeral', () => {
      // Arrange
      const message: Ably.Message = {
        name: 'test-event',
        data: 'test-data',
        id: 'test-id',
      };

      // Act
      const result = messageToEphemeral(message);

      // Assert
      expect(result).toEqual({
        name: 'test-event',
        data: 'test-data',
        id: 'test-id',
        extras: {
          ephemeral: true,
        },
      });
    });

    it('should convert a message with existing extras to ephemeral', () => {
      // Arrange
      const message: Ably.Message = {
        name: 'test-event',
        data: 'test-data',
        id: 'test-id',
        extras: {
          customField: 'customValue',
          anotherField: 123,
        } as Record<string, unknown>,
      };

      // Act
      const result = messageToEphemeral(message);

      // Assert
      expect(result).toEqual({
        name: 'test-event',
        data: 'test-data',
        id: 'test-id',
        extras: {
          customField: 'customValue',
          anotherField: 123,
          ephemeral: true,
        },
      });
    });

    it('should overwrite existing ephemeral flag', () => {
      // Arrange
      const message: Ably.Message = {
        name: 'test-event',
        data: 'test-data',
        id: 'test-id',
        extras: {
          ephemeral: false,
          otherField: 'value',
        } as Record<string, unknown>,
      };

      // Act
      const result = messageToEphemeral(message);

      // Assert
      expect(result).toEqual({
        name: 'test-event',
        data: 'test-data',
        id: 'test-id',
        extras: {
          ephemeral: true,
          otherField: 'value',
        },
      });
    });

    it('should preserve all original message properties', () => {
      // Arrange
      const timestamp = Date.now();
      const message: Ably.Message = {
        name: 'test-event',
        data: { complex: 'data', nested: { field: 'value' } },
        id: 'test-id',
        clientId: 'test-client',
        timestamp,
        encoding: 'json',
        extras: {
          originalField: 'originalValue',
        } as Record<string, unknown>,
      };

      // Act
      const result = messageToEphemeral(message);

      // Assert
      expect(result.name).toBe(message.name);
      expect(result.data).toBe(message.data);
      expect(result.id).toBe(message.id);
      expect(result.clientId).toBe(message.clientId);
      expect(result.timestamp).toBe(message.timestamp);
      expect(result.encoding).toBe(message.encoding);
      expect(result.extras).toEqual({
        originalField: 'originalValue',
        ephemeral: true,
      });
    });

    it('should not mutate the original message', () => {
      // Arrange
      const message: Ably.Message = {
        name: 'test-event',
        data: 'test-data',
        extras: {
          originalField: 'originalValue',
        } as Record<string, unknown>,
      };
      const originalExtras = { ...(message.extras as Record<string, unknown>) };

      // Act
      const result = messageToEphemeral(message);

      // Assert
      expect(message.extras).toEqual(originalExtras);
      expect(result).not.toBe(message);
      expect(result.extras).not.toBe(message.extras);
    });

    it('should handle message with null extras', () => {
      // Arrange
      const message: Ably.Message = {
        name: 'test-event',
        data: 'test-data',
        extras: null,
      };

      // Act
      const result = messageToEphemeral(message);

      // Assert
      expect(result).toEqual({
        name: 'test-event',
        data: 'test-data',
        extras: {
          ephemeral: true,
        },
      });
    });

    it('should handle message with undefined extras', () => {
      // Arrange
      const message: Ably.Message = {
        name: 'test-event',
        data: 'test-data',
        extras: undefined,
      };

      // Act
      const result = messageToEphemeral(message);

      // Assert
      expect(result).toEqual({
        name: 'test-event',
        data: 'test-data',
        extras: {
          ephemeral: true,
        },
      });
    });
  });

  describe('ephemeralMessage', () => {
    it('should create an ephemeral message with name only', () => {
      // Act
      const result = ephemeralMessage('test-event');

      // Assert
      expect(result).toEqual({
        name: 'test-event',
        data: undefined,
        extras: {
          ephemeral: true,
        },
      });
    });

    it('should create an ephemeral message with name and data', () => {
      // Arrange
      const data = { key: 'value', number: 42 };

      // Act
      const result = ephemeralMessage('test-event', data);

      // Assert
      expect(result).toEqual({
        name: 'test-event',
        data: data,
        extras: {
          ephemeral: true,
        },
      });
    });

    it('should create an ephemeral message with string data', () => {
      // Act
      const result = ephemeralMessage('test-event', 'string-data');

      // Assert
      expect(result).toEqual({
        name: 'test-event',
        data: 'string-data',
        extras: {
          ephemeral: true,
        },
      });
    });

    it('should create an ephemeral message with null data', () => {
      // Act
      const result = ephemeralMessage('test-event', null);

      // Assert
      expect(result).toEqual({
        name: 'test-event',
        data: null,
        extras: {
          ephemeral: true,
        },
      });
    });
  });
});

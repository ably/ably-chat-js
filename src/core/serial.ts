import * as Ably from 'ably';

import { ErrorCode } from './errors.js';

/**
 * Asserts that a serial parameter is valid (not undefined, null, or empty string).
 * @internal
 * @param serial The serial value to validate.
 * @param op The operation being performed (e.g., "send message reaction").
 * @param paramName The name of the parameter (e.g., "messageSerial").
 * @throws An {@link Ably.ErrorInfo} With InvalidArgument code if the serial is invalid.
 */
export const assertValidSerial = (serial: unknown, op: string, paramName: string): void => {
  if (!serial) {
    throw new Ably.ErrorInfo(
      `unable to ${op}; ${paramName} must be a non-empty string`,
      ErrorCode.InvalidArgument,
      400,
    );
  }
};

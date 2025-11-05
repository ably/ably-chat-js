import * as Ably from 'ably';

import { ErrorCode } from './errors.js';
import { Logger } from './logger.js';

/**
 * Interface for a type that resolves the current clientId from the realtime client.
 */
export interface ClientIdResolver {
  /**
   * Return the current clientId, throwing an exception if one isn't set.
   * @throws An {@link Ably.ErrorInfo} if no clientId is set.
   * @returns string The resolved clientId
   */
  get(): string;
}

export class DefaultClientIdResolver implements ClientIdResolver {
  constructor(
    private _realtime: Ably.Realtime,
    private _logger: Logger,
  ) {}

  get(): string {
    const clientId = this._realtime.auth.clientId;
    if (!clientId) {
      this._logger.error('unable to get client id; client id is not set', { clientId });
      throw new Ably.ErrorInfo('unable to get client id; client id is not set', ErrorCode.InvalidClientId, 400);
    }

    return clientId;
  }
}

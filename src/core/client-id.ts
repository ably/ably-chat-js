import * as Ably from 'ably';

import { Connection, ConnectionStatus, ConnectionStatusChange } from './connection.js';
import { Logger } from './logger.js';

/**
 * Interface for a type that resolves the current clientId from the realtime client.
 */
export interface ClientIdResolver {
  /**
   * Return the current clientId, throwing an exception if one isn't set.
   * @throws Ably.ErrorInfo if no clientId is set.
   * @returns string The resolved clientId
   */
  get(): string;
}

export class DefaultClientIdResolver implements ClientIdResolver {
  private readonly _off: () => void;
  private _clientId: string | undefined;
  constructor(
    connection: Connection,
    realtime: Ably.Realtime,
    private _logger: Logger,
  ) {
    this._clientId = realtime.auth.clientId;
    this._off = connection.onStatusChange((event: ConnectionStatusChange) => {
      if (event.current === ConnectionStatus.Connected) {
        this._clientId = realtime.auth.clientId;
        this._logger.debug('resolved clientId', { clientId: this._clientId });
      }
    }).off;
  }

  get(): string {
    if (!this._clientId) {
      throw new Ably.ErrorInfo('invalid client id', 40012, 400);
    }

    return this._clientId;
  }

  dispose(): void {
    this._off();
  }
}

import * as Ably from 'ably';
import { Mutex } from 'async-mutex';

import { Logger } from './logger.js';

/**
 * PresenceData is the opinionated structure that we use to represent presence data.
 */
export interface ChatPresenceData {
  /**
   * Information that the user has provided as part of "being present in the room".
   */
  userCustomData?: unknown;

  /**
   * Is the user currently typing.
   */
  typing?: boolean;
}

/**
 * PresenceApplicator is a function that takes the current presence data and returns the new presence data, in a similar
 * vein to how reducers work in Redux.
 */
type PresenceApplicator = (data: ChatPresenceData) => ChatPresenceData;

/**
 * Represents a single contribution to the presence data.
 */
export interface PresenceDataContribution {
  /**
   * Makes this contribution actively participating in the presence data. This will perform a presence update on the underlying
   * channel, which will become an enter if this is the first contributor to set data.
   *
   * @param applicator A reducer-like function that takes the current presence data and returns the new presence data.
   * @throws An {@link Ably.ErrorInfo} if the contribution has been disposed.
   * @throws An {@link Ably.ErrorInfo} if the contribution fails to apply. In this case, the presence data will be rolled back.
   * @returns A promise of the new presence data after the contribution has been applied.
   */
  set: (applicator: PresenceApplicator) => Promise<ChatPresenceData>;

  /**
   * Removes this contribution from the presence data. If the contributor has already been removed, this is a no-op.
   *
   * @param applicator A reducer-like function that takes the current presence data and returns the new presence data.
   * @throws An {@link Ably.ErrorInfo} if the contribution has been disposed.
   * @throws An {@link Ably.ErrorInfo} if the contribution fails to apply. In this case, the presence data will be rolled back.
   * @returns A promise that resolves when the contribution has been removed.
   */
  remove: (applicator: PresenceApplicator) => Promise<void>;

  /**
   * Disposes of this contribution, removing it from the presence data. After this point, it can no longer be used to register information to the presence data.
   * If there are no active contributions left, this will perform a leave operation on the underlying channel.
   *
   * If the contributor has already been disposed, this is a no-op. If the contributor isn't currently contributing, this is also a no-op.
   *
   * @param applicator A reducer-like function that takes the current presence data and returns the new presence data.
   * @throws An {@link Ably.ErrorInfo} if the contribution fails to apply. In this case, the presence data will be rolled back.
   * @returns A promise that resolves when the contribution has been removed.
   */
  dispose: (applicator: PresenceApplicator) => Promise<void>;
}

/**
 * An internal representation of a presence contribution that includes a flag to indicate if it has been disposed.
 */
interface InternalPresenceDataContribution extends PresenceDataContribution {
  /**
   * A flag to indicate if this contribution has been disposed.
   */
  disposed: boolean;
}

/**
 * Manages presence on a channel. This allows us to have multiple features using presence on the channel, sharing it,
 * but also allowing us to leave the underlying channel presence when no features are using it.
 */
export interface PresenceDataManager {
  newContributor(): PresenceDataContribution;
}

/**
 * Default implementation of the {@link PresenceManager} interface.
 *
 * It manages a number of contributors, that can contribute their presence data to the channel. All presence operations
 * are performed in a mutex to ensure that they are atomic and that the presence data is consistent.
 */
export class DefaultPresenceDataManager implements PresenceDataManager {
  private readonly _channel: Ably.RealtimeChannel;
  private _presenceData: ChatPresenceData;
  private _contributions: Set<InternalPresenceDataContribution>;
  private _opMtx: Mutex;
  private readonly _clientId: string;
  private readonly _logger: Logger;

  constructor(channel: Ably.RealtimeChannel, clientId: string, logger: Logger) {
    this._channel = channel;
    this._presenceData = {};
    this._contributions = new Set();
    this._opMtx = new Mutex();
    this._clientId = clientId;
    this._logger = logger;
    this._logger.trace('DefaultPresenceDataManager.constructor()');
  }

  /**
   * Creates a new contributor to the presence data.
   * @returns A new presence contributor.
   */
  newContributor(): PresenceDataContribution {
    this._logger.trace('DefaultPresenceDataManager.newContributor()');
    const contribution: InternalPresenceDataContribution = {
      disposed: false,
      set: async (applicator: PresenceApplicator) => {
        if (contribution.disposed) {
          this._logger.error('DefaultPresenceDataManager.contribution.set() called on disposed contribution');
          throw new Ably.ErrorInfo('presence contribution has been disposed', 40000, 400);
        }

        await this._doPresenceUpdate(applicator).then(() => this._presenceData);
        this._contributions.add(contribution);
        return this._presenceData;
      },
      remove: async (applicator: PresenceApplicator) => {
        if (contribution.disposed) {
          this._logger.error('DefaultPresenceDataManager.contribution.remove() called on disposed contribution');
          throw new Ably.ErrorInfo('presence contribution has been disposed', 40000, 400);
        }

        if (!this._contributions.has(contribution)) {
          return;
        }

        return this._removeContribution(contribution, applicator);
      },
      dispose: async (applicator: PresenceApplicator) => {
        this._logger.debug('DefaultPresenceDataManager.contribution.dispose()');
        if (contribution.disposed || !this._contributions.has(contribution)) {
          return;
        }

        await this._removeContribution(contribution, applicator);
        contribution.disposed = true;
      },
    };

    return contribution;
  }

  /**
   * Handles a contributor updating its contribution to presence. This does an underlying presence.update on the channel,
   * which is interpreted as a presence enter by the server if this is the first contributor to set data.
   *
   * @param applicator A reducer-like function that takes the current presence data and returns the new presence data.
   * @throws An {@link Ably.ErrorInfo} if the presence update fails. In this case, the presence data will be rolled back.
   * @returns A promise that resolves when the presence data has been updated.
   */
  private async _doPresenceUpdate(applicator: PresenceApplicator): Promise<void> {
    this._logger.trace('DefaultPresenceDataManager._doPresenceUpdate()');
    await this._opMtx.acquire();
    const presenceData = this._presenceData;
    this._presenceData = applicator(presenceData);

    // Update our presence data, rollback if the update fails
    return this._channel.presence
      .updateClient(this._clientId, this._presenceData)
      .catch((error: unknown) => {
        this._logger.debug('DefaultPresenceDataManager._doPresenceUpdate() failed', { error });
        this._presenceData = presenceData;
        throw error;
      })
      .finally(() => {
        this._opMtx.release();
      });
  }

  /**
   * Handles the case where the last contributor leaves and we therefore need to perform a presence leave operation on the channel.
   *
   * @param applicator A reducer-like function that takes the current presence data and returns the new presence data.
   * @throws An {@link Ably.ErrorInfo} if the presence leave fails. In this case, the presence data will be rolled back.
   * @returns A promise that resolves when the presence data has been updated.
   */
  private async _doPresenceLeave(applicator: PresenceApplicator): Promise<void> {
    this._logger.trace('DefaultPresenceDataManager._doPresenceLeave()');
    await this._opMtx.acquire();
    const presenceData = this._presenceData;
    this._presenceData = applicator(presenceData);

    // Update our presence data, rollback if the update fails
    return this._channel.presence
      .leaveClient(this._clientId, this._presenceData)
      .catch((error: unknown) => {
        this._logger.debug('DefaultPresenceDataManager._doPresenceLeave() failed', { error });
        this._presenceData = presenceData;
        throw error;
      })
      .finally(() => {
        this._opMtx.release();
      });
  }

  /**
   * Removes a contribution from the presence data. This will either perform a presence leave operation if this is the last
   * contributor, or a presence update operation if there are still other contributors.
   *
   * @param contribution The contribution to remove.
   * @param applicator A reducer-like function that takes the current presence data and returns the new presence data.
   */
  private async _removeContribution(
    contribution: InternalPresenceDataContribution,
    applicator: PresenceApplicator,
  ): Promise<void> {
    this._logger.trace('DefaultPresenceDataManager._removeContribution()');
    // Do the leave or update operation, whatever is necessary
    await (this._contributions.size === 1 ? this._doPresenceLeave(applicator) : this._doPresenceUpdate(applicator));

    // Remove ourselves from the contributions - we were successful
    this._contributions.delete(contribution);
  }
}

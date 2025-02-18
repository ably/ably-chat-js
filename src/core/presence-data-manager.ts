import * as Ably from 'ably';
import { PresenceMessage } from 'ably';
import { Mutex } from 'async-mutex';

import { Logger } from './logger.js';

/**
 * PresenceData is the opinionated structure that we use to represent presence data.
 */
export interface ChatPresenceData {
  /**
   * Contains the typing data of the user.
   */
  typing?: {
    /**
     * Is the user currently typing.
     */
    isTyping: boolean
  }

  /**
   * Contains the presence data of the user.
   */
  presence?: {
    /**
     * A nonce that is used to uniquely identify the presence data, and is used to determine if an update has occurred.
     */
    nonce?: string
    /**
     * Information that the user has provided as part of the presence payload.
     */
    userCustomData?: unknown;
  }
}

export interface ChatPresenceMessage extends Ably.PresenceMessage {
  data: ChatPresenceData;
}

export interface PresenceSetChange {
  /**
   * The previous presence set, before the latest presence event.
   */
  previous: ChatPresenceMessage[];
  /**
   * The latest presence set, after the latest presence event.
   */
  latest: ChatPresenceMessage[];
}

/**
 * PresenceManager is a unified interface that combines management of presence data and fetching of the presence set.
 * It consolidates the functionality of adding/removing contributors and retrieving the presence state from the channel.
 */
export interface PresenceManager {
  /**
   * Creates a new contributor to the presence data.
   * This allows features or services to participate in presence, contributing individual data that rolls into the shared presence set.
   *
   * @returns A new presence data contributor.
   */
  newContributor(): PresenceDataContribution;

  /**
   * Fetches the full presence set for the associated channel. This is useful for retrieving the current presence state of all members.
   * Handles retries in case of failure, ensure calls are handled in FIFO order.
   * This method is intended to be used by features that need to access the full presence set,
   * and to ensure a consistent view of presence across those features.
   *
   * @returns A promise that resolves with an array of presence messages.
   */
  getPresenceSet(params?: Ably.RealtimePresenceParams): Promise<PresenceSetChange>;
}

/**
 * DefaultPresenceManager combines the functionalities of managing presence contributions and fetching presence data
 * into a single class. This provides a unified interface for working with Ably presence in real-time channels.
 */
export class DefaultPresenceManager implements PresenceManager {
  private _dataManager: DefaultPresenceDataManager;
  private _setManager: DefaultPresenceSetManager;

  /**
   * Creates an instance of DefaultPresenceManager.
   *
   * @param channel The Ably RealtimeChannel instance associated with the current room or context.
   * @param clientId The client ID being used for presence updates.
   * @param logger A shared logger instance for debugging and trace-level logs.
   */
  constructor(channel: Ably.RealtimeChannel, clientId: string, logger: Logger) {
    this._dataManager = new DefaultPresenceDataManager(channel, clientId, logger);
    this._setManager = new DefaultPresenceSetManager(channel, logger);
  }

  /**
   * Creates a new contributor to the presence data.
   *
   * Internally delegates to the DefaultPresenceDataManager implementation, allowing clients to
   * contribute presence data to the shared channel state. These contributions can represent individual
   * states (e.g., typing status) that are merged into the overall shared presence status.
   *
   * @returns A PresenceDataContribution instance that can be used to add/update/remove presence information.
   */
  public newContributor(): PresenceDataContribution {
    return this._dataManager.newContributor();
  }

  /**
   * Fetches the full set of presence data for the associated channel.
   *
   * This provides the list of all members currently present in the channel, including their individual
   * presence states. Internally, it delegates to the DefaultPresenceSetManager to handle retries and ensure
   * reliability.
   *
   * @returns A Promise resolved with the full presence set as an array of PresenceMessage objects.
   */
  public getPresenceSet(
    params?: Ably.RealtimePresenceParams,
  ): Promise<{ previous: ChatPresenceMessage[]; latest: ChatPresenceMessage[] }> {
    return this._setManager.get(params);
  }
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
    this._logger.trace('DefaultPresenceDataManager.newContributor()');

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
        this._logger.trace('DefaultPresenceDataManager._doPresenceUpdate() - releasing mutex');
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
        this._logger.trace('DefaultPresenceDataManager._doPresenceLeave() - releasing mutex');
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

const PRESENCE_GET_MAX_RETRIES = 5;
const PRESENCE_GET_RETRY_INTERVAL_MS = 1000;
const PRESENCE_GET_RETRY_MAX_INTERVAL_MS = 10000;

// Interface for queueing Promises that resolve/reject when `presence.get()` completes
/**
 * Represents a queued element that stores the resolve and reject functions for promises
 * waiting for the presence state retrieval to complete.
 */
interface QueueElement {
  /**
   * Resolves the promise with the retrieved presence messages.
   *
   * @param value The presence messages from the channel.
   */
  resolve: (value: { previous: PresenceMessage[]; latest: PresenceMessage[] }) => void;

  /**
   * Rejects the promise with the given error or failure reason.
   *
   * @param reason The reason for the rejection.
   */
  reject: (reason: unknown) => void;
}

/**
 * DefaultPresenceSetManager is responsible for managing `get()` operations on the presence state of a channel.
 * It ensures that multiple callers for presence state retrieval do not result in repeated API calls by batching
 * requests and reusing the result for all current callers.
 */
export class DefaultPresenceSetManager {
  private _queue: QueueElement[] = [];
  private _isFetching = false;
  private _retryCount = 0;
  private _channel: Ably.RealtimeChannel;
  private _logger: Logger;
  private _currentPresenceData: ChatPresenceMessage[] = [];

  /**
   * Creates a new DefaultPresenceSetManager tied to an Ably real-time channel.
   *
   * @param channel The Ably RealtimeChannel instance to retrieve presence data from.
   * @param logger The logger instance
   */
  constructor(channel: Ably.RealtimeChannel, logger: Logger) {
    this._channel = channel;
    this._logger = logger;
  }

  /**
   * Fetches the presence data for the current channel.
   * This method supports concurrent callers by queueing their requests and ensuring only one fetch operation is in-flight.
   * It also retries with exponential backoff in case of failure, up to a maximum number of retries.
   *
   * @returns A promise that resolves with an array of PresenceMessage objects for the channel.
   * @throws An error if the maximum number of retries is exceeded or if another unexpected error occurs.
   */
  public get(
    params?: Ably.RealtimePresenceParams,
  ): Promise<{ previous: ChatPresenceMessage[]; latest: ChatPresenceMessage[] }> {
    return new Promise((resolve, reject) => {
      this._logger.debug('DefaultPresenceSetManager.get()', {
        isFetching: this._isFetching,
        pendingQueueSize: this._queue.length,
      });

      // Add the caller to the queue
      this._queue.push({ resolve, reject });

      // Start fetching if not already doing so
      if (!this._isFetching) {
        this._fetchPresence(params);
      }
    });
  }

  /**
   * Validates and transforms an array of `PresenceMessage` objects into `ChatPresenceMessage` objects.
   *
   * Any invalid messages are removed from the resolved list, and an error is logged.
   *
   * @param members The raw array of `PresenceMessage` objects from the Ably presence API.
   * @returns An array of validated `ChatPresenceMessage` objects.
   */
  private _validatePresenceMessages(members: PresenceMessage[]): ChatPresenceMessage[] {
    const validatedMembers: ChatPresenceMessage[] = [];

    for (const member of members) {
      try {
        // Validate that the message contains the expected ChatPresenceData structure
        const data = member.data as ChatPresenceData;
        if (this._isValidChatPresenceData(member.data)) {
          validatedMembers.push({
            ...member,
            data,
          });
        } else {
          this._logger.error(
            'DefaultPresenceSetManager._validatePresenceMessages(); Invalid ChatPresenceData received, excluding from result',
            { member },
          );
        }
      } catch (error) {
        this._logger.error(
          'DefaultPresenceSetManager._validatePresenceMessages(); Error while validating presence message, excluding from result',
          { member, error },
        );
      }
    }

    this._logger.debug('DefaultPresenceSetManager._validatePresenceMessages() - Validation completed', {
      originalCount: members.length,
      validatedCount: validatedMembers.length,
    });

    return validatedMembers;
  }

  /**
   * Checks if the given data object matches the expected `ChatPresenceData` structure.
   *
   * @param data The raw data to be validated.
   * @returns `true` if the `data` is valid, otherwise `false`.
   */
  private _isValidChatPresenceData(data?: unknown): boolean {
    if (data === undefined) {
      return false;
    }
    const dataObject = data as Record<string, unknown>;

    // Ensure typing and isOnline are both present and booleans
    if (dataObject.typing !== undefined && typeof dataObject.typing !== 'boolean') {
      return false;
    }

    if (dataObject.isOnline !== undefined && typeof dataObject.isOnline !== 'boolean') {
      return false;
    }

    return true;
  }

  /**
   * Internal helper to fetch the presence state from the channel.
   * This method performs retries with exponential backoff on failure.
   */
  private _fetchPresence(params?: Ably.RealtimePresenceParams): void {
    this._logger.trace('DefaultPresenceSetManager._fetchPresence() - Starting fetch operation');

    this._isFetching = true;

    this._channel.presence
      .get(params)
      .then((members: PresenceMessage[]) => {
        this._logger.trace('DefaultPresenceSetManager._fetchPresence() - Fetch succeeded', { members });

        const validatedMembers = this._validatePresenceMessages(members);
        // On success, resolve all queued promises with the retrieved presence data
        while (this._queue.length > 0) {
          const queueElement = this._queue.shift();
          if (queueElement) {
            const previous = this._currentPresenceData;
            this._currentPresenceData = validatedMembers;
            queueElement.resolve({ previous, latest: validatedMembers });
          }
        }

        // Reset retry count and fetching status
        this._retryCount = 0;
        this._isFetching = false;
      })
      .catch((error: unknown) => {
        this._logger.trace('DefaultPresenceSetManager._fetchPresence() - Error occurred', {
          error,
          retryCount: this._retryCount,
        });

        // Increment retry count and check if retries are still allowed
        this._retryCount++;
        const willRetry = this._retryCount < PRESENCE_GET_MAX_RETRIES;

        if (!willRetry) {
          this._logger.trace(
            'DefaultPresenceSetManager._fetchPresence() - Max retries exceeded, rejecting all promises',
          );

          // Reject all queued promises
          while (this._queue.length > 0) {
            const queueElement = this._queue.shift();
            if (queueElement) {
              queueElement.reject(error);
            }
          }

          // Reset fetching state
          this._retryCount = 0;
          this._isFetching = false;
          return;
        }

        // Retry logic with exponential backoff
        const waitBeforeRetry = Math.min(
          PRESENCE_GET_RETRY_MAX_INTERVAL_MS,
          PRESENCE_GET_RETRY_INTERVAL_MS * Math.pow(2, this._retryCount),
        );

        this._logger.debug('DefaultPresenceSetManager._fetchPresence() - Retry scheduled', {
          waitBeforeRetry,
        });

        setTimeout(() => {
          this._fetchPresence();
        }, waitBeforeRetry);
      });
  }
}

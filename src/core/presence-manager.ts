import * as Ably from 'ably';
import { Mutex } from 'async-mutex';

interface PresenceData {
  customUserData?: unknown;
  typing?: boolean;
}

type PresenceApplicator = (data: PresenceData) => PresenceData;

interface PresenceContribution {
  update: (applicator: PresenceApplicator) => Promise<PresenceData>;
  remove: (applicator: PresenceApplicator) => Promise<void>;
}

class PresenceManager {
  private readonly _channel: Ably.RealtimeChannel;
  private _presenceData: PresenceData;
  private _contributions: Set<PresenceContribution>;
  private _opMtx: Mutex;

  constructor(channel: Ably.RealtimeChannel) {
    this._channel = channel;
    this._presenceData = {};
    this._contributions = new Set();
    this._opMtx = new Mutex();
  }

  async addContributor(applicator: PresenceApplicator): Promise<PresenceContribution> {
    // We do the presence update - it'll just become an ENTER if we're not present
    await this._doPresenceUpdate(applicator);

    const contribution: PresenceContribution = {
      update: (applicator: PresenceApplicator) => this._doPresenceUpdate(applicator).then(() => this._presenceData),
      remove: (applicator: PresenceApplicator) => this._removeContribution(contribution, applicator),
    };

    this._contributions.add(contribution);

    return contribution;
  }

  private async _doPresenceUpdate(applicator: PresenceApplicator): Promise<void> {
    await this._opMtx.acquire();
    const presenceData = this._presenceData;
    this._presenceData = applicator(presenceData);

    // Update our presence data, rollback if the update fails
    return this._channel.presence
      .update(this._presenceData)
      .catch((error: unknown) => {
        this._presenceData = presenceData;
        throw error;
      })
      .finally(() => {
        this._opMtx.release();
      });
  }

  private async _doPresenceLeave(applicator: PresenceApplicator): Promise<void> {
    await this._opMtx.acquire();
    const presenceData = this._presenceData;
    this._presenceData = applicator(presenceData);

    // Update our presence data, rollback if the update fails
    return this._channel.presence
      .leave(this._presenceData)
      .catch((error: unknown) => {
        this._presenceData = presenceData;
        throw error;
      })
      .finally(() => {
        this._opMtx.release();
      });
  }

  private async _removeContribution(contribution: PresenceContribution, applicator: PresenceApplicator): Promise<void> {
    // Do the leave or update operation, whatever is necessary
    await (this._contributions.size === 1 ? this._doPresenceLeave(applicator) : this._doPresenceUpdate(applicator));

    // Remove ourselves from the contributions - we were successful
    this._contributions.delete(contribution);
  }
}

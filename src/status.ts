import * as Ably from 'ably';

import { Logger } from './logger.js';
import EventEmitter from './utils/EventEmitter.js';

/**
 * The different states that the feature can be in.
 */
export enum FeatureStatus {
  /**
   * A temporary state for when the library is first initialised.
   */
  Initialised = 'initialised',

  /**
   * The feature is currently disconnected from Ably, but will attempt to reconnect.
   */
  Disconnected = 'disconnected',

  /**
   * The feature is currently connected to Ably.
   */
  Connected = 'connected',

  /**
   * The feature is currently disconnected from Ably and will not attempt to reconnect.
   */
  Failed = 'failed',
}

/**
 * Represents a change in the status of the feature.
 */
export interface FeatureStatusChange {
  /**
   * The new status of the feature.
   */
  status: FeatureStatus;

  /**
   * An error that provides a reason why the feature has
   * entered the new status, if applicable.
   */
  error?: Ably.ErrorInfo;
}

/**
 * A function that can be called when the feature status changes.
 * @param change The change in status.
 */
export type FeatureStatusListener = (change: FeatureStatusChange) => void;

/**
 * The response from the `onStatusChange` method.
 */
export interface OnFeatureStatusChangeResponse {
  /**
   * Unregisters the listener that was added by the `onStatusChange` method.
   */
  off: () => void;
}

/**
 * Represents the status of a feature.
 */
export interface Feature {
  /**
   * The current status of the feature.
   */
  get currentStatus(): FeatureStatus;

  /**
   * The current error, if any, that caused the connection to enter the current status.
   */
  get error(): Ably.ErrorInfo | undefined;

  /**
   * Registers a listener that will be called whenever the connection status changes.
   * @param listener The function to call when the status changes.
   * @returns An object that can be used to unregister the listener.
   */
  onStatusChange(listener: FeatureStatusListener): OnFeatureStatusChangeResponse;

  /**
   * Removes all listeners that were added by the `onStatusChange` method.
   */
  offAll(): void;
}

type FeatureEventsMap = {
  [key in FeatureStatus]: FeatureStatusChange;
};

/**
 * An implementation of the `Connection` interface.
 * @internal
 */
export class DefaultFeature extends EventEmitter<FeatureEventsMap> implements Feature {
  private _status: FeatureStatus = FeatureStatus.Initialised;
  private _error?: Ably.ErrorInfo;
  private readonly _channel: Ably.RealtimeChannel;
  private readonly _logger: Logger;
  private readonly _featureName: string;

  /**
   * Constructs a new `DefaultFeatureStatus` instance.
   * @param ably The Ably Realtime client.
   */
  constructor(channel: Ably.RealtimeChannel, featureName: string, logger: Logger) {
    super();
    this._featureName = featureName;
    this._logger = logger;

    // Set our initial status and error
    this._status = this.mapAblyStatusToChat(channel.state);
    this._error = channel.errorReason;

    // Listen for changes to the connection status
    this._channel = channel;
    this._channel.on((change: Ably.ChannelStateChange) => {
      const chatState = this.mapAblyStatusToChat(change.current);
      this._error = change.reason;
      if (chatState === this._status) {
        return;
      }

      switch (chatState) {
        case FeatureStatus.Connected:
          this._status = FeatureStatus.Connected;
          this._error = undefined;
          this._logger.info(`Connected to ${this._featureName}`);
          this.emit(this._status, { status: this._status });
          break;
        case FeatureStatus.Disconnected:
          this._status = FeatureStatus.Disconnected;
          this._logger.info(`Disconnected from ${this._featureName}`);
          this.emit(this._status, { status: this._status, error: change.reason });
          break;
        case FeatureStatus.Failed:
          this._status = FeatureStatus.Failed;
          this._logger.error(`Feature ${this._featureName} failed`, { error: change.reason });
          this.emit(this._status, { status: this._status, error: change.reason });
          break;
      }
    });
  }

  /**
   * @inheritdoc
   */
  get currentStatus(): FeatureStatus {
    return this._status;
  }

  /**
   * @inheritdoc
   */
  get error(): Ably.ErrorInfo | undefined {
    return this._error;
  }

  /**
   * @inheritdoc
   */
  onStatusChange(listener: FeatureStatusListener): OnFeatureStatusChangeResponse {
    this.on(listener);

    return {
      off: () => this.off(listener),
    };
  }

  /**
   * @inheritdoc
   */
  offAll(): void {
    this.off();
  }

  private mapAblyStatusToChat(status: Ably.ChannelState): FeatureStatus {
    switch (status) {
      case 'attached':
        return FeatureStatus.Connected;
      case 'detached':
      case 'suspended':
      case 'detaching':
      case 'attaching':
        return FeatureStatus.Disconnected;
      // We should never see closing and closed, as we don't call closed.
      case 'failed':
        return FeatureStatus.Failed;
      default:
        return FeatureStatus.Initialised;
    }
  }
}

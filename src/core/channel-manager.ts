import * as Ably from 'ably';

import { roomChannelName } from './channel.js';
import { ErrorCode } from './errors.js';
import { Logger } from './logger.js';
import { DEFAULT_CHANNEL_OPTIONS, DEFAULT_CHANNEL_OPTIONS_REACT } from './version.js';

export type ChannelOptionsWithModes = Omit<Ably.ChannelOptions, 'modes'> & Required<Pick<Ably.ChannelOptions, 'modes'>>;

export type ChannelOptionsMerger = (options: ChannelOptionsWithModes) => ChannelOptionsWithModes;

export class ChannelManager {
  private readonly _realtime: Ably.Realtime;
  private readonly _logger: Logger;
  private _registeredOptions: ChannelOptionsWithModes;
  private readonly _isReact: boolean;
  private _resolvedChannel?: Ably.RealtimeChannel;
  private readonly _channelId: string;

  constructor(roomName: string, realtime: Ably.Realtime, logger: Logger, isReact: boolean) {
    logger.trace('ChannelManager();', { isReact });
    this._realtime = realtime;
    this._logger = logger;
    this._isReact = isReact;
    this._registeredOptions = this._defaultChannelOptions();
    this._channelId = roomChannelName(roomName);
  }

  mergeOptions(merger: ChannelOptionsMerger): void {
    this._logger.trace('ChannelManager.mergeOptions();');
    if (this._resolvedChannel) {
      this._logger.error('unable to modify channel options; channel has already been requested');
      throw new Ably.ErrorInfo(
        'unable to modify channel options; channel has already been requested',
        ErrorCode.ChannelOptionsCannotBeModified,
        400,
      );
    }

    this._registeredOptions = merger(this._registeredOptions);
  }

  get(): Ably.RealtimeChannel {
    this._logger.trace('ChannelManager.get();');

    this._resolvedChannel ??= this._realtime.channels.get(this._channelId, this._registeredOptions);

    return this._resolvedChannel;
  }

  release(): void {
    this._logger.trace('ChannelManager.release();', { channelId: this._channelId });
    if (!this._resolvedChannel) {
      return;
    }

    this._realtime.channels.release(this._channelId);
  }

  private _defaultChannelOptions(): ChannelOptionsWithModes {
    this._logger.trace('ChannelManager._defaultChannelOptions();');

    // Spec: CHA-IN1e
    const baseOptions = this._isReact ? DEFAULT_CHANNEL_OPTIONS_REACT : DEFAULT_CHANNEL_OPTIONS;
    this._logger.trace(this._isReact ? 'using react channel options' : 'using default channel options');

    // Create a deep copy of the options, ensuring modes array is also copied
    return { ...baseOptions, modes: [...(baseOptions.modes ?? [])] } as ChannelOptionsWithModes;
  }
}

import * as Ably from 'ably';

import { roomChannelName } from './channel.js';
import { Logger } from './logger.js';
import { DEFAULT_CHANNEL_OPTIONS, DEFAULT_CHANNEL_OPTIONS_REACT } from './version.js';

export type ChannelOptionsMerger = (options: Ably.ChannelOptions) => Ably.ChannelOptions;

export class ChannelManager {
  private readonly _realtime: Ably.Realtime;
  private readonly _logger: Logger;
  private _registeredOptions: Ably.ChannelOptions;
  private readonly _isReact: boolean;
  private _resolvedChannel?: Ably.RealtimeChannel;
  private readonly _channelId: string;

  constructor(roomId: string, realtime: Ably.Realtime, logger: Logger, isReact: boolean) {
    logger.trace('ChannelManager();', { isReact });
    this._realtime = realtime;
    this._logger = logger;
    this._isReact = isReact;
    this._registeredOptions = this._defaultChannelOptions();
    this._channelId = roomChannelName(roomId);
  }

  mergeOptions(merger: ChannelOptionsMerger): void {
    this._logger.trace('ChannelManager.mergeOptions();');
    if (this._resolvedChannel) {
      this._logger.error('channel options cannot be modified after the channel has been requested');
      throw new Ably.ErrorInfo('channel options cannot be modified after the channel has been requested', 40000, 400);
    }

    this._registeredOptions = merger(this._registeredOptions);
  }

  get(): Ably.RealtimeChannel {
    this._logger.trace('ChannelManager.get();');
    if (!this._resolvedChannel) {
      this._resolvedChannel = this._realtime.channels.get(this._channelId, this._registeredOptions);
    }

    return this._resolvedChannel;
  }

  release(): void {
    this._logger.trace('ChannelManager.release();', { channelId: this._channelId });
    if (!this._resolvedChannel) {
      return;
    }

    this._realtime.channels.release(this._channelId);
  }

  private _defaultChannelOptions(): Ably.ChannelOptions {
    return this._isReact ? DEFAULT_CHANNEL_OPTIONS_REACT : DEFAULT_CHANNEL_OPTIONS;
  }
}

import * as Ably from 'ably';

import { Logger } from './logger.js';
import { DEFAULT_CHANNEL_OPTIONS } from './version.js';

export type ChannelOptionsMerger = (options: Ably.ChannelOptions) => Ably.ChannelOptions;

export class ChannelManager {
  private readonly _realtime: Ably.Realtime;
  private readonly _logger: Logger;
  private readonly _registeredOptions = new Map<string, Ably.ChannelOptions>();
  private readonly _requestedChannels = new Set<string>();

  constructor(realtime: Ably.Realtime, logger: Logger) {
    logger.trace('ChannelManager();');
    this._realtime = realtime;
    this._logger = logger;
  }

  mergeOptions(channelName: string, merger: ChannelOptionsMerger): void {
    this._logger.trace('ChannelManager.registerOptions();', { channelName });
    if (this._requestedChannels.has(channelName)) {
      this._logger.error('channel options cannot be modified after the channel has been requested', { channelName });
      throw new Ably.ErrorInfo('channel options cannot be modified after the channel has been requested', 40000, 400);
    }

    const currentOpts = this._registeredOptions.get(channelName) ?? DEFAULT_CHANNEL_OPTIONS;
    this._registeredOptions.set(channelName, merger(currentOpts));
  }

  get(channelName: string): Ably.RealtimeChannel {
    this._logger.trace('ChannelManager.get();', { channelName });
    this._requestedChannels.add(channelName);
    return this._realtime.channels.get(
      channelName,
      this._registeredOptions.get(channelName) ?? DEFAULT_CHANNEL_OPTIONS,
    );
  }

  release(channelName: string): void {
    this._logger.trace('ChannelManager.release();', { channelName });
    this._requestedChannels.delete(channelName);
    this._registeredOptions.delete(channelName);
    this._realtime.channels.release(channelName);
  }
}

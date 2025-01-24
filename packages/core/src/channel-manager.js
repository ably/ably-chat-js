import * as Ably from 'ably';
import { DEFAULT_CHANNEL_OPTIONS } from './version.js';
export class ChannelManager {
    constructor(realtime, logger) {
        this._registeredOptions = new Map();
        this._requestedChannels = new Set();
        logger.trace('ChannelManager();');
        this._realtime = realtime;
        this._logger = logger;
    }
    mergeOptions(channelName, merger) {
        var _a;
        this._logger.trace('ChannelManager.registerOptions();', { channelName });
        if (this._requestedChannels.has(channelName)) {
            this._logger.error('channel options cannot be modified after the channel has been requested', { channelName });
            throw new Ably.ErrorInfo('channel options cannot be modified after the channel has been requested', 40000, 400);
        }
        const currentOpts = (_a = this._registeredOptions.get(channelName)) !== null && _a !== void 0 ? _a : DEFAULT_CHANNEL_OPTIONS;
        this._registeredOptions.set(channelName, merger(currentOpts));
    }
    get(channelName) {
        var _a;
        this._logger.trace('ChannelManager.get();', { channelName });
        this._requestedChannels.add(channelName);
        return this._realtime.channels.get(channelName, (_a = this._registeredOptions.get(channelName)) !== null && _a !== void 0 ? _a : DEFAULT_CHANNEL_OPTIONS);
    }
    release(channelName) {
        this._logger.trace('ChannelManager.release();', { channelName });
        this._requestedChannels.delete(channelName);
        this._registeredOptions.delete(channelName);
        this._realtime.channels.release(channelName);
    }
}
//# sourceMappingURL=channel-manager.js.map
import * as Ably from 'ably';
import { Logger } from './logger.js';
export type ChannelOptionsMerger = (options: Ably.ChannelOptions) => Ably.ChannelOptions;
export declare class ChannelManager {
    private readonly _realtime;
    private readonly _logger;
    private readonly _registeredOptions;
    private readonly _requestedChannels;
    constructor(realtime: Ably.Realtime, logger: Logger);
    mergeOptions(channelName: string, merger: ChannelOptionsMerger): void;
    get(channelName: string): Ably.RealtimeChannel;
    release(channelName: string): void;
}

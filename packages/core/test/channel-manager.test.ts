import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChannelManager, ChannelOptionsMerger } from '../src/channel-manager.ts';
import { DEFAULT_CHANNEL_OPTIONS } from '../src.ts';
import { randomClientId } from '../../../test/helper/identifier.ts';
import { makeTestLogger } from '../../../test/helper/logger.ts';

interface TestContext {
  mockRealtime: Ably.Realtime;
  channelManager: ChannelManager;
}

vi.mock('ably');

describe('ChannelManager', () => {
  beforeEach<TestContext>((context) => {
    context.mockRealtime = new Ably.Realtime({ clientId: randomClientId() });
    context.channelManager = new ChannelManager(context.mockRealtime, makeTestLogger());

    vi.spyOn(context.mockRealtime.channels, 'get').mockReturnValue({} as Ably.RealtimeChannel);
    vi.spyOn(context.mockRealtime.channels, 'release');
  });

  it<TestContext>('requests channel with default options', (context) => {
    const channelName = 'test-channel';
    context.channelManager.get(channelName);

    expect(context.mockRealtime.channels.get).toHaveBeenCalledWith(channelName, DEFAULT_CHANNEL_OPTIONS);
  });

  it<TestContext>('should merge options correctly', (context) => {
    const channelName = 'test-channel';
    const merger: ChannelOptionsMerger = (options) => ({ ...options, mode: 'presence' });

    context.channelManager.mergeOptions(channelName, merger);

    context.channelManager.get(channelName);
    expect(context.mockRealtime.channels.get).toHaveBeenCalledWith(channelName, {
      ...DEFAULT_CHANNEL_OPTIONS,
      mode: 'presence',
    });
  });

  it<TestContext>('should merge options multiple times over', (context) => {
    const channelName = 'test-channel';
    const merger: ChannelOptionsMerger = (options) => ({ ...options, mode: 'presence' });
    const merger2: ChannelOptionsMerger = (options) => ({ ...options, presence: 'enter' });

    context.channelManager.mergeOptions(channelName, merger);
    context.channelManager.mergeOptions(channelName, merger2);

    context.channelManager.get(channelName);
    expect(context.mockRealtime.channels.get).toHaveBeenCalledWith(channelName, {
      ...DEFAULT_CHANNEL_OPTIONS,
      mode: 'presence',
      presence: 'enter',
    });
  });

  it<TestContext>('should throw error if trying to merge options for a requested channel', (context) => {
    const channelName = 'test-channel';
    const merger: ChannelOptionsMerger = (options) => ({ ...options, mode: 'presence' });
    const merger2: ChannelOptionsMerger = (options) => ({ ...options, presence: 'enter' });

    context.channelManager.mergeOptions(channelName, merger);
    context.channelManager.get(channelName);

    // Should have been called once
    expect(context.mockRealtime.channels.get).toHaveBeenCalledTimes(1);
    expect(context.mockRealtime.channels.get).toHaveBeenCalledWith(channelName, {
      ...DEFAULT_CHANNEL_OPTIONS,
      mode: 'presence',
    });

    // Now try to merge again, should error
    expect(() => {
      context.channelManager.mergeOptions(channelName, merger2);
    }).toThrowErrorInfo({ code: 40000, statusCode: 400 });

    // And we shouldn't have called get again
    expect(context.mockRealtime.channels.get).toHaveBeenCalledTimes(1);
  });

  it<TestContext>('should get a channel singleton', (context) => {
    const channelName = 'test-channel';
    const merger: ChannelOptionsMerger = (options) => ({ ...options, mode: 'presence' });

    context.channelManager.mergeOptions(channelName, merger);
    const channel1 = context.channelManager.get(channelName);
    const channel2 = context.channelManager.get(channelName);

    expect(channel1).toBe(channel2);
  });

  it<TestContext>('should release a channel', (context) => {
    const channelName = 'test-channel';
    context.channelManager.get(channelName);

    context.channelManager.release(channelName);
    expect(context.mockRealtime.channels.release).toHaveBeenCalledWith(channelName);
  });
});

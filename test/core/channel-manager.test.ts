import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { roomChannelName } from '../../src/core/channel.ts';
import { ChannelManager, ChannelOptionsMerger } from '../../src/core/channel-manager.ts';
import { DEFAULT_CHANNEL_OPTIONS, DEFAULT_CHANNEL_OPTIONS_REACT } from '../../src/core/version.ts';
import { randomClientId } from '../helper/identifier.ts';
import { makeTestLogger } from '../helper/logger.ts';

interface TestContext {
  mockRealtime: Ably.Realtime;
  channelManager: ChannelManager;
}

vi.mock('ably');

describe('ChannelManager', () => {
  beforeEach<TestContext>((context) => {
    context.mockRealtime = new Ably.Realtime({ clientId: randomClientId() });
    context.channelManager = new ChannelManager('test-room', context.mockRealtime, makeTestLogger(), false);

    vi.spyOn(context.mockRealtime.channels, 'get').mockReturnValue({} as Ably.RealtimeChannel);
    vi.spyOn(context.mockRealtime.channels, 'release');
  });

  it<TestContext>('requests channel with default options', (context) => {
    context.channelManager.get();
    expect(context.mockRealtime.channels.get).toHaveBeenCalledWith(
      roomChannelName('test-room'),
      DEFAULT_CHANNEL_OPTIONS,
    );
  });

  it<TestContext>('requests channel with default react options', (context) => {
    context.channelManager = new ChannelManager('test-room', context.mockRealtime, makeTestLogger(), true);
    context.channelManager.get();
    expect(context.mockRealtime.channels.get).toHaveBeenCalledWith(
      roomChannelName('test-room'),
      DEFAULT_CHANNEL_OPTIONS_REACT,
    );
  });

  it<TestContext>('should merge options correctly', (context) => {
    const merger: ChannelOptionsMerger = (options) => ({ ...options, mode: 'presence' });

    context.channelManager.mergeOptions(merger);

    context.channelManager.get();
    expect(context.mockRealtime.channels.get).toHaveBeenCalledWith(roomChannelName('test-room'), {
      ...DEFAULT_CHANNEL_OPTIONS,
      mode: 'presence',
    });
  });

  it<TestContext>('should merge options multiple times over', (context) => {
    const merger: ChannelOptionsMerger = (options) => ({ ...options, mode: 'presence' });
    const merger2: ChannelOptionsMerger = (options) => ({ ...options, presence: 'enter' });

    context.channelManager.mergeOptions(merger);
    context.channelManager.mergeOptions(merger2);

    context.channelManager.get();
    expect(context.mockRealtime.channels.get).toHaveBeenCalledWith(roomChannelName('test-room'), {
      ...DEFAULT_CHANNEL_OPTIONS,
      mode: 'presence',
      presence: 'enter',
    });
  });

  it<TestContext>('should throw error if trying to merge options for a requested channel', (context) => {
    const merger: ChannelOptionsMerger = (options) => ({ ...options, mode: 'presence' });
    const merger2: ChannelOptionsMerger = (options) => ({ ...options, presence: 'enter' });

    context.channelManager.mergeOptions(merger);
    context.channelManager.get();

    // Should have been called once
    expect(context.mockRealtime.channels.get).toHaveBeenCalledTimes(1);
    expect(context.mockRealtime.channels.get).toHaveBeenCalledWith(roomChannelName('test-room'), {
      ...DEFAULT_CHANNEL_OPTIONS,
      mode: 'presence',
    });

    // Now try to merge again, should error
    expect(() => {
      context.channelManager.mergeOptions(merger2);
    }).toThrowErrorInfo({ code: 40000, statusCode: 400 });

    // And we shouldn't have called get again
    expect(context.mockRealtime.channels.get).toHaveBeenCalledTimes(1);
  });

  it<TestContext>('should get a channel singleton', (context) => {
    const merger: ChannelOptionsMerger = (options) => ({ ...options, mode: 'presence' });

    context.channelManager.mergeOptions(merger);
    const channel1 = context.channelManager.get();
    const channel2 = context.channelManager.get();

    expect(channel1).toBe(channel2);
  });

  it<TestContext>('should release a channel', (context) => {
    context.channelManager.get();

    context.channelManager.release();
    expect(context.mockRealtime.channels.release).toHaveBeenCalledWith(roomChannelName('test-room'));
  });

  it<TestContext>('should not call release if no channel has been resolved', (context) => {
    // Act - call release without first calling get()
    context.channelManager.release();

    // Assert - release should not be called on the realtime channels
    expect(context.mockRealtime.channels.release).not.toHaveBeenCalled();
  });
});

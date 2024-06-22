import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorInfo } from '../__mocks__/ably/index.ts';
import { DefaultFeature, FeatureStatus } from '../src/status.ts';
import { makeTestLogger } from './helper/logger.ts';

interface TestContext {
  realtime: Ably.Realtime;
  channel: Ably.RealtimeChannel;
  emulateStateChange: Ably.channelEventCallback;
  channelLevelListeners: Set<Ably.channelEventCallback>;
}

enum AblyChannelState {
  Attached = 'attached',
  Detached = 'detached',
  Failed = 'failed',
  Attaching = 'attaching',
  Detaching = 'detaching',
  Suspended = 'suspended',
}

const mapAblyStatusToChat = (status: Ably.ChannelState): FeatureStatus => {
  switch (status) {
    case 'attached':
      return FeatureStatus.Connected;
    case 'detached':
    case 'detaching':
    case 'attaching':
    case 'suspended':
      return FeatureStatus.Disconnected;
    case 'failed':
      return FeatureStatus.Failed;
    default:
      return FeatureStatus.Initialised;
  }
};

vi.mock('ably');

describe('feature', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = new Ably.Realtime({ clientId: 'clientId', key: 'key' });
    context.channelLevelListeners = new Set();

    const channel = context.realtime.channels.get('channel');
    context.channel = channel;
    vi.spyOn(channel, 'on').mockImplementation(
      // @ts-ignore
      async (listener: Ably.channelEventCallback) => {
        context.channelLevelListeners.add(listener);

        // @ts-ignore
        context.emulateStateChange = (stateChange: Ably.ChannelStateChange) => {
          context.channelLevelListeners.forEach((cb) => cb(stateChange));
        };
      },
    );

    vi.spyOn(channel, 'state', 'get').mockReturnValue('detached');
    vi.spyOn(channel, 'errorReason', 'get').mockReturnValue(new Ably.ErrorInfo('error', 500, 50000));
  });

  it<TestContext>('should set the initial channel state from the connection', (context) => {
    const feature = new DefaultFeature(context.channel, 'roomReactions', makeTestLogger());

    expect(feature.currentStatus).toEqual(FeatureStatus.Disconnected);
    expect(feature.error).toEqual(new Ably.ErrorInfo('error', 500, 50000));
  });

  it<TestContext>('listeners can be added', (context) =>
    new Promise<void>((done, reject) => {
      const feature = new DefaultFeature(context.channel, 'roomReactions', makeTestLogger());
      feature.onStatusChange((status) => {
        expect(status.status).toEqual(FeatureStatus.Connected);
        expect(status.error).toBeUndefined();
        done();
      });

      context.emulateStateChange({ current: 'attached', previous: 'detached', resumed: false });
      reject(new Error('Expected onStatusChange to be called'));
    }));

  it<TestContext>('listeners can be removed', (context) =>
    new Promise<void>((done, reject) => {
      const feature = new DefaultFeature(context.channel, 'roomReactions', makeTestLogger());
      const { off } = feature.onStatusChange(() => {
        reject(new Error('Expected onStatusChange to not be called'));
      });

      off();
      context.emulateStateChange({ current: 'attached', previous: 'detached', resumed: false });
      done();
    }));

  it<TestContext>('listeners can all be removed', (context) =>
    new Promise<void>((done, reject) => {
      const feature = new DefaultFeature(context.channel, 'roomReactions', makeTestLogger());
      feature.onStatusChange(() => {
        reject(new Error('Expected onStatusChange to not be called'));
      });
      feature.onStatusChange(() => {
        reject(new Error('Expected onStatusChange to not be called'));
      });

      feature.offAll();
      context.emulateStateChange({ current: 'attached', previous: 'detached', resumed: false });
      done();
    }));

  describe.each([
    [FeatureStatus.Connected, AblyChannelState.Attaching, AblyChannelState.Attached, undefined],
    [FeatureStatus.Connected, AblyChannelState.Detached, AblyChannelState.Attached, undefined],
    [FeatureStatus.Connected, AblyChannelState.Suspended, AblyChannelState.Attached, undefined],
    [FeatureStatus.Disconnected, AblyChannelState.Attached, AblyChannelState.Attaching, undefined],
    [FeatureStatus.Disconnected, AblyChannelState.Attached, AblyChannelState.Detached, undefined],
    [
      FeatureStatus.Failed,
      AblyChannelState.Attaching,
      AblyChannelState.Failed,
      new Ably.ErrorInfo('error', 500, 99998),
    ],
    [FeatureStatus.Failed, AblyChannelState.Attached, AblyChannelState.Failed, new Ably.ErrorInfo('error', 500, 99998)],
    [FeatureStatus.Failed, AblyChannelState.Detached, AblyChannelState.Failed, new Ably.ErrorInfo('error', 500, 99998)],

    [
      FeatureStatus.Failed,
      AblyChannelState.Attaching,
      AblyChannelState.Failed,
      new Ably.ErrorInfo('error', 500, 99999),
    ],
  ])(
    `processes state changes`,
    (
      expectedStatus: FeatureStatus,
      previousRealtimeState: AblyChannelState,
      newRealtimeState: AblyChannelState,
      error: ErrorInfo | undefined,
    ) => {
      const baseError = new Ably.ErrorInfo('error', 500, 99999);

      it<TestContext>(`transitions state to ${expectedStatus} when channel state goes from ${previousRealtimeState} to ${newRealtimeState}`, (context) =>
        new Promise<void>((done, reject) => {
          vi.spyOn(context.channel, 'state', 'get').mockReturnValue(previousRealtimeState);
          vi.spyOn(context.channel, 'errorReason', 'get').mockReturnValue(error ?? baseError);
          const feature = new DefaultFeature(context.channel, 'roomReactions', makeTestLogger());

          expect(feature.currentStatus).toEqual(mapAblyStatusToChat(previousRealtimeState));
          expect(feature.error).toEqual(error ?? baseError);

          feature.onStatusChange((status) => {
            expect(status.status).toEqual(expectedStatus);
            expect(status.error).toEqual(error);
            expect(feature.currentStatus).toEqual(expectedStatus);
            expect(feature.error).toEqual(error);
            done();
          });

          context.emulateStateChange({
            current: newRealtimeState,
            previous: previousRealtimeState,
            reason: error,
            resumed: false,
          });
          reject(new Error('Expected onStatusChange to be called'));
        }));
    },
  );

  describe.each([
    [AblyChannelState.Attached, AblyChannelState.Attached],
    [AblyChannelState.Detached, AblyChannelState.Detached],
    [AblyChannelState.Detached, AblyChannelState.Attaching],
    [AblyChannelState.Suspended, AblyChannelState.Suspended],
    [AblyChannelState.Attaching, AblyChannelState.Attaching],
    [AblyChannelState.Attaching, AblyChannelState.Detached],
    [AblyChannelState.Attaching, AblyChannelState.Detaching],
    [AblyChannelState.Failed, AblyChannelState.Failed],
  ])(`doesnt do state changes`, (previousRealtimeState: AblyChannelState, newRealtimeState: AblyChannelState) => {
    it<TestContext>(`does not transitions state when realtime state goes from ${previousRealtimeState} to ${newRealtimeState}`, (context) =>
      new Promise<void>((done, reject) => {
        vi.spyOn(context.channel, 'state', 'get').mockReturnValue(previousRealtimeState);
        const feature = new DefaultFeature(context.channel, 'roomReactions', makeTestLogger());

        expect(feature.currentStatus).toEqual(mapAblyStatusToChat(previousRealtimeState));

        feature.onStatusChange(() => {
          reject(new Error('Expected onStatusChange to not be called'));
        });

        context.emulateStateChange({ current: newRealtimeState, previous: previousRealtimeState, resumed: false });
        expect(feature.currentStatus).toEqual(mapAblyStatusToChat(previousRealtimeState));
        done();
      }));
  });
});

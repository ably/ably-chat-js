import * as Ably from 'ably';

interface Emitter {
  emit(event: string, arg: unknown): void;
}

export type ChannelEventEmitterReturnType<PayloadType> = (arg: PayloadType) => void;
export type ChannelStateEventEmitterReturnType = (arg: Ably.ChannelStateChange, update?: boolean) => void;

export const channelEventEmitter = (
  channel: Ably.RealtimeChannel,
): ChannelEventEmitterReturnType<Partial<Ably.InboundMessage>> => {
  const channelWithEmitter = channel as Ably.RealtimeChannel & {
    subscriptions: Emitter;
  };

  return (arg: Partial<Ably.InboundMessage>) => {
    if (!arg.name) {
      throw new Error('Event name is required');
    }

    channelWithEmitter.subscriptions.emit(arg.name, arg);
  };
};

export const channelStateEventEmitter = (channel: Ably.RealtimeChannel): ChannelStateEventEmitterReturnType => {
  const channelWithEmitter = channel as unknown as Emitter;

  return (arg: Ably.ChannelStateChange, update?: boolean) => {
    if (update) {
      if (arg.current !== 'attached') {
        throw new Error('expected current = attached for update');
      }

      channelWithEmitter.emit('update', arg);
      return;
    }

    channelWithEmitter.emit(arg.current, arg);
  };
};

import * as Ably from '@ably/pubsub-core';

/**
 * This type represents a callback that can be registered with an EventEmitter.
 *
 * The EventsMap is an interface of event names to the types of the payloads of
 * those events. For example:
 *
 *     interface MyEvents {
 *         reaction: {emoji: string}
 *     }
 *
 * There is no need to use this type directly, it is used for defining the
 * InterfaceEventEmitter.
 */
type Callback<EventsMap> = (arg: EventsMap[keyof EventsMap]) => void;
type CallbackSingle<K> = (arg: K) => void;

/**
 * This interface narrows the emit, on and off methods of the Pub/Sub
 * {@link Ably.EventEmitter} to the events and payloads of an EventsMap.
 */
interface InterfaceEventEmitter<EventsMap> extends Omit<Ably.EventEmitter, 'emit' | 'on' | 'off'> {
  emit<K extends keyof EventsMap>(event: K, arg: EventsMap[K]): void;

  on<K extends keyof EventsMap>(event: K, callback: CallbackSingle<EventsMap[K]>): void;
  on<K1 extends keyof EventsMap, K2 extends keyof EventsMap>(
    events: [K1, K2],
    callback: CallbackSingle<EventsMap[K1] | EventsMap[K2]>,
  ): void;
  on<K1 extends keyof EventsMap, K2 extends keyof EventsMap, K3 extends keyof EventsMap>(
    events: [K1, K2, K3],
    callback: CallbackSingle<EventsMap[K1] | EventsMap[K2] | EventsMap[K3]>,
  ): void;
  on(events: (keyof EventsMap)[], callback: Callback<EventsMap>): void;
  on(callback: Callback<EventsMap>): void;

  off<K extends keyof EventsMap>(event: K, listener: CallbackSingle<EventsMap[K]>): void;
  off(listener?: Callback<EventsMap>): void;
  off<K extends EventsMap[keyof EventsMap]>(listener: CallbackSingle<K>): void;
}

/**
 * The Pub/Sub {@link Ably.EventEmitter} constructor, typed to produce an
 * {@link InterfaceEventEmitter}.
 *
 * We do not export this directly because we prefer to export a class, which is
 * what we normally expect EventEmitter to be.
 */
const InternalEventEmitter = Ably.EventEmitter as new <EventsMap>() => InterfaceEventEmitter<EventsMap>;

/**
 * EventEmitter class based on the Pub/Sub {@link Ably.EventEmitter}. It is
 * different from the Pub/Sub EventEmitter because it takes an EventsMap type
 * parameter that types the events and their payloads.
 *
 * The EventsMap is an interface of event names to the types of the payloads of
 * those events. For example:
 *
 *     interface MyEvents {
 *         reaction: {emoji: string}
 *     }
 *
 * There is no need to use this type directly, it is used for defining the
 * InterfaceEventEmitter.
 */
class EventEmitter<EventsMap> extends InternalEventEmitter<EventsMap> {}

export default EventEmitter;

/**
 * Creates a wrapper function that forwards all arguments to the provided function.
 * @param fn The function to wrap
 * @returns A new function with the same signature as the input function
 */
export const wrap =
  <Args extends unknown[], Return>(fn: (...args: Args) => Return): ((...args: Args) => Return) =>
  (...args: Args) =>
    fn(...args);

/**
 * Checks if an EventEmitter has any listeners registered.
 * @param emitter The EventEmitter instance to check
 * @returns true if the emitter has listeners, false otherwise
 */
export const emitterHasListeners = <EventsMap>(emitter: EventEmitter<EventsMap>): boolean => {
  const numListeners =
    Object.values(emitter.events).flat().length +
    emitter.any.length +
    Object.values(emitter.eventsOnce).flat().length +
    emitter.anyOnce.length;

  return numListeners ? numListeners > 0 : false;
};

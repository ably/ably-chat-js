import * as Ably from 'ably';

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
 * This interface extends the Ably.EventEmitter interface to add a type-safe
 * emit method as well as convert an EventsMap into the type parameters used by
 * Ably.EventEmitter.
 */
interface InterfaceEventEmitter<EventsMap> extends Ably.EventEmitter<Callback<EventsMap>, void, keyof EventsMap> {
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
 * This is a workaround for the fact that the EventEmitter constructor is only
 * exported from the ably-js package for internal use by other Ably SDKs (like
 * this one).
 *
 * It is a correctly-typed constructor for the ably-js EventEmitter.
 *
 * We do not export this directly because we prefer to export a class, which is
 * what we normally expect EventEmitter to be.
 */
const InternalEventEmitter: new <EventsMap>() => InterfaceEventEmitter<EventsMap> = (
  Ably.Realtime as unknown as { EventEmitter: new <EventsMap>() => InterfaceEventEmitter<EventsMap> }
).EventEmitter;

/**
 * EventEmitter class based on the internal ably-js EventEmitter. It is
 * different from the ably-js EventEmitter because it takes an EventsMap type
 * parameter as opposed to the three type parameters required by
 * {@link Ably.EventEmitter}.
 *
 * We find the EventsMap type parameter to be more convenient to use in this
 * Chat SDK.
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
  const destructured = emitter as unknown as {
    events: Record<string, unknown[]>;
    any: unknown[];
    eventsOnce: Record<string, unknown[]>;
    anyOnce: unknown[];
  };

  const numListeners =
    Object.values(destructured.events).flat().length +
    destructured.any.length +
    Object.values(destructured.eventsOnce).flat().length +
    destructured.anyOnce.length;

  return numListeners ? numListeners > 0 : false;
};

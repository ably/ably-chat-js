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

/**
 * This interface extends the Ably.EventEmitter interface to add a type-safe
 * emit method as well as convert an EventsMap into the type parameters used by
 * Ably.EventEmitter.
 */
interface InterfaceEventEmitter<EventsMap> extends Ably.EventEmitter<Callback<EventsMap>, void, keyof EventsMap> {
  emit<K extends keyof EventsMap>(event: K, arg: EventsMap[K]): void;
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

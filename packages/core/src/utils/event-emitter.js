import * as Ably from 'ably';
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
const InternalEventEmitter = Ably.Realtime.EventEmitter;
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
class EventEmitter extends InternalEventEmitter {
}
export default EventEmitter;
//# sourceMappingURL=event-emitter.js.map
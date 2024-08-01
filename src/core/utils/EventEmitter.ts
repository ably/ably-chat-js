import * as Ably from 'ably';

type Callback<EventsMap> = (arg: EventsMap[keyof EventsMap]) => void;

interface InterfaceEventEmitter<EventsMap> extends Ably.EventEmitter<Callback<EventsMap>, void, keyof EventsMap> {
  emit<K extends keyof EventsMap>(event: K, arg: EventsMap[K]): void;
}

const InternalEventEmitter: new <EventsMap>() => InterfaceEventEmitter<EventsMap> = (
  Ably.Realtime as unknown as { EventEmitter: new <EventsMap>() => InterfaceEventEmitter<EventsMap> }
).EventEmitter;

class EventEmitter<EventsMap> extends InternalEventEmitter<EventsMap> {}

export default EventEmitter;

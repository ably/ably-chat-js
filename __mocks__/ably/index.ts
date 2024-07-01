import * as Ably from 'ably';

const MOCK_CLIENT_ID = 'MOCK_CLIENT_ID';

const mockPromisify = <T>(expectedReturnValue): Promise<T> =>
  new Promise((resolve) => {
    resolve(expectedReturnValue);
  });
const methodReturningVoidPromise = () => mockPromisify<void>((() => {})());
const methodReturningVoid = () => {};

function createMockPresence() {
  return {
    get: () => mockPromisify<Ably.PresenceMessage[]>([]),
    update: () => mockPromisify<void>(undefined),
    enterClient: methodReturningVoidPromise,
    leaveClient: methodReturningVoidPromise,
    enter: methodReturningVoidPromise,
    leave: methodReturningVoidPromise,
    subscriptions: createMockEmitter(),
    subscribe: methodReturningVoidPromise,
    unsubscribe: methodReturningVoidPromise,
  };
}

type anyType = ((_) => void)[];
type eventType = { [event: string]: ((_) => void)[] };

function createMockEmitter() {
  const emitter = {
    on: (eventsOrListener: string[] | string | (() => void), listener?: (client_id) => void) => {
      console.error('on', eventsOrListener, listener);
      if (listener) {
        if (typeof eventsOrListener === 'string') {
          eventsOrListener = [eventsOrListener];
        }

        for (const event of eventsOrListener as string[]) {
          if (!emitter.events[event]) {
            emitter.events[event] = [];
          }

          emitter.events[event].push(listener);
        }
        return;
      }

      emitter.any.push(eventsOrListener as (_) => void);
    },
    once: (eventsOrListener: string[] | string | (() => void), listener?: (client_id) => void) => {
      console.error('once', eventsOrListener, listener);
      if (listener) {
        if (typeof eventsOrListener === 'string') {
          eventsOrListener = [eventsOrListener];
        }

        for (const event of eventsOrListener as string[]) {
          if (!emitter.eventsOnce[event]) {
            emitter.eventsOnce[event] = [];
          }

          emitter.eventsOnce[event].push(listener);
        }
        return;
      }

      emitter.anyOnce.push(eventsOrListener as (_) => void);
    },
    emit: (event: string, arg: unknown) => {
      console.error('emit', event, arg);
      console.error('events for event', emitter.events[event], emitter.eventsOnce[event], emitter.any, emitter.anyOnce);
      if (emitter.events[event]) {
        emitter.events[event].forEach((element) => {
          element(arg);
        });
      }

      for (const listener of emitter.any) {
        listener(arg);
      }

      if (emitter.eventsOnce[event]) {
        emitter.eventsOnce[event].forEach((element) => {
          element(arg);
        });
        emitter.eventsOnce[event] = [];
      }

      for (const listener of emitter.anyOnce) {
        listener(arg);
      }
      emitter.anyOnce = [];
    },
    any: [] as anyType,
    events: {} as eventType,
    anyOnce: [] as anyType,
    eventsOnce: {} as eventType,
  };

  return emitter;
}

function createMockChannel(name: string) {
  const mock = {
    name,
    attach: methodReturningVoidPromise,
    detach: methodReturningVoidPromise,
    presence: createMockPresence(),
    subscribe: methodReturningVoidPromise,
    unsubscribe: methodReturningVoidPromise,
    on: (eventsOrListener: string[] | (() => void), listener?: (client_id) => void) => {
      mock.attachmentStateEmitter.on(eventsOrListener, listener);
    },
    once: (eventsOrListener: string[] | (() => void), listener?: (client_id) => void) => {
      mock.attachmentStateEmitter.once(eventsOrListener, listener);
    },
    emit: (event: string, arg: unknown) => {
      mock.attachmentStateEmitter.emit(event, arg);
    },
    publish: () => {},
    subscriptions: createMockEmitter(),
    setOptions: methodReturningVoidPromise,
    whenState: methodReturningVoidPromise,
    properties: {
      attachSerial: '',
      channelSerial: '',
    },
    state: 'initialized',
    attachmentStateEmitter: createMockEmitter(),
    errorReason: new Ably.ErrorInfo('error', 500, 50000),
  };
  return mock;
}

function createMockConnection() {
  return {
    state: 'connected',
    errorReason: new Ably.ErrorInfo('error', 500, 50000),
    on: methodReturningVoid,
  };
}

class MockRealtime {
  public channels: {
    get: (name: string) => ReturnType<typeof createMockChannel>;
  };
  public auth: {
    clientId: string;
    requestToken(): void;
  };
  public connection: ReturnType<typeof createMockConnection>;

  public time() {}

  constructor(data) {
    const client_id = data.clientId || MOCK_CLIENT_ID;

    const channelMap = new Map<string, ReturnType<typeof createMockChannel>>();

    this.channels = {
      get: (name: string): ReturnType<typeof createMockChannel> => {
        const existing = channelMap.get(name);
        if (existing) {
          return existing;
        }

        const newChannel = createMockChannel(name);
        channelMap.set(name, newChannel);
        return newChannel;
      },
    };
    this.auth = {
      clientId: client_id,
      requestToken: () => {},
    };
    this.connection = createMockConnection();

    this.options = {};
  }
}

class MockErrorInfo extends Ably.ErrorInfo {}

export { MockErrorInfo as ErrorInfo, MockRealtime as Realtime };

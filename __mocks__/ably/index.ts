import * as Ably from 'ably';

const MOCK_CLIENT_ID = 'MOCK_CLIENT_ID';

const mockPromisify = <T>(expectedReturnValue: T): Promise<T> =>
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

type anyType = ((arg: unknown) => void)[];
type eventType = { [event: string]: ((arg: unknown) => void)[] };

function createMockEmitter() {
  const emitter = {
    on: (eventsOrListener: string[] | string | ((arg: unknown) => void), listener?: (arg: unknown) => void) => {
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

      emitter.any.push(eventsOrListener as (arg: unknown) => void);
    },
    once: (eventsOrListener: string[] | string | ((arg: unknown) => void), listener?: (arg: unknown) => void) => {
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

      emitter.anyOnce.push(eventsOrListener as (arg: unknown) => void);
    },
    emit: (event: string, arg: unknown) => {
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
    off: (eventsOrListener: string[] | string | ((arg: unknown) => void), listener?: (arg: unknown) => void) => {
      if (listener) {
        if (typeof eventsOrListener === 'string') {
          eventsOrListener = [eventsOrListener];
        }

        for (const event of eventsOrListener as string[]) {
          if (emitter.events[event]) {
            emitter.events[event] = emitter.events[event].filter((l) => l !== listener);
          }
          if (emitter.eventsOnce[event]) {
            emitter.eventsOnce[event] = emitter.eventsOnce[event].filter((l) => l !== listener);
          }
        }
        return;
      }

      // Remove from any
      emitter.any = emitter.any.filter((l) => l !== eventsOrListener);
      emitter.anyOnce = emitter.anyOnce.filter((l) => l !== eventsOrListener);
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
    on: (eventsOrListener: string[] | string | ((arg: unknown) => void), listener?: (arg: unknown) => void) => {
      mock.attachmentStateEmitter.on(eventsOrListener, listener);
    },
    once: (eventsOrListener: string[] | string | ((arg: unknown) => void), listener?: (arg: unknown) => void) => {
      mock.attachmentStateEmitter.once(eventsOrListener, listener);
    },
    emit: (event: string, arg: unknown) => {
      mock.attachmentStateEmitter.emit(event, arg);
    },
    off: (eventsOrListener: string[] | string | ((arg: unknown) => void), listener?: (arg: unknown) => void) => {
      mock.attachmentStateEmitter.off(eventsOrListener, listener);
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
    release: (id: string) => void;
  };
  public auth: {
    clientId: string;
    requestToken(): void;
  };
  public connection: ReturnType<typeof createMockConnection>;
  private options: {
    agents?: Record<string, string | undefined>;
  };

  public time() {}

  constructor(data: { clientId?: string }) {
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
      release: (id: string) => {
        channelMap.delete(id);
      },
    };
    this.auth = {
      clientId: client_id,
      requestToken: () => {},
    };

    this.options = {
      agents: {},
    };

    this.connection = createMockConnection();
  }

  public request() {}
}

class MockErrorInfo extends Ably.ErrorInfo {}

export { MockErrorInfo as ErrorInfo, MockRealtime as Realtime };

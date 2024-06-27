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
    subscriptions: {
      once: (_: unknown, fn: () => void) => {
        fn();
      },
    },
    subscribe: methodReturningVoidPromise,
    unsubscribe: methodReturningVoidPromise,
  };
}

function createMockEmitter() {
  return {
    any: [],
    events: {},
    anyOnce: [],
    eventsOnce: {},
  };
}

function createMockChannel(name: string) {
  return {
    name,
    attach: methodReturningVoidPromise,
    detach: methodReturningVoidPromise,
    presence: createMockPresence(),
    subscribe: methodReturningVoidPromise,
    unsubscribe: methodReturningVoidPromise,
    on: () => {},
    off: () => {},
    publish: () => {},
    subscriptions: createMockEmitter(),
    setOptions: methodReturningVoidPromise,
    whenState: methodReturningVoidPromise,
    properties: {
      attachSerial: '',
      channelSerial: '',
    },
    state: 'attached',
    errorReason: new Ably.ErrorInfo('error', 500, 50000),
  };
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

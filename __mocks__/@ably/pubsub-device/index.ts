import * as Ably from '@ably/pubsub-core';

const MOCK_CLIENT_ID = 'MOCK_CLIENT_ID';

const mockPromisify = <T>(expectedReturnValue: T): Promise<T> =>
  new Promise((resolve) => {
    resolve(expectedReturnValue);
  });
const methodReturningVoidPromise = () => mockPromisify<void>((() => {})());
const methodReturningVoid = () => {};

function createMockPresence() {
  const mock = {
    get: () => mockPromisify<Ably.PresenceMessage[]>([]),
    update: () => mockPromisify<void>(undefined),
    enterClient: methodReturningVoidPromise,
    leaveClient: methodReturningVoidPromise,
    updateClient: methodReturningVoidPromise,
    enter: methodReturningVoidPromise,
    leave: methodReturningVoidPromise,
    subscriptions: createMockEmitter(),
    subscribe: async (...args: any[]) => {
      mock.subscriptions.on(...args);
    },
    unsubscribe: methodReturningVoidPromise,
  };
  return mock;
}

function createMockAnnotations() {
  const mock = {
    publish: (messageSerial: string, type: string, data: string | ArrayBuffer | Uint8Array) =>
      mockPromisify<void>(undefined),
    delete: (messageSerial: string, type: string, data: string | ArrayBuffer | Uint8Array) =>
      mockPromisify<void>(undefined),
    subscriptions: createMockEmitter(),
    subscribe: async (...args: any[]) => {
      mock.subscriptions.on(...args);
    },
    unsubscribe: methodReturningVoidPromise,
  };
  return mock;
}

type anyType = ((arg: unknown) => void)[];
type eventType = { [event: string]: ((arg: unknown) => void)[] };

function createMockEmitter() {
  return new Ably.EventEmitter();
}

function createMockChannel(name: string) {
  const mock = {
    name,
    attach: methodReturningVoidPromise,
    detach: methodReturningVoidPromise,
    presence: createMockPresence(),
    annotations: createMockAnnotations(),
    subscribe: async (...args: any[]) => {
      mock.subscriptions.on(...args);
      return Promise.resolve();
    },
    unsubscribe: async (...args: any[]) => {
      mock.subscriptions.off(...args);
    },
    on: (...args: any[]) => {
      mock.attachmentStateEmitter.on(...args);
    },
    once: (...args: any[]) => {
      mock.attachmentStateEmitter.once(...args);
    },
    emit: (event: string, arg: unknown) => {
      mock.attachmentStateEmitter.emit(event, arg);
    },
    off: (...args: any[]) => {
      mock.attachmentStateEmitter.off(...args);
    },
    publish: () => mockPromisify({ serials: [] }),
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
  const mock = {
    state: 'connected',
    errorReason: new Ably.ErrorInfo('error', 500, 50000),
    on: (...args: any[]) => {
      mock.eventEmitter.on(...args);
    },
    off: (...args: any[]) => {
      mock.eventEmitter.off(...args);
    },
    eventEmitter: createMockEmitter(),
    listeners: [],
  };
  return mock;
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

const createClient = (options: Ably.ClientOptions | string): Ably.PubSubRealtimeClient =>
  new MockRealtime(typeof options === 'string' ? {} : options) as unknown as Ably.PubSubRealtimeClient;

const ErrorInfo = Ably.ErrorInfo;

export { createClient, ErrorInfo };

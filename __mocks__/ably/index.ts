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
  return new (Ably.Realtime as any).EventEmitter();
}

function createMockChannel(name: string) {
  const mock = {
    name,
    attach: methodReturningVoidPromise,
    detach: methodReturningVoidPromise,
    presence: createMockPresence(),
    subscribe: methodReturningVoidPromise,
    unsubscribe: methodReturningVoidPromise,
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

  static EventEmitter = (Ably.Realtime as any).EventEmitter;
}

class MockErrorInfo extends Ably.ErrorInfo {}

export { MockErrorInfo as ErrorInfo, MockRealtime as Realtime };

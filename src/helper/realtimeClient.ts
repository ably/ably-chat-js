import * as Ably from 'ably';

const defaultTestClientId = 'ably-chat-js-client-id';

// Create a realtime client with the given options, or Sandbox defaults if not specified,
// and return it.
const ablyRealtimeClient = (options?: Ably.ClientOptions): Ably.Realtime => {
  options = options || {};

  options.clientId = options.clientId || defaultTestClientId;
  options.environment = options.environment || 'sandbox';
  options.key = options.key || process.env.testAblyApiKey;

  return new Ably.Realtime(options);
};

export { ablyRealtimeClient, defaultTestClientId };

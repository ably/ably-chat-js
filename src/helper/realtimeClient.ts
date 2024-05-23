import * as Ably from 'ably';
import * as jwt from 'jsonwebtoken';

const defaultTestClientId = 'ably-chat-js-client-id';

const baseOptions = (options?: Ably.ClientOptions): Ably.ClientOptions => {
  options = options || {};
  options.clientId = options.clientId || defaultTestClientId;
  options.environment = options.environment || 'sandbox';
  options.key = options.key || process.env.testAblyApiKey;
  // TODO: Support non-JSON protocol
  options.useBinaryProtocol = false;
  options.logHandler = options.logHandler || ((msg) => console.log(msg));
  return options;
};

// Create a realtime client with the given options, or Sandbox defaults if not specified,
// and return it.
const ablyRealtimeClient = (options?: Ably.ClientOptions): Ably.Realtime => {
  return new Ably.Realtime(baseOptions(options));
};

// At the moment, chat doesn't support keys for authentication, so create a client that uses tokens
const ablyRealtimeClientWithToken = (options?: Ably.ClientOptions): Ably.Realtime => {
  options = baseOptions(options);
  const [keyId, keySecret] = options!.key!.split(':');
  options.useTokenAuth = true;

  // Generate the token
  // It's valid for 1 hour and has access to all channels and chat rooms
  var header = {
    typ: 'JWT',
    alg: 'HS256',
    kid: keyId,
  };
  var currentTime = Math.round(Date.now() / 1000);
  var claims = {
    iat: currentTime,
    exp: currentTime + 3600,
    'x-ably-capability': '{"*":["*"], "[chat]*":["*"]}',
    'x-ably-clientId': options.clientId,
  };

  const token = jwt.sign(claims, keySecret, { header: header });
  options.token = token;

  return ablyRealtimeClient(options);
};

export { ablyRealtimeClient, ablyRealtimeClientWithToken, defaultTestClientId };

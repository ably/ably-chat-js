import * as Ably from 'ably';
import * as jwt from 'jsonwebtoken';

import { ablyApiKey, isLocalEnvironment, testEnvironment } from './environment.js';
import { randomClientId } from './identifier.js';

const baseOptions = (options?: Ably.ClientOptions): Ably.ClientOptions => {
  options = options ?? {};
  options.clientId = options.clientId ?? randomClientId();
  options.environment = options.environment ?? testEnvironment();
  options.key = options.key ?? ablyApiKey();
  options.useBinaryProtocol = options.useBinaryProtocol ?? false;
  options.logHandler =
    options.logHandler ??
    ((msg) => {
      console.error(msg);
    });
  options.logLevel = options.logLevel ?? 1; // error

  if (isLocalEnvironment()) {
    options.port = 8081;
    options.tls = false;
  }

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

  if (!options.key) {
    throw new Error('key must be provided when using tokens');
  }

  const [keyId, keySecret] = options.key.split(':');
  if (!keyId || !keySecret) {
    throw new Error('key must be in the format "keyId:key');
  }

  options.useTokenAuth = true;

  // Generate the token
  // It's valid for 1 hour and has access to all channels and chat rooms
  const header = {
    typ: 'JWT',
    alg: 'HS256',
    kid: keyId,
  };
  const currentTime = Math.round(Date.now() / 1000);
  const claims = {
    iat: currentTime,
    exp: currentTime + 3600,
    'x-ably-capability': '{"[chat]*":["*"]}',
    'x-ably-clientId': options.clientId,
  };

  options.token = jwt.sign(claims, keySecret, { header: header });

  return ablyRealtimeClient(options);
};

export { ablyRealtimeClient, ablyRealtimeClientWithToken };

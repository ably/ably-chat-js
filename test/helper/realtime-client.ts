import * as Ably from 'ably';
import * as jwt from 'jsonwebtoken';

import { ablyApiKey, isLocalEnvironment, testEndpoint } from './environment.js';
import { randomClientId } from './identifier.js';

const baseOptions = (options?: Ably.ClientOptions): Ably.ClientOptions => {
  options = options ?? {};
  options.clientId = options.clientId ?? randomClientId();
  options.endpoint = options.endpoint ?? testEndpoint();
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
const ablyRealtimeClient = (options?: Ably.ClientOptions): Ably.Realtime => new Ably.Realtime(baseOptions(options));

// At the moment, chat doesn't support keys for authentication, so create a client that uses tokens
const ablyRealtimeClientWithToken = (
  options?: Ably.ClientOptions,
  extraClaims?: Record<string, string>,
): Ably.Realtime => {
  options = baseOptions(options);

  if (!options.key) {
    throw new Error('key must be provided when using tokens');
  }

  const [keyId, keySecret] = options.key.split(':');
  if (!keyId || !keySecret) {
    throw new Error('key must be in the format "keyId:key');
  }

  const clientId = options.clientId;

  options.authCallback = (
    data: Ably.TokenParams,
    callback: (err: Ably.ErrorInfo | null, token: string | null) => void,
  ) => {
    // Generate the token
    // It's valid for 10 minutes and has access to all chat rooms
    const header = {
      typ: 'JWT',
      alg: 'HS256',
      kid: keyId,
    };
    const currentTime = Math.round(Date.now() / 1000);
    const claims = {
      iat: currentTime,
      exp: currentTime + 600,
      'x-ably-capability': '{"*":["*"]}',
      'x-ably-clientId': clientId,
      ...extraClaims,
    };

    let token: string | null = null;
    let err: Ably.ErrorInfo | null = null;
    try {
      token = jwt.sign(claims, keySecret, { header: header });
    } catch (error: unknown) {
      err = new Ably.ErrorInfo('unable to generate JWT', 40000, 400, error as Error);
    } finally {
      callback(err, token);
    }
  };

  // Strip the clientId, so we get it confirmed from the server
  delete options.clientId;
  delete options.key;

  return new Ably.Realtime(options);
};

export { ablyRealtimeClient, ablyRealtimeClientWithToken };

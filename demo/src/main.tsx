import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Ably from 'ably';
import { ClientOptions } from 'ably';
import { ChatClient, LogLevel } from '@ably/chat';
import { ChatClientProvider } from '@ably/chat/react';
import { nanoid } from 'nanoid';
import App from './App.tsx';
import './index.css';
import { AblyProvider } from 'ably/react';

// Generate a random clientId and remember it for the length of the session, so
// if refreshing the page you still see your own messages as yours.
//
// This also allows users to change their clientId by setting the
// sessionStorage key and we use this in `setClientId()` (see Chat.tsx).
const clientId = (function () {
  const knownClientId = sessionStorage.getItem('ably-chat-demo-clientId');
  if (knownClientId) {
    return knownClientId;
  }
  const newClientId = nanoid();
  sessionStorage.setItem('ably-chat-demo-clientId', newClientId);
  return newClientId;
})();

// This is a config useful for the Ably team to work on new features before they are released.
// In real apps, developers building with the Ably Chat SDK only need to use Ably Production.
const getRealtimeOptions = () => {
  const environment = import.meta?.env?.VITE_ABLY_CHAT_ENV;
  const realtimeOptions: ClientOptions = {
    authUrl: `/api/ably-token-request?clientId=${clientId}`,
    clientId,
  };
  switch (environment) {
    case 'local': {
      console.log('Using local Ably environment');
      realtimeOptions.endpoint = 'local-rest.ably.io';
      realtimeOptions.port = 8081;
      realtimeOptions.tls = false;
      break;
    }
    case 'sandbox':
      console.log('Using sandbox Ably environment');
      realtimeOptions.endpoint = 'nonprod:sandbox';
      break;
    case 'production':
    case undefined:
      console.log('Using production Ably environment');
      realtimeOptions.endpoint = import.meta.env.VITE_ABLY_HOST ?? undefined;
      break;
    default:
      throw new Error(
        `Unknown environment: ${environment}, please set VITE_ABLY_CHAT_ENV to one of 'local', 'sandbox', or 'production'`,
      );
  }
  return realtimeOptions;
};

const getLogLevel = () => {
  const envLogLevel = import.meta?.env?.VITE_ABLY_CHAT_LOG_LEVEL?.toLowerCase();
  switch (envLogLevel) {
    case 'silent':
      return LogLevel.Silent;
    case 'error':
      return LogLevel.Error;
    case 'warn':
      return LogLevel.Warn;
    case 'info':
      return LogLevel.Info;
    case 'debug':
      return LogLevel.Debug;
    case 'trace':
      return LogLevel.Trace;
    default:
      console.log(`Unknown log level: ${envLogLevel}, defaulting to 'info'`);
      return LogLevel.Info;
  }
};

const realtimeClient = new Ably.Realtime(getRealtimeOptions());

const chatClient = new ChatClient(realtimeClient, { logLevel: getLogLevel() });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AblyProvider client={realtimeClient}>
      <ChatClientProvider client={chatClient}>
        <App />
      </ChatClientProvider>
    </AblyProvider>
  </React.StrictMode>,
);

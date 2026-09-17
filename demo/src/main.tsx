import React from 'react';
import ReactDOM from 'react-dom/client';
import { createClient, ClientOptions } from '@ably/pubsub-device';
import { ChatClient, LogLevel } from '@ably/chat';
import { ChatClientProvider } from '@ably/chat/react';
import { nanoid } from 'nanoid';
import App from './App.tsx';
import './index.css';
import { PubSubClientProvider } from '@ably/pubsub-device/react';

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
function getRoomNameFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('room') || 'abcd';
}

const getPubSubOptions = () => {
  const environment = import.meta?.env?.VITE_ABLY_CHAT_ENV;
  const pubsubOptions: ClientOptions = {
    authCallback: async (_params, callback) => {
      try {
        const roomName = getRoomNameFromUrl();
        const response = await fetch(`/api/ably-token-request?clientId=${clientId}&roomName=${roomName}`);
        const token = await response.text();
        callback(null, token);
      } catch (error) {
        callback(error instanceof Error ? error.message : String(error), null);
      }
    },
    clientId,
  };
  switch (environment) {
    case 'local': {
      console.log('Using local Ably environment');
      pubsubOptions.endpoint = 'local-rest.ably.io';
      pubsubOptions.port = 8081;
      pubsubOptions.tls = false;
      break;
    }
    case 'sandbox':
      console.log('Using sandbox Ably environment');
      pubsubOptions.endpoint = 'nonprod:sandbox';
      break;
    case 'production':
    case undefined:
      console.log('Using production Ably environment');
      pubsubOptions.endpoint = import.meta.env.VITE_ABLY_HOST ?? undefined;
      break;
    default:
      throw new Error(
        `Unknown environment: ${environment}, please set VITE_ABLY_CHAT_ENV to one of 'local', 'sandbox', or 'production'`,
      );
  }
  return pubsubOptions;
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

const pubsubClient = createClient(getPubSubOptions());

const chatClient = new ChatClient(pubsubClient, { logLevel: getLogLevel(), idempotentRestPublishing: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PubSubClientProvider client={pubsubClient}>
      <ChatClientProvider client={chatClient}>
        <App />
      </ChatClientProvider>
    </PubSubClientProvider>
  </React.StrictMode>,
);

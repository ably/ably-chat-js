import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Ably from 'ably';
import { ChatClient, LogLevel } from '@ably-labs/chat';
import { nanoid } from 'nanoid';
import App from './App.tsx';
import './index.css';

// generate a random clientId and remember it for the length of the session, so
// if refreshing the page you still see your messages as yours
const clientId = (function () {
  const knownClientId = sessionStorage.getItem('ably-chat-demo-clientId');
  if (knownClientId) {
    return knownClientId;
  }
  const newClientId = nanoid();
  sessionStorage.setItem('ably-chat-demo-clientId', newClientId);
  return newClientId;
})();

// use this for local development with local realtime
//
// const ablyClient = new Ably.Realtime({
//   authUrl: `/api/ably-token-request?clientId=${clientId}`,
//   port: 8081,
//   environment: 'local',
//   tls: false,
//   clientId,
// });

const ablyClient = new Ably.Realtime({
  authUrl: `/api/ably-token-request?clientId=${clientId}`,
  restHost: import.meta?.env?.VITE_ABLY_HOST ? import.meta.env.VITE_ABLY_HOST : undefined,
  realtimeHost: import.meta?.env?.VITE_ABLY_HOST ? import.meta.env.VITE_ABLY_HOST : undefined,
  clientId,
});

const chatClient = new ChatClient(ablyClient, { logLevel: LogLevel.debug });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App client={chatClient} />
  </React.StrictMode>,
);

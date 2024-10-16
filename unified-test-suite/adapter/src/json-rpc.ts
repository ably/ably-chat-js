import { JSONRPCClient, JSONRPCServer } from 'json-rpc-2.0';
import { nanoid } from 'nanoid';
import WebSocket from 'ws';

const webSocket = new WebSocket('ws://localhost:3000');

export const jsonRpc = new JSONRPCServer();

let webSocketReady = false;
let waiterForReadiness: () => void | undefined;

webSocket.on('message', (message) => {
  console.log(`Received: ${message.toString()}`);

  const data = JSON.parse(message.toString());

  if (data.status === 'ready') {
    webSocketReady = true;
    waiterForReadiness?.();
  } else {
    jsonRpc.receive(data).then((jsonRPCResponse) => {
      webSocket.send(JSON.stringify(jsonRPCResponse));
    });
  }
});

webSocket.on('open', () => {
  webSocket.send(JSON.stringify({ role: 'ADAPTER' }));
});

export const waitForConnection = () =>
  new Promise<void>((resolve) => {
    if (webSocketReady) {
      resolve();
    } else {
      waiterForReadiness = resolve;
    }
  });

export const clientRpc = new JSONRPCClient(
  (request) => {
    try {
      webSocket.send(JSON.stringify(request));
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  },
  () => nanoid(),
);

import { buildChatAdapter } from './chat-adapter';
import { jsonRpc, waitForConnection } from './json-rpc';

const main = async () => {
  console.log('Building Chat Adapter');
  buildChatAdapter(jsonRpc);
  console.log('Waiting for ws');
  await waitForConnection();
  console.log('Connected to ws');
};

main();

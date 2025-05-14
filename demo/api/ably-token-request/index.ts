import * as dotenv from 'dotenv';
import * as Ably from 'ably';
import { HandlerEvent } from '@netlify/functions';

dotenv.config();

export async function handler(event: HandlerEvent) {
  if (!process.env.VITE_ABLY_CHAT_API_KEY) {
    console.error(`
Missing VITE_ABLY_CHAT_API_KEY environment variable.
If you're running locally, please ensure you have a ./.env file with a value for VITE_ABLY_CHAT_API_KEY=your-key.
If you're running in Netlify, make sure you've configured env variable VITE_ABLY_CHAT_API_KEY.

Please see README.md for more details on configuring your Ably API Key.`);

    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify('VITE_ABLY_CHAT_API_KEY is not set'),
    };
  }

  const clientId = event.queryStringParameters?.['clientId'] || process.env.DEFAULT_CLIENT_ID || 'NO_CLIENT_ID';
  const client = new Ably.Rest({
    key: process.env.VITE_ABLY_CHAT_API_KEY,
    restHost: process.env.VITE_ABLY_HOST,
    realtimeHost: process.env.VITE_ABLY_HOST,
  });
  const tokenRequestData = await client.auth.createTokenRequest({
    capability: {
      '[chat]*': ['*'],
    },
    clientId: clientId,
  });

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(tokenRequestData),
  };
}

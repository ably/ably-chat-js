import * as dotenv from 'dotenv';
import * as jwt from 'jsonwebtoken';
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

  // Parse API key to extract key name and secret
  const apiKey = process.env.VITE_ABLY_CHAT_API_KEY;
  const [keyName, keySecret] = apiKey.split(':');

  if (!keySecret) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify('Invalid API key format'),
    };
  }

  // Create JWT token with Ably claims
  const currentTime = Math.floor(Date.now() / 1000);
  const claims = {
    'x-ably-capability': JSON.stringify({ '[chat]*': ['*'] }),
    'x-ably-clientId': clientId,
    iat: currentTime,
    exp: currentTime + 3600, // Token valid for 1 hour
  };

  const token = jwt.sign(claims, keySecret, {
    algorithm: 'HS256',
    keyid: keyName,
  });

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/jwt' },
    body: token,
  };
}

import type { IncomingMessage, ServerResponse } from 'http';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import * as url from 'url';

// Load environment variables from .env file
dotenv.config();

/**
 * Handles requests to /api/ably-token-request
 * Generates a JWT token for Ably authentication.
 */
export function handleTokenRequest(req: IncomingMessage, res: ServerResponse): void {
  const apiKey = process.env.VITE_ABLY_CHAT_API_KEY;

  if (!apiKey) {
    console.error(`
Missing VITE_ABLY_CHAT_API_KEY environment variable.
Please ensure you have a ./.env file with a value for VITE_ABLY_CHAT_API_KEY=your-key.

Please see README.md for more details on configuring your Ably API Key.`);

    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify('VITE_ABLY_CHAT_API_KEY is not set'));
    return;
  }

  const parsedUrl = url.parse(req.url || '', true);
  const clientId =
    (parsedUrl.query.clientId as string | undefined) || process.env.DEFAULT_CLIENT_ID || 'NO_CLIENT_ID';

  // Parse API key to extract key name and secret
  const [keyName, keySecret] = apiKey.split(':');

  if (!keySecret) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify('Invalid API key format'));
    return;
  }

  // Create JWT token with Ably claims
  const currentTime = Math.floor(Date.now() / 1000);
  const claims = {
    'x-ably-capability': JSON.stringify({ '*': ['*'] }),
    'x-ably-clientId': clientId,
    iat: currentTime,
    exp: currentTime + 3600, // Token valid for 1 hour
  };

  const token = jwt.sign(claims, keySecret, {
    algorithm: 'HS256',
    keyid: keyName,
  });

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/jwt');
  res.end(token);
}


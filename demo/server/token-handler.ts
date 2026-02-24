import type { IncomingMessage, ServerResponse } from 'http';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import * as url from 'url';

// Load environment variables. We do this on demand.
let mustLoadDotenv = true;
function loadDotenv() {
  if (mustLoadDotenv) {
    mustLoadDotenv = false;
    dotenv.config();
  }
}

const DISPLAY_NAMES = [
  'Alice',
  'Bob',
  'Charlie',
  'Diana',
  'Eve',
  'Frank',
  'Grace',
  'Hank',
  'Iris',
  'Jack',
  'Karen',
  'Leo',
  'Mia',
  'Nick',
  'Olivia',
  'Paul',
  'Quinn',
  'Rosa',
  'Sam',
  'Tina',
  'Uma',
  'Vince',
  'Wendy',
  'Xander',
  'Yara',
];

// Map clientIds to display names so the same client always gets the same name
const clientDisplayNames = new Map<string, string>();

function getDisplayName(clientId: string): string {
  const existing = clientDisplayNames.get(clientId);
  if (existing) {
    return existing;
  }
  const name = DISPLAY_NAMES[Math.floor(Math.random() * DISPLAY_NAMES.length)]!;
  clientDisplayNames.set(clientId, name);
  return name;
}

/**
 * Handles requests to /api/ably-token-request
 * Generates a JWT token for Ably authentication.
 */
export function handleTokenRequest(req: IncomingMessage, res: ServerResponse): void {
  loadDotenv();

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
  const roomName = (parsedUrl.query.roomName as string | undefined) || 'abcd';

  // Parse API key to extract key name and secret
  const [keyName, keySecret] = apiKey.split(':');

  if (!keySecret) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify('Invalid API key format'));
    return;
  }

  const displayName = getDisplayName(clientId);

  // Create JWT token with Ably claims, including a user claim for the room
  const currentTime = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = {
    'x-ably-capability': JSON.stringify({ '*': ['*'] }),
    'x-ably-clientId': clientId,
    [`ably.room.${roomName}`]: JSON.stringify({ display_name: displayName }),
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


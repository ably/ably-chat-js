import * as Ably from 'ably';
import { Reaction } from './reaction.js';
export declare function parseReaction(message: Ably.InboundMessage, clientId?: string): Reaction;

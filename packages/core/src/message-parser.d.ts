import * as Ably from 'ably';
import { Message } from './message.js';
export declare function parseMessage(roomId: string | undefined, inboundMessage: Ably.InboundMessage): Message;

import { LRUCache } from 'lru-cache';
import { Message } from '../entities.js';

type MessageCache = LRUCache<string, Message, unknown>;

export { type MessageCache };

export const CACHE_SIZE = 100;

export const initMessageCache: () => MessageCache = () => {
  return new LRUCache({
    max: CACHE_SIZE,
  });
};

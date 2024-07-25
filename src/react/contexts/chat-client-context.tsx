import { ChatClient } from '@ably/chat';
import React from 'react';

/**
 * Context key to handle global context for Ably Chat Client.
 * Only a single instance of Ably Chat context should exist to avoid issues resulted from multiple identical contexts,
 * e.g., a Chat Client instance added in one context, and then attempted to retrieve it from a different context.
 *
 */
const contextKey = Symbol.for('__ABLY_CHAT_CLIENT_CONTEXT__');

/**
 * Extends GlobalThis interface with chat context.
 * The chat context is created once and stored in the global state to ensure a single context instance.
 *
 * @property {React.Context<ChatClientContextValue> | undefined} contextKey Ably Chat client context.
 */
interface GlobalThis {
  [contextKey]?: React.Context<ChatClientContextValue>;
}

/**
 * Object to encapsulate global context. Uses `globalThis` if defined.
 * Protects against creating multiple instances of the context due to misconfigurations
 * in module bundler or package manager configurations.
 *
 */
const globalObjectForContext: GlobalThis = typeof globalThis === 'undefined' ? {} : (globalThis as GlobalThis);

/**
 * Props for a chat client context provider.
 */
export interface ChatClientContextProviderProps {
  /**
   Instance of the {@link ChatClient}
   */
  client: ChatClient;
}

/**
 * Record of provider props for each chat client context provider, indexed by provider id.
 *
 */
export type ChatClientContextValue = Record<string, ChatClientContextProviderProps>;

/**
 * Returns a chat client context.
 * Retrieve the context from the global object if initialized,
 * else, initialize and store the context in the global object.
 *
 * @return {React.Context<ChatClientContextValue>} Global context for ChatClient.
 *
 */
function getChatContext(): React.Context<ChatClientContextValue> {
  let context = globalObjectForContext[contextKey];
  if (!context) {
    context = globalObjectForContext[contextKey] = React.createContext<ChatClientContextValue>({});
  }

  return context;
}

/**
 * Global context for ChatClientProvider.
 * Access point for ChatClient context in the application.
 *
 * @type {React.Context<ChatClientContextValue>}
 */
export const ChatClientContext: React.Context<ChatClientContextValue> = getChatContext();

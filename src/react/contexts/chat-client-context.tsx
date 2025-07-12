import React from 'react';

import { ChatClient } from '../../core/chat-client.js';

/**
 * The Context key to handle global context for the {@link ChatClient}.
 * Only a single instance the {@link ChatClientContext} should exist to avoid issues resulting from multiple identical contexts,
 * e.g., a {@link ChatClient} instance added in one context, and then attempting to retrieve it from a different context.
 *
 */
const contextKey = Symbol.for('__ABLY_CHAT_CLIENT_CONTEXT__');

/**
 * Extends GlobalThis interface with chat context.
 * The {@link ChatClientContext} is created once and stored in the global state to ensure a single context instance.
 * contextKey Ably Chat client context.
 */
interface GlobalThis {
  [contextKey]?: React.Context<ChatClientContextValue>;
}

/**
 * Object to encapsulate global context.
 * Uses {@link GlobalThis} if defined.
 * Protects against creating multiple instances of the {@link ChatClientContext} due to misconfigurations
 * in the module bundler or package manager configurations.
 *
 */
const globalObjectForContext: GlobalThis = typeof globalThis === 'undefined' ? {} : (globalThis as GlobalThis);

/**
 * Props for the chat client context provider.
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
 * Returns a {@link ChatClientContext}.
 * Retrieve the context from the global object if initialized,
 * else, initialize and store the context in the global object.
 * @returns Global context for {@link ChatClient}.
 */
const getChatContext = (): React.Context<ChatClientContextValue> => {
  let context = globalObjectForContext[contextKey];

  context ??= globalObjectForContext[contextKey] = React.createContext<ChatClientContextValue>({});

  return context;
};

/**
 * Global context for {@link ChatClientProvider}.
 * Access point for {@link ChatClient} context in the application.
 */
export const ChatClientContext: React.Context<ChatClientContextValue> = getChatContext();

import { ChatClient } from '@ably/chat';
import * as React from 'react';
import { ReactNode } from 'react';

import { ChatClientContext, ChatClientContextValue } from '../contexts/chat-client-context.js';

/**
 * The default identifier for the chat client context.
 */
export const DEFAULT_CHAT_CLIENT_ID = 'default';

/**
 * Props for the ChatClientProvider component.
 */
export interface ChatClientProviderProps {
  /**
   * The child components to be rendered within this provider.
   */
  children?: ReactNode | ReactNode[] | null;

  /**
   * An instance of the chat client to be used in the provider.
   */
  client: ChatClient;
}

/**
 * Returns a React component that provides a `ChatClient` in a React context to the component subtree.
 * Updates the context value when the `ChatClient` prop changes.
 *
 * @param {ChatClientProviderProps} props - The props for the ChatClientProvider component.
 *
 * @returns {ChatClientProvider} component.
 */
export const ChatClientProvider = ({ children, client }: ChatClientProviderProps) => {
  const context = React.useContext(ChatClientContext);
  const value: ChatClientContextValue = React.useMemo(() => {
    // Set the internal useReact option to true to enable React-specific agent.
    client.addReactAgent();
    return { ...context, [DEFAULT_CHAT_CLIENT_ID]: { client: client } };
  }, [client, context]);

  return <ChatClientContext.Provider value={value}>{children}</ChatClientContext.Provider>;
};

import * as React from 'react';
import { ReactNode } from 'react';

import { ChatClient } from '../../core/chat.js';
import { ChatClientContext, ChatClientContextValue } from '../contexts/chat-client-context.js';

/**
 * The default identifier for the {@link ChatClientContext}.
 */
export const DEFAULT_CHAT_CLIENT_ID = 'default';

/**
 * Props for the {@link ChatClientProvider} component.
 */
export interface ChatClientProviderProps {
  /**
   * The child components to be rendered within this provider.
   */
  children?: ReactNode | ReactNode[] | null;

  /**
   * An instance of the {@link ChatClient} to be used in the provider.
   */
  client: ChatClient;
}

/**
 * Returns a React component that provides a {@link ChatClient} in a React context to the component subtree.
 * Updates the context value when the client prop changes.
 *
 * @param {ChatClientProviderProps} props - The props for the {@link ChatClientProvider} component.
 *
 * @returns {ChatClientProvider} component.
 */
export const ChatClientProvider = ({ children, client }: ChatClientProviderProps) => {
  const context = React.useContext(ChatClientContext);

  const value: ChatClientContextValue = React.useMemo(() => {
    (client as unknown as { addReactAgent(): void }).addReactAgent();

    const uiKitVersion = globalThis.__ABLY_CHAT_REACT_UI_COMPONENTS_VERSION__;
    if (typeof uiKitVersion === 'string') {
      (
        client as unknown as {
          addAgentWithVersion(agent: string, version: string): void;
        }
      ).addAgentWithVersion('chat-ui-kit', uiKitVersion);
    }

    return { ...context, [DEFAULT_CHAT_CLIENT_ID]: { client: client } };
  }, [client, context]);

  return <ChatClientContext.Provider value={value}>{children}</ChatClientContext.Provider>;
};

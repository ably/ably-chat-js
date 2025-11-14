// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as Ably from 'ably';
import * as React from 'react';
import { ReactNode, useRef } from 'react';

import { ChatClient } from '../../core/chat-client.js';
import { Logger } from '../../core/logger.js';
import { ChatClientContext } from '../contexts/chat-client-context.js';
import { RoomReferenceManager } from '../helper/room-reference-manager.js';
import {
  ExtendedChatClientContextValue,
  ROOM_REFERENCE_MANAGER_KEY,
} from '../hooks/internal/use-room-reference-manager.js';

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
 * The provider manages room reference counting internally and will only detach rooms when no more references exist.
 *
 * **Important**: The `client` prop should be memoized to prevent unnecessary context updates.
 * Ideally, create the {@link ChatClient} and its underlying {@link Ably.Realtime} client outside
 * of React components to avoid duplicate connections and ensure stable references.
 *
 * **Note**: All chat-related hooks must be used within this provider's component tree.
 * @param props - The props for the {@link ChatClientProvider} component
 * @param props.children - The child components to be rendered within this provider.
 * @param props.client - An instance of the {@link ChatClient} to be used in the provider
 * @returns A React element that provides the chat client context to its children
 * @example
 * ```tsx
 * import * as Ably from 'ably';
 * import React, { useMemo } from 'react';
 * import { ChatClient } from '@ably/chat';
 * import { ChatClientProvider, useChatClient } from '@ably/chat/react';
 *
 * // Child component that uses chat functionality
 * const ChatComponent = () => {
 *   const { clientId } = useChatClient();
 *   return <div>Connected as: {clientId}</div>;
 * };
 *
 * const chatClient: ChatClient; // existing ChatClient instance
 *
 * // Main app component with provider
 * const App = () => {
 *   return (
 *     <ChatClientProvider client={chatClient}>
 *         <ChatComponent />
 *     </ChatClientProvider>
 *   );
 * };
 *
 * export default App;
 * ```
 */
export const ChatClientProvider = ({ children, client }: ChatClientProviderProps) => {
  const context = React.useContext(ChatClientContext);
  const roomReferenceManagerRef = useRef<RoomReferenceManager | undefined>(undefined);

  const value: ExtendedChatClientContextValue = React.useMemo(() => {
    // Set the internal useReact option to true to enable React-specific agent.
    (client as unknown as { addReactAgent(): void }).addReactAgent();

    // Create or update the room reference manager
    if (roomReferenceManagerRef.current?.client !== client) {
      const clientLogger = (client as unknown as { logger: Logger }).logger;
      roomReferenceManagerRef.current = new RoomReferenceManager(client, clientLogger);
    }

    // Add the agent for the UI kit
    const uiKitVersion = globalThis.__ABLY_CHAT_REACT_UI_KIT_VERSION__;
    if (typeof uiKitVersion === 'string') {
      (
        client as unknown as {
          addAgentWithVersion(agent: string, version: string): void;
        }
      ).addAgentWithVersion('chat-react-ui-kit', uiKitVersion);
    }

    return {
      ...context,
      [DEFAULT_CHAT_CLIENT_ID]: { client: client },
      [ROOM_REFERENCE_MANAGER_KEY]: roomReferenceManagerRef.current,
    };
  }, [client, context]);

  return <ChatClientContext.Provider value={value}>{children}</ChatClientContext.Provider>;
};

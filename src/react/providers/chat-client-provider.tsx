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
 * **Important**: The `client` should be memoized to prevent unnecessary context updates. Ideally, the {@link ChatClient}
 * and its underlying Ably.Realtime client should be created outside of React components to avoid duplicate connections.
 * @example
 * ```tsx
 * import * as Ably from 'ably';
 * import { ChatClient } from '@ably/chat';
 * import { ChatClientProvider } from '@ably/chat/react';
 *
 * // Create client outside React to avoid recreating on re-renders
 * const realtime = new Ably.Realtime({ key: 'your-api-key', clientId: 'user-123' });
 * const chatClient = new ChatClient(realtime);
 *
 * const App = () => {
 *   return (
 *     <ChatClientProvider client={chatClient}>
 *       <MyChatApp />
 *     </ChatClientProvider>
 *   );
 * };
 * ```
 * @param props - The props for the {@link ChatClientProvider} component.
 * @param props.children The child components to render.
 * @param props.client The chat client instance to provide in context.
 * @returns A React element that provides the chat client context to its children.
 */
export const ChatClientProvider = ({ children, client }: ChatClientProviderProps) => {
  const context = React.useContext(ChatClientContext);
  const roomReferenceManagerRef = useRef<RoomReferenceManager | undefined>(undefined);

  const value: ExtendedChatClientContextValue = React.useMemo(() => {
    // Set the internal useReact option to true to enable React-specific agent.
    (client as unknown as { addReactAgent(): void }).addReactAgent();

    // Create or update the room reference manager
    if (!roomReferenceManagerRef.current || roomReferenceManagerRef.current.client !== client) {
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

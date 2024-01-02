import { FC } from 'react';
import { Chat as ChatSdk } from '@ably-labs/chat';
import { ConversationProvider } from './containers/ConversationContext';
import { Chat } from './containers/Chat';

interface AppProps {
  client: ChatSdk;
}
const App: FC<AppProps> = ({ client }) => (
  <ConversationProvider
    client={client}
    conversationId="conversation1"
  >
    <Chat />
  </ConversationProvider>
);

export default App;

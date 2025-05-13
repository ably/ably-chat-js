import { FC } from 'react';
import { useChatClient, useTyping } from '@ably/chat/react';

interface TypingIndicatorPanelProps {}

export const TypingIndicatorPanel: FC<TypingIndicatorPanelProps> = () => {
  const chatClient = useChatClient();
  const clientId = chatClient.clientId;
  const { currentlyTyping } = useTyping();

  // Filter out the current user from the list of typing users
  const otherTypingUsers = Array.from(currentlyTyping).filter((client) => client !== clientId);

  return (
    <div className="h-6 px-2 pt-2">
      {otherTypingUsers.length > 0 && (
        <p className="text-sm text-gray-700 overflow-hidden">
          {otherTypingUsers.join(', ')} {otherTypingUsers.length > 1 ? 'are' : 'is'} typing...
        </p>
      )}
    </div>
  );
};

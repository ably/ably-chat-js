import { FC } from 'react';
import { useChatClient, useTyping } from '@ably/chat/react';

interface TypingIndicatorPanelProps {}

export const TypingIndicatorPanel: FC<TypingIndicatorPanelProps> = () => {
  const chatClient = useChatClient();
  const clientId = chatClient.clientId;
  const { currentlyTyping } = useTyping();

  return (
    <div className="h-6 px-2 pt-2">
      {currentlyTyping.size > 0 && (
        <p className="text-sm text-gray-700 overflow-hidden">
          {Array.from(currentlyTyping).filter((client) => client !== clientId).join(', ')}
          {' '}
          {currentlyTyping.size > 1 ? 'are' : 'is'} typing...
        </p>
      )}
    </div>
  );
};

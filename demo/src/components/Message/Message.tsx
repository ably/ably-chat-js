import React, { ReactNode, useCallback } from 'react';
import clsx from 'clsx';

interface MessageProps {
  id: string;
  self?: boolean;
  children?: ReactNode | undefined;
  onMessageClick?(id: string): void;
}
export const Message: React.FC<MessageProps> = ({ id, self = false, children, onMessageClick }) => {
  const handleMessageClick = useCallback(() => {
    onMessageClick?.(id);
  }, [id, onMessageClick]);

  return (
    <div
      className="chat-message"
      onClick={handleMessageClick}
    >
      <div className={clsx('flex items-end', { ['justify-end']: self, ['justify-start']: !self })}>
        <div
          className={clsx('flex flex-col space-y-2 text max-w-xs mx-2', {
            ['items-end order-1']: self,
            ['items-start order-2']: !self,
          })}
        >
          <div
            className={clsx('px-4 py-2 rounded-lg inline-block', {
              ['rounded-br bg-blue-600 text-white']: self,
              ['rounded-bl justify-start bg-gray-300 text-gray-600']: !self,
            })}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

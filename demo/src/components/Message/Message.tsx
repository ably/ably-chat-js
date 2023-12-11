import React, { ReactNode } from 'react';
import clsx from 'clsx';

interface MessageProps {
  self?: boolean;
  children?: ReactNode | undefined;
}
export const Message: React.FC<MessageProps> = ({ self = false, children }) => {
  return (
    <div className="chat-message">
      <div className={clsx('flex items-end', { ['justify-end']: self, ['justify-start']: !self })}>
        <div
          className={clsx('flex flex-col space-y-2 text-xs max-w-xs mx-2', {
            ['items-end order-1']: self,
            ['items-start order-2']: !self,
          })}
        >
          <div>
            <span
              className={clsx('px-4 py-2 rounded-lg inline-block', {
                ['rounded-br bg-blue-600 text-white']: self,
                ['rounded-bl justify-start bg-gray-300 text-gray-600']: !self,
              })}
            >
              {children}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

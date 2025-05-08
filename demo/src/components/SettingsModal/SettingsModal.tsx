import React, { useState, useEffect, useRef } from 'react';
import { MessageReactionTypeSelector } from '../MessageReactionTypeSelector';
import { FiSettings } from 'react-icons/fi';

interface SettingsModalProps {
  className?: string;
}

// This component is used to display a settings modal for message reactions. Message reactions
// have three types: Unique, Distinct, and Multiple which govern the behavior of how reactions are added to messages.
export const SettingsModal: React.FC<SettingsModalProps> = ({ className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const toggleModal = () => {
    setIsOpen(!isOpen);
  };

  // Close the modal when clicking outside of it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={toggleModal}
        className="p-1 text-gray-600 !bg-green-300 hover:text-blue-500 focus:outline-none"
        title="Reaction Settings"
      >
        <FiSettings className="w-5 h-5" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 flex bg-white items-center justify-center z-50">
          <div
            className="fixed inset-0 bg-white bg-opacity-30"
            onClick={toggleModal}
          ></div>
          <div
            ref={modalRef}
            className="bg-white rounded-lg shadow-xl p-4 w-80 z-50 relative"
          >
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg text-black font-medium">Reaction Settings</h3>
              <button
                onClick={toggleModal}
                className="text-black-500 !bg-grey-500 hover:text-black-700 focus:outline-none"
              >
                ✕
              </button>
            </div>
            <MessageReactionTypeSelector />
          </div>
        </div>
      )}
    </div>
  );
};

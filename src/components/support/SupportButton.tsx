// src/components/support/SupportButton.tsx
import React, { useState, useEffect } from 'react';
import { BugReportModal } from './BugReportModal';
import { SupportService } from './SupportService';
import type { SupportConfig } from './types';

interface SupportButtonProps {
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  config?: SupportConfig;
}

export function SupportButton({ 
  position = 'bottom-right',
  config = { enabled: true, collectSystemInfo: true, allowScreenshots: true, position: 'bottom-right' }
}: SupportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const positionClasses = {
    'bottom-right': 'fixed bottom-6 right-6',
    'bottom-left': 'fixed bottom-6 left-6',
    'top-right': 'fixed top-6 right-6',
    'top-left': 'fixed top-6 left-6'
  };

  useEffect(() => {
    // Auto-abrir se configurado (ex: primeira visita)
    if (config.autoOpen && !localStorage.getItem('support-visited')) {
      setTimeout(() => setIsOpen(true), 2000);
      localStorage.setItem('support-visited', 'true');
    }
  }, [config.autoOpen]);

  if (!config.enabled) return null;

  return (
    <>
      <div className={`${positionClasses[position]} z-50`}>
        {!isMinimized && (
          <button
            onClick={() => setIsOpen(true)}
            className="relative bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-300 group"
            aria-label="Abrir suporte"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            
            {/* Tooltip */}
            <div className="absolute bottom-full mb-2 right-0 bg-gray-900 text-white text-sm px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              Reportar um problema ou sugerir melhoria
              <div className="absolute top-full right-4 w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-gray-900"></div>
            </div>

            {/* Badge de notificação */}
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
        )}

        {/* Botão minimizado */}
        {isMinimized && (
          <button
            onClick={() => setIsMinimized(false)}
            className="bg-gray-600 hover:bg-gray-700 text-white rounded-full p-2 shadow-lg"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}
      </div>

      {/* Modal de Bug Report */}
      <BugReportModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onMinimize={() => {
          setIsMinimized(true);
          setIsOpen(false);
        }}
        config={config}
      />
    </>
  );
}
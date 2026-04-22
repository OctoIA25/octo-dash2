/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Página: Octo Chat
 * Rota: /octo-chat
 * 
 * Integração minimalista com chat externo via iframe
 */

import { useTheme } from '@/hooks/useTheme';

const OCTO_CHAT_URL = 'https://octodash-octo-chat.fltgo5.easypanel.host/';

export const OctoChatPage = () => {
  const { currentTheme } = useTheme();
  const isDarkMode = currentTheme === 'preto' || currentTheme === 'cinza';

  return (
    <div 
      className="h-screen w-full overflow-hidden"
      style={{ backgroundColor: isDarkMode ? 'var(--bg-primary)' : '#ffffff' }}
    >
      <iframe
        src={OCTO_CHAT_URL}
        title="Octo Chat"
        className="w-full h-full border-0"
        allow="microphone; camera; clipboard-read; clipboard-write"
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals"
      />
    </div>
  );
};

export default OctoChatPage;

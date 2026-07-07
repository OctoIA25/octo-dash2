import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { chatPathForPhone } from '../services/chatService';

interface OpenConversationLinkProps {
  phone: string | null | undefined;
  contactName?: string | null;
  className?: string;
}

/**
 * Link "Abrir conversa" do módulo WhatsApp — usado no card do Kanban e no fim
 * das Observações do lead. Não renderiza nada sem telefone válido ou sem a
 * permissão 'chat' (mesmo gating da sidebar/rota).
 */
export function OpenConversationLink({ phone, contactName, className }: OpenConversationLinkProps) {
  const { user } = useAuthContext();
  const path = (user?.sidebarPermissions ?? []).includes('chat')
    ? chatPathForPhone(phone, contactName)
    : null;
  if (!path) return null;
  return (
    <Link
      to={path}
      onClick={(e) => e.stopPropagation()}
      title="Abrir conversa no WhatsApp"
      className={`inline-flex items-center gap-1 shrink-0 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors ${className ?? ''}`}
    >
      <MessageSquare className="h-3 w-3" strokeWidth={2.4} />
      Abrir conversa
    </Link>
  );
}

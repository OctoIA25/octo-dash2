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
/**
 * Caminho do chat para este telefone, ou null quando não há telefone válido ou
 * o usuário não tem a permissão 'chat'. Quem precisa decidir o layout ANTES de
 * renderizar (um campo inteiro no modal, p.ex.) usa o hook; quem só quer o link
 * usa o componente abaixo.
 */
export function useChatPath(phone: string | null | undefined, contactName?: string | null) {
  const { user } = useAuthContext();
  return (user?.sidebarPermissions ?? []).includes('chat')
    ? chatPathForPhone(phone, contactName)
    : null;
}

export function OpenConversationLink({ phone, contactName, className }: OpenConversationLinkProps) {
  const path = useChatPath(phone, contactName);
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

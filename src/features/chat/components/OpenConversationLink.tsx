import { Link } from 'react-router-dom';
import { MessageSquare, Copy, ExternalLink } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
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

/**
 * Campo somente-leitura com a URL da conversa + botão de copiar. Mesmo gating
 * do link acima (sem telefone válido ou sem permissão 'chat', não renderiza).
 * URL absoluta porque o campo existe para ser colado fora do dashboard.
 *
 * `compact` é a versão que cabe no card do Kanban; o padrão é a do modal.
 * O clique não sobe: em ambos os lugares o container abre o modal do lead.
 */
export function ConversationLinkField({
  phone,
  contactName,
  compact = false,
  className,
}: OpenConversationLinkProps & { compact?: boolean }) {
  const path = useChatPath(phone, contactName);
  const { toast } = useToast();
  if (!path) return null;

  const url = `${window.location.origin}${path}`;
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link da conversa copiado' });
    } catch {
      // clipboard bloqueado (contexto inseguro / permissão): mostra para copiar na mão.
      toast({ title: 'Não foi possível copiar', description: url, variant: 'destructive' });
    }
  };

  return (
    <div
      className={`flex items-center gap-1.5 ${className ?? ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <Input
        readOnly
        value={url}
        aria-label="Link da conversa"
        onFocus={(e) => e.currentTarget.select()}
        className={compact ? 'h-6 px-1.5 font-mono text-[10px] select-text' : 'h-8 font-mono text-xs'}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={`shrink-0 ${compact ? 'h-6 w-6' : 'h-8 w-8'}`}
        onClick={copiar}
        title="Copiar link da conversa"
        aria-label="Copiar link da conversa"
      >
        <Copy className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      </Button>
      <Button
        asChild
        variant="outline"
        size="icon"
        className={`shrink-0 ${compact ? 'h-6 w-6' : 'h-8 w-8'}`}
        title="Abrir conversa em nova aba"
      >
        {/* ponytail: <a target="_blank"> em vez de <Link>; o campo existe para
            abrir/colar a URL fora do dashboard, então abre em aba nova. */}
        <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Abrir conversa em nova aba">
          <ExternalLink className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        </a>
      </Button>
    </div>
  );
}

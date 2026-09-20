import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { WHATSAPP_CATEGORIES, categoryLabel, type WhatsappConversation } from '../types';

interface Props {
  conversations: WhatsappConversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
  /** P1.9: leitura por usuário e vínculo com candidato. */
  extras?: Readonly<Record<string, ExtrasDaConversa>>;
  /** Quem está olhando, para o recorte "Meus clientes". */
  meuUserId?: string | null;
  /** Conversas que casaram pela BUSCA NO CONTEÚDO, vindas do servidor. */
  idsPorConteudo?: ReadonlySet<string>;
  /** Avisa o pai quando o termo muda, para ele buscar no conteúdo. */
  onBuscaChange?: (termo: string) => void;
  /** Abre o candidato ligado à conversa. */
  onVerCandidato?: (candidatoId: string) => void;
}

/** 'todas' = sem filtro; 'sem' = conversas ainda não categorizadas. */
export type FiltroCategoria = 'todas' | 'sem' | (typeof WHATSAPP_CATEGORIES)[number]['value'];

const FILTROS: ReadonlyArray<{ value: FiltroCategoria; label: string }> = [
  { value: 'todas', label: 'Todas' },
  ...WHATSAPP_CATEGORIES,
  { value: 'sem', label: 'Sem categoria' },
];

/** O que a lista sabe além da própria conversa (P1.9). */
export interface ExtrasDaConversa {
  /** Quando ESTE usuário leu. Ausente = nunca leu. */
  lidaEm?: string | null;
  /** A conversa é com um candidato a corretor. */
  ehRecrutamento?: boolean;
  candidatoId?: string | null;
  candidatoNome?: string | null;
}

export interface FiltrosDaConversa {
  categoria: FiltroCategoria;
  /** Só as conversas atribuídas a este usuário. */
  meuUserId?: string | null;
  /** Ligar o recorte "Meus clientes". */
  apenasMeus?: boolean;
  /** Ligar o recorte "Não lidas". */
  apenasNaoLidas?: boolean;
  /** Ligar a aba Recrutamento. */
  apenasRecrutamento?: boolean;
  /**
   * Conversas cujo CONTEÚDO casou com a busca, vindas do servidor.
   * `undefined` = não houve busca por conteúdo (termo curto ou ainda
   * carregando); `Set` vazio = houve e não casou nada. A diferença importa:
   * tratar as duas igual esconderia conversas que casam pelo nome.
   */
  idsPorConteudo?: ReadonlySet<string>;
}

/**
 * Uma conversa está NÃO LIDA quando chegou mensagem depois da última vez que
 * ESTE usuário a abriu. Conversa sem mensagem nenhuma nunca é "não lida" —
 * são 1.279 cascas na Lotus, e contá-las encheria o contador de nada.
 */
export function naoLida(c: WhatsappConversation, e?: ExtrasDaConversa): boolean {
  if (!c.last_message_at) return false;
  if (!e?.lidaEm) return true;
  return new Date(c.last_message_at).getTime() > new Date(e.lidaEm).getTime();
}

/**
 * Busca por nome/telefone/conteúdo + recortes da tela. Pura e exportada por
 * ser a única regra que pode ESCONDER uma conversa — por isso tem teste.
 */
export function filtrarConversas(
  conversations: ReadonlyArray<WhatsappConversation>,
  query: string,
  filtros: FiltroCategoria | FiltrosDaConversa,
  extras: Readonly<Record<string, ExtrasDaConversa>> = {},
): WhatsappConversation[] {
  // Assinatura antiga (só a categoria) segue valendo: a tela de integração e
  // os testes existentes a usam, e quebrá-los não faz parte deste item.
  const f: FiltrosDaConversa = typeof filtros === 'string' ? { categoria: filtros } : filtros;
  const q = query.trim().toLowerCase();

  return conversations.filter((c) => {
    const e = extras[c.id];

    if (f.categoria === 'sem' ? c.category != null : f.categoria !== 'todas' && c.category !== f.categoria) {
      return false;
    }
    if (f.apenasRecrutamento && !e?.ehRecrutamento) return false;
    if (f.apenasMeus && (!f.meuUserId || c.assigned_user_id !== f.meuUserId)) return false;
    if (f.apenasNaoLidas && !naoLida(c, e)) return false;

    if (!q) return true;
    const name = (c.contact_name ?? c.contact_profile_name ?? '').toLowerCase();
    if (name.includes(q) || c.contact_phone.toLowerCase().includes(q)) return true;
    // Só dígitos: quem digita "(11) 98888" não acha "5511988887777".
    const digitos = q.replace(/\D/g, '');
    if (digitos.length >= 4 && c.contact_phone.replace(/\D/g, '').includes(digitos)) return true;
    return f.idsPorConteudo?.has(c.id) ?? false;
  });
}

/** Um recorte de ação: liga/desliga, com contador opcional. */
function Recorte({ ligado, onClick, rotulo, contador }: {
  ligado: boolean; onClick: () => void; rotulo: string; contador?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={ligado}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
        ligado
          ? 'border-blue-500 bg-blue-500 text-white'
          : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
      }`}
    >
      {rotulo}
      {contador && (
        <span className={`tabular-nums ${ligado ? 'text-white/80' : 'text-gray-400 dark:text-slate-500'}`}>
          {contador}
        </span>
      )}
    </button>
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function initials(name: string | null, phone: string): string {
  const source = (name ?? phone).trim();
  if (!source) return '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ConversationList({
  conversations, selectedId, onSelect, loading,
  extras = {}, meuUserId, idsPorConteudo, onBuscaChange, onVerCandidato,
}: Props) {
  const [query, setQuery] = useState('');
  const [categoria, setCategoria] = useState<FiltroCategoria>('todas');
  const [apenasMeus, setApenasMeus] = useState(false);
  const [apenasNaoLidas, setApenasNaoLidas] = useState(false);
  const [apenasRecrutamento, setApenasRecrutamento] = useState(false);

  const filtered = useMemo(
    () => filtrarConversas(
      conversations, query,
      { categoria, apenasMeus, meuUserId, apenasNaoLidas, apenasRecrutamento, idsPorConteudo },
      extras,
    ),
    [conversations, query, categoria, apenasMeus, meuUserId, apenasNaoLidas, apenasRecrutamento, idsPorConteudo, extras],
  );

  // O contador conta sobre TODAS as conversas, e não sobre a lista filtrada:
  // um "Não lidas 3" que muda quando se troca de categoria não é contador, é
  // ruído. Acima de 99 vira "99+", como o plano pede.
  const totalNaoLidas = useMemo(
    () => conversations.reduce((n, c) => n + (naoLida(c, extras[c.id]) ? 1 : 0), 0),
    [conversations, extras],
  );
  const totalRecrutamento = useMemo(
    () => conversations.reduce((n, c) => n + (extras[c.id]?.ehRecrutamento ? 1 : 0), 0),
    [conversations, extras],
  );
  const quantidade = (n: number) => (n > 99 ? '99+' : String(n));

  return (
    <div className="flex h-full flex-col border-r" style={{ borderColor: 'var(--border-color, #e5e7eb)' }}>
      <div className="p-3 border-b" style={{ borderColor: 'var(--border-color, #e5e7eb)' }}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); onBuscaChange?.(e.target.value); }}
            placeholder="Nome, telefone ou o que foi dito"
            className="w-full rounded-md border bg-transparent pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            style={{ borderColor: 'var(--border-color, #e5e7eb)' }}
          />
        </div>
        {/* Recortes de ação (P1.9) — separados da etiqueta de propósito: um
            diz DE QUEM é a conversa, o outro diz SOBRE O QUÊ ela é. */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Recorte ligado={apenasMeus} onClick={() => setApenasMeus((v) => !v)} rotulo="Meus clientes" />
          <Recorte
            ligado={apenasNaoLidas}
            onClick={() => setApenasNaoLidas((v) => !v)}
            rotulo="Não lidas"
            contador={totalNaoLidas > 0 ? quantidade(totalNaoLidas) : undefined}
          />
          <Recorte
            ligado={apenasRecrutamento}
            onClick={() => setApenasRecrutamento((v) => !v)}
            rotulo="Recrutamento"
            contador={totalRecrutamento > 0 ? quantidade(totalRecrutamento) : undefined}
          />
        </div>

        {apenasRecrutamento && totalRecrutamento === 0 && (
          // Aba vazia que não se explica parece aba quebrada. Conferido em
          // 20/09/2026: nenhuma das 1.645 conversas da Lotus bate com
          // candidato, e só 2 candidatos têm telefone cadastrado.
          <p className="mt-2 text-[11px] leading-snug text-gray-500 dark:text-slate-400">
            Nenhuma conversa de candidato ainda. A Lia de recrutamento não conversa por este número —
            quando passar a conversar, elas aparecem aqui sozinhas.
          </p>
        )}

        <div className="mt-2 flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setCategoria(f.value)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                categoria === f.value
                  ? 'border-emerald-500 bg-emerald-500 text-white'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && conversations.length === 0 && (
          <div className="p-4 text-sm text-gray-500">Carregando conversas...</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="p-4 text-sm text-gray-500">Nenhuma conversa encontrada.</div>
        )}
        <ul>
          {filtered.map((c) => {
            const displayName = c.contact_name ?? c.contact_profile_name ?? c.contact_phone;
            const isSelected = c.id === selectedId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className={`w-full text-left px-3 py-3 flex items-center gap-3 border-b transition-colors ${
                    isSelected ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'
                  }`}
                  style={{ borderColor: 'var(--border-color, #e5e7eb)' }}
                >
                  <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-emerald-500 text-white text-sm font-medium">
                    {initials(c.contact_name ?? c.contact_profile_name, c.contact_phone)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{displayName}</span>
                      <span className="text-xs text-gray-500">{formatTime(c.last_message_at)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-gray-500">
                        {c.last_message_preview ?? '—'}
                      </span>
                      {c.category && (
                        <span className="flex-none rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-slate-800 dark:text-slate-300">
                          {categoryLabel(c.category)}
                        </span>
                      )}
                      {/* O ponto de não lida é POR USUÁRIO. `unread_count`
                          está em zero nas 1.645 conversas da Lotus — nada o
                          preenche — e um contador único seria errado de
                          qualquer forma: lida pelo gestor não é lida pelo
                          corretor. */}
                      {naoLida(c, extras[c.id]) && (
                        <span
                          className="ml-1 h-2 w-2 flex-none rounded-full bg-emerald-500"
                          role="img"
                          aria-label="não lida"
                          title="Chegou mensagem depois da última vez que você abriu"
                        />
                      )}
                    </div>
                  </div>
                </button>
                {extras[c.id]?.ehRecrutamento && extras[c.id]?.candidatoId && onVerCandidato && (
                  <button
                    type="button"
                    onClick={() => onVerCandidato(extras[c.id]!.candidatoId!)}
                    className="-mt-1 mb-1 ml-[68px] text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Ver candidato{extras[c.id]?.candidatoNome ? `: ${extras[c.id]!.candidatoNome}` : ''}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

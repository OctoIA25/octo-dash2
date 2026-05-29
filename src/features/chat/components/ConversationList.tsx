import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { WhatsappConversation } from '../types';

interface Props {
  conversations: WhatsappConversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
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

export function ConversationList({ conversations, selectedId, onSelect, loading }: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const name = (c.contact_name ?? c.contact_profile_name ?? '').toLowerCase();
      return name.includes(q) || c.contact_phone.toLowerCase().includes(q);
    });
  }, [conversations, query]);

  return (
    <div className="flex h-full flex-col border-r" style={{ borderColor: 'var(--border-color, #e5e7eb)' }}>
      <div className="p-3 border-b" style={{ borderColor: 'var(--border-color, #e5e7eb)' }}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar conversa"
            className="w-full rounded-md border bg-transparent pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            style={{ borderColor: 'var(--border-color, #e5e7eb)' }}
          />
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
                      {c.unread_count > 0 && (
                        <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-500 px-1.5 text-xs font-medium text-white">
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

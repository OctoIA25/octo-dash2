/**
 * Sidebar de histórico de conversas dos agentes de IA.
 *
 * Suporta dois modos:
 *  - "self": lista as próprias conversas do usuário (corretor ou gestor).
 *  - "manager": gestor escolhe um usuário do tenant e visualiza as conversas
 *    desse usuário em modo leitura (sem permissão de enviar).
 */

import { useEffect, useMemo, useState } from 'react';
import {
  MessageSquarePlus,
  Trash2,
  Pencil,
  Archive,
  ChevronDown,
  ChevronRight,
  Eye,
  User as UserIcon,
  History,
} from 'lucide-react';
import {
  AgentConversation,
  AgentSlug,
  listTenantUsersWithConversations,
} from '../services/agentConversationService';

interface ConversationsSidebarProps {
  agent: AgentSlug;
  isDarkMode: boolean;
  isManager: boolean;
  tenantId?: string;
  conversations: AgentConversation[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => Promise<unknown>;
  onArchive: (id: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  /** undefined = self; user_id = visualizando outro usuário do tenant */
  viewingUserId: string | null;
  onViewingUserChange: (userId: string | null) => void;
  loading?: boolean;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
}

const formatRelativeDate = (iso: string | null): string => {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

export const ConversationsSidebar = ({
  agent,
  isDarkMode,
  isManager,
  tenantId,
  conversations,
  activeConversationId,
  onSelect,
  onNew,
  onRename,
  onArchive,
  onDelete,
  viewingUserId,
  onViewingUserChange,
  loading,
  isCollapsed = false,
  onToggleCollapsed,
}: ConversationsSidebarProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [tenantUsers, setTenantUsers] = useState<
    Array<{ user_id: string; user_name: string | null; user_email: string | null; conversation_count: number }>
  >([]);

  useEffect(() => {
    const fetchUsers = async () => {
      if (!isManager || !tenantId) return;
      const users = await listTenantUsersWithConversations(tenantId, agent);
      setTenantUsers(users);
    };
    fetchUsers();
  }, [isManager, tenantId, agent]);

  const accentColor = agent === 'caio' ? 'blue' : 'indigo';

  const colorClasses = useMemo(() => {
    if (agent === 'caio') {
      return {
        activeBg: isDarkMode ? 'bg-blue-600/30 border-blue-400/60' : 'bg-blue-100 border-blue-400',
        activeText: isDarkMode ? 'text-blue-200' : 'text-blue-900',
        newButton: isDarkMode
          ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'
          : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700',
      };
    }
    return {
      activeBg: isDarkMode ? 'bg-indigo-600/30 border-indigo-400/60' : 'bg-indigo-100 border-indigo-400',
      activeText: isDarkMode ? 'text-indigo-200' : 'text-indigo-900',
      newButton: 'bg-indigo-600 hover:bg-indigo-700',
    };
  }, [agent, isDarkMode]);

  const handleStartEdit = (conv: AgentConversation) => {
    setEditingId(conv.id);
    setEditingValue(conv.title);
  };

  const handleConfirmEdit = async () => {
    if (editingId && editingValue.trim()) {
      await onRename(editingId, editingValue.trim());
    }
    setEditingId(null);
    setEditingValue('');
  };

  const selectedUser = tenantUsers.find((u) => u.user_id === viewingUserId);

  if (isCollapsed) {
    return (
      <div
        className={`flex flex-col h-full border-r items-center py-3 gap-2 ${
          isDarkMode ? 'border-neutral-800/60 bg-neutral-900/40' : 'border-gray-200 bg-gray-50/80'
        }`}
      >
        <button
          onClick={onToggleCollapsed}
          title="Expandir histórico"
          className={`p-2 rounded-lg transition-colors ${
            isDarkMode ? 'hover:bg-neutral-800 text-gray-300' : 'hover:bg-gray-200 text-gray-700'
          }`}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={onNew}
          disabled={!!viewingUserId}
          title="Nova conversa"
          className={`p-2 rounded-lg text-white shadow-md transition-all ${
            viewingUserId ? 'opacity-50 cursor-not-allowed bg-gray-500' : `${colorClasses.newButton} hover:shadow-lg`
          }`}
        >
          <MessageSquarePlus className="w-4 h-4" />
        </button>
        <div className={`mt-2 flex flex-col items-center gap-1 text-[10px] font-bold writing-mode-vertical ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          <History className="w-3.5 h-3.5" />
          <span className="block" style={{ writingMode: 'vertical-rl' }}>
            HISTÓRICO ({conversations.length})
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0 max-h-full" style={{ backgroundColor: 'hsl(var(--bg-primary))' }}>
      {/* Header (pr-10 reserva espaço para o X de fechar do modal) */}
      <div className="px-4 pt-4 pb-3 pr-10">
        <div className="flex items-baseline gap-2 mb-3">
          <h2 className="text-base font-bold tracking-tight" style={{ color: 'hsl(var(--text-primary))' }}>
            Conversas
          </h2>
          {conversations.length > 0 && (
            <span className="text-xs" style={{ color: 'hsl(var(--text-secondary))' }}>
              {conversations.length}
            </span>
          )}
        </div>
        <button
          onClick={onNew}
          disabled={!!viewingUserId}
          className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-white text-sm font-semibold transition-colors ${
            viewingUserId ? 'opacity-50 cursor-not-allowed bg-gray-500' : 'bg-indigo-600 hover:bg-indigo-700'
          }`}
        >
          <MessageSquarePlus className="w-4 h-4" />
          Nova conversa
        </button>

        {isManager && (
          <div className="mt-3">
            <button
              onClick={() => setShowUserPicker((v) => !v)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
              style={{ color: 'hsl(var(--text-primary))', border: '1px solid hsl(var(--border))' }}
            >
              <Eye className={`w-3.5 h-3.5 ${viewingUserId ? 'text-indigo-500' : ''}`} />
              <span className="flex-1 text-left truncate">
                {selectedUser
                  ? `Vendo: ${selectedUser.user_name || selectedUser.user_email || 'usuário'}`
                  : 'Ver conversas de um usuário'}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showUserPicker ? 'rotate-180' : ''}`} />
            </button>

            {showUserPicker && (
              <div
                className={`mt-2 max-h-60 overflow-y-auto rounded-lg border ${
                  isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
                } shadow-lg`}
              >
                <button
                  onClick={() => {
                    onViewingUserChange(null);
                    setShowUserPicker(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-left ${
                    !viewingUserId
                      ? isDarkMode
                        ? 'bg-neutral-800 text-white'
                        : 'bg-gray-100 text-gray-900'
                      : isDarkMode
                        ? 'text-gray-300 hover:bg-neutral-800'
                        : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <UserIcon className="w-3.5 h-3.5" />
                  Minhas conversas
                </button>
                {tenantUsers.length === 0 ? (
                  <p className={`px-3 py-2 text-[11px] italic ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    Ainda não há conversas de outros usuários.
                  </p>
                ) : (
                  tenantUsers.map((u) => (
                    <button
                      key={u.user_id}
                      onClick={() => {
                        onViewingUserChange(u.user_id);
                        setShowUserPicker(false);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left ${
                        viewingUserId === u.user_id
                          ? isDarkMode
                            ? 'bg-neutral-800 text-white'
                            : 'bg-gray-100 text-gray-900'
                          : isDarkMode
                            ? 'text-gray-300 hover:bg-neutral-800'
                            : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <UserIcon className="w-3.5 h-3.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{u.user_name || u.user_email || u.user_id.slice(0, 8)}</div>
                        {u.user_email && u.user_name && (
                          <div className={`truncate text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                            {u.user_email}
                          </div>
                        )}
                      </div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          isDarkMode ? 'bg-neutral-700 text-gray-300' : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {u.conversation_count}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lista de conversas */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-0.5">
        {loading ? (
          <p className="text-xs text-center py-4" style={{ color: 'hsl(var(--text-secondary))' }}>
            Carregando...
          </p>
        ) : conversations.length === 0 ? (
          <p className="text-xs text-center py-6" style={{ color: 'hsl(var(--text-secondary))' }}>
            {viewingUserId ? 'Este usuário ainda não tem conversas.' : 'Sem conversas. Comece uma nova.'}
          </p>
        ) : (
          conversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const isEditing = editingId === conv.id;
            return (
              <div
                key={conv.id}
                className="group rounded-lg transition-colors"
                style={isActive ? { backgroundColor: 'hsl(var(--bg-secondary))' } : undefined}
              >
                {isEditing ? (
                  <div className="p-2">
                    <input
                      autoFocus
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onBlur={handleConfirmEdit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleConfirmEdit();
                        if (e.key === 'Escape') {
                          setEditingId(null);
                          setEditingValue('');
                        }
                      }}
                      className={`w-full text-xs px-2 py-1 rounded border ${
                        isDarkMode
                          ? 'bg-neutral-900 border-neutral-700 text-white'
                          : 'bg-white border-gray-300 text-gray-900'
                      } focus:outline-none focus:ring-1 focus:ring-${accentColor}-500`}
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => onSelect(conv.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${isActive ? '' : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate" style={{ color: 'hsl(var(--text-primary))' }}>
                          {conv.title}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[11px]" style={{ color: 'hsl(var(--text-secondary))' }}>
                            {formatRelativeDate(conv.last_message_at || conv.created_at)}
                          </span>
                          <span className="text-[11px]" style={{ color: 'hsl(var(--text-secondary))' }}>
                            · {conv.message_count} msg
                          </span>
                          {viewingUserId && conv.user_name && (
                            <span className="text-[11px] truncate" style={{ color: 'hsl(var(--text-secondary))' }}>
                              · {conv.user_name}
                            </span>
                          )}
                        </div>
                      </div>

                      {!viewingUserId && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEdit(conv);
                            }}
                            className={`p-1 rounded hover:bg-${accentColor}-500/20`}
                            title="Renomear"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onArchive(conv.id);
                            }}
                            className="p-1 rounded hover:bg-gray-500/20"
                            title="Arquivar"
                          >
                            <Archive className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm('Excluir esta conversa? Esta ação não pode ser desfeita.')) {
                                onDelete(conv.id);
                              }
                            }}
                            className="p-1 rounded hover:bg-red-500/20 text-red-500"
                            title="Excluir"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

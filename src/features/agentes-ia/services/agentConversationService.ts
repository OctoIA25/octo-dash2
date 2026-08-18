/**
 * Serviço de persistência das conversas dos Agentes de IA
 *
 * Tabelas: agent_conversations + agent_messages
 *
 * Visibilidade (controlada por RLS no banco):
 *  - Dono: enxerga só suas próprias conversas e mensagens.
 *  - Gestor (admin/owner/team_leader do tenant): enxerga todas do tenant.
 */

import { supabase } from '@/lib/supabaseClient';

export type AgentSlug = 'caio' | 'elaine';
export type AgentMessageRole = 'user' | 'agent' | 'system';

export interface AgentConversation {
  id: string;
  tenant_id: string;
  user_id: string;
  agent_slug: AgentSlug;
  title: string;
  user_name: string | null;
  user_email: string | null;
  message_count: number;
  last_message_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentMessageRecord {
  id: string;
  conversation_id: string;
  tenant_id: string;
  user_id: string;
  role: AgentMessageRole;
  content: string;
  display_content: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface CreateConversationInput {
  tenantId: string;
  userId: string;
  userName?: string | null;
  userEmail?: string | null;
  agent: AgentSlug;
  firstMessage: string;
}

const MAX_TITLE_WORDS = 8;
const MAX_TITLE_LENGTH = 80;

const deriveTitle = (text: string): string => {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Nova conversa';
  const words = cleaned.split(' ').slice(0, MAX_TITLE_WORDS).join(' ');
  return words.length > MAX_TITLE_LENGTH ? words.slice(0, MAX_TITLE_LENGTH) + '...' : words;
};

export const createConversation = async (
  input: CreateConversationInput
): Promise<AgentConversation | null> => {
  const { data, error } = await supabase
    .from('agent_conversations')
    .insert({
      tenant_id: input.tenantId,
      user_id: input.userId,
      agent_slug: input.agent,
      title: deriveTitle(input.firstMessage),
      user_name: input.userName ?? null,
      user_email: input.userEmail ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Erro ao criar conversa do agente:', error);
    return null;
  }
  return data as unknown as AgentConversation;
};

export const listConversations = async (
  agent: AgentSlug,
  options?: { userId?: string; tenantId?: string; includeArchived?: boolean }
): Promise<AgentConversation[]> => {
  let query = supabase
    .from('agent_conversations')
    .select('*')
    .eq('agent_slug', agent)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (options?.userId) query = query.eq('user_id', options.userId);
  if (options?.tenantId) query = query.eq('tenant_id', options.tenantId);
  if (!options?.includeArchived) query = query.is('archived_at', null);

  const { data, error } = await query;
  if (error) {
    console.error('❌ Erro ao listar conversas do agente:', error);
    return [];
  }
  return (data ?? []) as unknown as AgentConversation[];
};

export const listConversationMessages = async (
  conversationId: string
): Promise<AgentMessageRecord[]> => {
  const { data, error } = await supabase
    .from('agent_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ Erro ao carregar mensagens da conversa:', error);
    return [];
  }
  return (data ?? []) as unknown as AgentMessageRecord[];
};

interface AppendMessageInput {
  conversationId: string;
  tenantId: string;
  userId: string;
  role: AgentMessageRole;
  content: string;
  displayContent?: string | null;
  metadata?: Record<string, unknown>;
}

export const appendMessage = async (
  input: AppendMessageInput
): Promise<AgentMessageRecord | null> => {
  const { data, error } = await supabase
    .from('agent_messages')
    .insert({
      conversation_id: input.conversationId,
      tenant_id: input.tenantId,
      user_id: input.userId,
      role: input.role,
      content: input.content,
      display_content: input.displayContent ?? null,
      metadata: input.metadata ?? {},
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Erro ao gravar mensagem do agente:', error);
    return null;
  }
  return data as unknown as AgentMessageRecord;
};

export const renameConversation = async (
  conversationId: string,
  title: string
): Promise<boolean> => {
  const trimmed = title.trim();
  if (!trimmed) return false;
  const { error } = await supabase
    .from('agent_conversations')
    .update({ title: trimmed.slice(0, MAX_TITLE_LENGTH) })
    .eq('id', conversationId);
  if (error) {
    console.error('❌ Erro ao renomear conversa:', error);
    return false;
  }
  return true;
};

export const archiveConversation = async (conversationId: string): Promise<boolean> => {
  const { error } = await supabase
    .from('agent_conversations')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', conversationId);
  if (error) {
    console.error('❌ Erro ao arquivar conversa:', error);
    return false;
  }
  return true;
};

export const deleteConversation = async (conversationId: string): Promise<boolean> => {
  const { error } = await supabase
    .from('agent_conversations')
    .delete()
    .eq('id', conversationId);
  if (error) {
    console.error('❌ Erro ao excluir conversa:', error);
    return false;
  }
  return true;
};

export const listTenantUsersWithConversations = async (
  tenantId: string,
  agent: AgentSlug
): Promise<Array<{ user_id: string; user_name: string | null; user_email: string | null; conversation_count: number }>> => {
  const { data, error } = await supabase
    .from('agent_conversations')
    .select('user_id, user_name, user_email')
    .eq('tenant_id', tenantId)
    .eq('agent_slug', agent)
    .is('archived_at', null);

  if (error) {
    console.error('❌ Erro ao listar usuários com conversas:', error);
    return [];
  }

  const grouped = new Map<string, { user_id: string; user_name: string | null; user_email: string | null; conversation_count: number }>();
  for (const row of (data ?? []) as Array<{ user_id: string; user_name: string | null; user_email: string | null }>) {
    const existing = grouped.get(row.user_id);
    if (existing) {
      existing.conversation_count += 1;
      if (!existing.user_name && row.user_name) existing.user_name = row.user_name;
      if (!existing.user_email && row.user_email) existing.user_email = row.user_email;
    } else {
      grouped.set(row.user_id, {
        user_id: row.user_id,
        user_name: row.user_name,
        user_email: row.user_email,
        conversation_count: 1,
      });
    }
  }
  return Array.from(grouped.values()).sort((a, b) =>
    (a.user_name || a.user_email || '').localeCompare(b.user_name || b.user_email || '')
  );
};

// ---------------------------------------------------------------------------
// Relatórios da Elaine
//
// Um relatório é a resposta da Elaine gerada a partir de uma especialidade
// sobre um corretor identificado (metadata.is_report). Diferente da conversa,
// ele é visível para os DOIS lados: quem gerou (normalmente o gestor) e o
// corretor analisado — este último via a política de RLS que casa
// metadata->>'subject_email' com o e-mail do JWT.
// ---------------------------------------------------------------------------

export interface AgentReport {
  id: string;
  /** Data em que o relatório foi gerado. */
  createdAt: string;
  /** Texto do relatório (Markdown, como a Elaine devolveu). */
  content: string;
  /** Especialidade que originou o relatório (ex.: 'gestao-liderados'). */
  especialidade: string | null;
  /** Nome do corretor analisado. */
  subjectNome: string | null;
  /** Nome de quem pediu o relatório. */
  geradoPor: string | null;
}

const MAX_REPORTS = 50;

const toReport = (row: {
  id: string;
  created_at: string;
  content: string;
  metadata: Record<string, unknown> | null;
}): AgentReport => {
  const meta = row.metadata ?? {};
  const texto = (chave: string): string | null => {
    const valor = meta[chave];
    return typeof valor === 'string' && valor.trim() ? valor : null;
  };
  return {
    id: row.id,
    createdAt: row.created_at,
    content: row.content,
    especialidade: texto('especialidade'),
    subjectNome: texto('corretor_nome'),
    geradoPor: texto('gerado_por'),
  };
};

/**
 * Lista os relatórios da Elaine sobre um corretor, do mais recente ao mais antigo.
 * Informe o id numérico (tela do gestor) OU o e-mail (tela do próprio corretor).
 */
export const listElaineReports = async (params: {
  subjectCorretorId?: number | null;
  subjectEmail?: string | null;
}): Promise<AgentReport[]> => {
  let query = supabase
    .from('agent_messages')
    .select('id, created_at, content, metadata')
    .filter('metadata->>is_report', 'eq', 'true')
    .order('created_at', { ascending: false })
    .limit(MAX_REPORTS);

  if (params.subjectCorretorId) {
    query = query.filter('metadata->>subject_corretor_id', 'eq', String(params.subjectCorretorId));
  } else if (params.subjectEmail) {
    query = query.filter('metadata->>subject_email', 'eq', params.subjectEmail.trim().toLowerCase());
  } else {
    return [];
  }

  const { data, error } = await query;
  if (error) {
    console.error('❌ Erro ao listar relatórios da Elaine:', error.code, error.message, error.details);
    return [];
  }
  return (data ?? []).map((row) => toReport(row as never));
};

/**
 * Cadência da LIA — contrato de leitura consumido pelo card do lead.
 *
 * A fonte é `lia_followups`, tabela escrita pelo app da LIA. Ela NÃO é lida
 * direto do PostgREST: está com RLS sem policy (devolveria lista vazia) e
 * carrega texto de conversa com o cliente. Quem recorta quem pode ver é o
 * servidor — ver server/liaCadencia/index.js.
 *
 * Espelha o padrão de restKpisService: interface do serviço aqui, timeout
 * explícito, erro do backend traduzido para mensagem que a tela pode mostrar.
 */
import { authedFetch } from '@/features/comunicacao/services/authedFetch';

const TIMEOUT_MS = 15_000;

/** Uma tentativa de contato da LIA com o lead. */
export interface CadenciaEvento {
  id: string;
  tag: string | null;
  attempt_number: number | null;
  channel: string | null;
  status: string | null;
  /** respondido | sem_resposta | aguardando | expirado | cancelado | visita_agendada | escalado | opt_out */
  resultado: string;
  respondeu: boolean;
  scheduled_at: string | null;
  sent_at: string | null;
  respondido_em: string | null;
  tempo_ate_resposta_min: number | null;
  motivo: string | null;
  cancelled_reason: string | null;
  template_name: string | null;
}

export interface CadenciaResumo {
  total: number;
  enviadas: number;
  pendentes: number;
  canceladas: number;
  expiradas: number;
  respondidas: number;
  /** O lead voltou a falar ANTES de a cadência sair — ela foi cancelada por isso. */
  retornos_espontaneos: number;
  /** Percentual inteiro, ou null quando nada foi enviado (0% mentiria). */
  taxa_resposta: number | null;
  tempo_resposta_min: { mediana: number | null; amostra: number };
  por_tentativa: { attempt_number: number; enviadas: number; respondidas: number }[];
  por_tag: { tag: string; enviadas: number; respondidas: number }[];
  proxima: {
    /**
     * Por ele o corretor remarca ou cancela (P2.5). OPCIONAL de propósito: uma
     * resposta guardada antes deste deploy não traz os três campos novos, e
     * exigi-los faria a tela quebrar em cima de cache.
     */
    id?: string | null;
    scheduled_at: string;
    tag: string | null;
    attempt_number: number | null;
    atrasada: boolean;
    /**
     * 'lead' = o CLIENTE pediu este retorno. É outra coisa de "próxima
     * cadência": a LIA não vai cutucar um lead sumido, ela marcou hora com
     * ele. O card fala dos dois com palavras diferentes de propósito.
     */
    pedido_por?: 'lead' | 'lia' | 'corretor' | null;
    motivo?: string | null;
  } | null;
  ultima_interacao_lead: string | null;
  dias_em_silencio: number | null;
  interaction_count: number | null;
  /** A consulta bateu no teto de linhas: a timeline é um recorte. */
  truncated: boolean;
}

export interface Cadencia {
  resumo: CadenciaResumo;
  timeline: CadenciaEvento[];
}

/** 403 e 404 não são falha do sistema — a tela diz o que aconteceu. */
const MENSAGEM_POR_ERRO: Record<string, string> = {
  forbidden: 'Você não tem acesso à cadência deste lead.',
  lead_not_found: 'Lead não encontrado neste tenant.',
  invalid_lead_id: 'Lead inválido.',
  invalid_quando: 'Escolha uma data e hora válidas.',
  quando_no_passado: 'Esse horário já passou.',
  sem_horario_permitido: 'Não há horário permitido para falar com o cliente a partir daí.',
  // O dono da plataforma precisa dizer de qual imobiliária é o lead; sem o
  // `?tenantId=` a rota não tem como saber.
  tenant_required_for_owner: 'Escolha a imobiliária antes de marcar o retorno.',
  tenant_not_found: 'Imobiliária não encontrada.',
  no_tenant_access: 'Você não tem acesso a nenhuma imobiliária.',
};

/*
 * O CÓDIGO VAI JUNTO NA MENSAGEM DESCONHECIDA.
 *
 * "Não foi possível marcar o retorno." escondeu um
 * `tenant_required_for_owner` e custou uma ida e volta para descobrir. Erro
 * que a gente não previu tem de sair legível na tela: quem está usando manda
 * o print e a causa vem junto.
 */
const mensagemDoErro = (codigo: string, acao: string) =>
  MENSAGEM_POR_ERRO[codigo] ?? `Não foi possível ${acao} (${codigo}).`;

export async function fetchCadenciaDoLead(
  leadId: string,
  tenantId?: string | null,
): Promise<Cadencia> {
  const params = new URLSearchParams();
  if (tenantId && tenantId !== 'owner') params.set('tenantId', tenantId);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await authedFetch(
      `/api/v1/leads/${encodeURIComponent(leadId)}/cadencia?${params}`,
      { signal: controller.signal },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      const codigo = String(json?.error ?? `HTTP ${res.status}`);
      throw new Error(MENSAGEM_POR_ERRO[codigo] ?? 'Não foi possível carregar a cadência.');
    }
    return { resumo: json.resumo, timeline: json.timeline ?? [] };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Marcar um retorno para a LIA fazer — 26/09/2026.
 *
 * A rota existia desde o P2.5 e NENHUMA tela a chamava: o corretor via a
 * cadência e não tinha como marcar nada. Quando construímos o emissor de
 * `followup.criado` para a LIA, ele nasceu sem origem — o evento nunca
 * dispararia, porque ninguém consegue criar o retorno.
 *
 * O horário que VALE é o que a resposta devolve, não o que foi pedido: o
 * servidor empurra para o próximo horário em que dá para falar com o cliente
 * e avisa em `ajustado`. Mostrar o pedido em vez do agendado faria o card
 * prometer uma hora que não vai acontecer.
 */
export interface RetornoMarcado {
  id: string;
  created: boolean;
  agendado_para: string;
  ajustado: boolean;
}

/**
 * O `?tenantId=` é obrigatório para o dono da plataforma — `resolveTenant`
 * devolve `tenant_required_for_owner` sem ele. O GET irmão já mandava; este
 * não mandava, e foi o que quebrou o botão no primeiro uso em produção.
 */
const rotaDoRetorno = (leadId: string, tenantId?: string | null) => {
  const params = new URLSearchParams();
  if (tenantId && tenantId !== 'owner') params.set('tenantId', tenantId);
  const q = params.toString();
  return `/api/v1/leads/${encodeURIComponent(leadId)}/retorno${q ? `?${q}` : ''}`;
};

export async function marcarRetorno(
  leadId: string,
  quando: string,
  motivo: string,
  substituir?: string | null,
  tenantId?: string | null,
): Promise<RetornoMarcado> {
  const res = await authedFetch(rotaDoRetorno(leadId, tenantId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quando, motivo, ...(substituir ? { substituir } : {}) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    const codigo = String(json?.error ?? `HTTP ${res.status}`);
    throw new Error(mensagemDoErro(codigo, 'marcar o retorno'));
  }
  return {
    id: json.id,
    created: Boolean(json.created),
    agendado_para: json.agendado_para,
    ajustado: Boolean(json.ajustado),
  };
}

export async function desmarcarRetorno(
  leadId: string,
  id: string,
  tenantId?: string | null,
): Promise<void> {
  const res = await authedFetch(rotaDoRetorno(leadId, tenantId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cancelar: id }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    const codigo = String(json?.error ?? `HTTP ${res.status}`);
    throw new Error(mensagemDoErro(codigo, 'desmarcar o retorno'));
  }
}

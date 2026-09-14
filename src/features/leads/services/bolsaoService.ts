/**
 * 🎯 SERVIÇO DO BOLSÃO DE LEADS (Multi-tenant)
 * 
 * Gerencia leads que não foram atendidos no prazo estabelecido
 * e estão disponíveis para qualquer corretor assumir.
 */

import { supabase } from '@/lib/supabaseClient';
import type { ValorClassificacao } from '@/features/leads/utils/classificarLead';

/**
 * Interface para leads do Bolsão (estrutura real do Supabase)
 */
export interface BolsaoLead {
  id: number;
  created_at: string;
  tenant_id?: string | null;
  codigo: string | null;              // Código do imóvel
  corretor: string | null;            // Corretor original
  lead: string | null;                // Telefone/ID do lead
  numerocorretor: string | null;      // Telefone do corretor original
  status: string | null;              // "novo", "finalizado", etc.
  corretor_responsavel: string | null; // Quem assumiu o lead
  numero_corretor_responsavel: string | null;
  data_atribuicao: string | null;
  atendido: boolean | null;
  data_atendimento: string | null;
  data_finalizacao: string | null;
  data_expiracao: string | null;
  nomedolead: string | null;          // 🆕 Nome do lead (campo real: nomedolead)
  Foto: string | null;                // 🆕 URL da foto do lead
  portal: string | null;              // 🆕 Portal de origem (OLX, ZAP, etc)
  is_exclusive?: boolean | null;
  classification?: ValorClassificacao;
  /**
   * Preferências do lead. A tabela `bolsao` NÃO tem a coluna — só as fontes
   * (`leads`/`kenlo_leads`) — então aqui vem `undefined` e o editor abre vazio.
   * ponytail: se o Bolsão precisar exibir, é ADD COLUMN + trigger de espelho
   * copiado de `tg_leads_classification_to_bolsao`.
   */
  preferences?: string[] | null;
  /** Já vêm do select('*'); faltavam na interface. Necessários para escrever na tabela FONTE. */
  source_lead_id?: string | null;
  source_kenlo_id?: string | null;
}

const BOLSAO_TABLE = 'bolsao'; // Nome da tabela (sem acento)

/**
 * Torna um valor seguro para ir dentro de um filtro PostgREST (.or()/.and()).
 * Envolve em aspas duplas e escapa `"` e `\`, transformando vírgula/ponto/
 * parênteses em texto literal em vez de sintaxe de filtro. NÃO remove
 * caracteres — o nome original é preservado.
 */
export function pgrstLiteral(value: string): string {
  return `"${String(value ?? '').replace(/(["\\])/g, '\\$1')}"`;
}

/**
 * Busca leads disponíveis no Bolsão
 * Leads disponíveis são aqueles com status "bolsao" (expirados sem atendimento)
 * que ninguém pegou ainda. `status` sozinho não basta: os triggers de etapa
 * (tg_leads_status_to_bolsao / tg_kenlo_leads_stage_to_bolsao) marcam
 * `atendido` mas mantêm status 'bolsao', e a transferência pelo modal do lead
 * grava `corretor_responsavel` sem mexer no status.
 */
export async function fetchBolsaoLeads(tenantId: string): Promise<BolsaoLead[]> {
  try {
    const { data, error } = await supabase
      .from(BOLSAO_TABLE)
      .select('*')
      .eq('status', 'bolsao')
      .or('atendido.is.null,atendido.eq.false')
      .is('corretor_responsavel', null)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });
    
    if (error) {
      throw new Error(`Erro ao buscar leads do Bolsão: ${error.message}`);
    }
    
    return data || [];
    
  } catch (error) {
    console.error('❌ Erro ao buscar leads do Bolsão:', error);
    return [];
  }
}

/**
 * Busca todos os leads que passaram pelo Bolsão em algum momento.
 * Critério: `data_expiracao IS NOT NULL` — só o `expire_bolsao_leads()` (pg_cron)
 * seta, ao mover pro pool; portanto identifica de forma confiável leads que cairam no pool.
 * Inclui status atuais 'bolsao', 'assumido', 'atendido', 'finalizado'.
 */
export async function fetchTodosLeadsBolsao(tenantId: string): Promise<BolsaoLead[]> {
  try {
    const { data, error } = await supabase
      .from(BOLSAO_TABLE)
      .select('*')
      .not('data_expiracao', 'is', null)
      .eq('tenant_id', tenantId)
      .order('data_expiracao', { ascending: false });

    if (error) {
      throw new Error(`Erro ao buscar leads que passaram pelo bolsão: ${error.message}`);
    }

    return data || [];

  } catch (error) {
    console.error('❌ Erro ao buscar leads que passaram pelo bolsão:', error);
    return [];
  }
}

/**
 * Busca leads de um corretor específico
 */
export async function fetchLeadsDoCorretor(nomeCorretor: string): Promise<BolsaoLead[]> {
  try {
    // O nome vai cru dentro de um filtro .or() do PostgREST, onde vírgula, ponto
    // e parênteses são SINTAXE. Sem tratar, um nome como `x,corretor.not.is.null`
    // injeta cláusulas extras e alarga o OR. pgrstLiteral envolve o valor em
    // aspas (escapando " e \), tornando-o um literal — não removemos nada.
    const alvo = pgrstLiteral(nomeCorretor);
    const { data, error } = await supabase
      .from(BOLSAO_TABLE)
      .select('*')
      .or(`corretor_responsavel.eq.${alvo},corretor.eq.${alvo}`)
      .neq('status', 'bolsao')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    return data || [];
    
  } catch (error) {
    console.error(`❌ Erro ao buscar leads do corretor:`, error);
    return [];
  }
}

/**
 * Busca TODOS os leads em andamento de TODOS os corretores.
 */
export async function fetchTodosLeadsEmAndamento(): Promise<BolsaoLead[]> {
  try {
    
    const { data, error } = await supabase
      .from(BOLSAO_TABLE)
      .select('*')
      .neq('status', 'bolsao')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    return data || [];
    
  } catch (error) {
    console.error('❌ Erro ao buscar todos os leads em andamento:', error);
    return [];
  }
}

/**
 * Busca lista de corretores únicos
 */
export async function fetchListaCorretores(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from(BOLSAO_TABLE)
      .select('corretor,corretor_responsavel');
    
    if (error) throw error;
    
    const corretoresSet = new Set<string>();
    data?.forEach((lead: any) => {
      if (lead.corretor?.trim()) corretoresSet.add(lead.corretor.trim());
      if (lead.corretor_responsavel?.trim()) corretoresSet.add(lead.corretor_responsavel.trim());
    });
    
    return Array.from(corretoresSet).sort();
  } catch (error) {
    console.error('❌ Erro ao buscar lista de corretores:', error);
    return [];
  }
}

/**
 * Marca um lead como atendido pelo corretor
 */
export async function confirmarAtendimentoLead(leadId: number): Promise<{ success: boolean; message: string }> {
  try {
    const { error } = await supabase
      .from(BOLSAO_TABLE)
      .update({
        atendido: true,
        data_atendimento: new Date().toISOString(),
        status: 'atendido'
      })
      .eq('id', leadId);
    
    if (error) throw error;
    
    return { success: true, message: 'Lead confirmado como atendido!' };
  } catch (error) {
    console.error(`❌ Erro ao confirmar atendimento:`, error);
    return { success: false, message: 'Erro ao confirmar atendimento.' };
  }
}

/**
 * Assume um lead do Bolsão
 */
export async function assumirLeadDoBolsao(
  bolsaoId: number,
  corretorNome: string,
  corretorTelefone: string
): Promise<{ success: boolean; message: string }> {
  try {
    const agora = new Date().toISOString();
    
    const { error } = await supabase
      .from(BOLSAO_TABLE)
      .update({
        corretor_responsavel: corretorNome,
        numero_corretor_responsavel: corretorTelefone,
        data_atribuicao: agora,
        atendido: true,
        data_atendimento: agora,
        status: 'assumido'
      })
      .eq('id', bolsaoId);
    
    if (error) throw error;
    
    return { success: true, message: `Lead assumido por ${corretorNome}!` };
  } catch (error) {
    console.error('❌ Erro ao assumir lead:', error);
    return { success: false, message: 'Erro ao assumir lead.' };
  }
}

/**
 * Atualiza o status de um lead no Kanban
 */
export async function atualizarStatusLead(
  leadId: number, 
  novoStatus: string
): Promise<{ success: boolean; message: string }> {
  try {
    const atualizacao: any = { status: novoStatus };
    
    if (novoStatus === 'atendido') {
      atualizacao.atendido = true;
      atualizacao.data_atendimento = new Date().toISOString();
    }
    
    if (novoStatus === 'finalizado') {
      atualizacao.atendido = true;
      atualizacao.data_finalizacao = new Date().toISOString();
    }
    
    const { error } = await supabase
      .from(BOLSAO_TABLE)
      .update(atualizacao)
      .eq('id', leadId);
    
    if (error) throw error;
    
    return { success: true, message: `Status atualizado para ${novoStatus}!` };
  } catch (error) {
    console.error(`❌ Erro ao atualizar status:`, error);
    return { success: false, message: 'Erro ao atualizar status.' };
  }
}

/**
 * Verifica se a tabela bolsao existe
 */
export async function verificarTabelaBolsao(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from(BOLSAO_TABLE)
      .select('id')
      .limit(1);
    
    return !error;
  } catch (error) {
    return false;
  }
}

/**
 * Interface para métricas de tempo de resposta por corretor
 */
export interface CorretorMetrica {
  corretor: string;
  totalLeadsAssumidos: number;
  tempoMedioResposta: number; // Em minutos
  leadsAtendidos: number;
  leadsFinalizados: number;
  taxaAtendimento: number; // Percentual
}

/**
 * Calcula métricas de tempo de resposta para cada corretor
 */
export async function calcularMetricasCorretores(dataInicio?: Date, dataFim?: Date): Promise<CorretorMetrica[]> {
  try {
    let query = supabase
      .from(BOLSAO_TABLE)
      .select('*')
      .not('corretor_responsavel', 'is', null)
      .not('data_atribuicao', 'is', null);
    
    if (dataInicio) {
      query = query.gte('created_at', dataInicio.toISOString());
    }
    if (dataFim) {
      query = query.lte('created_at', dataFim.toISOString());
    }
    
    const { data: leads, error } = await query;
    
    if (error) throw error;
    if (!leads || leads.length === 0) return [];
    
    // Agrupar leads por corretor
    const corretoresMap = new Map<string, BolsaoLead[]>();
    leads.forEach(lead => {
      if (lead.corretor_responsavel) {
        const corretor = lead.corretor_responsavel.trim();
        if (!corretoresMap.has(corretor)) corretoresMap.set(corretor, []);
        corretoresMap.get(corretor)!.push(lead);
      }
    });
    
    // Calcular métricas
    const metricas: CorretorMetrica[] = [];
    corretoresMap.forEach((leadsDoCorretor, corretor) => {
      const leadsComTempo = leadsDoCorretor.filter(l => l.created_at && l.data_atribuicao);
      
      let somaTempo = 0;
      leadsComTempo.forEach(lead => {
        const diffMs = new Date(lead.data_atribuicao!).getTime() - new Date(lead.created_at).getTime();
        somaTempo += diffMs / (1000 * 60);
      });
      
      const tempoMedio = leadsComTempo.length > 0 ? somaTempo / leadsComTempo.length : 0;
      const leadsAtendidos = leadsDoCorretor.filter(l => l.atendido === true).length;
      const leadsFinalizados = leadsDoCorretor.filter(l => l.status === 'finalizado').length;
      const taxaAtendimento = leadsDoCorretor.length > 0 ? (leadsAtendidos / leadsDoCorretor.length) * 100 : 0;
      
      metricas.push({
        corretor,
        totalLeadsAssumidos: leadsDoCorretor.length,
        tempoMedioResposta: Math.round(tempoMedio),
        leadsAtendidos,
        leadsFinalizados,
        taxaAtendimento: Math.round(taxaAtendimento)
      });
    });
    
    metricas.sort((a, b) => a.tempoMedioResposta - b.tempoMedioResposta);
    return metricas;
    
  } catch (error) {
    console.error('?? Erro ao calcular métricas:', error);
    return [];
  }
}

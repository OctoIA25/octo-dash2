/**
 * 🎯 SERVIÇO DO BOLSÃO DE LEADS (Multi-tenant)
 * 
 * Gerencia leads que não foram atendidos no prazo estabelecido
 * e estão disponíveis para qualquer corretor assumir.
 */

import { supabase } from '@/lib/supabaseClient';
import { fetchTenantBolsaoConfig } from './tenantBolsaoConfigService';
import { redistributeLeadToTeamQueue } from '@/features/corretores/services/teamQueueService';

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
}

const BOLSAO_TABLE = 'bolsao'; // Nome da tabela (sem acento)

/**
 * Busca leads disponíveis no Bolsão
 * Leads disponíveis são aqueles com status "bolsao" (expirados sem atendimento)
 */
export async function fetchBolsaoLeads(): Promise<BolsaoLead[]> {
  try {
    
    const { data, error } = await supabase
      .from(BOLSAO_TABLE)
      .select('*')
      .eq('status', 'bolsao')
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
 * Critério: `data_expiracao IS NOT NULL` — só é setado por `moverLeadParaBolsao`,
 * portanto identifica de forma confiável leads que cairam no pool.
 * Inclui status atuais 'bolsao', 'assumido', 'atendido', 'finalizado'.
 */
export async function fetchTodosLeadsBolsao(): Promise<BolsaoLead[]> {
  try {
    const { data, error } = await supabase
      .from(BOLSAO_TABLE)
      .select('*')
      .not('data_expiracao', 'is', null)
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
    
    const { data, error } = await supabase
      .from(BOLSAO_TABLE)
      .select('*')
      .or(`corretor_responsavel.eq.${nomeCorretor},corretor.eq.${nomeCorretor}`)
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
 * Verifica e move leads expirados para o Bolsão considerando imóvel exclusivo ou não exclusivo
 */
export async function verificarLeadsExpirados(): Promise<number> {
  try {
    const { data: leadsExpirados, error } = await supabase
      .from(BOLSAO_TABLE)
      .select('*')
      .eq('status', 'novo')
      .or('atendido.eq.false,atendido.is.null')
      .not('corretor', 'is', null);

    // Leads em "Visita Agendada" (stage já avançado no funil) nunca expiram —
    // ficam com o corretor captador independente do tempo.
    const VISITA_AGENDADA_STAGES = new Set([
      'visit_scheduled',
      'visita_agendada',
      'Visita Agendada',
      'qualified',
    ]);
    const bolsaoIds = (leadsExpirados || []).map((l: any) => l.id);
    const stagesMap = new Map<number, string>();
    if (bolsaoIds.length > 0) {
      const { data: kenloRows } = await (supabase as any)
        .from('kenlo_leads')
        .select('id, stage')
        .in('id', bolsaoIds);
      (kenloRows || []).forEach((r: any) => stagesMap.set(r.id, r.stage));
    }
    
    if (error) throw error;
    if (!leadsExpirados || leadsExpirados.length === 0) return 0;
    
    let movidosComSucesso = 0;
    for (const lead of leadsExpirados) {
      const tenantId = lead.tenant_id;
      if (!tenantId) continue;

      // Pula leads em visita agendada — ficam com o corretor captador
      const stage = stagesMap.get(lead.id);
      if (stage && VISITA_AGENDADA_STAGES.has(stage)) {
        continue;
      }

      const config = await fetchTenantBolsaoConfig(tenantId);
      const limiteMinutos = lead.is_exclusive
        ? config.tempoExpiracaoExclusivo
        : config.tempoExpiracaoNaoExclusivo;

      const createdAt = new Date(lead.created_at);
      const agora = new Date();
      const diffMinutos = Math.floor((agora.getTime() - createdAt.getTime()) / 60000);

      if (diffMinutos < limiteMinutos) {
        continue;
      }

      // Tentar redistribuição via fila da equipe antes do Bolsão geral (se habilitado)
      if (config.teamQueueEnabled) {
        const currentCorretor =
          lead.corretor_responsavel || lead.corretor || null;
        const attemptNumber = ((lead as any).queue_attempt ?? 0) + 1;

        const queueResult = await redistributeLeadToTeamQueue(
          lead.id,
          tenantId,
          (lead as any).original_corretor_user_id ?? null,
          currentCorretor,
          attemptNumber,
          config.teamQueueOrder
        );

        if (queueResult.redistributed) {
          // Lead foi redistribuído para a equipe — não vai ao Bolsão geral
          movidosComSucesso++;
          continue;
        }
      }

      // Nenhum membro elegível na equipe — mover para Bolsão geral
      const movido = await moverLeadParaBolsao(lead.id);
      if (movido) movidosComSucesso++;
    }
    
    return movidosComSucesso;
  } catch (error) {
    console.error('❌ Erro ao verificar leads expirados:', error);
    return 0;
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
 * Move um lead específico para o Bolsão
 */
export async function moverLeadParaBolsao(leadId: number): Promise<boolean> {
  try {
    const { error } = await supabase
      .from(BOLSAO_TABLE)
      .update({
        status: 'bolsao',
        atendido: false,
        corretor_responsavel: null,
        numero_corretor_responsavel: null,
        data_atendimento: null,
        data_expiracao: new Date().toISOString()
      })
      .eq('id', leadId);
    
    if (error) throw error;
    return true;
  } catch (error) {
    console.error(`❌ Erro ao mover lead ${leadId}:`, error);
    return false;
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

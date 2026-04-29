/**
 * 📊 SERVIÇO DE MÉTRICAS
 * 
 * Busca métricas reais do sistema para o dashboard de gestão de equipe
 * Integra dados do bolsão de leads para calcular tempo médio de resposta
 */

import { calcularMetricasCorretores, CorretorMetrica } from '@/features/leads/services/bolsaoService';
import { supabase } from '@/integrations/supabase/client';

/**
 * Interface para métricas de tempo de resposta por equipe
 */
export interface MetricasEquipe {
  equipe: string;
  tempoMedio: number; // em minutos
  cor: string;
  corretores: string[];
}

/**
 * Interface para métricas gerais da equipe
 */
export interface MetricasGerais {
  tempoMedioRespostaGeral: number; // em minutos
  totalLeadsAssumidos: number;
  taxaAtendimentoGeral: number; // percentual
}

/**
 * Cache do mapeamento de corretores para equipes
 */
let mapeamentoEquipesCache: Record<string, { equipe: string; cor: string }> | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

/**
 * Busca o mapeamento de corretores para equipes do Supabase
 * 
 * Lógica:
 * 1. Busca todas as equipes (teams) do tenant atual
 * 2. Busca todos os corretores (tenant_memberships) com team_id
 * 3. Join: corretor → equipe (name + color)
 * 4. Retorna mapeamento: { nomeCorretor: { equipe, cor } }
 */
async function buscarMapeamentoEquipes(tenantId?: string): Promise<Record<string, { equipe: string; cor: string }>> {
  // Verificar cache
  const now = Date.now();
  if (mapeamentoEquipesCache && (now - cacheTimestamp) < CACHE_DURATION) {
    return mapeamentoEquipesCache;
  }

  try {
    // Se não foi fornecido tenantId, tentar obter do auth
    if (!tenantId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return {};
      }
      
      // Buscar tenant_id do usuário
      const { data: membership } = await supabase
        .from('tenant_memberships' as any)
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (!membership) {
        return {};
      }
      
      tenantId = (membership as any).tenant_id;
    }
    
    if (!tenantId) {
      return {};
    }

    // 1. Buscar equipes do tenant
    const { data: teams, error: teamsError } = await supabase
      .from('teams' as any)
      .select('id, name, color')
      .eq('tenant_id', tenantId);

    if (teamsError || !teams) {
      console.error('❌ [metricsService] Erro ao buscar equipes:', teamsError);
      return {};
    }

    // 2. Buscar memberships com team_id e user_id
    const { data: memberships, error: membershipsError } = await supabase
      .from('tenant_memberships' as any)
      .select('user_id, team_id')
      .eq('tenant_id', tenantId)
      .not('team_id', 'is', null);

    if (membershipsError || !memberships) {
      console.error('❌ [metricsService] Erro ao buscar memberships:', membershipsError);
      return {};
    }

    // 3. Buscar perfis de usuário para obter nomes
    const userIds = memberships.map((m: any) => m.user_id);
    const { data: profiles, error: profilesError } = await supabase
      .from('user_profiles' as any)
      .select('id, full_name')
      .in('id', userIds);

    if (profilesError || !profiles) {
      console.error('❌ [metricsService] Erro ao buscar perfis:', profilesError);
      return {};
    }

    // 4. Criar mapa de user_id → nome
    const userToName = new Map(
      (profiles as any[]).map((p) => [p.id, p.full_name])
    );

    // 5. Criar mapa de team_id → equipe (name + color)
    const teamToEquipe = new Map(
      (teams as any[]).map((t) => [t.id, { name: t.name, color: t.color }])
    );

    // 6. Criar mapeamento final: nomeCorretor → { equipe, cor }
    const mapeamento: Record<string, { equipe: string; cor: string }> = {};

    (memberships as any[]).forEach((membership) => {
      const nomeCorretor = userToName.get(membership.user_id);
      const equipeInfo = teamToEquipe.get(membership.team_id);

      if (nomeCorretor && equipeInfo) {
        mapeamento[nomeCorretor] = {
          equipe: equipeInfo.name,
          cor: equipeInfo.color
        };
      }
    });

    // Atualizar cache
    mapeamentoEquipesCache = mapeamento;
    cacheTimestamp = now;

    return mapeamento;

  } catch (error) {
    console.error('❌ [metricsService] Erro ao buscar mapeamento de equipes:', error);
    return {};
  }
}

/**
 * Limpa o cache do mapeamento de equipes
 */
export function limparCacheMapeamentoEquipes(): void {
  mapeamentoEquipesCache = null;
  cacheTimestamp = 0;
}

/**
 * Calcula métricas de tempo de resposta usando a tabela leads principal
 */
export async function calcularMetricasCorretoresFromLeads(
  dataInicio?: Date,
  dataFim?: Date,
  tenantId?: string
): Promise<CorretorMetrica[]> {
  try {
    if (!tenantId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data: membership } = await supabase
        .from('tenant_memberships' as any)
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (!membership) return [];
      tenantId = (membership as any).tenant_id;
    }

    // Buscar leads do tenant com tempo de resposta
    let query = supabase
      .from('leads' as any)
      .select('assigned_agent_id, assigned_at, created_at, status, final_sale_value, assigned_agent_name')
      .eq('tenant_id', tenantId)
      .filter('archived_at', 'is', null)
      .not('assigned_agent_id', 'is', null);
    
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
    const corretoresMap = new Map<string, any[]>();
    leads.forEach(lead => {
      const corretorNome = (lead as any).assigned_agent_name || 'Corretor Desconhecido';
      if (!corretoresMap.has(corretorNome)) corretoresMap.set(corretorNome, []);
      corretoresMap.get(corretorNome)!.push(lead);
    });
    
    // Calcular métricas
    const metricas: CorretorMetrica[] = [];
    corretoresMap.forEach((leadsDoCorretor, corretor) => {
      const totalLeads = leadsDoCorretor.length;
      const leadsFinalizados = leadsDoCorretor.filter(l => l.final_sale_value && l.final_sale_value > 0).length;
      const taxaAtendimento = totalLeads > 0 ? (leadsFinalizados / totalLeads) * 100 : 0;
      
      // Calcular tempo médio de resposta real
      let somaTempo = 0;
      let leadsComTempo = 0;
      
      leadsDoCorretor.forEach(lead => {
        const createdAt = new Date(lead.created_at);
        const assignedAt = new Date(lead.assigned_at);
        
        // Tempo em minutos desde criação até atribuição
        const diffMs = assignedAt.getTime() - createdAt.getTime();
        const diffMin = diffMs / (1000 * 60);
        
        // Considerar apenas tempos razoáveis (entre 0 e 24 horas)
        if (diffMin >= 0 && diffMin <= 1440) {
          somaTempo += diffMin;
          leadsComTempo++;
        }
      });
      
      const tempoMedio = leadsComTempo > 0 ? somaTempo / leadsComTempo : 0;
      
      metricas.push({
        corretor,
        totalLeadsAssumidos: totalLeads,
        tempoMedioResposta: Math.round(tempoMedio),
        leadsAtendidos: leadsFinalizados,
        leadsFinalizados,
        taxaAtendimento: Math.round(taxaAtendimento)
      });
    });
    
    return metricas;
    
  } catch (error) {
    console.error('?? Erro ao calcular métricas de corretores:', error);
    return [];
  }
}

/**
 * Busca métricas gerais de tempo de resposta
 */
export async function buscarMetricasGerais(
  dataInicio?: Date,
  dataFim?: Date
): Promise<MetricasGerais> {
  try {
    // Usar a nova função que busca da tabela leads principal
    const metricasCorretores = await calcularMetricasCorretoresFromLeads(dataInicio, dataFim);
    
    if (metricasCorretores.length === 0) {
      return {
        tempoMedioRespostaGeral: 0,
        totalLeadsAssumidos: 0,
        taxaAtendimentoGeral: 0
      };
    }
    
    // Calcular média geral
    const somaTempo = metricasCorretores.reduce((acc, m) => acc + m.tempoMedioResposta, 0);
    const somaLeads = metricasCorretores.reduce((acc, m) => acc + m.totalLeadsAssumidos, 0);
    const somaAtendidos = metricasCorretores.reduce((acc, m) => acc + m.leadsAtendidos, 0);
    
    const tempoMedioGeral = Math.round(somaTempo / metricasCorretores.length);
    const taxaAtendimentoGeral = somaLeads > 0 
      ? Math.round((somaAtendidos / somaLeads) * 100)
      : 0;
  
    
    return {
      tempoMedioRespostaGeral: tempoMedioGeral,
      totalLeadsAssumidos: somaLeads,
      taxaAtendimentoGeral
    };
    
  } catch (error) {
    console.error('?? Erro ao buscar métricas gerais:', error);
    return {
      tempoMedioRespostaGeral: 0,
      totalLeadsAssumidos: 0,
      taxaAtendimentoGeral: 0
    };
  }
}

/**
 * Busca métricas de tempo de resposta por equipe
 */
export async function buscarMetricasPorEquipe(
  dataInicio?: Date,
  dataFim?: Date,
  tenantId?: string
): Promise<MetricasEquipe[]> {
  try {
    
    // Se não foi fornecido tenantId, tentar obter do AuthContext
    if (!tenantId) {
      console.warn('?? [metricsService] Nenhum tenantId fornecido, tentando buscar do usuário...');
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn('?? [metricsService] Usuário não autenticado para buscar métricas por equipe');
        return [];
      }
      
      // Buscar tenant_id do usuário
      const { data: membership } = await supabase
        .from('tenant_memberships' as any)
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (!membership) {
        console.warn('?? [metricsService] Usuário sem tenant membership');
        return [];
      }
      
      tenantId = (membership as any).tenant_id;
    }
    
    
    // Continuar com o processamento usando este tenantId
    return await processarMetricasComTenant(tenantId, dataInicio, dataFim);
    
  } catch (error) {
    console.error('❌ Erro ao buscar métricas por equipe:', error);
    return [];
  }
}

/**
 * Processa métricas com um tenant específico
 */
async function processarMetricasComTenant(
  tenantId: string,
  dataInicio?: Date,
  dataFim?: Date
): Promise<MetricasEquipe[]> {
  const metricasCorretores = await calcularMetricasCorretoresFromLeads(dataInicio, dataFim, tenantId);
  
  if (metricasCorretores.length === 0) {
    return [];
  }
  
  // Filtrar corretores por tenant usando tenant_memberships
  // Primeiro, buscar todos os user_ids do tenant
  const { data: tenantMemberships, error: membershipsError } = await supabase
    .from('tenant_memberships' as any)
    .select('user_id')
    .eq('tenant_id', tenantId);
  
  if (membershipsError || !tenantMemberships) {
    console.warn('?? [metricsService] Erro ao buscar memberships do tenant:', membershipsError);
    return [];
  }
  
  // Buscar os nomes dos corretores do tenant
  const userIds = (tenantMemberships as any[]).map(m => m.user_id);
  const { data: tenantProfiles, error: profilesError } = await supabase
    .from('user_profiles' as any)
    .select('full_name')
    .in('id', userIds);
  
  if (profilesError || !tenantProfiles) {
    console.warn('?? [metricsService] Erro ao buscar perfis do tenant:', profilesError);
    return [];
  }
  
  const tenantCorretoresNomes = new Set((tenantProfiles as any[]).map(p => p.full_name));

  // Criar mapa de métricas por corretor
  const metricasMap = new Map<string, CorretorMetrica>();
  metricasCorretores.forEach(m => {
    metricasMap.set(m.corretor, m);
  });
  
  // Criar métricas para todos os corretores do tenant
  // Se o corretor tiver métricas, usar; senão, usar valores padrão (0)
  const metricasFiltradas: CorretorMetrica[] = Array.from(tenantCorretoresNomes)
    .filter(nome => nome !== null) // Remover valores nulos
    .map(nome => {
      const metricas = metricasMap.get(nome);
      if (metricas) {
        return metricas;
      } else {
        // Corretor sem métricas - usar valores padrão
        return {
          corretor: nome,
          totalLeadsAssumidos: 0,
          tempoMedioResposta: 0,
          leadsAtendidos: 0,
          leadsFinalizados: 0,
          taxaAtendimento: 0
        };
      }
    });

  // Buscar mapeamento de equipes do Supabase
  const mapeamentoEquipes = await buscarMapeamentoEquipes();
  
  // Agrupar métricas por equipe com dados detalhados
  const equipeMap = new Map<string, {
    tempoTotal: number;
    count: number;
    cor: string;
    corretores: string[];
    totalLeads: number;
    leadsFinalizados: number;
    somaTaxaAtendimento: number;
  }>();
  
  metricasFiltradas.forEach(metrica => {
    const equipaInfo = mapeamentoEquipes[metrica.corretor];
    
    if (equipaInfo) {
      const nomeEquipe = equipaInfo.equipe;
      
      if (!equipeMap.has(nomeEquipe)) {
        equipeMap.set(nomeEquipe, {
          tempoTotal: 0,
          count: 0,
          cor: equipaInfo.cor,
          corretores: [],
          totalLeads: 0,
          leadsFinalizados: 0,
          somaTaxaAtendimento: 0
        });
      }
      
      const equipeData = equipeMap.get(nomeEquipe)!;
      equipeData.tempoTotal += metrica.tempoMedioResposta;
      equipeData.count += 1;
      equipeData.corretores.push(metrica.corretor);
      equipeData.totalLeads += metrica.totalLeadsAssumidos;
      equipeData.leadsFinalizados += metrica.leadsFinalizados;
      equipeData.somaTaxaAtendimento += metrica.taxaAtendimento;
    } else {
      // Corretores sem equipe definida vão para "Equipe Geral"
      const nomeEquipe = 'Equipe Geral';
      
      if (!equipeMap.has(nomeEquipe)) {
        equipeMap.set(nomeEquipe, {
          tempoTotal: 0,
          count: 0,
          cor: '#6b7280', // Cinza
          corretores: [],
          totalLeads: 0,
          leadsFinalizados: 0,
          somaTaxaAtendimento: 0
        });
      }
      
      const equipeData = equipeMap.get(nomeEquipe)!;
      equipeData.tempoTotal += metrica.tempoMedioResposta;
      equipeData.count += 1;
      equipeData.corretores.push(metrica.corretor);
      equipeData.totalLeads += metrica.totalLeadsAssumidos;
      equipeData.leadsFinalizados += metrica.leadsFinalizados;
      equipeData.somaTaxaAtendimento += metrica.taxaAtendimento;
    }
  });
  
  // Converter Map para array de métricas com cálculos melhorados
  const metricas: MetricasEquipe[] = Array.from(equipeMap.entries()).map(
    ([equipe, data]) => {
      const tempoMedio = data.count > 0 ? Math.round(data.tempoTotal / data.count) : 0;
      const taxaConversao = data.totalLeads > 0 ? Math.round((data.leadsFinalizados / data.totalLeads) * 100) : 0;

      
      return {
        equipe,
        tempoMedio,
        cor: data.cor,
        corretores: data.corretores
      };
    }
  );
  
  // Ordenar por tempo médio (mais rápido primeiro)
  metricas.sort((a, b) => a.tempoMedio - b.tempoMedio);
  
  return metricas;
}

/**
 * Busca métrica de tempo de resposta para um corretor específico
 */
export async function buscarMetricaCorretor(
  nomeCorretor: string,
  dataInicio?: Date,
  dataFim?: Date
): Promise<CorretorMetrica | null> {
  try {
    
    const metricasCorretores = await calcularMetricasCorretores(dataInicio, dataFim);
    
    const metrica = metricasCorretores.find(m => m.corretor === nomeCorretor);
    
    if (metrica) {
    } else {
    }
    
    return metrica || null;
    
  } catch (error) {
    console.error(`❌ Erro ao buscar métrica do corretor ${nomeCorretor}:`, error);
    return null;
  }
}

/**
 * Busca todas as métricas de corretores
 */
export async function buscarTodasMetricasCorretores(
  dataInicio?: Date,
  dataFim?: Date
): Promise<CorretorMetrica[]> {
  try {
    
    const metricas = await calcularMetricasCorretoresFromLeads(dataInicio, dataFim);
    
    
    return metricas;
    
  } catch (error) {
    console.error('?? Erro ao buscar métricas de corretores:', error);
    return [];
  }
}

/**
 * Busca contagem de leads por equipe do tenant
 */
export async function buscarLeadsPorEquipe(tenantId?: string): Promise<{ equipe: string; quantidade: number; cor: string }[]> {
  try {
    if (!tenantId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data: membership } = await supabase
        .from('tenant_memberships' as any)
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (!membership) return [];
      tenantId = (membership as any).tenant_id;
    }

    // Buscar leads do tenant
    const { data: leads, error } = await supabase
      .from('leads' as any)
      .select('id, assigned_agent_name')
      .eq('tenant_id', tenantId)
      .filter('archived_at', 'is', null);

    if (error || !leads) return [];

    // Buscar memberships com user_profiles para mapear nome -> team
    const { data: memberships } = await supabase
      .from('tenant_memberships' as any)
      .select('user_id, team_id')
      .eq('tenant_id', tenantId)
      .not('team_id', 'is', null);

    if (!memberships) return [];

    // Buscar user_profiles para obter emails
    const { data: userProfiles } = await supabase
      .from('user_profiles' as any)
      .select('id, email');

    if (!userProfiles) return [];

    // Buscar equipes para obter cores
    const { data: teams } = await supabase
      .from('teams' as any)
      .select('id, name, color')
      .eq('tenant_id', tenantId);

    if (!teams) return [];

    // Criar mapeamentos
    const userIdToEmail = new Map((userProfiles as any[]).map(p => [p.id, p.email]));
    const userToTeam = new Map((memberships as any[]).map(m => [m.user_id, m.team_id]));
    const teamToInfo = new Map((teams as any[]).map(t => [t.id, { name: t.name, color: t.color }]));

    // Criar mapa de email -> team_id
    const emailToTeam = new Map<string, string>();
    (memberships as any[]).forEach(m => {
      const userEmail = userIdToEmail.get(m.user_id);
      if (userEmail && m.team_id) {
        emailToTeam.set(userEmail, m.team_id);
      }
    });


    // Contar leads por equipe
    const equipeCount = new Map<string, number>();
    const geralCount = new Map<string, number>(); // Contagem para "Equipe Geral"
    
    (leads as any[]).forEach(lead => {
      if (lead.assigned_agent_name) {
        const teamId = emailToTeam.get(lead.assigned_agent_name);
        if (teamId) {
          equipeCount.set(teamId, (equipeCount.get(teamId) || 0) + 1);
        } else {
          // Lead sem equipe mapeada -> "Equipe Geral"
          geralCount.set('geral', (geralCount.get('geral') || 0) + 1);
        }
      }
    });

    // Converter para array
    const resultado = Array.from(equipeCount.entries()).map(([teamId, count]) => {
      const info = teamToInfo.get(teamId);
      return {
        equipe: info?.name || 'Equipe Geral',
        quantidade: count,
        cor: info?.color || '#6b7280'
      };
    });

    // Adicionar "Equipe Geral" se houver leads sem equipe
    if (geralCount.has('geral') && geralCount.get('geral') > 0) {
      resultado.push({
        equipe: 'Equipe Geral',
        quantidade: geralCount.get('geral'),
        cor: '#6b7280'
      });
    }

    return resultado;
  } catch (error) {
    console.error('❌ Erro ao buscar leads por equipe:', error);
    return [];
  }
}

/**
 * Busca distribuição de exclusivo vs ficha
 */
export async function buscarDistribuicaoExclusivoFicha(tenantId?: string): Promise<{ tipo: string; quantidade: number; percentual: number }[]> {
  try {
    if (!tenantId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data: membership } = await supabase
        .from('tenant_memberships' as any)
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (!membership) return [];
      tenantId = (membership as any).tenant_id;
    }

    // Buscar leads do tenant
    const { data: leads, error } = await supabase
      .from('leads' as any)
      .select('is_exclusive')
      .eq('tenant_id', tenantId)
      .filter('archived_at', 'is', null);

    if (error || !leads) return [];

    // Contar exclusivo vs ficha
    const exclusivo = (leads as any[]).filter(l => l.is_exclusive === true).length;
    const ficha = (leads as any[]).filter(l => l.is_exclusive === false).length;
    const total = exclusivo + ficha;

    if (total === 0) return [];

    return [
      {
        tipo: 'Exclusivo',
        quantidade: exclusivo,
        percentual: (exclusivo / total) * 100
      },
      {
        tipo: 'Ficha',
        quantidade: ficha,
        percentual: (ficha / total) * 100
      }
    ];
  } catch (error) {
    console.error('❌ Erro ao buscar distribuição exclusivo/ficha:', error);
    return [];
  }
}

/**
 * Busca negócios fechados por fonte
 */
export async function buscarNegociosFechadosPorFonte(tenantId?: string): Promise<{ fonte: string; quantidade: number }[]> {
  try {
    if (!tenantId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data: membership } = await supabase
        .from('tenant_memberships' as any)
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (!membership) return [];
      tenantId = (membership as any).tenant_id;
    }

    // Buscar leads finalizados do tenant dos últimos 6 meses
    const seisMesesAtras = new Date();
    seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 6);

    const { data: leads, error } = await supabase
      .from('leads' as any)
      .select('source, final_sale_value, created_at')
      .eq('tenant_id', tenantId)
      .filter('archived_at', 'is', null)
      .not('final_sale_value', 'is', null)
      .gt('final_sale_value', 0)
      .gte('created_at', seisMesesAtras.toISOString());

    if (error || !leads) {
      console.log('?? [metricsService] Erro ou sem leads finalizados:', error);
      return [];
    }

    // Contar por fonte
    const fonteCount = new Map<string, number>();
    (leads as any[]).forEach(lead => {
      const fonte = lead.source || 'Outros';
      fonteCount.set(fonte, (fonteCount.get(fonte) || 0) + 1);
    });

    const resultado = Array.from(fonteCount.entries()).map(([fonte, quantidade]) => ({
      fonte,
      quantidade
    }));
    
    return resultado;
  } catch (error) {
    console.error('❌ Erro ao buscar negócios fechados por fonte:', error);
    return [];
  }
}

/**
 * Busca vendas por faixa de preço por mês
 */
export async function buscarVendasPorFaixa(tenantId?: string): Promise<{ mes: string; ate_500k: number; de_500k_999k: number; acima_1m: number }[]> {
  try {
    if (!tenantId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data: membership } = await supabase
        .from('tenant_memberships' as any)
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (!membership) return [];
      tenantId = (membership as any).tenant_id;
    }

    // Buscar leads finalizados do tenant
    const { data: leads, error } = await supabase
      .from('leads' as any)
      .select('final_sale_value, created_at')
      .eq('tenant_id', tenantId)
      .filter('archived_at', 'is', null)
      .not('final_sale_value', 'is', null)
      .gt('final_sale_value', 0)
      .order('created_at', { ascending: true });

    if (error || !leads) return [];

    // Agrupar por mês e faixa de preço
    const vendasPorMes = new Map<string, { ate_500k: number; de_500k_999k: number; acima_1m: number }>();
    
    (leads as any[]).forEach(lead => {
      const valor = lead.final_sale_value;
      const mes = new Date(lead.created_at).toLocaleString('pt-BR', { month: 'short' });
      
      if (!vendasPorMes.has(mes)) {
        vendasPorMes.set(mes, { ate_500k: 0, de_500k_999k: 0, acima_1m: 0 });
      }
      
      const dados = vendasPorMes.get(mes)!;
      if (valor < 500000) {
        dados.ate_500k++;
      } else if (valor < 1000000) {
        dados.de_500k_999k++;
      } else {
        dados.acima_1m++;
      }
    });

    return Array.from(vendasPorMes.entries()).map(([mes, dados]) => ({
      mes,
      ...dados
    }));
  } catch (error) {
    console.error('❌ Erro ao buscar vendas por faixa:', error);
    return [];
  }
}

/**
 * Busca evolução de ativações de imóveis por mês
 */
export async function buscarEvolucaoAtivacoes(tenantId?: string): Promise<{ mes: string; quantidade: number }[]> {
  try {
    if (!tenantId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data: membership } = await supabase
        .from('tenant_memberships' as any)
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (!membership) return [];
      tenantId = (membership as any).tenant_id;
    }

    // Buscar imóveis do tenant dos últimos 6 meses
    const seisMesesAtras = new Date();
    seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 6);
    
    const { data: imoveis, error } = await supabase
      .from('imoveis_locais' as any)
      .select('created_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', seisMesesAtras.toISOString())
      .order('created_at', { ascending: true });

    if (error || !imoveis) {
      console.log('?? [metricsService] Erro ou sem imóveis:', error);
      return [];
    }

    // Agrupar por mês
    const ativacoesPorMes = new Map<string, number>();
    
    (imoveis as any[]).forEach(imovel => {
      const mes = new Date(imovel.created_at).toLocaleString('pt-BR', { month: 'short' });
      ativacoesPorMes.set(mes, (ativacoesPorMes.get(mes) || 0) + 1);
    });

    const resultado = Array.from(ativacoesPorMes.entries()).map(([mes, quantidade]) => ({
      mes,
      quantidade
    }));
    
    return resultado;
  } catch (error) {
    console.error('?? Erro ao buscar evolução de ativações:', error);
    return [];
  }
}

/**
 * Interface para variações percentuais
 */
export interface VariacoesPercentuais {
  vendasCriadas: number;
  vendasAssinadas: number;
  imoveisAtivos: number;
  totalLeadsMes: number;
  valorTotalVendasMes: number;
  tempoMedioRespostaGeral: number;
}

/**
 * Interface para KPIs da equipe
 */
export interface KPIsEquipe {
  vendasCriadas: number;
  vendasAssinadas: number;
  imoveisAtivos: number;
  totalLeadsMes: number;
  valorTotalVendasMes: number;
  tempoMedioRespostaGeral: number;
}

/**
 * Busca KPIs reais da equipe
 */
export async function buscarKPIsEquipe(tenantId?: string): Promise<KPIsEquipe> {
  try {
    if (!tenantId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return getDefaultKPIs();
      
      const { data: membership } = await supabase
        .from('tenant_memberships' as any)
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (!membership) return getDefaultKPIs();
      tenantId = (membership as any).tenant_id;
    }

    // Buscar todos os leads do tenant
    const { data: leads, error: leadsError } = await supabase
      .from('leads' as any)
      .select('created_at, final_sale_value, status')
      .eq('tenant_id', tenantId)
      .filter('archived_at', 'is', null);

    if (leadsError || !leads) {
      return getDefaultKPIs();
    }


    // Buscar imóveis ativos
    const { data: imoveis, error: imoveisError } = await supabase
      .from('imoveis_locais' as any)
      .select('id')
      .eq('tenant_id', tenantId);

    const imoveisAtivos = imoveisError || !imoveis ? 0 : imoveis.length;

    // Calcular KPIs
    const dataAtual = new Date();
    const primeiroDiaMes = new Date(dataAtual.getFullYear(), dataAtual.getMonth(), 1);

    const vendasCriadas = leads.length;
    const vendasAssinadas = leads.filter((l: any) => 
      l.final_sale_value && l.final_sale_value > 0
    ).length;

    const leadsDoMes = leads.filter((l: any) => 
      new Date(l.created_at) >= primeiroDiaMes
    ).length;

    const valorTotalVendas = leads.reduce((acc: number, l: any) => 
      l.final_sale_value ? acc + l.final_sale_value : acc, 0
    );

    // Buscar tempo médio de resposta geral
    const metricasGerais = await buscarMetricasGerais();
    const tempoMedioRespostaGeral = metricasGerais.tempoMedioRespostaGeral;

    const kpis: KPIsEquipe = {
      vendasCriadas,
      vendasAssinadas,
      imoveisAtivos,
      totalLeadsMes: leadsDoMes,
      valorTotalVendasMes: valorTotalVendas,
      tempoMedioRespostaGeral
    };

    return kpis;

  } catch (error) {
    console.error('?? Erro ao buscar KPIs da equipe:', error);
    return getDefaultKPIs();
  }
}

/**
 * Busca KPIs de um período específico para comparação
 */
async function buscarKPIsPeriodo(tenantId: string, dataInicio: Date, dataFim: Date): Promise<Partial<KPIsEquipe>> {
  try {
    // Buscar leads do período
    const { data: leads, error: leadsError } = await supabase
      .from('leads' as any)
      .select('created_at, final_sale_value, assigned_at')
      .eq('tenant_id', tenantId)
      .filter('archived_at', 'is', null)
      .gte('created_at', dataInicio.toISOString())
      .lte('created_at', dataFim.toISOString());

    if (leadsError || !leads) return {};

    // Buscar imóveis do período
    const { data: imoveis, error: imoveisError } = await supabase
      .from('imoveis_locais' as any)
      .select('id')
      .eq('tenant_id', tenantId)
      .gte('created_at', dataInicio.toISOString())
      .lte('created_at', dataFim.toISOString());

    const imoveisPeriodo = imoveisError || !imoveis ? 0 : imoveis.length;

    // Calcular KPIs do período
    const vendasCriadas = leads.length;
    const vendasAssinadas = leads.filter((l: any) => 
      l.final_sale_value && l.final_sale_value > 0
    ).length;

    const valorTotalVendas = leads.reduce((acc: number, l: any) => 
      l.final_sale_value ? acc + l.final_sale_value : acc, 0
    );

    // Calcular tempo médio de resposta do período
    let somaTempo = 0;
    let leadsComTempo = 0;
    
    leads.forEach((lead: any) => {
      if (lead.assigned_at) {
        const createdAt = new Date(lead.created_at);
        const assignedAt = new Date(lead.assigned_at);
        const diffMs = assignedAt.getTime() - createdAt.getTime();
        const diffMin = diffMs / (1000 * 60);
        
        if (diffMin >= 0 && diffMin <= 1440) {
          somaTempo += diffMin;
          leadsComTempo++;
        }
      }
    });

    const tempoMedio = leadsComTempo > 0 ? somaTempo / leadsComTempo : 0;

    return {
      vendasCriadas,
      vendasAssinadas,
      imoveisAtivos: imoveisPeriodo,
      totalLeadsMes: vendasCriadas,
      valorTotalVendasMes: valorTotalVendas,
      tempoMedioRespostaGeral: Math.round(tempoMedio)
    };
  } catch (error) {
    console.error('?? Erro ao buscar KPIs do período:', error);
    return {};
  }
}

/**
 * Calcula variações percentuais comparando mês atual com mês anterior
 */
export async function buscarVariacoesPercentuais(tenantId?: string): Promise<VariacoesPercentuais> {
  try {
    if (!tenantId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return getDefaultVariacoes();
      
      const { data: membership } = await supabase
        .from('tenant_memberships' as any)
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (!membership) return getDefaultVariacoes();
      tenantId = (membership as any).tenant_id;
    }

    // Definir períodos
    const agora = new Date();
    const inicioMesAtual = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const fimMesAtual = new Date(agora.getFullYear(), agora.getMonth() + 1, 0);
    
    const inicioMesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
    const fimMesAnterior = new Date(agora.getFullYear(), agora.getMonth(), 0);

    // Buscar KPIs do mês atual
    const kpisAtuais = await buscarKPIsPeriodo(tenantId, inicioMesAtual, fimMesAtual);
    
    // Buscar KPIs do mês anterior
    const kpisAnteriores = await buscarKPIsPeriodo(tenantId, inicioMesAnterior, fimMesAnterior);

    // Calcular variações
    const calcularVariacao = (atual: number, anterior: number): number => {
      if (anterior === 0) return atual > 0 ? 100 : 0;
      return Math.round(((atual - anterior) / anterior) * 100);
    };

    const variacoes: VariacoesPercentuais = {
      vendasCriadas: calcularVariacao(kpisAtuais.vendasCriadas || 0, kpisAnteriores.vendasCriadas || 0),
      vendasAssinadas: calcularVariacao(kpisAtuais.vendasAssinadas || 0, kpisAnteriores.vendasAssinadas || 0),
      imoveisAtivos: calcularVariacao(kpisAtuais.imoveisAtivos || 0, kpisAnteriores.imoveisAtivos || 0),
      totalLeadsMes: calcularVariacao(kpisAtuais.totalLeadsMes || 0, kpisAnteriores.totalLeadsMes || 0),
      valorTotalVendasMes: calcularVariacao(kpisAtuais.valorTotalVendasMes || 0, kpisAnteriores.valorTotalVendasMes || 0),
      tempoMedioRespostaGeral: calcularVariacao(kpisAtuais.tempoMedioRespostaGeral || 0, kpisAnteriores.tempoMedioRespostaGeral || 0)
    };

    return variacoes;

  } catch (error) {
    console.error('?? Erro ao calcular variações percentuais:', error);
    return getDefaultVariacoes();
  }
}

/**
 * Retorna variações padrão caso ocorra erro
 */
function getDefaultVariacoes(): VariacoesPercentuais {
  return {
    vendasCriadas: 0,
    vendasAssinadas: 0,
    imoveisAtivos: 0,
    totalLeadsMes: 0,
    valorTotalVendasMes: 0,
    tempoMedioRespostaGeral: 0
  };
}

/**
 * Retorna KPIs padrão caso ocorra erro
 */
function getDefaultKPIs(): KPIsEquipe {
  return {
    vendasCriadas: 0,
    vendasAssinadas: 0,
    imoveisAtivos: 0,
    totalLeadsMes: 0,
    valorTotalVendasMes: 0,
    tempoMedioRespostaGeral: 0
  };
}

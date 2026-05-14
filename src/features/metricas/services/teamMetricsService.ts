import { supabase } from '@/lib/supabaseClient';

const CACHE_DURATION = 5 * 60 * 1000;
const DEFAULT_TEAM_COLOR = '#6b7280';

export interface TeamMetricInfo {
  id: string;
  name: string;
  color: string;
}

export interface TeamResolver {
  teams: TeamMetricInfo[];
  teamById: Map<string, TeamMetricInfo>;
  userIdToTeam: Map<string, TeamMetricInfo>;
  nameToTeam: Map<string, TeamMetricInfo>;
  emailToTeam: Map<string, TeamMetricInfo>;
  teamMembers: Map<string, string[]>;
}

export interface TeamResponseMetric {
  equipe: string;
  tempoMedio: number;
  cor: string;
  corretores: string[];
}

export interface TeamLeadsCount {
  equipe: string;
  quantidade: number;
  cor: string;
}

export interface BrokerMetric {
  corretor: string;
  totalLeadsAssumidos: number;
  tempoMedioResposta: number;
  leadsAtendidos: number;
  leadsFinalizados: number;
  taxaAtendimento: number;
}

export interface TeamKpis {
  vendasCriadas: number;
  vendasAssinadas: number;
  imoveisAtivos: number;
  totalLeadsMes: number;
  valorTotalVendasMes: number;
  tempoMedioRespostaGeral: number;
}

export interface TeamMetricVariations {
  vendasCriadas: number;
  vendasAssinadas: number;
  imoveisAtivos: number;
  totalLeadsMes: number;
  valorTotalVendasMes: number;
  tempoMedioRespostaGeral: number;
}

interface ResolverCacheEntry {
  timestamp: number;
  resolver: TeamResolver;
}

interface LeadMetricRow {
  id?: string | null;
  created_at?: string | null;
  assigned_agent_id?: string | null;
  attended_by_id?: string | null;
  assigned_agent_name?: string | null;
  attended_by_name?: string | null;
  first_response_at?: string | null;
  final_sale_value?: number | null;
  status?: string | null;
}

interface MetricRange {
  dataInicio?: Date;
  dataFim?: Date;
  exclusiveEnd?: boolean;
}

const resolverCache = new Map<string, ResolverCacheEntry>();

export function limparCacheTeamMetrics(): void {
  resolverCache.clear();
}

export function normalizeMetricKey(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function toDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getCurrentMonthRange(reference = new Date()) {
  return {
    dataInicio: new Date(reference.getFullYear(), reference.getMonth(), 1),
    dataFim: new Date(reference.getFullYear(), reference.getMonth() + 1, 1),
    exclusiveEnd: true,
  };
}

function getPreviousMonthRange(reference = new Date()) {
  return {
    dataInicio: new Date(reference.getFullYear(), reference.getMonth() - 1, 1),
    dataFim: new Date(reference.getFullYear(), reference.getMonth(), 1),
    exclusiveEnd: true,
  };
}

function round(value: number, decimals = 1): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function percentual(atual: number, anterior: number): number {
  if (anterior === 0) return atual === 0 ? 0 : 100;
  return Math.round(((atual - anterior) / anterior) * 100);
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getRangeValue(date: Date, field: string, isEnd = false, exclusiveEnd = false): string {
  if (field === 'data_transacao') {
    return formatDateOnly(date);
  }

  if (isEnd && !exclusiveEnd) {
    const inclusiveEnd = new Date(date);
    inclusiveEnd.setHours(23, 59, 59, 999);
    return inclusiveEnd.toISOString();
  }

  return date.toISOString();
}

function addDateRange(query: any, range?: MetricRange, field = 'created_at') {
  let nextQuery = query;
  if (range?.dataInicio) {
    nextQuery = nextQuery.gte(field, getRangeValue(range.dataInicio, field));
  }
  if (range?.dataFim) {
    const endValue = getRangeValue(range.dataFim, field, true, range.exclusiveEnd);
    nextQuery = range.exclusiveEnd
      ? nextQuery.lt(field, endValue)
      : nextQuery.lte(field, endValue);
  }
  return nextQuery;
}

async function resolveTenantId(tenantId?: string): Promise<string | null> {
  if (tenantId) return tenantId;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from('tenant_memberships' as any)
    .select('tenant_id')
    .eq('user_id', user.id)
    .maybeSingle();

  return (membership as any)?.tenant_id ?? null;
}

function addTeamAlias(map: Map<string, TeamMetricInfo>, value: unknown, team: TeamMetricInfo): void {
  const key = normalizeMetricKey(value);
  if (!key || map.has(key)) return;
  map.set(key, team);
}

export async function buscarMapaEquipesPorTenant(tenantId?: string): Promise<TeamResolver> {
  const resolvedTenantId = await resolveTenantId(tenantId);
  const emptyResolver: TeamResolver = {
    teams: [],
    teamById: new Map(),
    userIdToTeam: new Map(),
    nameToTeam: new Map(),
    emailToTeam: new Map(),
    teamMembers: new Map(),
  };

  if (!resolvedTenantId) return emptyResolver;

  const now = Date.now();
  const cached = resolverCache.get(resolvedTenantId);
  if (cached && now - cached.timestamp < CACHE_DURATION) {
    return cached.resolver;
  }

  const { data: teamsData, error: teamsError } = await supabase
    .from('teams' as any)
    .select('id, name, color')
    .eq('tenant_id', resolvedTenantId)
    .order('name');

  if (teamsError) {
    console.error('[teamMetricsService] Erro ao buscar equipes:', teamsError);
    return emptyResolver;
  }

  const teams = ((teamsData || []) as any[]).map((team) => ({
    id: team.id,
    name: team.name || 'Equipe sem nome',
    color: team.color || DEFAULT_TEAM_COLOR,
  }));

  const teamById = new Map(teams.map((team) => [team.id, team]));

  const { data: membershipsData, error: membershipsError } = await supabase
    .from('tenant_memberships' as any)
    .select('user_id, team_id')
    .eq('tenant_id', resolvedTenantId)
    .not('team_id', 'is', null);

  if (membershipsError) {
    console.error('[teamMetricsService] Erro ao buscar membros de equipes:', membershipsError);
    return { ...emptyResolver, teams, teamById };
  }

  const memberships = ((membershipsData || []) as any[])
    .filter((membership) => membership.user_id && membership.team_id && teamById.has(membership.team_id));

  const userIds = [...new Set(memberships.map((membership) => membership.user_id))];
  const profilesResult = userIds.length > 0
    ? await supabase
        .from('user_profiles' as any)
        .select('id, full_name, email')
        .in('id', userIds)
    : { data: [], error: null };

  if (profilesResult.error) {
    console.warn('[teamMetricsService] Erro ao buscar perfis para equipes:', profilesResult.error);
  }

  const profileById = new Map(((profilesResult.data || []) as any[]).map((profile) => [profile.id, profile]));

  const userIdToTeam = new Map<string, TeamMetricInfo>();
  const nameToTeam = new Map<string, TeamMetricInfo>();
  const emailToTeam = new Map<string, TeamMetricInfo>();
  const teamMembers = new Map<string, string[]>();

  memberships.forEach((membership) => {
    const team = teamById.get(membership.team_id);
    if (!team) return;

    userIdToTeam.set(membership.user_id, team);

    const profile = profileById.get(membership.user_id) as any;
    const memberNames: string[] = [];

    if (profile?.full_name) {
      addTeamAlias(nameToTeam, profile.full_name, team);
      memberNames.push(profile.full_name);
    }
    if (profile?.email) {
      addTeamAlias(emailToTeam, profile.email, team);
      addTeamAlias(nameToTeam, profile.email, team);
    }

    const existingMembers = teamMembers.get(team.id) || [];
    teamMembers.set(team.id, [...new Set([...existingMembers, ...memberNames])]);
  });

  const resolver = { teams, teamById, userIdToTeam, nameToTeam, emailToTeam, teamMembers };
  resolverCache.set(resolvedTenantId, { timestamp: now, resolver });

  return resolver;
}

export function resolverEquipeDoLead(
  resolver: TeamResolver,
  lead: Partial<LeadMetricRow>
): TeamMetricInfo | null {
  const userId = lead.attended_by_id || lead.assigned_agent_id;
  if (userId) {
    const teamByUser = resolver.userIdToTeam.get(userId);
    if (teamByUser) return teamByUser;
  }

  const name = lead.assigned_agent_name || lead.attended_by_name;
  const byName = resolver.nameToTeam.get(normalizeMetricKey(name));
  if (byName) return byName;

  const byEmail = resolver.emailToTeam.get(normalizeMetricKey(name));
  if (byEmail) return byEmail;

  return null;
}

export function calcularTempoRespostaLead(lead: Partial<LeadMetricRow>): number | null {
  const createdAt = toDate(lead.created_at);
  const responseAt = toDate(lead.first_response_at);

  if (!createdAt || !responseAt) return null;

  const diffMin = (responseAt.getTime() - createdAt.getTime()) / (1000 * 60);
  if (diffMin < 0 || diffMin > 1440) return null;

  return diffMin;
}

async function buscarLeadsMetricas(
  tenantId: string,
  range?: MetricRange,
  includeArchived = false
): Promise<LeadMetricRow[]> {
  let query = supabase
    .from('leads' as any)
    .select('id, created_at, assigned_agent_id, assigned_agent_name, first_response_at, final_sale_value, status, archived_at')
    .eq('tenant_id', tenantId);

  if (!includeArchived) {
    query = query.is('archived_at', null);
  }

  query = addDateRange(query, range, 'created_at');

  const { data, error } = await query;
  if (error) {
    console.error('[teamMetricsService] Erro ao buscar leads para métricas:', error);
    return [];
  }

  return (data || []) as LeadMetricRow[];
}

export async function buscarMetricasCorretoresCentral(
  dataInicio?: Date,
  dataFim?: Date,
  tenantId?: string
): Promise<BrokerMetric[]> {
  const resolvedTenantId = await resolveTenantId(tenantId);
  if (!resolvedTenantId) return [];

  const leads = await buscarLeadsMetricas(resolvedTenantId, { dataInicio, dataFim });
  const byBroker = new Map<string, {
    total: number;
    responseTotal: number;
    responseCount: number;
    finalizados: number;
    atendidos: number;
  }>();

  leads.forEach((lead) => {
    const corretor = (lead.assigned_agent_name || 'Corretor Desconhecido').trim();
    const current = byBroker.get(corretor) || {
      total: 0,
      responseTotal: 0,
      responseCount: 0,
      finalizados: 0,
      atendidos: 0,
    };

    const responseMinutes = calcularTempoRespostaLead(lead);
    current.total += 1;

    if (responseMinutes !== null) {
      current.responseTotal += responseMinutes;
      current.responseCount += 1;
      current.atendidos += 1;
    }

    if ((lead.final_sale_value || 0) > 0 || normalizeMetricKey(lead.status).includes('proposta assinada')) {
      current.finalizados += 1;
    }

    byBroker.set(corretor, current);
  });

  return Array.from(byBroker.entries()).map(([corretor, data]) => ({
    corretor,
    totalLeadsAssumidos: data.total,
    tempoMedioResposta: data.responseCount > 0 ? Math.round(data.responseTotal / data.responseCount) : 0,
    leadsAtendidos: data.atendidos,
    leadsFinalizados: data.finalizados,
    taxaAtendimento: data.total > 0 ? round((data.atendidos / data.total) * 100) : 0,
  }));
}

export async function buscarMetricasGeraisCentral(
  dataInicio?: Date,
  dataFim?: Date,
  tenantId?: string
) {
  const resolvedTenantId = await resolveTenantId(tenantId);
  if (!resolvedTenantId) {
    return {
      tempoMedioRespostaGeral: 0,
      totalLeadsAssumidos: 0,
      taxaAtendimentoGeral: 0,
    };
  }

  const leads = await buscarLeadsMetricas(resolvedTenantId, { dataInicio, dataFim });
  let tempoTotal = 0;
  let leadsComResposta = 0;

  leads.forEach((lead) => {
    const responseMinutes = calcularTempoRespostaLead(lead);
    if (responseMinutes === null) return;
    tempoTotal += responseMinutes;
    leadsComResposta += 1;
  });

  return {
    tempoMedioRespostaGeral: leadsComResposta > 0 ? Math.round(tempoTotal / leadsComResposta) : 0,
    totalLeadsAssumidos: leads.length,
    taxaAtendimentoGeral: leads.length > 0 ? round((leadsComResposta / leads.length) * 100) : 0,
  };
}

export async function buscarMetricasPorEquipeCentral(
  tenantId?: string,
  dataInicio?: Date,
  dataFim?: Date
): Promise<TeamResponseMetric[]> {
  const resolvedTenantId = await resolveTenantId(tenantId);
  if (!resolvedTenantId) return [];

  const [resolver, leads] = await Promise.all([
    buscarMapaEquipesPorTenant(resolvedTenantId),
    buscarLeadsMetricas(resolvedTenantId, { dataInicio, dataFim }),
  ]);

  const stats = new Map<string, {
    team: TeamMetricInfo;
    responseTotal: number;
    responseCount: number;
    corretores: Set<string>;
  }>();

  resolver.teams.forEach((team) => {
    stats.set(team.id, {
      team,
      responseTotal: 0,
      responseCount: 0,
      corretores: new Set(resolver.teamMembers.get(team.id) || []),
    });
  });

  leads.forEach((lead) => {
    const team = resolverEquipeDoLead(resolver, lead);
    if (!team) return;

    const current = stats.get(team.id) || {
      team,
      responseTotal: 0,
      responseCount: 0,
      corretores: new Set<string>(),
    };

    if (lead.assigned_agent_name) current.corretores.add(lead.assigned_agent_name);

    const responseMinutes = calcularTempoRespostaLead(lead);
    if (responseMinutes !== null) {
      current.responseTotal += responseMinutes;
      current.responseCount += 1;
    }

    stats.set(team.id, current);
  });

  return Array.from(stats.values()).map((data) => ({
    equipe: data.team.name,
    tempoMedio: data.responseCount > 0 ? round(data.responseTotal / data.responseCount) : 0,
    cor: data.team.color,
    corretores: Array.from(data.corretores).sort(),
  }));
}

export async function buscarLeadsPorEquipeCentral(tenantId?: string): Promise<TeamLeadsCount[]> {
  const resolvedTenantId = await resolveTenantId(tenantId);
  if (!resolvedTenantId) return [];

  const [resolver, leads] = await Promise.all([
    buscarMapaEquipesPorTenant(resolvedTenantId),
    buscarLeadsMetricas(resolvedTenantId),
  ]);

  const counts = new Map<string, { team: TeamMetricInfo; quantidade: number }>();

  leads.forEach((lead) => {
    const team = resolverEquipeDoLead(resolver, lead);
    if (!team) return;

    const current = counts.get(team.id) || { team, quantidade: 0 };
    current.quantidade += 1;
    counts.set(team.id, current);
  });

  return Array.from(counts.values())
    .map(({ team, quantidade }) => ({
      equipe: team.name,
      quantidade,
      cor: team.color,
    }))
    .sort((a, b) => b.quantidade - a.quantidade);
}

async function countImoveisAtivos(tenantId: string, dataFim?: Date): Promise<number> {
  let query = supabase
    .from('imoveis_locais' as any)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  if (dataFim) {
    query = query.lt('created_at', dataFim.toISOString());
  }

  const { count, error } = await query;
  if (error) {
    console.error('[teamMetricsService] Erro ao contar imóveis ativos:', error);
    return 0;
  }

  return count || 0;
}

export async function buscarKPIsEquipeCentral(
  tenantId?: string,
  range?: MetricRange
): Promise<TeamKpis> {
  const resolvedTenantId = await resolveTenantId(tenantId);
  if (!resolvedTenantId) {
    return {
      vendasCriadas: 0,
      vendasAssinadas: 0,
      imoveisAtivos: 0,
      totalLeadsMes: 0,
      valorTotalVendasMes: 0,
      tempoMedioRespostaGeral: 0,
    };
  }

  const period = range || getCurrentMonthRange();

  const salesQuery = addDateRange(
    supabase
      .from('leads' as any)
      .select('status')
      .eq('tenant_id', resolvedTenantId)
      .eq('status', 'Proposta Enviada'),

    period,
    'updated_at'
  );

  const leadsQuery = addDateRange(
    supabase
      .from('leads' as any)
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', resolvedTenantId)
      .is('archived_at', null),
    period,
    'created_at'
  );

  const [salesResult, leadsResult, imoveisAtivos, metricasGerais] = await Promise.all([
    salesQuery,
    leadsQuery,
    countImoveisAtivos(resolvedTenantId, range?.dataFim),
    buscarMetricasGeraisCentral(period.dataInicio, period.dataFim, resolvedTenantId),
  ]);

  if (salesResult.error) {
    console.error('[teamMetricsService] Erro ao buscar vendas:', salesResult.error);
  }
  if (leadsResult.error) {
    console.error('[teamMetricsService] Erro ao contar leads do período:', leadsResult.error);
  }

  const vendas = (salesResult.data || []) as any[];
  const vendasAssinadas = vendas.filter((venda) => venda.status === 'concluida');

  return {
    vendasCriadas: vendas.length,
    vendasAssinadas: vendasAssinadas.length,
    imoveisAtivos,
    totalLeadsMes: leadsResult.count || 0,
    valorTotalVendasMes: vendasAssinadas.reduce((sum, venda) => sum + Number(venda.valor_imovel || 0), 0),
    tempoMedioRespostaGeral: metricasGerais.tempoMedioRespostaGeral,
  };
}

export async function buscarVariacoesPercentuaisEquipeCentral(tenantId?: string): Promise<TeamMetricVariations> {
  const resolvedTenantId = await resolveTenantId(tenantId);
  if (!resolvedTenantId) {
    return {
      vendasCriadas: 0,
      vendasAssinadas: 0,
      imoveisAtivos: 0,
      totalLeadsMes: 0,
      valorTotalVendasMes: 0,
      tempoMedioRespostaGeral: 0,
    };
  }

  const [atual, anterior] = await Promise.all([
    buscarKPIsEquipeCentral(resolvedTenantId, getCurrentMonthRange()),
    buscarKPIsEquipeCentral(resolvedTenantId, getPreviousMonthRange()),
  ]);

  return {
    vendasCriadas: percentual(atual.vendasCriadas, anterior.vendasCriadas),
    vendasAssinadas: percentual(atual.vendasAssinadas, anterior.vendasAssinadas),
    imoveisAtivos: percentual(atual.imoveisAtivos, anterior.imoveisAtivos),
    totalLeadsMes: percentual(atual.totalLeadsMes, anterior.totalLeadsMes),
    valorTotalVendasMes: percentual(atual.valorTotalVendasMes, anterior.valorTotalVendasMes),
    tempoMedioRespostaGeral: percentual(atual.tempoMedioRespostaGeral, anterior.tempoMedioRespostaGeral),
  };
}

export async function buscarMapeamentoCorretorEquipe(tenantId?: string): Promise<Record<string, { equipe: string; cor: string }>> {
  const resolver = await buscarMapaEquipesPorTenant(tenantId);
  const mapping: Record<string, { equipe: string; cor: string }> = {};

  resolver.nameToTeam.forEach((team, key) => {
    mapping[key] = { equipe: team.name, cor: team.color };
  });

  return mapping;
}

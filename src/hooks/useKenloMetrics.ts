/**
 * 📊 useKenloMetrics — Métricas agregadas da base universal de leads (kenlo_leads).
 *
 * ⚠️ MULTI-TENANT: todas as queries são filtradas por `tenant_id` vindo do AuthContext.
 *    `kenlo_leads` tem RLS desabilitada — o filtro em app é obrigatório.
 *
 * Retorna agregações prontas para os gráficos que antes usavam dados inventados.
 * Só emite queries quando há `tenantId` válido (ignora o pseudo-tenant "owner").
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  buscarMapaEquipesPorTenant,
  resolverEquipeDoLead,
} from '@/features/metricas/services/teamMetricsService';

const PAGE_SIZE = 1000;

interface KenloLeadRow {
  attended_by_id: string | null;
  attended_by_name: string | null;
  is_exclusive: boolean | null;
  interest_type: string | null;
  interest_is_sale: boolean | null;
  interest_is_rent: boolean | null;
  stage: string | null;
  temperature: string | null;
  portal: string | null;
  lead_timestamp: string | null;
  archived_at: string | null;
}

export interface MonthPoint {
  mes: string;
  quantidade: number;
}

export interface ExclusivoFichaPoint {
  tipo: 'Exclusivo' | 'Ficha';
  quantidade: number;
  percentual: number;
}

export interface EquipePoint {
  equipe: string;
  quantidade: number;
  cor: string;
}

const MES_LABEL = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

async function fetchKenloLeads(tenantId: string): Promise<KenloLeadRow[]> {
  const rows: KenloLeadRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('kenlo_leads')
      .select('attended_by_id,attended_by_name,is_exclusive,interest_type,interest_is_sale,interest_is_rent,stage,temperature,portal,lead_timestamp,archived_at')
      .eq('tenant_id', tenantId)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    const page = (data ?? []) as KenloLeadRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

export interface UseKenloMetricsResult {
  isLoading: boolean;
  isError: boolean;
  tenantReady: boolean;
  totalLeads: number;
  evolucaoMensal: MonthPoint[];
  exclusivoVsFicha: ExclusivoFichaPoint[];
  leadsPorEquipe: EquipePoint[];
}

export function useKenloMetrics(): UseKenloMetricsResult {
  const { tenantId } = useAuthContext();
  const tenantReady = Boolean(tenantId && tenantId !== 'owner');

  const leadsQuery = useQuery({
    queryKey: ['kenlo-metrics', 'leads', tenantId],
    queryFn: () => fetchKenloLeads(tenantId as string),
    enabled: tenantReady,
    staleTime: 5 * 60 * 1000,
  });

  const teamResolverQuery = useQuery({
    queryKey: ['kenlo-metrics', 'team-resolver', tenantId],
    queryFn: () => buscarMapaEquipesPorTenant(tenantId as string),
    enabled: tenantReady,
    staleTime: 10 * 60 * 1000,
  });

  const leads = useMemo(() => leadsQuery.data ?? [], [leadsQuery.data]);
  const teamResolver = teamResolverQuery.data;

  const evolucaoMensal = useMemo<MonthPoint[]>(() => {
    if (leads.length === 0) return [];
    const now = new Date();
    const buckets: MonthPoint[] = [];

    for (let i = 11; i >= 0; i--) {
      const ref = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = `${MES_LABEL[ref.getMonth()]}/${String(ref.getFullYear()).slice(2)}`;
      buckets.push({ mes: label, quantidade: 0 });
    }

    const firstBucketDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    for (const lead of leads) {
      if (!lead.lead_timestamp) continue;
      const ts = new Date(lead.lead_timestamp);
      if (Number.isNaN(ts.getTime())) continue;
      if (ts < firstBucketDate) continue;
      const idx = (ts.getFullYear() - firstBucketDate.getFullYear()) * 12 +
                  (ts.getMonth() - firstBucketDate.getMonth());
      if (idx >= 0 && idx < buckets.length) {
        buckets[idx] = { ...buckets[idx], quantidade: buckets[idx].quantidade + 1 };
      }
    }

    return buckets;
  }, [leads]);

  const exclusivoVsFicha = useMemo<ExclusivoFichaPoint[]>(() => {
    if (leads.length === 0) return [];
    let exclusivo = 0;
    let ficha = 0;
    for (const lead of leads) {
      if (lead.is_exclusive === true) exclusivo += 1;
      else ficha += 1;
    }
    const total = exclusivo + ficha;
    if (total === 0) return [];
    return [
      { tipo: 'Exclusivo', quantidade: exclusivo, percentual: (exclusivo / total) * 100 },
      { tipo: 'Ficha', quantidade: ficha, percentual: (ficha / total) * 100 },
    ];
  }, [leads]);

  const leadsPorEquipe = useMemo<EquipePoint[]>(() => {
    if (leads.length === 0 || !teamResolver) return [];

    const counts = new Map<string, { equipe: string; quantidade: number; cor: string }>();
    for (const lead of leads) {
      const team = resolverEquipeDoLead(teamResolver, {
        attended_by_id: lead.attended_by_id,
        attended_by_name: lead.attended_by_name,
        assigned_agent_name: lead.attended_by_name,
      });
      if (!team) continue;

      const current = counts.get(team.id) || {
        equipe: team.name,
        quantidade: 0,
        cor: team.color,
      };
      current.quantidade += 1;
      counts.set(team.id, current);
    }

    return Array.from(counts.values())
      .sort((a, b) => b.quantidade - a.quantidade);
  }, [leads, teamResolver]);

  return {
    isLoading: leadsQuery.isLoading || teamResolverQuery.isLoading,
    isError: leadsQuery.isError || teamResolverQuery.isError,
    tenantReady,
    totalLeads: leads.length,
    evolucaoMensal,
    exclusivoVsFicha,
    leadsPorEquipe,
  };
}

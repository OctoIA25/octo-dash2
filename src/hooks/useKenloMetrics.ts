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

const PAGE_SIZE = 1000;

interface KenloLeadRow {
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

interface CorretorRow {
  nm_corretor: string | null;
  email: string | null;
  equipe: string | null;
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

const EQUIPE_CORES: Record<string, string> = {
  Verde: '#22c55e',
  Amarela: '#eab308',
  Vermelha: '#ef4444',
  Azul: '#3b82f6',
  Laranja: '#f97316',
};

const fallbackCor = (idx: number): string => {
  const palette = ['#7c3aed', '#06b6d4', '#ec4899', '#14b8a6', '#f59e0b', '#6366f1'];
  return palette[idx % palette.length];
};

const normalizeName = (value: string | null | undefined): string => {
  if (!value) return '';
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
};

async function fetchKenloLeads(tenantId: string): Promise<KenloLeadRow[]> {
  const rows: KenloLeadRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('kenlo_leads')
      .select('attended_by_name,is_exclusive,interest_type,interest_is_sale,interest_is_rent,stage,temperature,portal,lead_timestamp,archived_at')
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

async function fetchCorretoresEquipe(tenantId: string): Promise<CorretorRow[]> {
  const { data, error } = await supabase
    .from('Corretores')
    .select('nm_corretor,email,equipe')
    .eq('tenant_id', tenantId);

  if (error) throw new Error(error.message);
  return (data ?? []) as CorretorRow[];
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

  const corretoresQuery = useQuery({
    queryKey: ['kenlo-metrics', 'corretores', tenantId],
    queryFn: () => fetchCorretoresEquipe(tenantId as string),
    enabled: tenantReady,
    staleTime: 10 * 60 * 1000,
  });

  const leads = leadsQuery.data ?? [];
  const corretores = corretoresQuery.data ?? [];

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
    if (leads.length === 0 || corretores.length === 0) return [];

    const nameToEquipe = new Map<string, string>();
    for (const c of corretores) {
      if (!c.equipe) continue;
      const byName = normalizeName(c.nm_corretor);
      if (byName) nameToEquipe.set(byName, c.equipe);
      const byEmail = normalizeName(c.email);
      if (byEmail) nameToEquipe.set(byEmail, c.equipe);
    }

    const counts = new Map<string, number>();
    for (const lead of leads) {
      const key = normalizeName(lead.attended_by_name);
      if (!key) continue;
      const equipe = nameToEquipe.get(key);
      if (!equipe) continue;
      counts.set(equipe, (counts.get(equipe) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([equipe, quantidade], idx) => ({
        equipe,
        quantidade,
        cor: EQUIPE_CORES[equipe] ?? fallbackCor(idx),
      }));
  }, [leads, corretores]);

  return {
    isLoading: leadsQuery.isLoading || corretoresQuery.isLoading,
    isError: leadsQuery.isError || corretoresQuery.isError,
    tenantReady,
    totalLeads: leads.length,
    evolucaoMensal,
    exclusivoVsFicha,
    leadsPorEquipe,
  };
}

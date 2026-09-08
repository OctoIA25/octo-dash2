/**
 * Métricas Individuais de UM corretor, sob demanda.
 *
 * Mesma fonte da aba "Métricas Individuais" de Relatórios (mesmos serviços,
 * mesmo builder, mesmo período padrão: o mês corrente) — só que sem arrastar o
 * `useRelatorios` inteiro, que também carrega KPIs do tenant, ranking e
 * métricas de equipes. Aqui só interessa o painel de um corretor.
 *
 * Busca só dispara com `nomeCorretor` preenchido: no grid de Gestão de Equipe
 * seriam N requisições, uma por card, para um painel que quase sempre está
 * fechado.
 */

import { useEffect, useState } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import {
  buscarMetricasIndividuaisLeads,
  buscarMetricasIndividuaisVendas,
  type MetricasIndividuaisLeads,
  type MetricasIndividuaisVendas,
} from '@/features/relatorios/services/relatoriosService';
import { buildCorretorMetricasCompletas } from '@/features/relatorios/utils/buildCorretorMetricasCompletas';
import type { CorretorMetricasCompletas } from '@/types/metricsTypes';

export interface PeriodoMetricas {
  inicio: string; // yyyy-MM-dd
  fim: string;    // yyyy-MM-dd
}

/** Mês corrente — o mesmo padrão do painel de Relatórios. */
export const periodoMesCorrente = (): PeriodoMetricas => ({
  inicio: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
  fim: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
});

interface Resultado {
  model: CorretorMetricasCompletas | null;
  isLoading: boolean;
  error: string | null;
}

export function useMetricasIndividuaisCorretor(
  nomeCorretor: string | null,
  periodo: PeriodoMetricas,
): Resultado {
  const { tenantId } = useAuth();
  const [leads, setLeads] = useState<MetricasIndividuaisLeads | null>(null);
  const [vendas, setVendas] = useState<MetricasIndividuaisVendas | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { inicio, fim } = periodo;

  useEffect(() => {
    if (!tenantId || tenantId === 'owner' || !nomeCorretor) {
      setLeads(null);
      setVendas(null);
      setError(null);
      return;
    }

    // Troca de corretor com a busca anterior em voo: descarta o resultado velho
    // em vez de deixá-lo sobrescrever o novo.
    let cancelado = false;
    setIsLoading(true);
    setError(null);

    Promise.all([
      buscarMetricasIndividuaisLeads(tenantId, nomeCorretor, inicio, fim),
      buscarMetricasIndividuaisVendas(tenantId, nomeCorretor, inicio, fim),
    ])
      .then(([leadsData, vendasData]) => {
        if (cancelado) return;
        setLeads(leadsData);
        setVendas(vendasData);
      })
      .catch((e: unknown) => {
        if (cancelado) return;
        console.error('Erro ao carregar métricas individuais do corretor:', e);
        setError(e instanceof Error ? e.message : 'Erro ao carregar métricas');
        setLeads(null);
        setVendas(null);
      })
      .finally(() => {
        if (!cancelado) setIsLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, [tenantId, nomeCorretor, inicio, fim]);

  const model = nomeCorretor
    ? buildCorretorMetricasCompletas({
        nomeCorretor,
        // Sem o ranking do tenant carregado aqui, a posição não é conhecida.
        // O card mostra o badge de ranking; 0 é o valor neutro (sem posição).
        rankingPosicao: 0,
        leads,
        vendas,
        gestaoAtivaRanking: leads?.totalLeads ?? 0,
        tempoMedioRespostaMin: leads?.tempoMedioRespostaMin ?? 0,
      })
    : null;

  return { model, isLoading, error };
}

/**
 * RELATÓRIO: Funil por Unidade (tipo de imóvel).
 *
 * Mesma ideia do funil de leads, porém agrupando por tipo de imóvel/unidade.
 *
 * Apresentação: GRÁFICO DE COLUNAS AGRUPADAS (mesmo estilo dos demais gráficos
 * da seção) — eixo X = etapas do funil; cada tipo de imóvel é uma série
 * (coluna colorida). Permite comparar visualmente as unidades em cada etapa.
 *
 * Reaproveitamento: as REGRAS das etapas vêm de
 * `@/features/leads/utils/funnelStages` (sem duplicar lógica de negócio);
 * aqui cuidamos apenas da composição/visual do gráfico.
 *
 * Recebe `leads` JÁ FILTRADOS pela página (datas/corretor/equipe), ficando
 * automaticamente compatível com os filtros existentes.
 */

import { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';
import { Badge } from '@/components/ui/badge';
import { Building2, Layers } from 'lucide-react';
import { ImovelTipoInfo, UnidadeCategoria } from '@/features/relatorios/utils/unidadeClassifier';
import { buildFunilPorUnidade } from '@/features/relatorios/utils/funilPorUnidade';
import { FunnelSubSection, getFunnelStageOrder } from '@/features/leads/utils/funnelStages';

// Registro idempotente dos elementos de barra do Chart.js.
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// Cor por categoria (consistente com a paleta azul/quente da seção).
const CATEGORIA_COR: Record<UnidadeCategoria, string> = {
  Apartamento: '#2563EB',
  Casa: '#10B981',
  Terreno: '#F59E0B',
  Galpão: '#8B5CF6',
  Outros: '#64748B',
  'Não informado': '#CBD5E1',
};

interface FunilPorUnidadeChartProps {
  leads: ProcessedLead[];
  tipoMap: Map<string, ImovelTipoInfo>;
  subSection?: FunnelSubSection;
  isLoading?: boolean;
}

export const FunilPorUnidadeChart = ({
  leads,
  tipoMap,
  subSection = 'geral',
  isLoading = false,
}: FunilPorUnidadeChartProps) => {
  const grupos = useMemo(
    () => buildFunilPorUnidade(leads, tipoMap, subSection),
    [leads, tipoMap, subSection]
  );

  const etapas = useMemo(() => getFunnelStageOrder(subSection), [subSection]);

  const totalGeral = useMemo(() => grupos.reduce((acc, g) => acc + g.total, 0), [grupos]);

  const chartData = useMemo(
    () => ({
      labels: etapas,
      datasets: grupos.map((g) => ({
        label: `${g.categoria} (${g.total.toLocaleString('pt-BR')})`,
        data: g.funnel.data,
        backgroundColor: CATEGORIA_COR[g.categoria] ?? '#64748B',
        borderRadius: 4,
        maxBarThickness: 28,
      })),
    }),
    [etapas, grupos]
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top' as const,
          labels: { color: '#6b7280', font: { size: 11 }, boxWidth: 12, usePointStyle: true },
        },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: 'rgba(75, 85, 99, 0.3)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: (ctx: { dataset: { label?: string }; parsed: { y: number } }) => {
              const nome = (ctx.dataset.label || '').replace(/\s*\(.*\)$/, '');
              return `${nome}: ${ctx.parsed.y.toLocaleString('pt-BR')} leads`;
            },
          },
        },
        datalabels: { display: false },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#6b7280', font: { size: 10 }, maxRotation: 45, minRotation: 30 },
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(107, 114, 128, 0.1)' },
          ticks: { color: '#6b7280', font: { size: 10 }, precision: 0 },
        },
      },
    }),
    []
  );

  return (
    <Card className="bg-bg-card border border-border shadow-sm dark:bg-bg-card/40 dark:border-bg-secondary/40">
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <StandardCardTitle icon={Layers}>Funil por Unidade</StandardCardTitle>
          <Badge variant="secondary" className="text-xs">
            {totalGeral.toLocaleString('pt-BR')} leads
          </Badge>
        </div>
        <p className="text-xs text-text-secondary dark:text-slate-400 mt-1">
          Leads por etapa do funil, comparados por tipo de imóvel.
        </p>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="py-16 text-center text-sm text-text-secondary dark:text-slate-400">
            Carregando funil por unidade…
          </div>
        ) : grupos.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2 text-text-secondary dark:text-slate-400">
            <Building2 className="h-8 w-8 opacity-60" />
            <p className="text-sm">Nenhum lead encontrado para o período/filtros selecionados.</p>
          </div>
        ) : (
          <div className="h-[420px]">
            <Bar data={chartData} options={options} />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FunilPorUnidadeChart;

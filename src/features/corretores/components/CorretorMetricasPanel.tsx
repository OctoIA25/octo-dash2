/**
 * Painel de Métricas Individuais de um corretor, embutido no card de Gestão de
 * Equipe. É o mesmo "Painel do corretor" da aba Métricas Individuais de
 * Relatórios: mesmo componente (CorretorMetricCard), mesmos serviços, mesmo
 * período padrão (mês corrente).
 *
 * Componente separado de propósito: o hook de busca não pode ser chamado dentro
 * do .map() dos cards — cada card aberto é que dispara a sua própria carga.
 */

import { useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import { CorretorMetricCard } from '@/components/metrics/individual';
import {
  useMetricasIndividuaisCorretor,
  periodoMesCorrente,
} from '../hooks/useMetricasIndividuaisCorretor';

interface CorretorMetricasPanelProps {
  nome: string;
  /** Abre a aba completa de Métricas Individuais em Relatórios. */
  onAbrirRelatorios?: () => void;
}

export const CorretorMetricasPanel = ({ nome, onAbrirRelatorios }: CorretorMetricasPanelProps) => {
  // periodoMesCorrente() devolve objeto novo a cada chamada; congelado aqui para
  // o efeito do hook não reiniciar a cada re-render do card.
  const periodo = useMemo(() => periodoMesCorrente(), []);
  const { model, isLoading, error } = useMetricasIndividuaisCorretor(nome, periodo);

  return (
    <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
            Métricas individuais
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Mês corrente — dados reais do banco.
          </p>
        </div>
        {onAbrirRelatorios && (
          <button
            type="button"
            onClick={onAbrirRelatorios}
            className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            Ver em Relatórios
            <ExternalLink className="h-3 w-3" />
          </button>
        )}
      </div>

      {error ? (
        <p className="text-xs text-rose-600 dark:text-rose-400 py-2">
          Não foi possível carregar as métricas: {error}
        </p>
      ) : (
        <div className="max-w-md">
          {model && <CorretorMetricCard corretor={model} isLoading={isLoading} />}
        </div>
      )}
    </div>
  );
};

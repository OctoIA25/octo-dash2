/**
 * Forecast Interessado — Comercial › Cliente Interessado › Forecast.
 *
 * Os negócios que já estão perto do fechamento, um por linha. O recorte por
 * papel (gestor vê o tenant, corretor vê os seus) vem do RLS de `proposals`,
 * não daqui.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, Plus, RefreshCw, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthContext } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  addLeadToForecast,
  fetchForecast,
  removeFromForecast,
  updateForecast,
  type ForecastPatch,
  type LeadParaForecast,
} from '../services/forecastService';
import { somarForecast, type ForecastRow } from '../utils/forecastRow';
import { moeda } from '../utils/format';
import { AdicionarLeadDialog } from './AdicionarLeadDialog';
import { ForecastTable } from './ForecastTable';

/** Box de resumo do topo. Os mesmos números do rodapé, na altura dos olhos. */
function BoxResumo({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-slate-100">
        {valor}
      </p>
    </div>
  );
}

export function ForecastSection() {
  const { tenantId } = useAuthContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const queryKey = ['forecast', tenantId];

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchForecast(tenantId as string),
    enabled: Boolean(tenantId) && tenantId !== 'owner',
  });

  const rows = data ?? [];

  const salvar = useMutation({
    mutationFn: ({ proposalId, patch }: { proposalId: string; patch: ForecastPatch }) =>
      updateForecast(proposalId, patch),

    // Otimista: a célula já mostra o valor novo enquanto o UPDATE viaja. Sem
    // isso o campo pisca de volta ao valor antigo até o refetch chegar.
    onMutate: async ({ proposalId, patch }) => {
      await queryClient.cancelQueries({ queryKey });
      const anterior = queryClient.getQueryData<ForecastRow[]>(queryKey);

      queryClient.setQueryData<ForecastRow[]>(queryKey, (atual) =>
        (atual ?? []).map((row) =>
          row.proposalId === proposalId
            ? {
                ...row,
                ...('empreendimento' in patch ? { empreendimento: patch.empreendimento ?? '' } : {}),
                ...('unidade' in patch ? { unidade: patch.unidade ?? '' } : {}),
                ...('previsaoFechamento' in patch
                  ? { previsaoFechamento: patch.previsaoFechamento || null }
                  : {}),
                ...('estadoAtual' in patch ? { estadoAtual: patch.estadoAtual ?? '' } : {}),
              }
            : row,
        ),
      );

      return { anterior };
    },

    onError: (err, _vars, context) => {
      // Desfaz o otimismo: deixar o valor novo na tela depois de um erro faz o
      // usuário acreditar que salvou.
      if (context?.anterior) queryClient.setQueryData(queryKey, context.anterior);
      toast({
        title: 'Não foi possível salvar',
        description: err instanceof Error ? err.message : 'Erro desconhecido ao salvar o campo.',
        variant: 'destructive',
      });
    },

    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const handleSave = (proposalId: string, patch: ForecastPatch) =>
    salvar.mutate({ proposalId, patch });

  const [dialogAberto, setDialogAberto] = useState(false);

  const tirar = useMutation({
    mutationFn: removeFromForecast,
    // Otimista: a linha sai na hora; volta se o banco recusar.
    onMutate: async (proposalId: string) => {
      await queryClient.cancelQueries({ queryKey });
      const anterior = queryClient.getQueryData<ForecastRow[]>(queryKey);
      queryClient.setQueryData<ForecastRow[]>(queryKey, (atual) =>
        (atual ?? []).filter((row) => row.proposalId !== proposalId),
      );
      return { anterior };
    },
    onError: (err, _id, context) => {
      if (context?.anterior) queryClient.setQueryData(queryKey, context.anterior);
      toast({
        title: 'Não foi possível tirar o lead',
        description: err instanceof Error ? err.message : 'Erro desconhecido.',
        variant: 'destructive',
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const colocar = useMutation({
    mutationFn: (lead: LeadParaForecast) => addLeadToForecast(tenantId as string, lead),
    onSuccess: (_data, lead) => {
      setDialogAberto(false);
      toast({ title: `${lead.name || 'Lead'} colocado no forecast.` });
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => {
      toast({
        title: 'Não foi possível colocar o lead',
        description: err instanceof Error ? err.message : 'Erro desconhecido.',
        variant: 'destructive',
      });
    },
  });

  const totais = somarForecast(rows);
  const leadIdsNoForecast = new Set(
    rows.map((row) => row.leadId).filter((id): id is string => !!id),
  );

  return (
    <div className="flex h-full w-full flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            Forecast
          </h1>
          <p className="text-sm text-muted-foreground">
            Negócios em negociação, proposta ou contrato — o que está virando fechamento.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => setDialogAberto(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Colocar lead
          </Button>
        </div>
      </header>

      {!isLoading && !error && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <BoxResumo titulo="Valor Geral de Venda" valor={moeda(totais.valor)} />
          <BoxResumo titulo="Valor Geral de Comissionamento" valor={moeda(totais.comissao)} />
          <BoxResumo titulo="Número de Prospects" valor={rows.length.toLocaleString('pt-BR')} />
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando forecast…
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'Erro ao carregar o forecast.'}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-12 text-center text-sm text-muted-foreground">
          Nenhum negócio nas fases finais do funil ainda. Quando um lead entrar em negociação ele
          aparece aqui — ou use “Colocar lead” para adicionar um manualmente.
        </div>
      ) : (
        <ForecastTable rows={rows} onSave={handleSave} onRemove={(id) => tirar.mutate(id)} />
      )}

      <AdicionarLeadDialog
        open={dialogAberto}
        onOpenChange={setDialogAberto}
        leadIdsNoForecast={leadIdsNoForecast}
        onAdd={(lead) => colocar.mutate(lead)}
        adicionando={colocar.isPending}
      />
    </div>
  );
}

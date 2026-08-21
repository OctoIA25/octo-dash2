/**
 * Forecast Interessado — Comercial › Cliente Interessado › Forecast.
 *
 * Os negócios que já estão perto do fechamento, um por linha. O recorte por
 * papel (gestor vê o tenant, corretor vê os seus) vem do RLS de `proposals`,
 * não daqui.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, RefreshCw, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthContext } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { fetchForecast, updateForecast, type ForecastPatch } from '../services/forecastService';
import { somarForecast, type ForecastRow } from '../utils/forecastRow';
import { moedaCompacta } from '../utils/format';
import { ForecastFunnel } from './ForecastFunnel';

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

  const totalGeral = somarForecast(rows);

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

        <div className="flex items-center gap-4">
          {rows.length > 0 && (
            <div className="text-right">
              <p className="text-lg font-semibold tabular-nums leading-tight">
                {moedaCompacta(totalGeral.valor)}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {rows.length} {rows.length === 1 ? 'negócio' : 'negócios'} ·{' '}
                {moedaCompacta(totalGeral.comissao)} em comissão
              </p>
            </div>
          )}

          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </header>

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
          Nenhum negócio nas fases finais do funil ainda. Assim que um lead entrar em negociação,
          ele aparece aqui.
        </div>
      ) : (
        <ForecastFunnel rows={rows} onSave={handleSave} />
      )}
    </div>
  );
}

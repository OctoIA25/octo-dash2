/**
 * Custo de IA na Telemetria (P2.8).
 *
 * A tela mostrava "custo —" e ninguém sabia se a IA era barata ou se ninguém
 * estava contando. Medido em 21/09/2026: das 19 chamadas registradas, ZERO
 * tinham token ou modelo.
 *
 * Por isso o primeiro elemento daqui não é o custo — é **quanto das chamadas
 * reportou uso**. Sem esse número, qualquer valor abaixo dele é uma meia
 * verdade que parece inteira.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CircleDollarSign, Loader2 } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { carregarCusto } from '../services/custoDeIaService';
import {
  confianca, custoPorDocumento, custoPorLead, dinheiro, sobreAFatura, tokens,
} from '../utils/custoDeIa';

interface Props {
  /** Modo do provedor de IA, quando conhecido. Muda o que se pode prometer. */
  modoDoProvedor?: 'api' | 'max' | null;
  percentualDoPlano?: number | null;
  dias?: number;
}

export function CustoDeIaSection({ modoDoProvedor = null, percentualDoPlano = null, dias = 30 }: Props) {
  const { user } = useAuthContext();
  const tenantId = user?.tenantId;

  const { data: painel, isLoading, isError, error } = useQuery({
    queryKey: ['custo-ia', tenantId, dias],
    queryFn: () => carregarCusto(tenantId!, dias),
    enabled: !!tenantId && tenantId !== 'owner',
  });

  const t = painel?.total ?? null;
  const conf = useMemo(() => confianca(t), [t]);

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Calculando o custo…
      </p>
    );
  }
  if (isError) {
    return (
      <p className="rounded-md border border-rose-200 p-3 text-sm text-rose-700 dark:border-rose-900 dark:text-rose-300">
        Não deu para calcular o custo: {(error as Error)?.message ?? 'erro desconhecido'}
      </p>
    );
  }
  if (!painel || !t) return null;

  return (
    <section className="space-y-3">
      <header>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <CircleDollarSign className="h-4 w-4 text-primary" />
          Custo de IA · últimos {dias} dias
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {sobreAFatura(modoDoProvedor, percentualDoPlano)}
        </p>
      </header>

      {/* O aviso vem ANTES dos números, de propósito: um custo parcial
          apresentado como total é pior do que nenhum custo. */}
      <div
        className={`flex items-start gap-2 rounded-md border p-2.5 text-xs ${
          conf.alerta
            ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'
            : 'text-muted-foreground'
        }`}
      >
        {conf.alerta && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
        <span>
          {conf.texto}
          {t.chamadas > 0 && ` (${conf.cobertura}% das chamadas com uso reportado)`}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Numero rotulo="Custo total" valor={dinheiro(t.custo_usd)} />
        <Numero
          rotulo="Custo por lead"
          valor={dinheiro(custoPorLead(t))}
          nota={t.leads_atendidos ? `${t.leads_atendidos} leads atendidos` : 'nenhum lead atendido'}
        />
        <Numero
          rotulo="Custo por documento"
          valor={dinheiro(custoPorDocumento(t))}
          nota={t.documentos ? `${t.documentos} documentos` : 'nenhum documento lido'}
        />
        <Numero
          rotulo="Chamadas"
          valor={String(t.chamadas)}
          nota={`${tokens(t.tokens_entrada + t.tokens_saida)} tokens · ${tokens(t.tokens_cache)} em cache`}
        />
      </div>

      {t.precos_nao_conferidos > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {t.precos_nao_conferidos} modelo(s) usam preço de tabela que ninguém conferiu ainda — o custo
          acima é uma estimativa até alguém confirmar em Configurações › IA.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Tabela
          titulo="Por agente"
          colunas={['Agente', 'Chamadas', 'Custo']}
          linhas={painel.por_agente.map((a) => [
            a.sem_uso > 0 ? `${a.agente} · ${a.sem_uso} sem uso` : a.agente,
            String(a.chamadas),
            dinheiro(a.custo_usd),
          ])}
        />
        <Tabela
          titulo="Por etapa"
          colunas={['Etapa', 'Chamadas', 'Custo']}
          linhas={painel.por_etapa.map((e) => [e.etapa, String(e.chamadas), dinheiro(e.custo_usd)])}
        />
      </div>

      <Tabela
        titulo="Por modelo"
        colunas={['Modelo', 'Chamadas', 'Tokens', 'Custo']}
        linhas={painel.por_modelo.map((m) => [
          // O modelo sem preço é o que explica um custo menor que o real.
          m.tem_preco ? (m.preco_conferido ? m.modelo : `${m.modelo} · preço não conferido`) : `${m.modelo} · sem preço cadastrado`,
          String(m.chamadas),
          tokens(m.tokens),
          dinheiro(m.custo_usd),
        ])}
      />
    </section>
  );
}

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{valor}</p>
      {nota && <p className="mt-0.5 text-[11px] text-muted-foreground">{nota}</p>}
    </div>
  );
}

function Tabela({
  titulo,
  colunas,
  linhas,
}: {
  titulo: string;
  colunas: string[];
  linhas: string[][];
}) {
  if (linhas.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <caption className="border-b bg-muted/40 p-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {titulo}
        </caption>
        <thead className="text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            {colunas.map((c, i) => (
              <th key={c} className={`p-2 ${i === 0 ? 'text-left' : 'text-right'}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l[0]} className="border-t">
              {l.map((v, i) => (
                <td key={i} className={`p-2 ${i === 0 ? '' : 'text-right tabular-nums'}`}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

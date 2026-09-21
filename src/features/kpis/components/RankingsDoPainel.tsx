/**
 * As oito tabelas de ranking, e o filtro por clique (P3.2).
 *
 * Clicar numa linha filtra o painel inteiro. SHIFT (ou segurar, no celular)
 * soma. Clicar de novo no que já está escolhido desfaz — é como a pessoa
 * cancela sem ir procurar o X do chip lá em cima.
 *
 * AS OITO ENTRAM, inclusive as vazias. O chefe pediu assim, e a tabela de
 * equipe quase vazia diz, melhor que qualquer aviso, que o campo existe e
 * ninguém preenche: 1 venda de 37 em produção.
 */

import { useRef } from 'react';
import { CircleOff } from 'lucide-react';
import { reais } from '../utils/painelComercial';
import {
  DIMENSOES, ROTULO_DA_DIMENSAO, estaSelecionado, type Dimensao, type Filtros,
} from '../utils/filtrosDoPainel';
import type { LinhaDeRanking, Rankings } from '../services/painelComercialService';

/** Quanto tempo segurar no celular vale como SHIFT. */
const SEGURAR_MS = 450;

interface Props {
  rankings: Rankings;
  filtros: Filtros;
  aoEscolher: (dimensao: Dimensao, valor: string, comShift: boolean) => void;
}

export function RankingsDoPainel({ rankings, filtros, aoEscolher }: Props) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {DIMENSOES.map((d) => (
        <Tabela
          key={d}
          dimensao={d}
          linhas={(rankings[d] ?? []) as LinhaDeRanking[]}
          semValor={(rankings[`${d}_sem_valor`] as number) ?? 0}
          filtros={filtros}
          aoEscolher={aoEscolher}
        />
      ))}
    </div>
  );
}

function Tabela({
  dimensao,
  linhas,
  semValor,
  filtros,
  aoEscolher,
}: {
  dimensao: Dimensao;
  linhas: LinhaDeRanking[];
  semValor: number;
  filtros: Filtros;
  aoEscolher: Props['aoEscolher'];
}) {
  // No celular não há SHIFT: segurar o dedo faz o mesmo papel.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const segurou = useRef(false);

  const iniciarToque = () => {
    segurou.current = false;
    timer.current = setTimeout(() => {
      segurou.current = true;
    }, SEGURAR_MS);
  };
  const terminarToque = () => {
    if (timer.current) clearTimeout(timer.current);
  };

  return (
    <div className="rounded-md border">
      <div className="flex items-baseline justify-between border-b bg-muted/40 px-2.5 py-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {ROTULO_DA_DIMENSAO[dimensao]}
        </span>
        {semValor > 0 && (
          // O número que explica um ranking curto. Sem ele, a tabela de equipe
          // parece quebrada em vez de vazia.
          <span
            className="text-[10px] text-amber-600 dark:text-amber-400"
            title={`${semValor} venda(s) do período não têm este campo preenchido e não aparecem aqui.`}
          >
            {semValor} sem
          </span>
        )}
      </div>

      {linhas.length === 0 ? (
        <p className="flex items-center gap-1.5 p-2.5 text-[11px] text-muted-foreground">
          <CircleOff className="h-3 w-3 shrink-0" />
          Nenhuma venda do período tem este campo preenchido.
        </p>
      ) : (
        <ul className="divide-y">
          {linhas.map((l) => {
            const escolhida = estaSelecionado(filtros, dimensao, l.valor);
            return (
              <li key={l.valor}>
                <button
                  type="button"
                  onPointerDown={iniciarToque}
                  onPointerUp={terminarToque}
                  onPointerLeave={terminarToque}
                  onClick={(e) => aoEscolher(dimensao, l.valor, e.shiftKey || segurou.current)}
                  title="Clique para filtrar · SHIFT (ou segure) para somar"
                  className={`flex w-full items-baseline justify-between gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-accent ${
                    escolhida ? 'bg-primary/10 font-medium text-primary' : ''
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{l.valor}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {l.vendas} · {reais(l.vgv)}
                    {l.participacao != null && ` · ${String(l.participacao).replace('.', ',')}%`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

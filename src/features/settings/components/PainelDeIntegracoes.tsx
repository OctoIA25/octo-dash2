/**
 * Integrações honestas (P4.10).
 *
 * O CRITÉRIO DE PRONTO DO PLANO é uma frase: "nenhum card pede senha para uma
 * integração que não existe". Antes disto, a tela mostrava 37 cards e seis
 * integrações existiam — as outras 31 eram formulário de e-mail e senha
 * desabilitado, com um selo "Desconectado" escrito à mão.
 *
 * Pedir credencial para o que não existe não é só inútil: é um convite a
 * digitar a senha de um portal numa caixa que não vai a lugar nenhum.
 *
 * Aqui ficam as duas peças que substituem aquilo: a FAIXA DE ESTADO das seis
 * de verdade (status, última sincronização, último erro e quantos leads cada
 * uma trouxe) e a LISTA do que ainda não existe — sem campo nenhum.
 */

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, CircleSlash, Clock, Plug } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import {
  comProblema, conectada, faz, rotuloDoStatus,
  type EstadoDaIntegracao, type Prevista,
} from '../integracoes';

async function carregarEstado(tenantId: string): Promise<EstadoDaIntegracao[] | null> {
  const { data, error } = await supabase.rpc('integracoes_status', { p_tenant_id: tenantId });
  if (error) throw error;
  return (data as EstadoDaIntegracao[]) ?? null;
}

async function carregarPrevistas(): Promise<Prevista[]> {
  const { data, error } = await supabase.rpc('integracoes_previstas_lista');
  if (error) throw error;
  return (data as Prevista[]) ?? [];
}

export function PainelDeIntegracoes({ tenantId }: { tenantId: string }) {
  const estado = useQuery({
    queryKey: ['integracoes-estado', tenantId],
    queryFn: () => carregarEstado(tenantId),
    enabled: !!tenantId && tenantId !== 'owner',
  });
  const previstas = useQuery({
    queryKey: ['integracoes-previstas'],
    queryFn: carregarPrevistas,
    enabled: !!tenantId && tenantId !== 'owner',
  });

  // A função devolve nulo quando recusa. Mostrar a tela vazia a quem não pode
  // ver seria dizer que a casa não tem integração nenhuma.
  if (estado.isSuccess && estado.data === null) {
    return (
      <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <strong>O estado das integrações é de quem administra a conta.</strong> Ele mostra
        erro de autenticação e endereço de servidor.
      </p>
    );
  }

  const itens = estado.data ?? [];
  const conectadas = itens.filter(conectada).length;
  const problemas = itens.filter(comProblema).length;

  return (
    <div className="mb-8 space-y-4">
      {/* ---------- os números, agora contados ---------- */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Tile icone={Plug} cor="blue" rotulo="Integrações disponíveis" valor={itens.length}
          nota="as que existem de verdade" />
        <Tile icone={CheckCircle2} cor="green" rotulo="Conectadas" valor={conectadas}
          nota={problemas > 0 ? `${problemas} com erro` : undefined} />
        <Tile icone={Clock} cor="purple" rotulo="Leads por integração" valor={null}
          nota="cada uma conta os seus, abaixo" />
      </div>

      {/* ---------- a faixa de estado ---------- */}
      <section className="rounded-xl border bg-white dark:bg-slate-900">
        <header className="border-b px-4 py-2.5">
          <h2 className="text-sm font-semibold">Estado das integrações</h2>
        </header>

        {estado.isLoading && <p className="p-4 text-xs text-muted-foreground">Carregando…</p>}

        <ul className="divide-y">
          {itens.map((e) => (
            <li key={e.codigo} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {e.nome}
                  <SeloDeStatus e={e} />
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {e.configurada
                    ? (faz(e.ultima_sincronizacao)
                        ? `Última sincronização ${faz(e.ultima_sincronizacao)}`
                        : 'Nunca sincronizou')
                    : 'Não configurada nesta imobiliária'}
                  {/* Onde o erro não é guardado, a tela diz isso — em vez de
                      mostrar "sem erros", que seria afirmar o que não se sabe. */}
                  {e.configurada && e.erro_nao_registrado && ' · erros não são registrados aqui'}
                </p>
                {e.ultimo_erro && (
                  <p className="mt-1 flex items-start gap-1 text-[11px] text-red-600">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    {e.ultimo_erro}
                  </p>
                )}
              </div>

              <div className="shrink-0 text-right">
                {e.leads === null ? (
                  <p className="text-[11px] text-muted-foreground">{e.leads_de_onde}</p>
                ) : (
                  <>
                    <p className="text-lg font-semibold tabular-nums">{e.leads.toLocaleString('pt-BR')}</p>
                    {/* De onde saiu o número. Um contador sem origem é um número
                        para acreditar — e foi assim que o antigo errou por meses. */}
                    <p className="text-[10px] text-muted-foreground">{e.leads_de_onde}</p>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- o que ainda não existe ---------- */}
      {(previstas.data ?? []).length > 0 && (
        <section className="rounded-xl border bg-white dark:bg-slate-900">
          <header className="border-b px-4 py-2.5">
            <h2 className="text-sm font-semibold">Ainda não disponíveis</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Estes portais não têm integração nesta Dash. Até setembro de 2026 cada um
              mostrava um campo de e-mail e senha aqui — e não havia para onde aquilo ir.
            </p>
          </header>
          <ul className="grid gap-px bg-slate-100 dark:bg-slate-800 sm:grid-cols-2 lg:grid-cols-3">
            {(previstas.data ?? []).map((p) => (
              <li key={p.codigo} className="bg-white px-3 py-2 dark:bg-slate-900">
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  <CircleSlash className="h-3 w-3 shrink-0 text-slate-400" />
                  {p.nome}
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {p.estado === 'em_breve' ? 'em breve'
                      : p.estado === 'por_outra' ? 'já atendido' : 'em outra aba'}
                  </span>
                </p>
                {p.explicacao && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{p.explicacao}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SeloDeStatus({ e }: { e: EstadoDaIntegracao }) {
  const cor = !e.configurada
    ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
    : comProblema(e)
      ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
      : conectada(e)
        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200';
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cor}`}>
      {rotuloDoStatus(e)}
    </span>
  );
}

function Tile({
  icone: Icone, cor, rotulo, valor, nota,
}: {
  icone: typeof Plug;
  cor: 'blue' | 'green' | 'purple';
  rotulo: string;
  valor: number | null;
  nota?: string;
}) {
  const fundo = { blue: 'bg-blue-50 text-blue-600', green: 'bg-green-50 text-green-600',
                  purple: 'bg-purple-50 text-purple-600' }[cor];
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${fundo}`}>
          <Icone className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-slate-400">{rotulo}</p>
          {valor !== null && (
            <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-slate-100">{valor}</p>
          )}
          {nota && <p className="text-[10px] text-muted-foreground">{nota}</p>}
        </div>
      </div>
    </div>
  );
}

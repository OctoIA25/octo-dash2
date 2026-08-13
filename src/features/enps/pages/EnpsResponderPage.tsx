/**
 * Página de resposta do eNPS (in-app, autenticada). Deep-link /enps/responder?cycle=<id>.
 * Form pequeno em state local (spec §7). Duas escalas NPS 0–10 IDENTIFICADAS + um
 * texto livre ANÔNIMO (o servidor grava esse campo em outra tabela, sem vínculo com
 * o autor). A copy tem que dizer exatamente isso — é o que o corretor está aceitando.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { getEnpsService } from '../hooks/useEnps';
import type { EnpsResponderContext, EnpsQuestion } from '../types';

type Notas = Partial<Record<'q_empresa' | 'q_gestor', number>>;

function NpsScale({ questionKey, value, onPick }: { questionKey: 'q_empresa' | 'q_gestor'; value: number | undefined; onPick: (n: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: 11 }, (_, n) => {
        const active = value === n;
        return (
          <button key={n} type="button" aria-label={`Nota ${n} para ${questionKey}`} aria-pressed={active} onClick={() => onPick(n)}
            className={`h-9 w-9 rounded-lg border text-sm font-semibold tabular-nums transition-all ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
            {n}
          </button>
        );
      })}
    </div>
  );
}

function Banner({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mx-auto max-w-xl mt-16 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-center">
      <p className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">{title}</p>
      {subtitle && <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">{subtitle}</p>}
    </div>
  );
}

export function EnpsResponderPage() {
  const [params] = useSearchParams();
  const cycleId = params.get('cycle') ?? '';
  const queryClient = useQueryClient();

  const [ctx, setCtx] = useState<EnpsResponderContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notas, setNotas] = useState<Notas>({});
  const [comentario, setComentario] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!cycleId) { setLoadError('Link inválido: ciclo ausente.'); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    getEnpsService().getResponderContext(cycleId)
      .then((c) => { if (alive) { setCtx(c); setLoadError(null); } })
      .catch((e) => { if (alive) setLoadError(e instanceof Error ? e.message : 'Falha ao carregar a pesquisa.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [cycleId]);

  const empresaQ = useMemo<EnpsQuestion | undefined>(() => ctx?.questions.find((q) => q.key === 'q_empresa'), [ctx]);
  const gestorQ = useMemo<EnpsQuestion | undefined>(() => ctx?.questions.find((q) => q.key === 'q_gestor'), [ctx]);
  const comentarioQ = useMemo<EnpsQuestion | undefined>(() => ctx?.questions.find((q) => q.key === 'q_comentario'), [ctx]);

  const showGestor = !!ctx?.hasLeader && !!gestorQ;
  const canSubmit = notas.q_empresa !== undefined && !sending && (!showGestor || notas.q_gestor !== undefined);

  async function handleSubmit() {
    if (!ctx || notas.q_empresa === undefined) return;
    const answers: { q_empresa: number; q_gestor?: number; q_comentario?: string } = { q_empresa: notas.q_empresa };
    if (showGestor && notas.q_gestor !== undefined) answers.q_gestor = notas.q_gestor;
    const texto = comentario.trim();
    if (texto) answers.q_comentario = texto;
    setSending(true);
    try {
      await getEnpsService().submitResponse({ cycle_id: ctx.cycle.id, answers });
      // Invalida a pendência para o banner da dash sumir na hora (senão fica até
      // o staleTime de 5min expirar). Prefixo ['enps','pending'] cobre qualquer tenantId.
      queryClient.invalidateQueries({ queryKey: ['enps', 'pending'] });
      toast.success('Resposta enviada. Obrigado!');
      setDone(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível enviar. Tente novamente.');
    } finally { setSending(false); }
  }

  if (loading) {
    return <div className="mx-auto max-w-xl p-6 space-y-4"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>;
  }
  if (loadError) return <Banner title="Não foi possível abrir a pesquisa" subtitle={loadError} />;
  if (!ctx) return <Banner title="Pesquisa indisponível" />;
  if (ctx.cycle.status === 'closed') return <Banner title="Esta pesquisa foi encerrada" subtitle="O ciclo deste mês já fechou. Obrigado pelo interesse." />;
  if (ctx.alreadyResponded || done) return <Banner title="Você já respondeu esta pesquisa" subtitle="Sua resposta foi registrada. Obrigado pela participação!" />;

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-[20px] font-bold text-slate-900 dark:text-slate-100">Pesquisa de satisfação (eNPS)</h1>
      <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">Suas notas ficam identificadas para a gestão. Só o campo de texto é anônimo. Leva menos de 1 minuto.</p>
      <div className="mt-6 space-y-6">
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-[14px] font-medium text-slate-900 dark:text-slate-100 mb-3">{empresaQ?.label ?? 'O quanto você recomendaria esta imobiliária para outro corretor trabalhar?'}</p>
          <NpsScale questionKey="q_empresa" value={notas.q_empresa} onPick={(n) => setNotas((p) => ({ ...p, q_empresa: n }))} />
          <div className="mt-1.5 flex justify-between text-[11px] text-slate-400"><span>0 — nada provável</span><span>10 — extremamente provável</span></div>
        </section>
        {showGestor && (
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <p className="text-[14px] font-medium text-slate-900 dark:text-slate-100 mb-3">{gestorQ!.label}</p>
            <NpsScale questionKey="q_gestor" value={notas.q_gestor} onPick={(n) => setNotas((p) => ({ ...p, q_gestor: n }))} />
            <div className="mt-1.5 flex justify-between text-[11px] text-slate-400"><span>0 — nada provável</span><span>10 — extremamente provável</span></div>
          </section>
        )}
        <section className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 p-4">
          <label htmlFor="enps-coment" className="text-[14px] font-medium text-slate-900 dark:text-slate-100">{comentarioQ?.label ?? 'Como está sendo sua experiência na equipe? Deixe sugestões ou críticas'}</label>
          <p className="mt-1 text-[12.5px] text-emerald-800 dark:text-emerald-300">Este campo é <strong>anônimo</strong>: fica guardado separado das suas notas, sem ligação com o seu nome.</p>
          <Textarea id="enps-coment" className="mt-2 bg-white dark:bg-slate-900" rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Opcional" />
        </section>
        <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full">{sending ? 'Enviando…' : 'Enviar resposta'}</Button>
      </div>
    </div>
  );
}

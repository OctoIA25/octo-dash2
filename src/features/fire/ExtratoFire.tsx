/**
 * A.6 · O extrato de uma pessoa: cada ponto, de onde veio e quando — e os
 * estornos, com o motivo. "Sem isso, a primeira contestação mata a campanha."
 * A origem com lead abre o lead ali mesmo (o modal das Notificações e do Chat).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CriarLeadQuickModal } from '@/features/leads/components/CriarLeadQuickModal';
import { fetchKanbanLeadDaConversa, type KanbanLead } from '@/features/leads/services/leadsService';
import { ROTULO_DO_EVENTO } from './fire';
import { carregarExtrato, estornarPonto, type PontoDoExtrato } from './fireService';

const quando = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

export function ExtratoFire({ tenantId, edicaoId, userId, podeEstornar }: {
  tenantId: string; edicaoId: string; userId: string; podeEstornar: boolean;
}) {
  const extrato = useQuery({ queryKey: ['fire-extrato', edicaoId, userId], queryFn: () => carregarExtrato(edicaoId, userId) });
  const [lead, setLead] = useState<KanbanLead | null>(null);
  const [erroLead, setErroLead] = useState<string | null>(null);

  const abrirLead = async (leadId: string) => {
    setErroLead(null);
    const achado = await fetchKanbanLeadDaConversa(tenantId, leadId, []);
    if (achado) setLead(achado);
    else setErroLead('Esse lead não foi encontrado. Ele pode ter sido arquivado ou transferido.');
  };

  if (extrato.isLoading) return <p className="text-[12.5px] text-slate-500">Carregando o extrato…</p>;
  if (extrato.isError) return <p role="alert" className="text-[12.5px] text-rose-600">{(extrato.error as Error).message}</p>;
  const pontos = extrato.data ?? [];
  if (pontos.length === 0) return <p className="text-[12.5px] text-slate-500">Nenhum ponto nesta edição ainda.</p>;

  return (
    <>
      {erroLead && <p role="alert" className="mb-1 text-[12px] text-rose-600">{erroLead}</p>}
      <ul aria-label="Extrato" className="divide-y divide-slate-100 text-[13px] dark:divide-slate-800">
        {pontos.map((p) => (
          <LinhaDoExtrato key={p.id} ponto={p} podeEstornar={podeEstornar} edicaoId={edicaoId} userId={userId} onAbrirLead={abrirLead} />
        ))}
      </ul>
      <CriarLeadQuickModal isOpen={lead !== null} onClose={() => setLead(null)} tenantId={tenantId} editingLead={lead} leadType={lead?.lead_type} />
    </>
  );
}

function LinhaDoExtrato({ ponto: p, podeEstornar, edicaoId, userId, onAbrirLead }: {
  ponto: PontoDoExtrato; podeEstornar: boolean; edicaoId: string; userId: string; onAbrirLead: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [estornando, setEstornando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const estornar = useMutation({
    mutationFn: () => estornarPonto(p.id, motivo.trim()),
    onSuccess: () => {
      setEstornando(false);
      qc.invalidateQueries({ queryKey: ['fire-extrato', edicaoId, userId] });
      qc.invalidateQueries({ queryKey: ['fire-painel'] });
    },
  });

  const origem = p.descricao || (p.origem_tipo === 'venda' || p.origem_tipo === 'proposta' ? 'sem lead' : '—');
  return (
    <li className="py-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="w-12 shrink-0 tabular-nums text-slate-500">{quando(p.data)}</span>
        <span className="font-medium">{p.estorno_de ? 'Estorno' : ROTULO_DO_EVENTO[p.evento]}</span>
        <span className="min-w-0 text-slate-600 dark:text-slate-300">
          ·{' '}
          {p.lead_id ? (
            <button type="button" className="text-blue-600 hover:underline dark:text-blue-400" onClick={() => onAbrirLead(p.lead_id!)}>{origem}</button>
          ) : origem}
        </span>
        <span className={`ml-auto tabular-nums font-semibold ${p.pontos < 0 ? 'text-rose-600' : 'text-emerald-700 dark:text-emerald-400'}`}>
          {p.pontos > 0 ? `+${p.pontos}` : p.pontos}
        </span>
      </div>
      {p.estorno_motivo && <p className="ml-14 text-[12px] text-slate-500">Motivo: {p.estorno_motivo}</p>}
      {p.estornado && <p className="ml-14 text-[12px] text-slate-500">estornado</p>}
      {podeEstornar && !p.estorno_de && !p.estornado && (
        estornando ? (
          <div className="ml-14 mt-1 flex flex-wrap items-center gap-2">
            <Input aria-label="Motivo do estorno" className="h-8 w-64" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por que este ponto está errado?" />
            <Button size="sm" variant="destructive" disabled={motivo.trim().length < 5 || estornar.isPending} onClick={() => estornar.mutate()}>Estornar</Button>
            <Button size="sm" variant="ghost" onClick={() => setEstornando(false)}>Cancelar</Button>
            {estornar.isError && <span role="alert" className="text-[12px] text-rose-600">{(estornar.error as Error).message}</span>}
          </div>
        ) : (
          <button type="button" className="ml-14 text-[12px] text-slate-500 hover:underline" onClick={() => setEstornando(true)}>estornar</button>
        )
      )}
    </li>
  );
}

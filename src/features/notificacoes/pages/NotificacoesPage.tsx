/**
 * Comunicados e alertas.
 *
 * A rota e a permissão continuam `notificacoes` (catálogo de permissões e
 * cargos não mudam); o nome na tela é "Comunicados".
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthContext } from '@/contexts/AuthContext';
import { useNotifications, type NotificationItem } from '@/contexts/NotificationsContext';
import { CriarLeadQuickModal } from '@/features/leads/components/CriarLeadQuickModal';
import { fetchKanbanLeadDaConversa, type KanbanLead } from '@/features/leads/services/leadsService';
import { NotificationListItem } from '../components/NotificationListItem';
import { NovoComunicadoDialog } from '../components/NovoComunicadoDialog';
import { destinoDoLink, tipoDe, type Categoria } from '../notificationKinds';
import { agruparPorDia } from '../tempo';
import { avisosNaTelaLigados, definirAvisosNaTela } from '../avisosNaTela';

type Aba = 'todos' | Categoria;

const ABAS: { id: Aba; rotulo: string; vazio: string }[] = [
  { id: 'todos', rotulo: 'Todos', vazio: 'Nada por aqui ainda. Comunicados, alertas dos seus leads e avisos do sistema aparecem nesta página.' },
  { id: 'comunicado', rotulo: 'Comunicados', vazio: 'Nenhum comunicado por aqui. Quando a diretoria ou a gerência enviar um aviso, ele aparece nesta aba.' },
  { id: 'alerta', rotulo: 'Alertas', vazio: 'Nenhum alerta. Atividades vencidas, bloqueios e leads esperando resposta aparecem aqui.' },
  { id: 'sistema', rotulo: 'Sistema', vazio: 'Nenhum aviso do sistema.' },
];

const ehAba = (v: string | null): v is Aba => ABAS.some((a) => a.id === v);

export const NotificacoesPage = () => {
  const { user, tenantId, isOwner } = useAuthContext();
  const { notifications, loading, loadError, loadNotifications, markAllAsRead, markAsRead, clearRead } = useNotifications();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const abaParam = params.get('aba');
  const aba: Aba = ehAba(abaParam) ? abaParam : 'todos';
  const leadId = params.get('lead');

  const [soNaoLidas, setSoNaoLidas] = useState(false);
  const [avisosLigados, setAvisosLigados] = useState(avisosNaTelaLigados);
  const [compondo, setCompondo] = useState(false);
  const [leadAberto, setLeadAberto] = useState<KanbanLead | null>(null);

  const role = user?.systemRole;
  const casaDeVerdade = !!tenantId && tenantId !== 'owner';
  const podeEnviarComunicado = casaDeVerdade && (isOwner || role === 'admin' || role === 'team_leader');

  useEffect(() => {
    if (tenantId && user?.id) loadNotifications(tenantId, user.id);
  }, [tenantId, user?.id, loadNotifications]);

  const atualizarParams = (mudar: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(params);
    mudar(p);
    setParams(p, { replace: true });
  };

  // ?lead=<uuid>: o link de uma notificação (ou do aviso na tela) abre o lead aqui.
  useEffect(() => {
    if (!leadId || !casaDeVerdade) return;
    let vivo = true;
    fetchKanbanLeadDaConversa(tenantId!, leadId, []).then((lead) => {
      if (!vivo) return;
      if (lead) setLeadAberto(lead);
      else toast.error('Esse lead não foi encontrado. Ele pode ter sido arquivado ou transferido.');
    });
    return () => { vivo = false; };
  }, [leadId, tenantId, casaDeVerdade]);

  const fecharLead = () => {
    setLeadAberto(null);
    atualizarParams((p) => p.delete('lead'));
  };

  const trocarAba = (id: Aba) => atualizarParams((p) => (id === 'todos' ? p.delete('aba') : p.set('aba', id)));

  const naoLidasPorAba = useMemo(() => {
    const conta: Record<Aba, number> = { todos: 0, comunicado: 0, alerta: 0, sistema: 0 };
    for (const n of notifications) {
      if (n.read) continue;
      conta.todos += 1;
      conta[tipoDe(n.type).categoria] += 1;
    }
    return conta;
  }, [notifications]);

  const grupos = useMemo(() => {
    const visiveis = notifications.filter(
      (n) => (aba === 'todos' || tipoDe(n.type).categoria === aba) && (!soNaoLidas || !n.read)
    );
    return agruparPorDia(visiveis, new Date());
  }, [notifications, aba, soNaoLidas]);

  const abrir = (item: NotificationItem) => {
    if (!item.read) markAsRead(item.id);
    const destino = destinoDoLink(item.linkType, item.linkId);
    if (destino) navigate(destino);
  };

  const alternarAvisos = (ligado: boolean) => {
    definirAvisosNaTela(ligado);
    setAvisosLigados(ligado);
  };

  const temLidas = notifications.some((n) => n.read);
  const abaAtual = ABAS.find((a) => a.id === aba) ?? ABAS[0];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Comunicados</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Avisos da diretoria, da gerência e da LIA, e alertas dos seus leads.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300" title="Vale só neste navegador">
            <Switch checked={avisosLigados} onCheckedChange={alternarAvisos} />
            Avisos na tela
          </label>
          <Button variant="outline" size="sm" onClick={() => markAllAsRead()} disabled={naoLidasPorAba.todos === 0}>
            Marcar tudo como lido
          </Button>
          {podeEnviarComunicado && (
            <Button size="sm" onClick={() => setCompondo(true)}>
              <Plus className="mr-1 h-4 w-4" aria-hidden /> Novo comunicado
            </Button>
          )}
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filtrar por tipo" className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {ABAS.map((a) => (
            <button key={a.id} type="button" aria-pressed={aba === a.id} onClick={() => trocarAba(a.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                aba === a.id
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}>
              {a.rotulo}
              {naoLidasPorAba[a.id] > 0 && (
                <span className="ml-1.5 rounded-full bg-blue-600 px-1.5 text-[11px] font-semibold text-white">
                  {naoLidasPorAba[a.id]}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <Switch checked={soNaoLidas} onCheckedChange={setSoNaoLidas} />
            Só não lidas
          </label>
          <Button variant="ghost" size="sm" onClick={() => clearRead()} disabled={!temLidas}>
            Limpar lidas
          </Button>
        </div>
      </div>

      <section className="mt-4">
        {loadError && (
          <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            Não deu para carregar as notificações.
            <Button variant="outline" size="sm" onClick={() => tenantId && user && loadNotifications(tenantId, user.id)}>
              Tentar de novo
            </Button>
          </div>
        )}

        {loading && notifications.length === 0 ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
          </div>
        ) : grupos.length === 0 ? (
          !loadError && (
            <p className="rounded-xl border border-dashed border-slate-200 px-6 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
              {soNaoLidas ? 'Tudo lido por aqui.' : abaAtual.vazio}
            </p>
          )
        ) : (
          grupos.map((g) => (
            <div key={g.rotulo} className="mb-6">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{g.rotulo}</h2>
              <ul className="space-y-2">
                {g.itens.map((n) => (
                  <NotificationListItem key={n.id} item={n} onAbrir={abrir} onMarcarLida={markAsRead} />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      {compondo && casaDeVerdade && user && (
        <NovoComunicadoDialog
          open={compondo}
          onOpenChange={setCompondo}
          tenantId={tenantId!}
          userId={user.id}
          soEquipesQueLidera={role === 'team_leader' && !isOwner}
        />
      )}

      <CriarLeadQuickModal
        isOpen={leadAberto !== null}
        onClose={fecharLead}
        tenantId={tenantId}
        editingLead={leadAberto}
        leadType={leadAberto?.lead_type}
      />
    </div>
  );
};

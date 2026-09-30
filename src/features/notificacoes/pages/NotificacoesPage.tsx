/**
 * Comunicados e alertas.
 *
 * A rota e a permissão continuam `notificacoes` (catálogo de permissões e
 * cargos não mudam); o nome na tela é "Comunicados".
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { BellRing, CheckCheck, Inbox, Plus } from 'lucide-react';
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

const ABAS: { id: Aba; rotulo: string; vazio: { titulo: string; texto: string } }[] = [
  { id: 'todos', rotulo: 'Tudo', vazio: { titulo: 'Nenhum aviso por enquanto', texto: 'Comunicados da diretoria e da gerência, alertas dos seus leads e avisos do sistema chegam aqui.' } },
  { id: 'comunicado', rotulo: 'Comunicados', vazio: { titulo: 'Nenhum comunicado', texto: 'Quando a diretoria, a gerência ou a LIA enviar um aviso para você ou para a sua equipe, ele aparece aqui.' } },
  { id: 'alerta', rotulo: 'Alertas', vazio: { titulo: 'Nenhum alerta', texto: 'Atividades vencidas, bloqueios e leads esperando resposta aparecem aqui.' } },
  { id: 'sistema', rotulo: 'Sistema', vazio: { titulo: 'Nenhum aviso do sistema', texto: 'Imóveis aguardando aprovação, demandas e avisos de integração aparecem aqui.' } },
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
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-7 tracking-tight text-slate-900 dark:text-slate-50">Comunicados</h1>
          <p className="mt-1 max-w-[60ch] text-sm text-slate-500 dark:text-slate-400">
            Avisos da diretoria, da gerência e da LIA, e os alertas dos seus leads.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 dark:text-slate-300"
            title="Mostra um aviso no canto da tela quando chega algo novo. Vale só neste navegador."
          >
            <BellRing className="h-4 w-4 text-slate-400" aria-hidden />
            Aviso na tela
            <Switch checked={avisosLigados} onCheckedChange={alternarAvisos} aria-label="Aviso na tela" />
          </label>
          {podeEnviarComunicado && (
            <Button onClick={() => setCompondo(true)} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Novo comunicado
            </Button>
          )}
        </div>
      </header>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filtrar por tipo" className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {ABAS.map((a) => (
            <button key={a.id} type="button" aria-pressed={aba === a.id} onClick={() => trocarAba(a.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                aba === a.id
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}>
              {a.rotulo}
              {naoLidasPorAba[a.id] > 0 && (
                <span className={`min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold leading-5 ${
                  aba === a.id ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                }`}>
                  {naoLidasPorAba[a.id]}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <Switch checked={soNaoLidas} onCheckedChange={setSoNaoLidas} aria-label="Só não lidas" />
            Só não lidas
          </label>
          <button type="button" onClick={() => markAllAsRead()} disabled={naoLidasPorAba.todos === 0}
            className="inline-flex items-center gap-1.5 font-medium text-slate-600 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:text-slate-50">
            <CheckCheck className="h-4 w-4" aria-hidden /> Marcar tudo como lido
          </button>
          <button type="button" onClick={() => clearRead()} disabled={!temLidas}
            className="font-medium text-slate-500 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:text-slate-50">
            Limpar lidas
          </button>
        </div>
      </div>

      <section className="mt-5">
        {loadError && (
          <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            Não deu para carregar os avisos. Confira a conexão e tente de novo.
            <Button variant="outline" size="sm" onClick={() => tenantId && user && loadNotifications(tenantId, user.id)}>
              Tentar de novo
            </Button>
          </div>
        )}

        {loading && notifications.length === 0 ? (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3.5 px-5 py-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2"><Skeleton className="h-3 w-1/3" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-5/6" /></div>
              </div>
            ))}
          </div>
        ) : grupos.length === 0 ? (
          !loadError && (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center dark:border-slate-800 dark:bg-slate-900">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                <Inbox className="h-5 w-5 text-slate-500" aria-hidden />
              </span>
              <p className="mt-4 text-sm font-semibold text-slate-900 dark:text-slate-50">
                {soNaoLidas ? 'Tudo lido por aqui' : abaAtual.vazio.titulo}
              </p>
              <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                {soNaoLidas ? 'Desligue "Só não lidas" para ver os avisos que você já leu.' : abaAtual.vazio.texto}
              </p>
              {podeEnviarComunicado && !soNaoLidas && (aba === 'todos' || aba === 'comunicado') && (
                <Button variant="outline" className="mt-5" onClick={() => setCompondo(true)}>
                  <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Novo comunicado
                </Button>
              )}
            </div>
          )
        ) : (
          grupos.map((g) => (
            <div key={g.rotulo} className="mb-6">
              <h2 className="mb-2 flex items-center gap-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                {g.rotulo}
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" aria-hidden />
              </h2>
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
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

/**
 * Painel de Atividades (rota /central-leads e aba "Central de Leads").
 *
 * Substituiu a listagem de leads das integrações que morava aqui. A listagem por
 * portal continua existindo no Kanban e no Bolsão; esta tela passou a responder
 * outra pergunta: "o que eu preciso fazer, e o que eu deixei passar".
 *
 * Atividade = linha de `agenda_eventos`. Não há tabela nova: o modal do lead, a
 * agenda, o WeekPlanner e o bloqueio do bolsão já escrevem e leem de lá.
 * As faixas de tempo e as abas vivem em `utils/atividades.ts`.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ClipboardList,
  Clock,
  Link2,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Sun,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ComboBox } from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  fetchTodosLeadsCRM,
  LEAD_TYPE_PROPRIETARIO,
  type KanbanLead,
} from '@/features/leads/services/leadsService';
import { classificacoesDe } from '@/features/leads/utils/classificarLead';
import { ClassificacaoDots } from '@/features/leads/components/ClassificacaoBadge';
import { fetchTenantMembers } from '@/features/corretores/services/tenantMembersService';
import {
  hasAnyPendingBlockingActivity,
  unblockCorretor,
} from '@/features/corretores/services/activityBlockingService';
import {
  faixaDaAtividade,
  contarAbas,
  filtrarPorAba,
  ordenarPorPrazo,
  separarAFazer,
  rotuloTipoAtividade,
  type AbaAtividades,
  TIPOS_ATIVIDADE,
  prazoAtividade,
  JANELA_DIAS,
  TIPOS_BLOQUEANTES,
  type Atividade,
} from '@/features/leads/utils/atividades';

const TODOS = '__todos__';

const PRIORIDADE_CLASSE: Record<string, string> = {
  alta: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  media: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  baixa: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

/** Colunas que a tela precisa de `agenda_eventos`. */
const COLUNAS =
  'id, titulo, descricao, data, horario, tipo, status, prioridade, corretor_email, lead_uuid, lead_nome, lead_telefone';

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Piso da consulta: atividade mais velha que isso não interessa ao painel. */
const inicioJanelaISO = () => {
  const d = new Date();
  d.setDate(d.getDate() - JANELA_DIAS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const negocioDoLead = (lead: KanbanLead): string => {
  if (lead.lead_type === LEAD_TYPE_PROPRIETARIO) return 'Captação';
  return classificacoesDe(lead.classification).includes('locacao') ? 'Aluguel' : 'Compra';
};

/** "Recebido em 05 de Dezembro de 2025 às 11:32" */
const recebidoEm = (lead: KanbanLead): string => {
  const quando = new Date(lead.event_at || lead.created_at);
  if (Number.isNaN(quando.getTime())) return '';
  const data = quando.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const hora = quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `Recebido em ${data} às ${hora}`;
};

const formatarPrazo = (a: Atividade) => {
  const prazo = prazoAtividade(a);
  const data = prazo.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const temHorario = /^\d{2}:\d{2}/.test((a.horario || '').toString());
  return temHorario ? `${data} às ${(a.horario || '').slice(0, 5)}` : `${data} · dia todo`;
};

/**
 * Uma aba do topo. Visual no espírito do C2S (ícone, rótulo, contagem), mas com
 * os tokens da dash — `primary` no ativo, `destructive` na contagem que cobra.
 */
const Aba: React.FC<{
  ativa: boolean;
  rotulo: string;
  contagem: number;
  icone: React.ReactNode;
  /** Contagem em vermelho: é dívida, não informação. */
  alerta?: boolean;
  onClick: () => void;
}> = ({ ativa, rotulo, contagem, icone, alerta, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={ativa ? 'page' : undefined}
    className={`relative flex min-w-[7rem] flex-1 flex-col items-center gap-1 border-b-2 px-3 py-2.5 transition-colors ${
      ativa
        ? 'border-primary text-primary'
        : 'border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'
    }`}
  >
    <span className="relative">
      {icone}
      {contagem > 0 && (
        <span
          className={`absolute -right-3 -top-2 min-w-[1.15rem] rounded-full px-1 text-[10px] font-bold leading-[1.15rem] text-white ${
            alerta ? 'bg-destructive' : 'bg-primary'
          }`}
        >
          {contagem > 999 ? '999+' : contagem}
        </span>
      )}
    </span>
    <span className="text-xs font-semibold">{rotulo}</span>
  </button>
);

/**
 * Card de uma atividade no painel, no formato do card de lead: quem é o lead e o
 * que ele quer em cima, a cobrança embaixo. A atividade é a linha vermelha do
 * rodapé — é assim que o corretor lê ("de quem é isso, e o que eu tenho que
 * fazer"), não uma lista de tarefas soltas.
 *
 * Atividade sem lead (tarefa avulsa) degrada pro título da própria atividade:
 * o card continua legível, só perde as colunas de interesse.
 */
const Linha: React.FC<{
  atividade: Atividade;
  lead?: KanbanLead;
  /** Só na aba "A fazer"; nas outras a faixa é derivada da própria atividade. */
  atrasada?: boolean;
  meuEmailNorm: string;
  concluindo: string | null;
  /** corretor_email (normalizado) → dono. Vazio enquanto não carregou. */
  pessoaPorEmail: Map<string, Pessoa>;
  onConcluir: (a: Atividade) => void;
  onVincularLead: (a: Atividade) => void;
}> = ({
  atividade,
  lead,
  atrasada,
  meuEmailNorm,
  concluindo,
  pessoaPorEmail,
  onConcluir,
  onVincularLead,
}) => {
  const minha = (atividade.corretor_email || '').toLowerCase() === meuEmailNorm;
  const faixa = faixaDaAtividade(atividade);
  const concluida = faixa === 'concluida';
  const cancelada = faixa === 'cancelada';
  // A aba "Todos" mostra vencidas que a aba "A fazer" já marcaria — a cor vem da
  // atividade, não de quem a renderiza.
  const emAtraso = atrasada ?? faixa === 'atrasada';
  const nome = lead?.nomedolead || atividade.lead_nome || atividade.titulo;
  // Nome e equipe descrevem a MESMA pessoa: quem tem que fazer a atividade.
  // Antes o nome vinha do `corretor_responsavel` do lead e a equipe do dono da
  // atividade — pessoas diferentes quando o gestor agenda para o corretor.
  const emailDono = (atividade.corretor_email || '').trim().toLowerCase();
  const pessoa = pessoaPorEmail.get(emailDono);
  const dono = pessoa?.nome || atividade.corretor_email;

  return (
    <article
      className={`overflow-hidden rounded-none border border-l-[3px] bg-card ${
        emAtraso
          ? 'border-border border-l-destructive'
          : concluida || cancelada
            ? 'border-border border-l-muted-foreground/30 bg-muted/30'
            : 'border-border border-l-primary'
      }`}
    >
      {/* Linha 1 — quem é */}
      <div className="flex items-center gap-3 px-3 py-2">
        <Checkbox
          checked={concluida}
          disabled={concluida || cancelada || !minha || concluindo === atividade.id}
          onCheckedChange={() => onConcluir(atividade)}
          aria-label={`Concluir ${atividade.titulo}`}
        />
        <span
          className={`truncate font-semibold ${
            concluida || cancelada ? 'text-muted-foreground line-through' : 'text-foreground'
          }`}
        >
          {nome}
        </span>
        {lead && <ClassificacaoDots tipo={lead.classification} />}
        <div className="ml-auto flex items-center gap-2">
          {concluindo === atividade.id && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {minha && (
            <button
              type="button"
              onClick={() => onVincularLead(atividade)}
              title={lead || atividade.lead_nome ? 'Trocar o lead vinculado' : 'Vincular um lead'}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Link2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Linha 2 — o que ele quer */}
      {lead ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border px-3 py-2 text-sm text-muted-foreground md:grid-cols-3">
          <span className="truncate">{negocioDoLead(lead)}</span>
          <span className="truncate">{lead.portal || 'Sem canal'}</span>
          <span className="truncate">{lead.lead || lead.email || ''}</span>
        </div>
      ) : (
        atividade.descricao && (
          <p className="border-t border-border px-3 py-2 text-sm text-muted-foreground">
            {atividade.descricao}
          </p>
        )
      )}

      {/* Linha 3 — quando entrou, e a cobrança */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-muted/40 px-3 py-1.5 text-xs">
        <span className="text-muted-foreground">{lead ? recebidoEm(lead) : ''}</span>
        <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
          <span
            className={
              concluida
                ? 'text-muted-foreground line-through'
                : emAtraso
                  ? 'font-semibold text-destructive'
                  : 'text-primary'
            }
          >
            {rotuloTipoAtividade(atividade.tipo)} · {formatarPrazo(atividade)}
          </span>
          {atividade.prioridade === 'alta' && !concluida && (
            <Badge className={`text-[10px] ${PRIORIDADE_CLASSE.alta}`}>alta</Badge>
          )}
          {dono && <span className="text-muted-foreground">{dono}</span>}
          <span className="text-muted-foreground">
            {pessoa?.equipe ? `Team ${pessoa.equipe}` : 'Sem time'}
          </span>
        </span>
      </div>
    </article>
  );
};

const Secao: React.FC<{
  titulo: string;
  icone: React.ReactNode;
  itens: Atividade[];
  vazio: string;
  children: (a: Atividade) => React.ReactNode;
}> = ({ titulo, icone, itens, vazio, children }) => (
  <section className="space-y-2">
    <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
      {icone}
      {titulo}
      <span className="rounded-full bg-muted px-2 text-xs">{itens.length}</span>
    </h2>
    {itens.length === 0 ? (
      <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        {vazio}
      </p>
    ) : (
      <div className="space-y-2">{itens.map((a) => children(a))}</div>
    )}
  </section>
);

/** Quem é o dono da atividade. Nome e equipe vêm juntos, da mesma pessoa. */
interface Pessoa {
  nome: string;
  equipe: string | null;
}

interface CentralLeadsPageProps {
  embedded?: boolean;
}

export const CentralLeadsPage: React.FC<CentralLeadsPageProps> = ({ embedded = false }) => {
  const { user, tenantId, isAdmin } = useAuth();
  // Leads direto do CRM: precisamos do `id` de verdade (uuid) pra amarrar a
  // atividade. `useLeadsData` entrega ProcessedLead, cujo `id_lead` é um
  // contador gerado no mapeamento — serve pra listar, não pra referenciar.
  const [leads, setLeads] = useState<KanbanLead[]>([]);

  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [concluindo, setConcluindo] = useState<string | null>(null);
  const [corretores, setCorretores] = useState<{ email: string; nome: string }[]>([]);
  // corretor_email (normalizado) → { nome, equipe }. Nome e equipe SEMPRE da
  // mesma pessoa: o dono da atividade.
  const [pessoaPorEmail, setPessoaPorEmail] = useState<Map<string, Pessoa>>(new Map());
  const [filtroCorretor, setFiltroCorretor] = useState<string>('');

  const [aba, setAba] = useState<AbaAtividades>('afazer');

  const [vinculando, setVinculando] = useState<Atividade | null>(null);
  const [leadEscolhido, setLeadEscolhido] = useState('');

  const [criarAberto, setCriarAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [nova, setNova] = useState({
    titulo: '',
    descricao: '',
    data: hojeISO(),
    horario: '',
    tipo: 'retornar_cliente',
    prioridade: 'media' as 'alta' | 'media' | 'baixa',
    leadNome: '',
    leadTelefone: '',
    leadUuid: null as string | null,
  });

  const tenantValido = Boolean(tenantId) && tenantId !== 'owner';
  // Casing original pra igualdade exata no banco; a versao minuscula so compara
  // em memoria. `_` e `%` sao legais em e-mail e viram curinga no LIKE, entao a
  // consulta usa `eq`, nunca `ilike`.
  const meuEmail = user?.email || '';
  const meuEmailNorm = meuEmail.toLowerCase();

  // Corretor vê só as suas; gestor escolhe no filtro (default: a equipe toda).
  const emailConsultado = isAdmin ? filtroCorretor : meuEmail;
  const visaoDeEquipe = isAdmin && filtroCorretor === '';

  const carregar = useCallback(async () => {
    if (!tenantValido) return;
    if (!visaoDeEquipe && !emailConsultado) return;

    setCarregando(true);
    try {
      let query = supabase
        .from('agenda_eventos')
        .select(COLUNAS)
        .eq('tenant_id', tenantId)
        .gte('data', inicioJanelaISO());

      if (!visaoDeEquipe) query = query.eq('corretor_email', emailConsultado);

      const { data, error } = await query;
      if (error) throw error;
      setAtividades((data || []) as unknown as Atividade[]);
    } catch (error) {
      console.error('Erro ao carregar atividades:', error);
      toast.error('Erro ao carregar atividades');
      setAtividades([]);
    } finally {
      setCarregando(false);
    }
  }, [tenantId, tenantValido, emailConsultado, visaoDeEquipe]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (!tenantValido) return;
    fetchTodosLeadsCRM(tenantId as string)
      .then(setLeads)
      .catch((e) => console.error('Erro ao carregar leads para vínculo:', e));
  }, [tenantId, tenantValido]);

  /**
   * Quem é cada corretor, da MESMA fonte que a tela de Equipe usa:
   * `tenant_memberships.team_id` para o vínculo, `user_profiles` para nome e
   * e-mail, `teams.name` para o nome do time.
   *
   * Não dá pra usar `fetchTenantMembers` aqui: `tenant_memberships` não tem
   * coluna de e-mail — ele vem da RPC `get_tenant_members`, e no fallback
   * (select direto) o campo `email` acaba preenchido com o `user_id`.
   */
  useEffect(() => {
    if (!tenantValido) return;

    (async () => {
      const [{ data: vinculos }, { data: times }] = await Promise.all([
        supabase.from('tenant_memberships').select('user_id, team_id').eq('tenant_id', tenantId),
        supabase.from('teams').select('id, name').eq('tenant_id', tenantId),
      ]);

      const ids = [...new Set((vinculos || []).map((v) => v.user_id as string))];
      if (ids.length === 0) return;

      const { data: perfis } = await supabase
        .from('user_profiles')
        .select('id, email, full_name')
        .in('id', ids);

      const nomeDoTime = new Map((times || []).map((t) => [t.id as string, t.name as string]));
      // Membership sem time não pode sobrescrever uma com time: o banco tem
      // linhas duplicadas por usuário e a ordem do select não é garantida.
      const timeDoUsuario = new Map<string, string>();
      for (const v of vinculos || []) {
        const nome = nomeDoTime.get(v.team_id as string);
        if (nome) timeDoUsuario.set(v.user_id as string, nome);
      }

      const mapa = new Map<string, Pessoa>();
      for (const p of perfis || []) {
        const email = String(p.email ?? '').trim().toLowerCase();
        if (!email) continue;
        mapa.set(email, {
          nome: String(p.full_name ?? '').trim() || email,
          equipe: timeDoUsuario.get(p.id as string) ?? null,
        });
      }
      setPessoaPorEmail(mapa);
    })().catch((e) => console.error('Erro ao carregar equipes:', e));
  }, [tenantId, tenantValido]);

  useEffect(() => {
    if (!isAdmin || !tenantValido) return;
    fetchTenantMembers(tenantId as string)
      .then((membros) =>
        setCorretores(
          membros
            .filter((m) => m.email)
            .map((m) => ({ email: m.email, nome: m.email }))
            .sort((a, b) => a.nome.localeCompare(b.nome))
        )
      )
      .catch((e) => console.error('Erro ao carregar corretores:', e));
  }, [isAdmin, tenantId, tenantValido]);

  // O card mostra o LEAD, não só a atividade — indexado por uuid pra não varrer
  // a lista de leads a cada linha renderizada.
  const leadsPorId = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);

  const contagens = useMemo(() => contarAbas(atividades), [atividades]);
  const aFazer = useMemo(() => separarAFazer(atividades), [atividades]);
  const listaDaAba = useMemo(
    () => ordenarPorPrazo(filtrarPorAba(atividades, aba)),
    [atividades, aba]
  );

  /**
   * Concluir é o que destrava o bolsão. Só o dono da atividade pode concluir —
   * gestor vê, cobra, mas não marca por ele.
   */
  const concluir = async (a: Atividade) => {
    if (!tenantValido) return;
    if ((a.corretor_email || '').toLowerCase() !== meuEmailNorm) {
      toast.error('Só o corretor responsável pode concluir a atividade.');
      return;
    }

    setConcluindo(a.id);
    try {
      const { error } = await supabase
        .from('agenda_eventos')
        .update({ status: 'concluido', updated_at: new Date().toISOString() })
        .eq('id', a.id)
        .eq('tenant_id', tenantId)
        .eq('corretor_email', meuEmail);
      if (error) throw error;

      setAtividades((prev) =>
        prev.map((x) => (x.id === a.id ? { ...x, status: 'concluido' } : x))
      );

      if ((TIPOS_BLOQUEANTES as readonly string[]).includes(a.tipo)) {
        const aindaPendente = await hasAnyPendingBlockingActivity(tenantId as string, meuEmail);
        if (!aindaPendente) {
          await unblockCorretor(tenantId as string, meuEmail);
          toast.success('Atividade concluída! Você foi desbloqueado do recebimento de leads.');
          return;
        }
      }
      toast.success('Atividade concluída!');
    } catch (error) {
      console.error('Erro ao concluir atividade:', error);
      toast.error('Erro ao concluir atividade');
      carregar();
    } finally {
      setConcluindo(null);
    }
  };

  /** Vincula (ou troca) o lead de uma atividade que já existe. */
  const salvarVinculo = async () => {
    if (!vinculando || !tenantValido) return;
    const lead = leads.find((l) => (l.nomedolead || l.lead || l.id) === leadEscolhido);
    const patch = {
      lead_uuid: lead?.id ?? null,
      lead_nome: leadEscolhido.trim() || null,
      lead_telefone: lead?.lead || null,
      updated_at: new Date().toISOString(),
    };

    try {
      const { error } = await supabase
        .from('agenda_eventos')
        .update(patch)
        .eq('id', vinculando.id)
        .eq('tenant_id', tenantId)
        .eq('corretor_email', meuEmail);
      if (error) throw error;

      setAtividades((prev) =>
        prev.map((x) => (x.id === vinculando.id ? { ...x, ...patch } : x))
      );
      toast.success(patch.lead_nome ? 'Lead vinculado!' : 'Lead desvinculado.');
      setVinculando(null);
    } catch (error) {
      console.error('Erro ao vincular lead:', error);
      toast.error('Erro ao vincular lead');
    }
  };

  const criar = async () => {
    if (!nova.titulo.trim()) {
      toast.error('Escreva o que precisa ser feito');
      return;
    }
    if (!user?.email || !tenantValido) {
      toast.error('Sessão sem tenant selecionado');
      return;
    }

    setSalvando(true);
    try {
      const { error } = await supabase.from('agenda_eventos').insert([
        {
          tenant_id: tenantId,
          corretor_email: user.email,
          titulo: nova.titulo.trim(),
          descricao: nova.descricao.trim() || null,
          data: nova.data,
          horario: nova.horario || null,
          tipo: nova.tipo,
          status: 'pendente',
          prioridade: nova.prioridade,
          lead_uuid: nova.leadUuid,
          lead_nome: nova.leadNome.trim() || null,
          lead_telefone: nova.leadTelefone.trim() || null,
        },
      ]);
      if (error) throw error;

      toast.success('Atividade criada!');
      setCriarAberto(false);
      setNova((prev) => ({
        ...prev,
        titulo: '',
        descricao: '',
        horario: '',
        leadNome: '',
        leadTelefone: '',
        leadUuid: null,
      }));
      carregar();
    } catch (error) {
      console.error('Erro ao criar atividade:', error);
      toast.error('Erro ao criar atividade');
    } finally {
      setSalvando(false);
    }
  };

  const linhaProps = {
    pessoaPorEmail,
    meuEmailNorm,
    concluindo,
    onConcluir: concluir,
    onVincularLead: (a: Atividade) => {
      setVinculando(a);
      setLeadEscolhido(a.lead_nome || '');
    },
  };

  const opcoesLead = useMemo(
    () =>
      leads.map((l) => ({
        value: l.nomedolead || l.lead || l.id,
        label: l.nomedolead || 'Sem nome',
        sublabel: l.lead || undefined,
      })),
    [leads]
  );

  if (!tenantValido) {
    return (
      <div className="p-6 text-sm text-slate-500">
        Selecione uma imobiliária para ver as atividades.
      </div>
    );
  }

  return (
    <div className={embedded ? 'space-y-6' : 'space-y-6 p-6'}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
            <ClipboardList className="h-6 w-6" />
            Atividades
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            O que precisa ser feito em cada lead — e o que passou do prazo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Select
              value={filtroCorretor || TODOS}
              onValueChange={(v) => setFiltroCorretor(v === TODOS ? '' : v)}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Corretor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Equipe toda</SelectItem>
                {corretores.map((c) => (
                  <SelectItem key={c.email} value={c.email}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="icon" onClick={carregar} disabled={carregando}>
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={() => setCriarAberto(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Nova atividade
          </Button>
        </div>
      </header>

      {/* Abas = estágios de tempo, não categorias. A atividade anda sozinha
          entre elas conforme o relógio; ver `atividadeNaAba` em utils. */}
      <nav
        className="flex overflow-x-auto border-b border-border"
        aria-label="Estágio das atividades"
      >
        <Aba
          ativa={aba === 'afazer'}
          onClick={() => setAba('afazer')}
          rotulo="A fazer"
          contagem={contagens.afazer}
          alerta={aFazer.pendentes.length > 0}
          icone={<ClipboardList className="h-5 w-5" />}
        />
        <Aba
          ativa={aba === 'visitas'}
          onClick={() => setAba('visitas')}
          rotulo="Visitas"
          contagem={contagens.visitas}
          icone={<MapPin className="h-5 w-5" />}
        />
        <Aba
          ativa={aba === 'futuras'}
          onClick={() => setAba('futuras')}
          rotulo="Futuras"
          contagem={contagens.futuras}
          icone={<Clock className="h-5 w-5" />}
        />
        <Aba
          ativa={aba === 'todos'}
          onClick={() => setAba('todos')}
          rotulo="Todos"
          contagem={contagens.todos}
          icone={<Archive className="h-5 w-5" />}
        />
      </nav>

      {carregando && atividades.length === 0 ? (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando atividades...
        </div>
      ) : aba === 'afazer' ? (
        <div className="space-y-6">
          <Secao
            titulo="Pendentes"
            icone={<AlertTriangle className="h-4 w-4 text-destructive" />}
            itens={aFazer.pendentes}
            vazio="Nada pendente."
          >
            {(a) => <Linha key={a.id} atividade={a} lead={leadsPorId.get(a.lead_uuid || '')} atrasada {...linhaProps} />}
          </Secao>
          <Secao
            titulo="Hoje"
            icone={<Sun className="h-4 w-4 text-amber-500" />}
            itens={aFazer.hoje}
            vazio="Nada marcado para hoje."
          >
            {(a) => <Linha key={a.id} atividade={a} lead={leadsPorId.get(a.lead_uuid || '')} {...linhaProps} />}
          </Secao>
        </div>
      ) : (
        <Secao
          titulo={
            aba === 'visitas' ? 'Visitas agendadas' : aba === 'futuras' ? 'Agendadas para depois' : 'Todas'
          }
          icone={
            aba === 'visitas' ? (
              <MapPin className="h-4 w-4 text-primary" />
            ) : aba === 'futuras' ? (
              <Clock className="h-4 w-4 text-primary" />
            ) : (
              <Archive className="h-4 w-4 text-muted-foreground" />
            )
          }
          itens={listaDaAba}
          vazio={
            aba === 'visitas'
              ? 'Nenhuma visita agendada.'
              : aba === 'futuras'
                ? 'Nada agendado para os próximos dias.'
                : `Nenhuma atividade nos últimos ${JANELA_DIAS} dias.`
          }
        >
          {(a) => <Linha key={a.id} atividade={a} lead={leadsPorId.get(a.lead_uuid || '')} {...linhaProps} />}
        </Secao>
      )}

      {aba === 'todos' && (
        <p className="text-xs text-muted-foreground">
          Mostrando os últimos {JANELA_DIAS} dias em diante.
        </p>
      )}

      <Dialog open={Boolean(vinculando)} onOpenChange={(aberto) => !aberto && setVinculando(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Vincular lead</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500 dark:text-slate-400">{vinculando?.titulo}</p>
          <ComboBox
            options={opcoesLead}
            value={leadEscolhido}
            onChange={setLeadEscolhido}
            placeholder="Selecione o lead..."
            emptyText="Nenhum lead"
            allowCustom
          />
          <DialogFooter>
            {vinculando?.lead_nome && (
              <Button variant="ghost" onClick={() => setLeadEscolhido('')}>
                Desvincular
              </Button>
            )}
            <Button variant="outline" onClick={() => setVinculando(null)}>
              Cancelar
            </Button>
            <Button onClick={salvarVinculo}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={criarAberto} onOpenChange={setCriarAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova atividade</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>O que precisa ser feito</Label>
              <Input
                value={nova.titulo}
                onChange={(e) => setNova({ ...nova, titulo: e.target.value })}
                placeholder="Ex.: Ligar pro João confirmando a visita"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Data</Label>
                <Input
                  type="date"
                  value={nova.data}
                  onChange={(e) => setNova({ ...nova, data: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Horário (opcional)</Label>
                <Input
                  type="time"
                  value={nova.horario}
                  onChange={(e) => setNova({ ...nova, horario: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={nova.tipo} onValueChange={(v) => setNova({ ...nova, tipo: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_ATIVIDADE.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Select
                  value={nova.prioridade}
                  onValueChange={(v) => setNova({ ...nova, prioridade: v as 'alta' | 'media' | 'baixa' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="baixa">Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Lead (opcional)</Label>
              <ComboBox
                options={opcoesLead}
                value={nova.leadNome}
                onChange={(value) => {
                  const lead = leads.find((l) => (l.nomedolead || l.lead || l.id) === value);
                  setNova((prev) => ({
                    ...prev,
                    leadNome: value,
                    leadTelefone: lead?.lead || '',
                    leadUuid: lead?.id ?? null,
                  }));
                }}
                placeholder="Selecione..."
                emptyText="Nenhum lead"
                allowCustom
              />
            </div>

            <div className="space-y-2">
              <Label>Detalhes (opcional)</Label>
              <Textarea
                value={nova.descricao}
                onChange={(e) => setNova({ ...nova, descricao: e.target.value })}
                rows={3}
                placeholder="Contexto que você vai querer lembrar depois"
              />
            </div>

            {(TIPOS_BLOQUEANTES as readonly string[]).includes(nova.tipo) && (
              <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                Se esta atividade passar do prazo sem ser concluída, você é avisado e, 24h
                depois, bloqueado de receber novos leads até concluí-la.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCriarAberto(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={criar} disabled={salvando}>
              {salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CentralLeadsPage;

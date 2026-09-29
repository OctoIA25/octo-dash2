/**
 * A aba do painel ao vivo dentro do Bolsão (P1.3).
 *
 * Lê o extrato direto da tabela: a RLS de `distribuicao_eventos` já deixa
 * qualquer membro ler o da própria imobiliária, e ninguém escreve pelo
 * navegador — quem grava é o servidor, com a chave de serviço.
 *
 * Atualiza sozinho a cada 30 s, com `setInterval`, que é como as outras telas
 * deste módulo se atualizam. Não é tempo real de verdade, e a tela diz a hora
 * da última leitura em vez de fingir que é.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { OctoDashLoader } from '@/components/ui/OctoDashLoader';
import { usePodeAbrirConversa } from '@/features/chat/components/OpenConversationLink';
import { chatPathForPhone } from '@/features/chat/services/chatService';
import { CriarLeadQuickModal } from '@/features/leads/components/CriarLeadQuickModal';
import { fetchKanbanLeadDaConversa, type KanbanLead } from '@/features/leads/services/leadsService';
import { useToast } from '@/hooks/use-toast';
import { ExtratoDistribuicao, type EventoDistribuicao, type LeadDoExtrato } from './ExtratoDistribuicao';

interface Props {
  tenantId?: string;
}

const INTERVALO_MS = 30_000;
const JANELA_MS = 24 * 60 * 60 * 1000;
/** Teto de linhas por leitura: um dia cheio da Lotus cabe folgado. */
const TETO = 200;

interface Estado {
  eventos: EventoDistribuicao[];
  nomes: Record<string, string>;
  leads: Record<string, LeadDoExtrato>;
  jaHouveAlgum: boolean;
  lidoAs: Date;
}

export function PainelDistribuicao({ tenantId }: Props) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  // Os nomes não mudam a cada 30 s; buscá-los de novo a cada ciclo seria uma
  // consulta por minuto para nada.
  const nomesRef = useRef<Record<string, string> | null>(null);
  // Nome e telefone do lead também não mudam a cada ciclo: só se busca quem
  // apareceu pela primeira vez.
  const contatosRef = useRef<Record<string, { nome: string | null; telefone: string | null }>>({});
  const podeAbrirConversa = usePodeAbrirConversa();
  const [leadAberto, setLeadAberto] = useState<KanbanLead | null>(null);
  const { toast } = useToast();

  // Mesmo caminho do Chat: busca a ficha por id e abre o modal de Meus Leads.
  const abrirLead = useCallback(async (leadId: string) => {
    if (!tenantId) return;
    const lead = await fetchKanbanLeadDaConversa(tenantId, leadId, []);
    if (lead) setLeadAberto(lead);
    else toast({ title: 'Não foi possível abrir este lead', variant: 'destructive' });
  }, [tenantId, toast]);

  const fecharLead = useCallback(() => {
    // O nome pode ter sido editado no modal: o próximo ciclo busca de novo.
    if (leadAberto) delete contatosRef.current[leadAberto.id];
    setLeadAberto(null);
  }, [leadAberto]);

  const carregar = useCallback(async () => {
    if (!tenantId || tenantId === 'owner') return;
    setAtualizando(true);
    try {
      const desde = new Date(Date.now() - JANELA_MS).toISOString();
      const [eventos, algum, membros] = await Promise.all([
        supabase
          .from('distribuicao_eventos')
          .select('id, lead_id, lead_ref, evento, corretor_id, motivo, tipo, prazo_ate, origem, created_at')
          .eq('tenant_id', tenantId)
          .gte('created_at', desde)
          .order('created_at', { ascending: false })
          .limit(TETO),
        // Painel vazio tem duas causas muito diferentes, e a tela precisa
        // saber qual é antes de escrever a frase.
        supabase
          .from('distribuicao_eventos')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId),
        nomesRef.current
          ? Promise.resolve({ data: null, error: null })
          : supabase.rpc('get_tenant_members', { p_tenant_id: tenantId }),
      ]);

      if (eventos.error) throw eventos.error;

      const lista = (eventos.data ?? []) as EventoDistribuicao[];
      const idsDosLeads = [...new Set(lista.map((e) => e.lead_id).filter((id): id is string => Boolean(id)))];

      // A finalidade só vem gravada na CONSULTA; os outros acontecimentos do
      // lead a herdam. Para quem não foi consultado dentro da janela, busca-se
      // a consulta mais antiga fora dela.
      const tipoPorLead: Record<string, string> = {};
      for (const e of lista) if (e.lead_id && e.tipo && !tipoPorLead[e.lead_id]) tipoPorLead[e.lead_id] = e.tipo;
      const semTipo = idsDosLeads.filter((id) => !tipoPorLead[id]);
      const semContato = idsDosLeads.filter((id) => !contatosRef.current[id]);

      const [tipos, contatos] = await Promise.all([
        semTipo.length
          ? supabase
              .from('distribuicao_eventos')
              .select('lead_id, tipo')
              .eq('tenant_id', tenantId)
              .in('lead_id', semTipo)
              .not('tipo', 'is', null)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        semContato.length
          ? supabase.from('leads').select('id, name, phone').in('id', semContato)
          : Promise.resolve({ data: [], error: null }),
      ]);
      // Falhar aqui não derruba o extrato: a linha continua dizendo o que
      // aconteceu, só sem o nome do lead.
      if (tipos.error) console.error('[distribuicao] finalidade dos leads:', tipos.error);
      if (contatos.error) console.error('[distribuicao] nome dos leads:', contatos.error);
      for (const t of (tipos.data ?? []) as Array<{ lead_id: string; tipo: string }>) {
        if (!tipoPorLead[t.lead_id]) tipoPorLead[t.lead_id] = t.tipo;
      }
      if (!contatos.error) {
        // Quem não voltou (lead apagado) também fica guardado, como sem nome —
        // senão seria consultado de novo a cada 30 s.
        for (const id of semContato) contatosRef.current[id] = { nome: null, telefone: null };
        for (const c of (contatos.data ?? []) as Array<{ id: string; name: string | null; phone: string | null }>) {
          contatosRef.current[c.id] = { nome: c.name, telefone: c.phone };
        }
      }

      const leads: Record<string, LeadDoExtrato> = {};
      for (const id of idsDosLeads) {
        const contato = contatosRef.current[id];
        leads[id] = {
          nome: contato?.nome ?? null,
          tipo: tipoPorLead[id] ?? null,
          conversa: podeAbrirConversa ? chatPathForPhone(contato?.telefone, contato?.nome) : null,
        };
      }

      if (membros.data) {
        nomesRef.current = Object.fromEntries(
          (membros.data as Array<{ user_id: string; name?: string; email?: string }>).map((m) => [
            m.user_id,
            m.name || m.email || m.user_id.slice(0, 8),
          ])
        );
      }

      setErro(null);
      setEstado({
        eventos: lista,
        nomes: nomesRef.current ?? {},
        leads,
        jaHouveAlgum: (algum.count ?? 0) > 0,
        lidoAs: new Date(),
      });
    } catch (e) {
      // Erro NÃO vira painel zerado: "nenhum lead distribuído" e "não
      // consegui ler" se parecem na tela e significam coisas opostas.
      setErro((e as { message?: string })?.message || 'não foi possível ler o extrato');
    } finally {
      setAtualizando(false);
    }
  }, [tenantId, podeAbrirConversa]);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, INTERVALO_MS);
    return () => clearInterval(t);
  }, [carregar]);

  if (!tenantId || tenantId === 'owner') {
    return <p className="p-6 text-sm text-text-secondary">Selecione uma imobiliária para ver a distribuição.</p>;
  }

  if (erro) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          Não foi possível ler o extrato: {erro}
        </p>
        <button type="button" onClick={carregar} className="text-[13px] font-medium text-blue-600 hover:underline">
          Tentar de novo
        </button>
      </div>
    );
  }

  if (!estado) {
    return (
      <div className="flex items-center justify-center py-16">
        <OctoDashLoader />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-text-secondary">
          Cada linha é um acontecimento gravado pelo servidor — esta tela não escreve nada.
        </p>
        <button
          type="button"
          onClick={carregar}
          disabled={atualizando}
          className="flex items-center gap-1.5 text-[12px] font-medium text-text-secondary hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${atualizando ? 'animate-spin' : ''}`} />
          lido às {estado.lidoAs.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </button>
      </div>
      <ExtratoDistribuicao
        eventos={estado.eventos}
        nomes={estado.nomes}
        leads={estado.leads}
        jaHouveAlgum={estado.jaHouveAlgum}
        onAbrirLead={abrirLead}
      />
      <CriarLeadQuickModal
        isOpen={leadAberto !== null}
        onClose={fecharLead}
        tenantId={tenantId}
        editingLead={leadAberto}
        leadType={leadAberto?.lead_type}
      />
    </div>
  );
}

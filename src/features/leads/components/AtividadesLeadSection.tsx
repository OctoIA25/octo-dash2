/**
 * Atividades dentro do card do lead.
 *
 * Responde, sem sair do modal: o que está marcado para este lead, o que já
 * passou do prazo, e permite agendar a próxima. Escreve na mesma
 * `agenda_eventos` que o painel de Atividades, a agenda e o bloqueio do bolsão
 * leem — não existe "atividade do lead" separada de atividade.
 *
 * A criação é por OPÇÃO PRÉ-DEFINIDA, não campo em branco: escolher "Retornar
 * para o cliente" já é a descrição da tarefa. O corretor só decide o quê, o
 * quando, e se quer deixar uma observação.
 *
 * ABERTA POR PADRÃO, ao contrário do Histórico. O Kanban abre e fecha este
 * modal o tempo todo, mas aqui a consulta é uma só, por índice (tenant +
 * lead_id), e ver o que está pendente é justamente o motivo de abrir o card.
 */
import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Check, Loader2, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  faixaDaAtividade,
  prazoAtividade,
  rotuloTipoAtividade,
  TIPOS_ATIVIDADE,
  TIPOS_BLOQUEANTES,
  type Atividade,
} from '../utils/atividades';
import {
  hasAnyPendingBlockingActivity,
  unblockCorretor,
} from '@/features/corretores/services/activityBlockingService';

const COLUNAS =
  'id, titulo, descricao, data, horario, tipo, status, prioridade, corretor_email, lead_uuid, lead_id, lead_nome, lead_telefone';

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const FORM_VAZIO = { tipo: '', data: hojeISO(), horario: '', observacao: '' };

/**
 * Como a atividade se amarra ao lead. São dois mundos que ainda não foram
 * unificados: o CRM identifica lead por uuid (`leads.id` → `lead_uuid`), o
 * Bolsão por um inteiro próprio (`bolsao.id` → `lead_id`). A section não decide
 * qual é — quem a monta sabe de onde veio o lead.
 */
export type VinculoLead =
  | { coluna: 'lead_uuid'; valor: string }
  | { coluna: 'lead_id'; valor: number };

interface Props {
  vinculo: VinculoLead;
  leadNome: string | null;
  leadTelefone: string | null;
  tenantId: string;
  corretorEmail: string;
  /** Imóvel do lead, gravado junto sem pedir nada ao corretor. */
  imovelRef?: string | null;
  imovelTitulo?: string | null;
  /**
   * Chamado depois de criar. O Bolsão usa pra mover o lead no funil
   * (`etapaAposAtividade`); o Kanban não passa nada.
   */
  onCriada?: (tipo: string) => void | Promise<void>;
  /** O modal do Kanban monta e desmonta o tempo todo; sem isto a consulta sairia fechado. */
  ativo: boolean;
}

export const AtividadesLeadSection = ({
  vinculo,
  leadNome,
  leadTelefone,
  tenantId,
  corretorEmail,
  imovelRef,
  imovelTitulo,
  onCriada,
  ativo,
}: Props) => {
  const { toast } = useToast();
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [concluindo, setConcluindo] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);

  const tenantValido = Boolean(tenantId) && tenantId !== 'owner';
  const leadVinculavel = vinculo.valor !== null && vinculo.valor !== undefined && vinculo.valor !== '';

  const carregar = useCallback(async () => {
    if (!ativo || !leadVinculavel || !tenantValido) return;
    setCarregando(true);
    try {
      const { data, error } = await supabase
        .from('agenda_eventos')
        .select(COLUNAS)
        .eq('tenant_id', tenantId)
        .eq(vinculo.coluna, vinculo.valor)
        .order('data', { ascending: false });
      if (error) throw error;
      setAtividades((data || []) as unknown as Atividade[]);
    } catch (error) {
      console.error('Erro ao carregar atividades do lead:', error);
      setAtividades([]);
    } finally {
      setCarregando(false);
    }
  }, [ativo, vinculo.coluna, vinculo.valor, leadVinculavel, tenantId, tenantValido]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const concluir = async (a: Atividade) => {
    setConcluindo(a.id);
    try {
      const { error } = await supabase
        .from('agenda_eventos')
        .update({ status: 'concluido', updated_at: new Date().toISOString() })
        .eq('id', a.id)
        .eq('tenant_id', tenantId)
        .eq('corretor_email', corretorEmail);
      if (error) throw error;

      setAtividades((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: 'concluido' } : x)));

      // Concluir um tipo bloqueante é o que devolve o corretor à roleta.
      if ((TIPOS_BLOQUEANTES as readonly string[]).includes(a.tipo)) {
        const aindaPendente = await hasAnyPendingBlockingActivity(tenantId, corretorEmail);
        if (!aindaPendente) {
          await unblockCorretor(tenantId, corretorEmail);
          toast({ title: '✅ Atividade concluída!', description: 'Você foi desbloqueado do recebimento de leads.' });
          return;
        }
      }
      toast({ title: '✅ Atividade concluída!' });
    } catch (error) {
      console.error('Erro ao concluir atividade:', error);
      toast({ title: 'Erro ao concluir atividade', variant: 'destructive' });
      carregar();
    } finally {
      setConcluindo(null);
    }
  };

  const criar = async () => {
    if (!form.tipo) {
      toast({ title: 'Escolha a atividade', description: 'Selecione o que vai ser feito', variant: 'destructive' });
      return;
    }
    if (!form.data || !form.horario) {
      toast({ title: 'Falta o horário', description: 'Informe a data e o horário', variant: 'destructive' });
      return;
    }

    setSalvando(true);
    try {
      const opcao = TIPOS_ATIVIDADE.find((t) => t.value === form.tipo);
      const { error } = await supabase.from('agenda_eventos').insert([
        {
          tenant_id: tenantId,
          corretor_email: corretorEmail,
          titulo: opcao?.tituloPadrao || 'Atividade',
          descricao: form.observacao.trim() || null,
          data: form.data,
          horario: form.horario,
          tipo: form.tipo,
          status: 'pendente',
          prioridade: 'media',
          [vinculo.coluna]: vinculo.valor,
          lead_nome: leadNome,
          lead_telefone: leadTelefone,
          imovel_ref: imovelRef || null,
          imovel_titulo: imovelTitulo || null,
        },
      ]);
      if (error) throw error;

      toast({ title: '✅ Atividade agendada!', description: `${opcao?.label} em ${form.data} às ${form.horario}` });
      setForm(FORM_VAZIO);
      setCriando(false);
      carregar();
      await onCriada?.(form.tipo);
    } catch (error) {
      console.error('Erro ao criar atividade:', error);
      toast({
        title: 'Erro ao criar atividade',
        description: error instanceof Error ? error.message : 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  if (!tenantValido || !leadVinculavel) return null;

  // "Atividade atual" = a próxima em aberto, pelo prazo. É o que o corretor
  // precisa ver ao abrir o card; o resto é histórico.
  const emAberto = atividades
    .filter((a) => !['concluida', 'cancelada'].includes(faixaDaAtividade(a)))
    .sort((x, y) => prazoAtividade(x).getTime() - prazoAtividade(y).getTime());
  const atual = emAberto[0];
  const atualAtrasada = atual ? faixaDaAtividade(atual) === 'atrasada' : false;
  const resto = atividades.filter((a) => a.id !== atual?.id);

  const quando = (a: Atividade) => {
    const prazo = prazoAtividade(a);
    const data = prazo.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    const temHora = /^\d{2}:\d{2}/.test((a.horario || '').toString());
    return temHora ? `${data}, ${(a.horario || '').slice(0, 5)}` : `${data}`;
  };

  return (
    <div className="mt-5 mb-5">
      <p className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
        <CalendarClock className="w-3.5 h-3.5" />
        Atividades
      </p>

      {carregando ? (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Carregando...
        </p>
      ) : (
        <>
          <p className="mb-1.5 text-[11px] font-semibold text-foreground">Atividade atual:</p>
          {atual ? (
            <div
              className={`mb-2 flex items-start gap-2 rounded-lg border px-3 py-2.5 ${
                atualAtrasada
                  ? 'border-destructive/30 bg-destructive/10'
                  : 'border-primary/30 bg-primary/5'
              }`}
            >
              <button
                type="button"
                onClick={() => concluir(atual)}
                disabled={(atual.corretor_email || '').toLowerCase() !== corretorEmail.toLowerCase() || concluindo === atual.id}
                aria-label={`Concluir ${atual.titulo}`}
                className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                  atualAtrasada
                    ? 'border-destructive/50 hover:bg-destructive/20'
                    : 'border-primary/50 hover:bg-primary/20'
                }`}
              >
                {concluindo === atual.id && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`text-[12px] font-semibold ${atualAtrasada ? 'text-destructive' : 'text-primary'}`}>
                  {rotuloTipoAtividade(atual.tipo)} — {atualAtrasada ? 'Pendente' : 'Agendada'}
                </p>
                <p className={`text-[11px] ${atualAtrasada ? 'text-destructive/80' : 'text-muted-foreground'}`}>
                  em {quando(atual)}
                </p>
                {atual.descricao && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{atual.descricao}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="mb-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-[11px] text-muted-foreground">
              Nenhuma atividade marcada para este lead.
            </p>
          )}

          {!criando && (
            <Button
              type="button"
              onClick={() => setCriando(true)}
              className="w-full h-9 text-xs font-semibold"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Criar nova atividade
            </Button>
          )}
        </>
      )}

      {criando && (
        <div className="mt-2 space-y-3 rounded-lg border border-border p-3">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-foreground">O que vai ser feito?</p>
            <div className="grid grid-cols-2 gap-1.5">
              {TIPOS_ATIVIDADE.map((t) => {
                const escolhido = form.tipo === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-checked={escolhido}
                    onClick={() => setForm((f) => ({ ...f, tipo: t.value }))}
                    className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors ${
                      escolhido
                        ? 'border-primary bg-primary/10 font-semibold text-primary'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    <span
                      className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border ${
                        escolhido ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                      }`}
                    >
                      {escolhido && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                    </span>
                    <span className="truncate">
                      {t.emoji} {t.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="mb-1 text-[11px] font-semibold text-foreground">Data</p>
              <Input
                type="date"
                value={form.data}
                onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
                className="h-9 text-xs"
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold text-foreground">Qual horário?</p>
              <Input
                type="time"
                value={form.horario}
                onChange={(e) => setForm((f) => ({ ...f, horario: e.target.value }))}
                className="h-9 text-xs"
              />
            </div>
          </div>

          <div>
            <p className="mb-1 text-[11px] font-semibold text-foreground">
              Deseja adicionar alguma observação?{' '}
              <span className="font-normal text-muted-foreground">(opcional)</span>
            </p>
            <Textarea
              value={form.observacao}
              onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
              placeholder="Ex: cliente pediu pra ligar depois das 18h"
              rows={2}
              className="resize-none text-xs"
            />
          </div>

          {(TIPOS_BLOQUEANTES as readonly string[]).includes(form.tipo) && (
            <p className="rounded-md bg-amber-50 p-2 text-[10.5px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              Passando do prazo sem concluir, você é avisado e, 24h depois, bloqueado de receber
              novos leads até concluir.
            </p>
          )}

          <div className="flex gap-2">
            <Button size="sm" onClick={criar} disabled={salvando} className="flex-1 h-8 text-xs">
              {salvando && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Agendar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCriando(false);
                setForm(FORM_VAZIO);
              }}
              disabled={salvando}
              className="h-8 text-xs"
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {resto.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[11px] font-semibold text-muted-foreground hover:text-foreground">
            Outras atividades ({resto.length})
          </summary>
          <ul className="mt-1.5 space-y-1.5">
            {resto.map((a) => {
              const faixa = faixaDaAtividade(a);
              const concluida = faixa === 'concluida';
              const atrasada = faixa === 'atrasada';
              const dono = (a.corretor_email || '').toLowerCase() === corretorEmail.toLowerCase();
              return (
                <li
                  key={a.id}
                  className={`flex items-start gap-2 rounded-md border px-2 py-1.5 ${
                    atrasada ? 'border-destructive/30 bg-destructive/5' : 'border-border'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => concluir(a)}
                    disabled={concluida || !dono || concluindo === a.id}
                    aria-label={`Concluir ${a.titulo}`}
                    className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                      concluida
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground/40 hover:border-primary'
                    }`}
                  >
                    {concluida && <Check className="h-3 w-3 text-primary-foreground" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-[12px] font-semibold ${
                        concluida ? 'text-muted-foreground line-through' : 'text-foreground'
                      }`}
                    >
                      {rotuloTipoAtividade(a.tipo)}
                    </p>
                    {a.descricao && (
                      <p className="truncate text-[11px] text-muted-foreground">{a.descricao}</p>
                    )}
                    <p className="text-[10px] tabular-nums text-muted-foreground">
                      {quando(a)}
                      {atrasada && <span className="ml-1.5 font-semibold text-destructive">atrasada</span>}
                    </p>
                  </div>
                  {concluindo === a.id && <Loader2 className="mt-0.5 h-3 w-3 animate-spin text-muted-foreground" />}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
};

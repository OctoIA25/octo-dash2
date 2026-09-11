/**
 * Modal de criar/editar lead — usado pelo botão "+ Adicionar" de cada coluna
 * (cria) e pelo clique em um card do Kanban (edita). Mantém o usuário no
 * Kanban, emite `leadsEventEmitter` para sincronizar Funil/Pipeline.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Save, User as UserIcon, Phone, Mail, Home, Loader2, Thermometer, Inbox, Tag, MessageSquare, IdCard, Archive, Building2, ChevronDown, MapPin } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { leadsEventEmitter } from '@/lib/leadsEventEmitter';
import { CLASSIFICACAO_ESTILOS, CLASSIFICACAO_ORDEM } from './ClassificacaoBadge';
import { classificacoesDe, toggleClassificacao } from '../utils/classificarLead';
import { PreferenciasEditor, preferenciasDe } from './PreferenciasLead';
import { DocumentosAnexos } from '@/components/DocumentosAnexos';
import { formatCpf } from '@/lib/documentoMasks';
import { useToast } from '@/hooks/use-toast';
import { useAuthContext } from '@/contexts/AuthContext';
import { ConversationLinkField, useChatPath } from '@/features/chat/components/OpenConversationLink';
import {
  LEAD_TYPE_INTERESSADO,
  LEAD_TYPE_PROPRIETARIO,
  fetchImoveisDeInteresse,
  type ImovelInteresse,
  type KanbanLead,
  type LeadType,
} from '../services/leadsService';
import { phoneVariants } from '@/features/chat/services/chatService';
import { CadenciaLiaSection } from './CadenciaLiaSection';
import { AtividadesLeadSection } from './AtividadesLeadSection';
import { useCadenciaLead } from '../hooks/useCadenciaLead';
import { HistoricoLeadSection } from './HistoricoLeadSection';
import { useHistoricoLead } from '../hooks/useHistoricoLead';
import { fetchCatalogoImoveis } from '@/features/imoveis/services/catalogoImoveisService';
import type { Imovel } from '@/features/imoveis/services/kenloService';

interface CriarLeadQuickModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string | undefined | null;
  /** Se preenchido, o modal entra em modo edição. */
  editingLead?: KanbanLead | null;
  /** Rótulo da etapa sugerida (só no criar). */
  stageHint?: string;
  /** 1 = Interessado (default), 2 = Proprietário. Controla qual lead_type gravar. */
  leadType?: LeadType;
  /** Mostra "Arquivar" no rodapé (só em modo edição). O pai abre o dialog de motivo. */
  onArquivar?: (lead: KanbanLead) => void;
}

interface LeadForm {
  name: string;
  phone: string;
  email: string;
  interest_reference: string;
  message: string;
  temperature: string;
  participa_bolsao: boolean;
  /** Só editável em modo edição — no INSERT o trigger sobrescreve. Multi-valor. */
  classification: string[];
  /** O que o cliente procura (Apartamento, Lançamento...). Marcação humana. */
  preferences: string[];
  /** Só existe/edita a partir da etapa de Propostas (seção Documentação). */
  cpf: string;
}

const EMPTY_FORM: LeadForm = {
  name: '',
  phone: '',
  email: '',
  interest_reference: '',
  message: '',
  temperature: 'Frio',
  participa_bolsao: true,
  classification: ['indefinido'],
  preferences: [],
  cpf: '',
};

const TEMPERATURES = ['Quente', 'Morno', 'Frio'];

/**
 * Etapas em que a seção Documentação aparece: Propostas em diante.
 * `KanbanLead.status` já vem como slug — Interessado: proposta-criada/enviada/
 * assinada; Proprietário: propostas-respondidas e feitura-contrato.
 */
const reachedPropostaStage = (status: string | null | undefined) =>
  Boolean(status && (status.startsWith('proposta') || status === 'feitura-contrato'));

const leadToForm = (lead: KanbanLead): LeadForm => ({
  name: lead.nomedolead ?? '',
  phone: lead.lead ?? lead.numerocorretor ?? '',
  email: lead.email ?? '',
  interest_reference: lead.codigo ?? '',
  message: lead.comments ?? '',
  temperature: lead.temperature ?? 'Frio',
  participa_bolsao: (lead as { participa_bolsao?: boolean }).participa_bolsao ?? true,
  classification: classificacoesDe(lead.classification),
  preferences: preferenciasDe(lead.preferences),
  // cpf não vem no select do Kanban (coluna nova, fora do hot path) — é
  // hidratado por query própria quando a seção Documentação está visível.
  cpf: '',
});

export const CriarLeadQuickModal = ({
  isOpen,
  onClose,
  tenantId,
  editingLead,
  stageHint,
  leadType = LEAD_TYPE_INTERESSADO,
  onArquivar,
}: CriarLeadQuickModalProps) => {
  const isEditMode = Boolean(editingLead);
  const isProprietario = leadType === LEAD_TYPE_PROPRIETARIO;
  // Documentação (CPF + upload) só a partir da etapa de Propostas.
  const showDocumentacao = isEditMode && reachedPropostaStage(editingLead?.status);
  const [form, setForm] = useState<LeadForm>(EMPTY_FORM);
  // Histórico de imóveis do cliente. `null` = ainda não buscado: o carregamento
  // é sob demanda porque custa duas queries + o catálogo, e a maioria dos leads
  // tem um imóvel só, que já está no campo "Código do Imóvel" acima.
  const [imoveisInteresse, setImoveisInteresse] = useState<ImovelInteresse[] | null>(null);
  const [catalogo, setCatalogo] = useState<Imovel[]>([]);
  const [carregandoInteresses, setCarregandoInteresses] = useState(false);
  const [verImoveisInteresse, setVerImoveisInteresse] = useState(false);
  // Cadência da LIA: só faz sentido em lead que já existe. O hook não dispara
  // no modo criar nem com o modal fechado — o Kanban abre e fecha isto o tempo
  // todo e cada abertura seria uma requisição.
  const cadenciaLead = useCadenciaLead(editingLead?.id, tenantId, isOpen && isEditMode);
  // Histórico: só busca quando o corretor expande a seção. O Kanban abre e
  // fecha este modal o tempo todo e a maioria das aberturas é para editar um
  // campo, não para ler a linha do tempo.
  const [verHistorico, setVerHistorico] = useState(false);
  const historicoLead = useHistoricoLead(
    editingLead?.id,
    tenantId,
    isOpen && isEditMode && verHistorico,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Apenas gestores podem criar/editar leads. Não-gestores abrem o modal
  // em modo somente leitura.
  const { isGestao, user } = useAuthContext();
  const userEmail = user?.email || '';
  const canEdit = isGestao;

  // Sem telefone válido ou sem permissão 'chat' o campo não renderiza — a
  // seção inteira sai junto, senão sobraria um rótulo órfão.
  const chatPath = useChatPath(
    editingLead?.lead ?? editingLead?.numerocorretor,
    editingLead?.nomedolead,
  );

  // Hidrata o form sempre que o lead muda ou o modal abre.
  useEffect(() => {
    if (!isOpen) return;
    if (editingLead) {
      setForm(leadToForm(editingLead));
    } else {
      setForm(EMPTY_FORM);
    }
    setError(null);
    // Outro lead, outro histórico: fecha e descarta o que estava carregado.
    setImoveisInteresse(null);
    setVerImoveisInteresse(false);
  }, [isOpen, editingLead]);

  // Hidrata o CPF da tabela-fonte (mesma ordem do UPDATE: leads → kenlo_leads).
  // Fora do select do Kanban de propósito: coluna nova no hot path derrubaria a
  // lista inteira se a migration ainda não tiver sido aplicada (42703 → vazio).
  useEffect(() => {
    if (!isOpen || !editingLead || !reachedPropostaStage(editingLead.status)) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('leads')
        .select('cpf')
        .eq('id', editingLead.id)
        .maybeSingle();
      let cpf = (data?.cpf as string | null) ?? null;
      if (!data) {
        const { data: kenlo } = await supabase
          .from('kenlo_leads')
          .select('cpf')
          .eq('id', editingLead.id)
          .maybeSingle();
        cpf = (kenlo?.cpf as string | null) ?? null;
      }
      if (!cancelled && cpf) setForm((f) => ({ ...f, cpf: formatCpf(cpf) }));
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, editingLead]);

  if (!isOpen) return null;

  const reset = () => {
    setForm(EMPTY_FORM);
    setError(null);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  /**
   * Abre/fecha a lista de imóveis do cliente, buscando na primeira abertura.
   * O catálogo vem do localStorage (mesma fonte do hook de imóveis) só para
   * enriquecer título/bairro/valor — sem ele a lista ainda mostra código,
   * portal e data.
   */
  const alternarImoveisDeInteresse = async () => {
    const abrindo = !verImoveisInteresse;
    setVerImoveisInteresse(abrindo);
    const telefone = editingLead?.lead ?? editingLead?.numerocorretor;
    if (!abrindo || imoveisInteresse !== null || !telefone || !tenantId) return;
    setCarregandoInteresses(true);
    try {
      // Catálogo = XML do tenant + imoveis_locais. Ler só o XML fazia todo imóvel
      // cadastrado na mão (CA054 e afins) cair em "Não encontrado no catálogo".
      const [lista, interesses] = await Promise.all([
        fetchCatalogoImoveis(tenantId),
        fetchImoveisDeInteresse(tenantId, phoneVariants(telefone)),
      ]);
      setCatalogo(lista);
      setImoveisInteresse(interesses);
    } catch (err) {
      console.error('Erro ao buscar imóveis de interesse:', err);
      setImoveisInteresse([]);
      toast({
        title: 'Erro ao buscar imóveis de interesse',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setCarregandoInteresses(false);
    }
  };

  const handleSubmit = async () => {
    if (!canEdit) {
      setError('Apenas gestores podem criar ou editar leads.');
      return;
    }
    if (!form.name.trim()) {
      setError('Nome é obrigatório');
      return;
    }
    if (!isEditMode && !form.phone.trim()) {
      setError('Telefone é obrigatório');
      return;
    }
    if (!tenantId) {
      setError('Tenant não identificado. Faça login novamente.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (isEditMode && editingLead) {
        // UPDATE — respeita RLS via tenant_memberships / assigned_agent_id
        const updatePayload = {
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          property_code: form.interest_reference.trim() || null,
          comments: form.message.trim() || null,
          temperature: form.temperature,
          participa_bolsao: form.participa_bolsao,
          // A ORIGEM NÃO VAI DAQUI: o trigger tg_classification_source_guard carimba
          // 'dashboard' sozinho. Mandar classification_source do cliente seria o
          // buraco que esta feature existe para fechar.
          classification: form.classification,
          // CHECK da 20260819 exige 1..10 termos ou NULL — vazio vira NULL.
          preferences: form.preferences.length ? form.preferences : null,
          // cpf só entra quando a seção Documentação está visível — para leads em
          // etapas anteriores o campo nem existe na tela e o valor salvo é preservado.
          ...(showDocumentacao ? { cpf: form.cpf.trim() || null } : {}),
          updated_at: new Date().toISOString(),
        };

        const { error: updateError, data: updated } = await supabase
          .from('leads')
          .update(updatePayload)
          .eq('id', editingLead.id)
          .eq('tenant_id', tenantId)
          .select('id');

        // Se o lead está em kenlo_leads (não existe em public.leads), atualizar lá.
        if (!updateError && (!updated || updated.length === 0)) {
          const kenloPayload: Record<string, unknown> = {
            client_name: form.name.trim(),
            client_phone: form.phone.trim() || null,
            client_email: form.email.trim() || null,
            interest_reference: form.interest_reference.trim() || null,
            message: form.message.trim() || null,
            temperature:
              form.temperature === 'Quente' ? 'hot' : form.temperature === 'Morno' ? 'warm' : 'cold',
            classification: form.classification,
            preferences: form.preferences.length ? form.preferences : null,
            ...(showDocumentacao ? { cpf: form.cpf.trim() || null } : {}),
            updated_at: new Date().toISOString(),
          };
          const { error: kenloError } = await supabase
            .from('kenlo_leads')
            .update(kenloPayload)
            .eq('id', editingLead.id)
            .eq('tenant_id', tenantId);
          if (kenloError) throw new Error(kenloError.message);
        } else if (updateError) {
          throw new Error(updateError.message);
        }

        toast({ title: `✅ ${typeLabel} atualizado`, description: `${form.name.trim()} foi salvo.` });
      } else {
        // INSERT
        const { data: authData } = await supabase.auth.getUser();
        const authUserId = authData?.user?.id ?? null;
        const authUserName =
          (authData?.user?.user_metadata?.name as string | undefined) ??
          authData?.user?.email?.split('@')[0] ??
          null;

        const payload: Record<string, unknown> = {
          tenant_id: tenantId,
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          property_code: form.interest_reference.trim() || null,
          comments: form.message.trim() || null,
          temperature: form.temperature,
          source: 'Manual',
          status: isProprietario ? 'Novos Proprietários' : 'Novos Leads',
          lead_type: leadType,
          participa_bolsao: form.participa_bolsao,
        };
        if (authUserId) payload.assigned_agent_id = authUserId;
        if (authUserName) payload.assigned_agent_name = authUserName;

        const { error: insertError } = await supabase.from('leads').insert(payload);
        if (insertError) throw new Error(insertError.message || 'Erro ao criar lead');

        toast({ title: `✅ ${typeLabel} criado`, description: `${form.name.trim()} foi adicionado.` });
      }

      leadsEventEmitter.emit();
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar lead');
    } finally {
      setIsSubmitting(false);
    }
  };

  const typeLabel = isProprietario ? 'Proprietário' : 'Lead';
  const title = isEditMode ? `Editar ${typeLabel}` : `Criar ${typeLabel}`;
  const subtitle = isEditMode
    ? `Atualize as informações do ${typeLabel.toLowerCase()}`
    : stageHint
      ? `Entrará em ${stageHint}`
      : isProprietario
        ? 'Cadastre um novo proprietário manualmente'
        : 'Cadastre um novo lead manualmente';

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/50 z-[100]"
        onClick={handleClose}
      />
      <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
        <div
          className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-[960px] max-w-[95vw] border border-slate-200 dark:border-slate-800 max-h-[92vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header com banner colorido — estilo dashboard */}
          <div className="relative px-5 py-4 bg-gradient-to-br from-blue-600 to-blue-700 text-white shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
                {isEditMode
                  ? <Save className="w-5 h-5 text-white" strokeWidth={2.2} />
                  : <Plus className="w-5 h-5 text-white" strokeWidth={2.2} />}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-white leading-tight">{title}</h2>
                <p className="text-xs text-blue-100/90 mt-0.5">{subtitle}</p>
              </div>
              <button
                onClick={handleClose}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                aria-label="Fechar"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          {/* Form */}
          <div className="flex-1 px-5 py-4 overflow-y-auto bg-slate-50/50 dark:bg-slate-950/40">
            {!canEdit && (
              <p className="mb-4 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
                Somente gestores podem editar leads. Você está visualizando em modo somente leitura.
              </p>
            )}

            {/* Com o card largo, o formulário vira duas colunas em telas
                grandes; abaixo de `lg` volta a ser uma coluna só, na mesma
                ordem de leitura. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-6 items-start">
            <div>
            {/* Seção: Informações do cliente */}
            <SectionTitle>Informações do cliente</SectionTitle>
            <div className="space-y-3 mb-5">
              <Field
                icon={<UserIcon className="w-4 h-4 text-slate-400" />}
                label="Nome *"
                type="text"
                placeholder="Nome do cliente"
                value={form.name}
                onChange={(v) => setForm((f) => ({ ...f, name: v }))}
                disabled={!canEdit}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  icon={<Phone className="w-4 h-4 text-slate-400" />}
                  label={isEditMode ? 'Telefone' : 'Telefone *'}
                  type="tel"
                  placeholder="(11) 99999-9999"
                  value={form.phone}
                  onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
                  disabled={!canEdit}
                />
                <Field
                  icon={<Mail className="w-4 h-4 text-slate-400" />}
                  label="Email"
                  type="email"
                  placeholder="email@exemplo.com"
                  value={form.email}
                  onChange={(v) => setForm((f) => ({ ...f, email: v }))}
                  disabled={!canEdit}
                />
              </div>

              {/* Link da conversa — só na edição, e do telefone JÁ SALVO
                  (`editingLead`, não `form.phone`): enquanto o corretor digita
                  um número novo o link apontaria para uma conversa inexistente. */}
              {isEditMode && chatPath && (
                <div>
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    <MessageSquare className="w-4 h-4 text-slate-400" />
                    Link da conversa
                  </label>
                  <ConversationLinkField
                    phone={editingLead?.lead ?? editingLead?.numerocorretor}
                    contactName={editingLead?.nomedolead}
                  />
                </div>
              )}
            </div>

            {/* Seção: Interesse */}
            <SectionTitle>Interesse</SectionTitle>
            <div className="space-y-3 mb-5">
              <Field
                icon={<Home className="w-4 h-4 text-slate-400" />}
                label="Código do Imóvel"
                type="text"
                placeholder="Ex: AP0929"
                value={form.interest_reference}
                onChange={(v) => setForm((f) => ({ ...f, interest_reference: v.toUpperCase() }))}
                mono
                disabled={!canEdit}
              />

              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  <Thermometer className="w-4 h-4 text-slate-400" />
                  Temperatura
                </label>
                <div className="flex gap-2">
                  {TEMPERATURES.map((t) => {
                    const active = form.temperature === t;
                    const color =
                      t === 'Quente' ? '#ef4444' : t === 'Morno' ? '#f59e0b' : '#3b82f6';
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, temperature: t }))}
                        disabled={!canEdit}
                        className="flex-1 py-2 text-xs font-semibold rounded-lg border transition-all bg-white dark:bg-slate-900 disabled:opacity-60 disabled:cursor-not-allowed"
                        style={{
                          borderColor: active ? color : '#e2e8f0',
                          backgroundColor: active ? color + '15' : undefined,
                          color: active ? color : '#64748b',
                        }}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Classificação — SÓ em edição.
                No INSERT o trigger `tg_*_classificar` sobrescreve `classification`
                incondicionalmente e carimba 'automatic', então um controle na criação
                deixaria o usuário escolher algo que o banco descarta em silêncio.
                A origem também não sai daqui: quem carimba é o trigger. */}
            {isEditMode && (
              <div className="mt-4">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  <Tag className="w-4 h-4 text-slate-400" />
                  Classificação
                  <span className="font-normal text-slate-400">(pode marcar mais de uma)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {CLASSIFICACAO_ORDEM.map((tipo) => {
                    const active = form.classification.includes(tipo);
                    return (
                      <button
                        key={tipo}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({ ...f, classification: toggleClassificacao(f.classification, tipo) }))
                        }
                        aria-pressed={active}
                        disabled={!canEdit}
                        className={`flex-1 min-w-[6.5rem] py-2 text-xs font-semibold rounded-lg border transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                          active
                            ? CLASSIFICACAO_ESTILOS[tipo].className
                            : 'bg-white dark:bg-slate-900 border-slate-200 text-slate-500 dark:border-slate-700'
                        }`}
                      >
                        {CLASSIFICACAO_ESTILOS[tipo].label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Preferências — o que o cliente procura. Só em edição, junto da
                Classificação: na criação o corretor ainda está digitando os
                dados básicos e o editor de chips viraria ruído. */}
            {isEditMode && (
              <div className="mt-4">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  <Tag className="w-4 h-4 text-slate-400" />
                  Preferências
                  <span className="font-normal text-slate-400">(o que o cliente procura)</span>
                </label>
                <PreferenciasEditor
                  valor={form.preferences}
                  onChange={(novo) => setForm((f) => ({ ...f, preferences: novo }))}
                  disabled={!canEdit}
                />
              </div>
            )}

            </div>

            <div>
            {/* Seção: Imóveis de interesse — todos os anúncios pelos quais este
                cliente já entrou em contato. Não existe tabela de interesses:
                cada anúncio vira uma linha de lead, então a lista sai do
                telefone (ver fetchImoveisDeInteresse). */}
            {isEditMode && (editingLead?.lead || editingLead?.numerocorretor) && (
              <div className="mb-5">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <SectionTitle>
                    Imóveis de interesse
                    {imoveisInteresse && (
                      <span className="ml-1.5 font-normal text-slate-400">
                        ({imoveisInteresse.length})
                      </span>
                    )}
                  </SectionTitle>
                  <button
                    type="button"
                    onClick={alternarImoveisDeInteresse}
                    className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline mb-2"
                  >
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform ${verImoveisInteresse ? 'rotate-180' : ''}`}
                    />
                    {verImoveisInteresse ? 'Ocultar' : 'Ver todos'}
                  </button>
                </div>

                {verImoveisInteresse && (
                  carregandoInteresses ? (
                    <div className="flex items-center gap-2 px-3 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                      <span className="text-xs text-slate-500">Buscando imóveis...</span>
                    </div>
                  ) : !imoveisInteresse?.length ? (
                    <p className="px-3 py-3 text-xs text-slate-500 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                      Nenhum imóvel de interesse registrado para este telefone.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {imoveisInteresse.map((item) => {
                        const chave = item.codigo.trim().toUpperCase();
                        const doCatalogo = catalogo.find(
                          (i) => (i.referencia || '').trim().toUpperCase() === chave,
                        );
                        const ehDesteLead =
                          (editingLead?.codigo || '').trim().toUpperCase() === chave;
                        return (
                          <div
                            key={chave}
                            className={`px-3 py-2.5 rounded-lg border ${
                              ehDesteLead
                                ? 'border-blue-300 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-950/30'
                                : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                                    {item.codigo}
                                  </span>
                                  {ehDesteLead && (
                                    <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                                      deste lead
                                    </span>
                                  )}
                                  {item.portal && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                                      {item.portal}
                                    </span>
                                  )}
                                </div>
                                {doCatalogo ? (
                                  <>
                                    <p className="text-xs text-slate-700 dark:text-slate-200 truncate mt-0.5">
                                      {doCatalogo.titulo}
                                    </p>
                                    <p className="flex items-center gap-1 text-[11px] text-slate-500 truncate">
                                      <MapPin className="w-3 h-3 shrink-0" />
                                      {doCatalogo.bairro}, {doCatalogo.cidade}
                                    </p>
                                  </>
                                ) : (
                                  <p className="text-[11px] text-slate-400 mt-0.5">
                                    Não encontrado no catálogo
                                  </p>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                {doCatalogo && doCatalogo.valor_venda > 0 && (
                                  <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                    R$ {doCatalogo.valor_venda.toLocaleString('pt-BR')}
                                  </p>
                                )}
                                {doCatalogo && doCatalogo.valor_locacao > 0 && (
                                  <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                                    R$ {doCatalogo.valor_locacao.toLocaleString('pt-BR')}/mês
                                  </p>
                                )}
                                <p className="text-[10px] text-slate-400">
                                  {item.data ? new Date(item.data).toLocaleDateString('pt-BR') : '-'}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </div>
            )}

            {/* Seção: Atividades — o que está marcado para este lead e o que
                já passou do prazo. Escreve em `agenda_eventos`, a mesma fonte do
                painel de Atividades e do bloqueio do bolsão. */}
            {isEditMode && editingLead && userEmail && (
              <AtividadesLeadSection
                vinculo={{ coluna: 'lead_uuid', valor: editingLead.id }}
                leadNome={editingLead.nomedolead}
                leadTelefone={editingLead.lead}
                tenantId={tenantId}
                corretorEmail={userEmail}
                imovelRef={editingLead.codigo}
                ativo={isOpen}
              />
            )}

            {/* Seção: Cadência da LIA — o que a IA já tentou com este lead.
                Somente leitura: quem agenda e dispara é a LIA; o CRM lê. */}
            {isEditMode && (
              <CadenciaLiaSection
                cadencia={cadenciaLead.cadencia}
                carregando={cadenciaLead.carregando}
                erro={cadenciaLead.erro}
              />
            )}

            {/* Seção: Histórico — como o lead se movimentou na dash (criação,
                entrega ao corretor, etapas) e o que a LIA reportou. Somente
                leitura: quem grava são os triggers do banco. */}
            {isEditMode && (
              <HistoricoLeadSection
                historico={historicoLead.historico}
                carregando={historicoLead.carregando}
                erro={historicoLead.erro}
                aberto={verHistorico}
                onToggle={() => setVerHistorico((v) => !v)}
              />
            )}

            {/* Seção: Documentação — só a partir da etapa de Propostas. Antes
                disso não faz sentido pedir CPF/documentos e a seção sumiria e
                voltaria conforme o lead anda no funil. */}
            {showDocumentacao && (
              <div className="mt-5 mb-5">
                <SectionTitle>Documentação</SectionTitle>
                <div className="space-y-3">
                  <Field
                    icon={<IdCard className="w-4 h-4 text-slate-400" />}
                    label="CPF"
                    type="text"
                    placeholder="000.000.000-00"
                    value={form.cpf}
                    onChange={(v) => setForm((f) => ({ ...f, cpf: formatCpf(v) }))}
                    mono
                    disabled={!canEdit}
                  />
                  <DocumentosAnexos
                    bucket="lead-documentos"
                    folder={`${tenantId}/${editingLead!.id}`}
                    canEdit={canEdit}
                  />
                </div>
              </div>
            )}

            {/* Seção: Observação */}
            <SectionTitle>Observação</SectionTitle>
            <textarea
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              rows={3}
              placeholder="Informações adicionais sobre o lead"
              disabled={!canEdit}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-none disabled:opacity-60 disabled:cursor-not-allowed"
            />

            {/* Seção: Bolsão */}
            <SectionTitle>Bolsão</SectionTitle>
            <button
              type="button"
              role="switch"
              aria-checked={form.participa_bolsao}
              onClick={() => setForm((f) => ({ ...f, participa_bolsao: !f.participa_bolsao }))}
              disabled={!canEdit}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                form.participa_bolsao
                  ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <Inbox className={`w-4 h-4 shrink-0 ${form.participa_bolsao ? 'text-orange-600 dark:text-orange-400' : 'text-slate-400'}`} />
                <span className="flex flex-col items-start min-w-0">
                  <span className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">Ativar bolsão</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {form.participa_bolsao
                      ? 'Lead expira conforme regra configurada'
                      : 'Lead fica fora do fluxo de expiração'}
                  </span>
                </span>
              </span>
              <span
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
                  form.participa_bolsao ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    form.participa_bolsao ? 'translate-x-[18px]' : 'translate-x-0.5'
                  }`}
                />
              </span>
            </button>

            </div>
            </div>

            {error && (
              <p className="mt-3 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
            <div>
              {isEditMode && canEdit && onArquivar && editingLead && (
                <button
                  onClick={() => onArquivar(editingLead)}
                  disabled={isSubmitting}
                  className="px-3 py-2 text-sm font-medium text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/40 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Archive className="w-4 h-4" />
                  Arquivar
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
            >
              {canEdit ? 'Cancelar' : 'Fechar'}
            </button>
            {canEdit && (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-60 shadow-sm"
              >
                {isSubmitting
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : isEditMode
                    ? <Save className="w-4 h-4" />
                    : <Plus className="w-4 h-4" />}
                {isSubmitting
                  ? (isEditMode ? 'Salvando...' : 'Criando...')
                  : (isEditMode ? 'Salvar' : `Criar ${typeLabel}`)}
              </button>
            )}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
    {children}
  </p>
);

interface FieldProps {
  icon: React.ReactNode;
  label: string;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  disabled?: boolean;
}

const Field = ({ icon, label, type, placeholder, value, onChange, mono, disabled }: FieldProps) => (
  <div>
    <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
      {icon}
      {label}
    </label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed ${mono ? 'font-mono' : ''}`}
    />
  </div>
);

/**
 * Modal de criar/editar lead — usado pelo botão "+ Adicionar" de cada coluna
 * (cria) e pelo clique em um card do Kanban (edita). Mantém o usuário no
 * Kanban, emite `leadsEventEmitter` para sincronizar Funil/Pipeline.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Save, User as UserIcon, Phone, Mail, Home, Loader2, Thermometer, Tag, MessageSquare, IdCard, Archive, Building2, ChevronDown, MapPin, ListChecks } from 'lucide-react';
import { corDaTemperatura, faixasDaRegua, PESOS_PADRAO, type PesosDoScore, type ResultadoDoScore } from '../utils/score';
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
import { avisoEmail, avisoTelefone, chaveTelefone, classificarEmail, classificarTelefone } from '@/lib/contato';
import { fetchCorretoresDisponiveis, type CorretorDisponivel } from '../services/roletaService';
import { fetchFichasDuplicadas, type FichaDuplicada } from '../services/leadsService';
import { CadenciaLiaSection } from './CadenciaLiaSection';
import { DistribuicaoDoLead } from '@/features/distribuicao/DistribuicaoDoLead';
import { CadenciaToquesSection } from './CadenciaToquesSection';
import { AtividadesLeadSection } from './AtividadesLeadSection';
import { useCadenciaLead } from '../hooks/useCadenciaLead';
import { HistoricoLeadSection } from './HistoricoLeadSection';
import { useHistoricoLead } from '../hooks/useHistoricoLead';
import { fetchCatalogoImoveis } from '@/features/imoveis/services/catalogoImoveisService';
import { ImovelDetalhesModal } from '@/components/imoveis/ImovelDetalhesModal';
import {
  acharLancamentoPorCodigo,
  fetchLancamentosRef,
  type LancamentoRef,
} from '@/features/imoveis/services/lancamentosLookup';
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
  /**
   * Libera criar/editar para quem não é gestão. Quem passa isto é o pai que JÁ
   * garantiu a posse do lead — "Meus Leads" do corretor só carrega leads
   * atribuídos a ele (assigned_agent_id / assigned_agent_name). O KanbanLead
   * não carrega assigned_agent_id, então a posse não dá para reconferir aqui.
   * No criar, o INSERT atribui o lead a quem criou (a roleta não sobrescreve).
   * RLS de `leads`/`kenlo_leads` já limita INSERT/UPDATE ao tenant do usuário.
   */
  permitirEdicao?: boolean;
  /**
   * As etapas do funil deste lead, para o seletor (P1.6). Vem do pai porque é
   * ele que conhece o funil (Interessado tem 8 etapas, Proprietário 11).
   */
  etapas?: Array<{ id: string; title: string }>;
  /**
   * Em que etapa o lead está, já normalizada. Vem pronta do pai: a
   * normalização de "Novos Leads" -> "novos-leads" mora lá, e refazê-la aqui
   * criaria a segunda verdade sobre a mesma coisa.
   */
  etapaAtual?: string;
  /**
   * O score já calculado, com o porquê de cada parcela (P1.7).
   *
   * O plano diz do Aether: "não há tela explicando por que um lead tem 32 e
   * outro 94". Esta é a tela.
   */
  avaliacao?: ResultadoDoScore | null;
  /** Os limites da imobiliária, para a régua desenhar as faixas certas. */
  pesos?: PesosDoScore;
  /**
   * Muda a etapa do lead. É a MESMA função que o arrastar usa — dois caminhos
   * fariam a regra de pré-requisitos valer num e não no outro.
   */
  onMudarEtapa?: (lead: KanbanLead, etapaId: string) => Promise<void>;
}

interface LeadForm {
  name: string;
  phone: string;
  email: string;
  interest_reference: string;
  message: string;

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

  classification: ['indefinido'],
  preferences: [],
  cpf: '',
};


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
  permitirEdicao = false,
  etapas,
  etapaAtual,
  onMudarEtapa,
  avaliacao,
  pesos = PESOS_PADRAO,
}: CriarLeadQuickModalProps) => {
  const isEditMode = Boolean(editingLead);
  const isProprietario = leadType === LEAD_TYPE_PROPRIETARIO;
  // Documentação (CPF + upload) só a partir da etapa de Propostas.
  const showDocumentacao = isEditMode && reachedPropostaStage(editingLead?.status);
  const [form, setForm] = useState<LeadForm>(EMPTY_FORM);
  // Seletor de etapa (P1.6). Só em edição, e só quando o pai entrega o funil
  // e o caminho de mudar — um seletor que não muda nada é pior que nenhum.
  const [mudandoEtapa, setMudandoEtapa] = useState(false);
  // Histórico de imóveis do cliente. `null` = ainda não buscado: o carregamento
  // é sob demanda porque custa duas queries + o catálogo, e a maioria dos leads
  // tem um imóvel só, que já está no campo "Código do Imóvel" acima.
  const [imoveisInteresse, setImoveisInteresse] = useState<ImovelInteresse[] | null>(null);
  const [catalogo, setCatalogo] = useState<Imovel[]>([]);
  // Lançamento não está no catálogo: o código do lead é o NOME do
  // empreendimento ('RESERVA CASTANHEIRA'). Ver lancamentosLookup.
  const [lancamentos, setLancamentos] = useState<LancamentoRef[]>([]);
  const [carregandoInteresses, setCarregandoInteresses] = useState(false);
  const [verImoveisInteresse, setVerImoveisInteresse] = useState(false);
  const [fichasDuplicadas, setFichasDuplicadas] = useState<FichaDuplicada[]>([]);
  // Registrar um toque da cadência cria/conclui atividade no servidor. As duas
  // seções são irmãs e não se falam: este contador é o recado de uma para a
  // outra, senão a lista de atividades só mostraria o resultado ao reabrir.
  const [atividadesSinal, setAtividadesSinal] = useState(0);
  // Imóvel aberto a partir da lista de interesses. Modal em cima do modal (o
  // Dialog fica em z-[9999], acima deste portal) para não perder a edição do
  // lead em andamento.
  const [imovelAberto, setImovelAberto] = useState<Imovel | null>(null);
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
  // Corretor responsável. O KanbanLead só traz o NOME de quem atende
  // (`corretor_responsavel`), nunca o user_id — então "atual" é texto e o
  // seletor guarda o user_id do DESTINO; vazio = mantém quem está.
  const corretorAtual = (editingLead?.corretor_responsavel || editingLead?.corretor || '').trim();
  const [corretores, setCorretores] = useState<CorretorDisponivel[]>([]);
  const [destinoId, setDestinoId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Gestão cria e edita qualquer lead. Corretor cria (para si) e edita os
  // próprios quando o pai libera via `permitirEdicao` (ver prop). Sem nenhum
  // dos dois, o modal abre em somente leitura.
  const { isGestao, user } = useAuthContext();
  const userEmail = user?.email || '';
  const canEdit = isGestao || permitirEdicao;
  // Transferir é da gestão: `isGestao` cobre admin, gestor (team_leader) e owner
  // — ver AuthContext, onde membership.role != 'corretor' mapeia para 'gestao'.
  const podeTransferir = isEditMode && isGestao;

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
    setDestinoId('');
    // Outro lead, outro histórico: fecha e descarta o que estava carregado.
    setImoveisInteresse(null);
    setVerImoveisInteresse(false);
  }, [isOpen, editingLead]);

  // Destinos da transferência. Mesma fonte da roleta (tenant_memberships +
  // user_profiles) para o nome gravado em `assigned_agent_name` bater com o que
  // roleta e bolsão gravam — é por nome que kenlo_leads e o espelho casam.
  useEffect(() => {
    if (!isOpen || !podeTransferir || !tenantId || tenantId === 'owner') return;
    let cancelado = false;
    fetchCorretoresDisponiveis(tenantId).then((lista) => {
      if (!cancelado) setCorretores(lista);
    });
    return () => {
      cancelado = true;
    };
  }, [isOpen, podeTransferir, tenantId]);

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

  /**
   * Outras fichas do mesmo contato. A maior parte dos duplicados é criada fora
   * da dash (ver fetchFichasDuplicadas); aqui o corretor pelo menos descobre
   * que a pessoa já está na base antes de tratar as duas como clientes
   * diferentes.
   */
  useEffect(() => {
    if (!isOpen || !isEditMode || !editingLead?.id || !tenantId) {
      setFichasDuplicadas([]);
      return;
    }
    let ativo = true;
    fetchFichasDuplicadas(tenantId, editingLead.id, form.phone, form.email)
      .then((fichas) => { if (ativo) setFichasDuplicadas(fichas); })
      .catch((err) => console.error('Erro ao buscar fichas duplicadas:', err));
    return () => { ativo = false; };
    // Reconsulta quando o contato muda: corrigir o telefone pode revelar (ou
    // resolver) a duplicidade.
  }, [isOpen, isEditMode, editingLead?.id, tenantId, form.phone, form.email]);

  if (!isOpen) return null;

  const reset = () => {
    setForm(EMPTY_FORM);
    setDestinoId('');
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
      const [lista, interesses, lancs] = await Promise.all([
        fetchCatalogoImoveis(tenantId),
        fetchImoveisDeInteresse(tenantId, phoneVariants(telefone)),
        fetchLancamentosRef(tenantId),
      ]);
      setCatalogo(lista);
      setImoveisInteresse(interesses);
      setLancamentos(lancs);
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
      setError('Você não tem permissão para editar este lead.');
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
    // Telefone que não dá para discar não entra: vira lead que ninguém atende e,
    // por não ter chave, nem duplicata o sistema consegue reconhecer depois.
    const telefone = classificarTelefone(form.phone);
    if (form.phone.trim() && (telefone.status === 'incompleto' || telefone.status === 'invalido')) {
      setError(telefone.status === 'incompleto'
        ? 'Telefone incompleto — confira o número antes de salvar.'
        : 'Telefone inválido — confira DDD e quantidade de dígitos.');
      return;
    }
    if (form.email.trim() && classificarEmail(form.email).status === 'invalido') {
      setError('E-mail inválido — confira o endereço.');
      return;
    }
    if (!tenantId) {
      setError('Tenant não identificado. Faça login novamente.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Duplicidade ANTES de gravar: o mesmo número em outro formato é a mesma
      // pessoa, e a trava do banco (unique_phone_per_tenant) só pega string
      // idêntica. Vale na criação e na edição — trocar o telefone de um lead
      // para o de outro criaria duas fichas da mesma pessoa do mesmo jeito.
      const chave = chaveTelefone(form.phone);
      if (chave) {
        // Consulta que falha (banco atrás do código, rede) NÃO pode impedir o
        // corretor de salvar: sem ela o comportamento volta a ser o de antes,
        // com a trava do banco pegando o telefone em formato idêntico.
        const jaExiste = await (async () => {
          try {
            let busca = supabase
              .from('leads')
              .select('id, name, assigned_agent_id, assigned_agent_name, status')
              .eq('tenant_id', tenantId)
              .eq('phone_key', chave);
            if (editingLead?.id) busca = busca.neq('id', editingLead.id);

            const { data, error } = await busca.order('created_at', { ascending: false }).limit(1).maybeSingle();
            // O postgrest resolve com erro em vez de lançar: sem olhar o
            // `error` aqui, a checagem ficaria desligada em silêncio (ex.:
            // migration do phone_key ainda não aplicada).
            if (error) console.error('Erro ao checar telefone duplicado:', error);
            return data;
          } catch (err) {
            console.error('Erro ao checar telefone duplicado:', err);
            return null;
          }
        })();

        if (jaExiste) {
          // Quem é o dono do lead do COLEGA é informação da gestão: a RLS
          // libera o tenant inteiro e o recorte "corretor vê só os leads dele"
          // mora na aplicação — dizer o nome entregaria a carteira do colega.
          // O lead do próprio corretor ele já vê na lista dele, então nesse
          // caso o detalhe é o que ajuda a achar a ficha.
          const ehMinha = Boolean(jaExiste.assigned_agent_id) && jaExiste.assigned_agent_id === user?.id;
          const comQuem = jaExiste.assigned_agent_name ? ` com ${jaExiste.assigned_agent_name}` : '';
          if (isGestao) {
            setError(`Este telefone já é do lead "${jaExiste.name}"${comQuem} (${jaExiste.status}). Procure por ele na lista em vez de criar outro.`);
          } else if (ehMinha) {
            setError(`Este telefone já é do lead "${jaExiste.name}" (${jaExiste.status}). Procure por ele na sua lista em vez de criar outro.`);
          } else {
            setError('Este telefone já está cadastrado na imobiliária. Fale com a gestão antes de cadastrar de novo.');
          }
          setIsSubmitting(false);
          return;
        }
      }

      if (isEditMode && editingLead) {
        // Transferência: só a gestão escolhe destino, e as colunas de atribuição
        // só entram no payload quando alguém foi escolhido — um save comum não
        // pode reescrever a atribuição (o trigger tr_leads_assigned_at zeraria o
        // cronômetro do bolsão a cada edição de nome ou temperatura).
        const destino = podeTransferir ? corretores.find((c) => c.id === destinoId) ?? null : null;

        // UPDATE — respeita RLS via tenant_memberships / assigned_agent_id
        const updatePayload = {
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          property_code: form.interest_reference.trim() || null,
          comments: form.message.trim() || null,
          // A temperatura passa a sair do score, e so quando ha score: sem
          // sinal carregado a coluna fica como esta. Gravar "Morno" porque o
          // ponto de partida e 50 seria inventar uma avaliacao que ninguem
          // fez — e e ela que o Kenlo, a proposta e o filtro do Kanban leem.
          ...(avaliacao ? { temperature: avaliacao.temperatura } : {}),
          // A ORIGEM NÃO VAI DAQUI: o trigger tg_classification_source_guard carimba
          // 'dashboard' sozinho. Mandar classification_source do cliente seria o
          // buraco que esta feature existe para fechar.
          classification: form.classification,
          // CHECK da 20260819 exige 1..10 termos ou NULL — vazio vira NULL.
          preferences: form.preferences.length ? form.preferences : null,
          // cpf só entra quando a seção Documentação está visível — para leads em
          // etapas anteriores o campo nem existe na tela e o valor salvo é preservado.
          ...(showDocumentacao ? { cpf: form.cpf.trim() || null } : {}),
          // `assigned_at` NÃO vai aqui: o trigger tr_leads_assigned_at carimba
          // now() sozinho quando o corretor muda, reiniciando o prazo do bolsão
          // para quem recebeu. O guard tr_leads_zz_assignee_guard confere que o
          // destino é membro do tenant.
          ...(destino ? { assigned_agent_id: destino.id, assigned_agent_name: destino.name } : {}),
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
            ...(avaliacao
              ? { temperature: avaliacao.temperatura === 'Quente' ? 'hot' : avaliacao.temperatura === 'Morno' ? 'warm' : 'cold' }
              : {}),
            classification: form.classification,
            preferences: form.preferences.length ? form.preferences : null,
            ...(showDocumentacao ? { cpf: form.cpf.trim() || null } : {}),
            // kenlo_leads não tem assigned_agent_id — a atribuição é o nome.
            ...(destino ? { attended_by_name: destino.name } : {}),
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

        if (destino) {
          // O espelho em `bolsao` NÃO é atualizado por trigger quando o corretor
          // muda (só em INSERT e em mudança de status), e é dele que a roleta lê
          // quem já tem o lead (pick_roleta_broker_excluding) e que o Bolsão lê
          // para listar os leads de um corretor. Sem isto o corretor anterior
          // continuaria lá e poderia receber o lead de volta na expiração.
          const { error: espelhoError } = await supabase
            .from('bolsao')
            .update({
              corretor_responsavel: destino.name,
              numero_corretor_responsavel: destino.phone ?? null,
              data_atribuicao: new Date().toISOString(),
            })
            .eq(editingLead.source_kenlo_id ? 'source_kenlo_id' : 'source_lead_id', editingLead.id);
          // Espelho desatualizado não invalida a transferência: a fonte já mudou.
          if (espelhoError) {
            console.warn('Espelho do bolsão não atualizado na transferência:', espelhoError.message);
          }
        }

        toast({
          title: `✅ ${typeLabel} atualizado`,
          description: destino
            ? `${form.name.trim()} transferido para ${destino.name}.`
            : `${form.name.trim()} foi salvo.`,
        });
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
          source: 'Manual',
          status: isProprietario ? 'Novos Proprietários' : 'Novos Leads',
          lead_type: leadType,
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
                Você está visualizando em modo somente leitura.
              </p>
            )}

            {fichasDuplicadas.length > 0 && (
              <div className="mb-4 text-xs text-orange-800 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900 rounded-lg px-3 py-2">
                <p className="font-medium mb-1">
                  {fichasDuplicadas.length === 1 ? 'Existe outra ficha' : `Existem ${fichasDuplicadas.length} outras fichas`} deste contato:
                </p>
                {/* A ficha de um COLEGA aparece só como sinal: nome e dono são
                    informação da gestão. A ficha do próprio corretor aparece
                    inteira — ela já está na lista dele. */}
                <ul className="space-y-0.5">
                  {fichasDuplicadas.map((ficha) => {
                    const oQueBateu = ficha.porQue === 'telefone' ? 'mesmo telefone' : 'mesmo e-mail';
                    const ehMinha = Boolean(ficha.corretorId) && ficha.corretorId === user?.id;
                    if (isGestao) {
                      return (
                        <li key={ficha.id}>
                          {ficha.nome}
                          {ficha.corretor ? ` — ${ficha.corretor}` : ' — sem corretor'}
                          {` (${ficha.status}, ${oQueBateu})`}
                        </li>
                      );
                    }
                    return (
                      <li key={ficha.id}>
                        {ehMinha
                          ? `${ficha.nome} (${ficha.status}, ${oQueBateu}) — está na sua lista`
                          : `Outro cadastro com o ${oQueBateu} — fale com a gestão`}
                      </li>
                    );
                  })}
                </ul>
              </div>
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
                  aviso={avisoTelefone(form.phone)}
                />
                <Field
                  icon={<Mail className="w-4 h-4 text-slate-400" />}
                  label="Email"
                  type="email"
                  placeholder="email@exemplo.com"
                  value={form.email}
                  onChange={(v) => setForm((f) => ({ ...f, email: v }))}
                  disabled={!canEdit}
                  aviso={avisoEmail(form.email)}
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

            {/* Seção: Corretor responsável — com quem o lead está agora. A gestão
                troca o responsável por aqui (salva junto com o resto do
                formulário); para o corretor é somente leitura. */}
            {isEditMode && (
              <div className="mb-5">
                <SectionTitle>Corretor responsável</SectionTitle>
                {podeTransferir ? (
                  <>
                    <label
                      htmlFor="lead-corretor-responsavel"
                      className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      <UserIcon className="w-4 h-4 text-slate-400" />
                      Transferir para
                    </label>
                    <select
                      id="lead-corretor-responsavel"
                      value={destinoId}
                      onChange={(e) => setDestinoId(e.target.value)}
                      disabled={!canEdit}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <option value="">{corretorAtual || 'Não atribuído'} (atual)</option>
                      {corretores
                        .filter((c) => c.name.trim().toLowerCase() !== corretorAtual.toLowerCase())
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                    {destinoId && (
                      <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                        Ao salvar, o lead sai da carteira de {corretorAtual || 'ninguém'} e entra na de{' '}
                        {corretores.find((c) => c.id === destinoId)?.name}.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100">
                    <UserIcon className="w-4 h-4 text-slate-400 shrink-0" />
                    {corretorAtual || 'Não atribuído'}
                  </p>
                )}
              </div>
            )}

            {/* Seção: Interesse */}
            <SectionTitle>Interesse</SectionTitle>
            <div className="space-y-3 mb-5">
              {isEditMode && avaliacao && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Score do lead</span>
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold ${corDaTemperatura(avaliacao.temperatura)}`}>
                      {avaliacao.score}/100
                      <span className="font-normal">{avaliacao.temperatura}</span>
                    </span>
                  </div>

                  {avaliacao.sinaisObservados === 0 ? (
                    // 50 por não ter sido observado e 50 por sinais que se
                    // anulam são coisas diferentes. Sem isto, o corretor leria
                    // "morno" como avaliação, quando não houve avaliação.
                    <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                      Nenhum sinal observado ainda — este lead está no ponto de partida, não foi avaliado.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-0.5">
                      {avaliacao.motivos.map((m) => (
                        <li key={m.id} className="flex items-baseline justify-between gap-2 text-[11.5px]">
                          <span className="text-slate-600 dark:text-slate-300">{m.texto}</span>
                          <span className={`shrink-0 font-mono tabular-nums ${m.pontos < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
                            {m.pontos > 0 ? '+' : '−'}{Math.abs(m.pontos)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {avaliacao.cortado && (
                    <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                      A soma passou dos limites e foi cortada em 0–100.
                    </p>
                  )}
                </div>
              )}

              {isEditMode && onMudarEtapa && etapas && etapas.length > 0 && editingLead && (
                <div>
                  <label
                    htmlFor="seletor-de-etapa"
                    className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    <ListChecks className="w-4 h-4 text-slate-400" />
                    Etapa
                  </label>
                  <select
                    id="seletor-de-etapa"
                    value={etapaAtual ?? ''}
                    disabled={!canEdit || mudandoEtapa}
                    onChange={async (e) => {
                      const destino = e.target.value;
                      if (!destino || destino === etapaAtual) return;
                      setMudandoEtapa(true);
                      // O aviso de pré-requisito é responsabilidade de quem
                      // move — a mesma função do arrastar. Aqui só se espera.
                      try { await onMudarEtapa(editingLead, destino); }
                      finally { setMudandoEtapa(false); }
                    }}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm disabled:opacity-50"
                  >
                    {etapas.map((et) => (
                      <option key={et.id} value={et.id}>{et.title}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Mudar aqui é o mesmo que arrastar o card — inclusive as pendências que a imobiliária exige.
                  </p>
                </div>
              )}

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

              {/* A TEMPERATURA NAO SE ESCOLHE MAIS. Eram tres botoes gravando
                  uma coluna propria, e o selo do card lia o score: o mesmo lead
                  aparecia "50 · Morno" em cima e "Quente" aqui embaixo, na
                  mesma tela. Quem marcava o botao acreditava ter mudado a
                  temperatura do lead, e nao mudava nada que alguem visse.

                  Agora a regua mostra onde o score caiu e por que — e o unico
                  jeito de mudar a temperatura e mudar os limites, em
                  Configuracoes, para todo mundo de uma vez. */}
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  <Thermometer className="w-4 h-4 text-slate-400" />
                  Temperatura
                </label>
                <ReguaDaTemperatura avaliacao={avaliacao ?? null} pesos={pesos} registrada={editingLead?.temperature ?? null} />
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
                        // Lançamento: o código do lead é o nome do
                        // empreendimento, nunca uma referência do catálogo.
                        const lancamento = doCatalogo
                          ? undefined
                          : acharLancamentoPorCodigo(item.codigo, lancamentos);
                        const classe = `px-3 py-2.5 rounded-lg border ${
                          ehDesteLead
                            ? 'border-blue-300 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-950/30'
                            : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                        } ${doCatalogo || lancamento ? 'cursor-pointer hover:border-blue-400 dark:hover:border-blue-600' : ''}`;
                        const conteudo = (
                          <>
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
                                ) : lancamento ? (
                                  <p className="text-xs text-slate-700 dark:text-slate-200 truncate mt-0.5">
                                    Lançamento: {lancamento.nome}
                                  </p>
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
                          </>
                        );

                        // ponytail: aba nova, como o link "abrir conversa" logo
                        // acima — a página do lançamento não cabe em modal e o
                        // corretor perderia a edição do lead em andamento.
                        if (lancamento) {
                          return (
                            <a
                              key={chave}
                              href={`/imoveis/lancamentos/${lancamento.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Ver lançamento ${lancamento.nome}`}
                              className={`block ${classe}`}
                            >
                              {conteudo}
                            </a>
                          );
                        }

                        return (
                          <div
                            key={chave}
                            role={doCatalogo ? 'button' : undefined}
                            tabIndex={doCatalogo ? 0 : undefined}
                            onClick={doCatalogo ? () => setImovelAberto(doCatalogo) : undefined}
                            onKeyDown={
                              doCatalogo
                                ? (e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      setImovelAberto(doCatalogo);
                                    }
                                  }
                                : undefined
                            }
                            title={doCatalogo ? `Ver imóvel ${item.codigo}` : undefined}
                            className={classe}
                          >
                            {conteudo}
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </div>
            )}

            {/* Seção: Cadência — 10 quadrados, um por toque com o cliente
                (LIA + corretor). Cor = canal, ícone = resultado. Os envios da
                LIA vêm da cadência já carregada acima, sem nova consulta. */}
            {isEditMode && editingLead && (
              <CadenciaToquesSection
                leadId={editingLead.id}
                tenantId={tenantId}
                userId={user?.id}
                timelineLia={cadenciaLead.cadencia?.timeline}
                ativo={isOpen}
                onMudou={() => setAtividadesSinal((n) => n + 1)}
              />
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
                recarregarSinal={atividadesSinal}
              />
            )}

            {/* Seção: Distribuição (P1.1) — por que este lead é desta pessoa,
                e quanto tempo falta para atender. Somente leitura: quem atribui
                é a Lia, e o prazo mora no extrato, não no lead. */}
            {isEditMode && editingLead && (
              <DistribuicaoDoLead
                tenantId={tenantId}
                leadId={editingLead.id}
                atendidoEm={editingLead.data_atendimento ?? null}
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

            {/* O BOLSAO NAO E MAIS POR LEAD. Decidido pelo chefe em 25/09:
                "tirar aquela regra de bolsao (vale sempre pra todos)". O
                interruptor daqui abria excecao para um lead so, e a regra do
                bolsao e da imobiliaria inteira — fica em Configuracoes.

                A coluna `participa_bolsao` continua existindo e continua sendo
                respeitada pelo gatilho do banco: a importacao da Santa Angela
                grava `false` de proposito, para 20 mil leads historicos nao
                inundarem o bolsao. O que sai e a EDICAO por aqui, e por isso o
                campo tambem some dos dois payloads — um save comum nao pode
                devolver um lead importado para o bolsao sem ninguem pedir. */}

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

      {/* Só monta quando há imóvel: o modal usa react-query (captadores) e não
          vale pagar hook/query em toda abertura do cadastro de lead. */}
      {imovelAberto && (
        <ImovelDetalhesModal
          imovel={imovelAberto}
          open
          onOpenChange={(aberto) => { if (!aberto) setImovelAberto(null); }}
        />
      )}
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
  /** Aviso de dado inválido/incompleto, mostrado abaixo do campo. */
  aviso?: string | null;
}

const Field = ({ icon, label, type, placeholder, value, onChange, mono, disabled, aviso }: FieldProps) => (
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
      className={`w-full px-3 py-2 bg-white dark:bg-slate-900 border rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed ${aviso ? 'border-amber-400 dark:border-amber-600' : 'border-slate-200 dark:border-slate-700'} ${mono ? 'font-mono' : ''}`}
    />
    {aviso && (
      <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">{aviso}</p>
    )}
  </div>
);

/**
 * A RÉGUA DA TEMPERATURA.
 *
 * O chefe pediu em 25/09: "a temperatura faltou aquela régua que a gente
 * comentou", e apontou a contradição — o mesmo lead marcado Morno no selo e
 * Quente nos botões da ficha.
 *
 * Ela desenha as faixas na largura que elas ocupam de verdade, e não em três
 * pedaços iguais: com os limites em 40 e 70, Frio ocupa 40% da régua e Quente
 * 31%. Três blocos iguais fariam parecer que as faixas têm o mesmo tamanho, e
 * é justamente o tamanho delas que muda quando alguém mexe nos limites.
 */
function ReguaDaTemperatura({
  avaliacao, pesos, registrada,
}: {
  avaliacao: ResultadoDoScore | null;
  pesos: PesosDoScore;
  registrada: string | null;
}) {
  const faixas = faixasDaRegua(pesos);
  const avaliado = avaliacao && avaliacao.sinaisObservados > 0;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
      <div className="flex h-6 overflow-hidden rounded-md">
        {faixas.map((f) => {
          const atual = avaliacao?.temperatura === f.temperatura;
          return (
            <div
              key={f.temperatura}
              style={{ width: `${((f.ate - f.de + 1) / 101) * 100}%` }}
              title={`${f.temperatura}: ${f.de} a ${f.ate}`}
              className={`flex items-center justify-center text-[10px] font-semibold border-r last:border-r-0 border-white dark:border-slate-900 ${
                atual ? corDaTemperatura(f.temperatura) : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
              }`}
            >
              {f.temperatura}
            </div>
          );
        })}
      </div>

      <div className="mt-1 flex justify-between text-[9.5px] font-mono tabular-nums text-slate-400">
        {faixas.map((f) => <span key={f.temperatura}>{f.de}</span>)}
        <span>100</span>
      </div>

      {/* Os três casos são diferentes e a ficha precisa dizer qual é.
          Um lead no ponto de partida NÃO é um lead morno: é um lead que
          ninguém avaliou, e tratar os dois igual é o defeito que o P1.7 veio
          desfazer. */}
      {avaliado ? (
        <p className="mt-1.5 text-[11px] text-slate-600 dark:text-slate-300">
          <strong>{avaliacao.score}/100 · {avaliacao.temperatura}</strong> — sai do score acima, e não
          se escolhe à mão. Para mudar a faixa, mexa nos limites em Configurações.
        </p>
      ) : avaliacao ? (
        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          Nenhum sinal observado ainda — o lead está no ponto de partida ({avaliacao.score}), não foi
          avaliado.
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          Os sinais deste lead ainda não carregaram.
          {registrada ? <> A última temperatura registrada foi <strong>{registrada}</strong>.</> : null}
        </p>
      )}
    </div>
  );
}

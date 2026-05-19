import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertCircle,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  DollarSign,
  Download,
  FileText,
  Filter,
  GripVertical,
  History,
  Landmark,
  LayoutGrid,
  List,
  Loader2,
  MapPin,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  TrendingUp,
  Users,
  WalletCards,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { useLeadsMetrics } from '@/features/leads/hooks/useLeadsMetrics';
import {
  atualizarStatusLeadCRM,
  type CRMLead,
} from '@/features/leads/services/leadsService';
import {
  appendSavedProposalHistoryItems,
  createSavedProposal,
  fetchSavedProposals,
  updateSavedProposal,
  type SaveProposalInput,
  type SavedProposal,
  type SavedProposalHistory,
  type SavedProposalParty,
} from '@/features/leads/services/proposalsService';

const PROPOSAL_STAGES = [
  {
    id: 'negociacao',
    dbStatus: 'Negociação',
    label: 'Negociação',
    color: '#2563eb',
    icon: Clock3,
    probability: 35,
  },
  {
    id: 'proposta-criada',
    dbStatus: 'Proposta Criada',
    label: 'Proposta Criada',
    color: '#f59e0b',
    icon: FileText,
    probability: 50,
  },
  {
    id: 'proposta-enviada',
    dbStatus: 'Proposta Enviada',
    label: 'Proposta Enviada',
    color: '#dc2626',
    icon: Send,
    probability: 65,
  },
  {
    id: 'propostas-respondidas',
    dbStatus: 'Propostas Respondidas',
    label: 'Respondidas',
    color: '#f97316',
    icon: AlertCircle,
    probability: 72,
  },
  {
    id: 'feitura-contrato',
    dbStatus: 'Feitura de Contrato',
    label: 'Contrato',
    color: '#7c3aed',
    icon: FileText,
    probability: 86,
  },
  {
    id: 'proposta-assinada',
    dbStatus: 'Proposta Assinada',
    label: 'Assinadas',
    color: '#16a34a',
    icon: CheckCircle2,
    probability: 100,
  },
  {
    id: 'arquivado',
    dbStatus: 'Arquivado',
    label: 'Arquivadas',
    color: '#64748b',
    icon: XCircle,
    probability: 0,
  },
] as const;

type ProposalStage = (typeof PROPOSAL_STAGES)[number];
type ProposalStageId = ProposalStage['id'];
type ViewMode = 'kanban' | 'lista';
type ProposalSource = 'crm' | 'draft';
type SignatureChannel = 'whatsapp' | 'email';
type SignatureStatus = 'pendente' | 'enviado' | 'assinado' | 'recusado';
type CreditSupport = 'aprovado' | 'suporte';
type PropertyOrigin = 'interno' | 'externo';

interface ProposalAddress {
  cep: string;
  numero: string;
  logradouro: string;
  bairro: string;
  complemento: string;
  cidade: string;
  uf: string;
}

interface ProposalItem {
  id: string;
  source: ProposalSource;
  propertyOrigin: PropertyOrigin;
  cliente: string;
  telefone?: string | null;
  corretor: string;
  agenteResponsavel: string;
  valor: number;
  imovelRef: string;
  endereco?: ProposalAddress;
  tipoNegocio: string;
  tipoLead: string;
  origem: string;
  temperatura: string;
  status: string;
  stageId: ProposalStageId;
  criadaEm: string;
  atualizadaEm: string;
  observacoes?: string | null;
  raw?: CRMLead;
}

interface DraftFormState {
  propertyOrigin: PropertyOrigin;
  imovelRef: string;
  cep: string;
  numero: string;
  logradouro: string;
  bairro: string;
  complemento: string;
  cidade: string;
  uf: string;
  agenteResponsavel: string;
  valor: string;
  comFinanciamento: boolean;
  financiamentoAproximado: string;
  sinalArras: string;
  condicoesEspecificas: string;
  parceirosExternos: boolean;
  revisado: boolean;
  tipoNegocio: string;
  stageId: ProposalStageId;
  compradores: ProposalParty[];
  vendedores: ProposalParty[];
}

interface ProposalParty {
  id: string;
  nomeCompleto: string;
  cpf: string;
  rg: string;
  celular: string;
  email: string;
  empresa: boolean;
  assinaturaPor: SignatureChannel;
  assinadoPor: string;
  statusAssinatura: SignatureStatus;
}

interface PaymentDetails {
  formaPagamento: string;
  valor: string;
  comFinanciamento: boolean;
  financiamentoAproximado: string;
  sinalArras: string;
  assessoriaBancaria: CreditSupport;
  condicoesEspecificas: string;
}

interface HistoryItem {
  id: string;
  label: string;
  detail: string;
  date: string;
}

interface ProposalDetailState {
  compradores: ProposalParty[];
  vendedores: ProposalParty[];
  pagamento: PaymentDetails;
  propertyOrigin: PropertyOrigin;
  endereco?: ProposalAddress;
  agenteResponsavel: string;
  parceirosExternos: boolean;
  revisado: boolean;
  enviadoProponente: boolean;
  enviadoProprietario: boolean;
  historico: HistoryItem[];
}

const STAGE_BY_ID = PROPOSAL_STAGES.reduce((acc, stage) => {
  acc[stage.id] = stage;
  return acc;
}, {} as Record<ProposalStageId, ProposalStage>);

const STAGE_IDS = new Set<ProposalStageId>(PROPOSAL_STAGES.map((stage) => stage.id));

const INITIAL_DRAFT_FORM: DraftFormState = {
  propertyOrigin: 'interno',
  imovelRef: '',
  cep: '',
  numero: '',
  logradouro: '',
  bairro: '',
  complemento: '',
  cidade: '',
  uf: '',
  agenteResponsavel: '',
  valor: '',
  comFinanciamento: false,
  financiamentoAproximado: '',
  sinalArras: '',
  condicoesEspecificas: '',
  parceirosExternos: false,
  revisado: false,
  tipoNegocio: 'Venda',
  stageId: 'proposta-criada',
  compradores: [],
  vendedores: [],
};

const GENERAL_CONDITIONS = [
  'A presente proposta está submetida às disposições dos artigos 722 a 729 do Código Civil, especialmente ao artigo 723, que estabelece o dever da imobiliária e dos corretores de imóveis de atuarem com diligência, prudência e transparência, prestando espontaneamente todas as informações relevantes sobre o andamento da negociação, inclusive quanto à segurança, riscos envolvidos, alterações de valores e demais fatores que possam influenciar a concretização do negócio.',
  'Esta proposta terá validade de 03 (três) dias corridos, contados da data de sua assinatura pelo(a)(s) Proponente(s) Comprador(a)(es), ficando condicionada à aceitação expressa do(a)(s) proprietário(a)(s)/vendedor(es). Após a aceitação da proposta, o(a)(s) Proponente(s) Comprador(a)(es) deverá(ão) encaminhar toda a documentação necessária para elaboração do contrato no prazo máximo de 48 (quarenta e oito) horas. O descumprimento deste prazo poderá resultar na liberação do imóvel para nova comercialização, sem qualquer ônus ao proprietário ou à imobiliária.',
  'A parte que der causa ao arrependimento ou desistência do negócio após a aceitação desta proposta ficará obrigada ao pagamento de multa equivalente a 10% (dez por cento) do valor total do imóvel, além dos honorários de corretagem e intermediação imobiliária no percentual de 6% (seis por cento) sobre o valor do negócio, nos termos do artigo 725 do Código Civil.',
  'A penalidade prevista no item anterior não será aplicada caso o(a)(s) Proponente(s) Comprador(a)(es) não obtenha(m) aprovação de financiamento imobiliário junto à instituição financeira competente e/ou não consiga(m) a liberação dos recursos provenientes do FGTS, desde que devidamente comprovada a negativa.',
  'Com a aceitação desta proposta pelo(a)(s) proprietário(a)(s)/vendedor(es), as partes declaram ciência e concordância expressa quanto à coleta, tratamento e armazenamento de dados pessoais e documentos necessários à análise da negociação, incluindo certidões negativas, pesquisas cadastrais e documentos do imóvel e das partes envolvidas, nos termos da Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais - LGPD). As partes autorizam, ainda, a imobiliária a providenciar a elaboração do instrumento particular de compra e venda, escritura pública e/ou contrato de financiamento, comprometendo-se a fornecer toda a documentação necessária e arcar com as despesas inerentes à formalização da transação.',
  'Fica eleito o foro da comarca da situação do imóvel para dirimir quaisquer dúvidas ou controvérsias oriundas desta proposta, com renúncia expressa a qualquer outro, por mais privilegiado que seja.',
];

const normalize = (value: string | null | undefined) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuidLike = (value: string | null | undefined) => Boolean(value && uuidPattern.test(value));

const createLocalId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const parseCurrencyInput = (value: string) => {
  const normalized = value
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value || 0);

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return 'Aguardando...';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatAddress = (address?: ProposalAddress) => {
  if (!address) return 'Endereço não informado';
  const street = [address.logradouro, address.numero].filter(Boolean).join(', ');
  const city = [address.cidade, address.uf].filter(Boolean).join(' - ');
  return [street, address.bairro, city].filter(Boolean).join(' | ') || 'Endereço não informado';
};

const hasAddressData = (address?: ProposalAddress) => Boolean(address && Object.values(address).some(Boolean));

const daysSince = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diff = Date.now() - date.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
};

const getInitials = (name: string) => {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
};

const getStageFromStatus = (status: string | null | undefined, finalSaleValue?: number | null): ProposalStageId | null => {
  if ((finalSaleValue || 0) > 0) return 'proposta-assinada';

  const value = normalize(status);
  if (!value) return null;
  if (value.includes('arquivad')) return 'arquivado';
  if (value.includes('assinad') || value.includes('fechamento') || value.includes('vendid')) return 'proposta-assinada';
  if (value.includes('feitura') || value.includes('contrato')) return 'feitura-contrato';
  if (value.includes('respondid')) return 'propostas-respondidas';
  if (value === 'proposta') return 'propostas-respondidas';
  if (value.includes('enviad')) return 'proposta-enviada';
  if (value.includes('criad')) return 'proposta-criada';
  if (value.includes('negoci')) return 'negociacao';
  return null;
};

const inferBusinessType = (lead: CRMLead) => {
  const propertyType = normalize(lead.property_type);
  if (propertyType.includes('locacao') || propertyType.includes('aluguel') || propertyType.includes('rent')) {
    return 'Locação';
  }
  return 'Venda';
};

const leadToProposal = (lead: CRMLead): ProposalItem | null => {
  const stageId = getStageFromStatus(lead.status, lead.final_sale_value);
  if (!stageId) return null;

  return {
    id: lead.id,
    source: 'crm',
    propertyOrigin: 'interno',
    cliente: lead.name || 'Lead sem nome',
    telefone: lead.phone,
    corretor: lead.assigned_agent_name || 'Não atribuído',
    agenteResponsavel: lead.assigned_agent_name || 'Não atribuído',
    valor: lead.final_sale_value || lead.property_value || 0,
    imovelRef: lead.property_code || 'Sem imóvel',
    tipoNegocio: inferBusinessType(lead),
    tipoLead: lead.lead_type === 2 ? 'Proprietário' : 'Interessado',
    origem: lead.source || 'CRM',
    temperatura: lead.temperature || 'Frio',
    status: lead.status || STAGE_BY_ID[stageId].dbStatus,
    stageId,
    criadaEm: lead.created_at,
    atualizadaEm: lead.updated_at || lead.created_at,
    observacoes: lead.comments,
    raw: lead,
  };
};

const isStageId = (id: string): id is ProposalStageId => STAGE_IDS.has(id as ProposalStageId);

const csvEscape = (value: string | number) => {
  const text = String(value ?? '');
  if (/[;"\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

const createParty = (partial: Partial<ProposalParty> = {}): ProposalParty => ({
  id: partial.id || createLocalId('party'),
  nomeCompleto: partial.nomeCompleto || '',
  cpf: partial.cpf || '',
  rg: partial.rg || '',
  celular: partial.celular || '',
  email: partial.email || '',
  empresa: partial.empresa ?? false,
  assinaturaPor: partial.assinaturaPor || 'whatsapp',
  assinadoPor: partial.assinadoPor || '',
  statusAssinatura: partial.statusAssinatura || 'pendente',
});

const getFlowSteps = (proposal: ProposalItem, detail: ProposalDetailState) => {
  const sentToProponent = detail.historico.find((item) => item.label === 'Enviada proponentes')?.date;
  const sentToOwner = detail.historico.find((item) => item.label === 'Enviada proprietários')?.date;
  const buyersSigned = detail.compradores.length > 0 && detail.compradores.every((party) => party.statusAssinatura === 'assinado');
  const ownersSigned = detail.vendedores.length > 0 && detail.vendedores.every((party) => party.statusAssinatura === 'assinado');
  const becameDeal = proposal.stageId === 'proposta-assinada';

  return [
    {
      label: 'Rascunho',
      detail: formatDateTime(proposal.criadaEm),
      done: true,
    },
    {
      label: 'Enviada proponentes',
      detail: detail.enviadoProponente ? formatDateTime(sentToProponent || proposal.atualizadaEm) : 'Aguardando...',
      done: detail.enviadoProponente,
    },
    {
      label: 'Assinada proponentes',
      detail: buyersSigned ? 'Assinada' : 'Aguardando...',
      done: buyersSigned,
    },
    {
      label: 'Enviada proprietários',
      detail: detail.enviadoProprietario ? formatDateTime(sentToOwner || proposal.atualizadaEm) : 'Aguardando...',
      done: detail.enviadoProprietario,
    },
    {
      label: 'Assinado proprietários',
      detail: ownersSigned ? 'Assinado' : 'Aguardando...',
      done: ownersSigned,
    },
    {
      label: 'Virou Negócio',
      detail: becameDeal ? formatDateTime(proposal.atualizadaEm) : 'Aguardando...',
      done: becameDeal,
    },
  ];
};

const buildDefaultProposalDetail = (proposal: ProposalItem): ProposalDetailState => ({
  compradores: proposal.source === 'draft'
    ? []
    : [
        createParty({
          id: `comprador-${proposal.id}`,
          nomeCompleto: proposal.cliente,
          celular: proposal.telefone || '',
          email: proposal.raw?.email || '',
          assinadoPor: proposal.cliente,
          statusAssinatura: proposal.stageId === 'proposta-assinada' ? 'assinado' : 'pendente',
        }),
      ],
  vendedores: [],
  pagamento: {
    formaPagamento: proposal.tipoNegocio === 'Locação' ? 'Locação' : 'Compra e venda',
    valor: proposal.valor ? formatCurrency(proposal.valor) : '',
    comFinanciamento: false,
    financiamentoAproximado: '',
    sinalArras: '',
    assessoriaBancaria: 'suporte',
    condicoesEspecificas: '',
  },
  propertyOrigin: proposal.propertyOrigin,
  endereco: proposal.endereco,
  agenteResponsavel: proposal.agenteResponsavel,
  parceirosExternos: false,
  revisado: false,
  enviadoProponente: false,
  enviadoProprietario: false,
  historico: [
    {
      id: `hist-created-${proposal.id}`,
      label: 'Rascunho',
      detail: `${proposal.cliente} - ${proposal.imovelRef}`,
      date: proposal.criadaEm,
    },
    {
      id: `hist-stage-${proposal.id}`,
      label: `Etapa atual: ${STAGE_BY_ID[proposal.stageId].label}`,
      detail: proposal.status,
      date: proposal.atualizadaEm,
    },
  ],
});

const toProposalNumber = (value: number | string | null | undefined) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  return parseCurrencyInput(String(value || ''));
};

const savedPartyToProposalParty = (party: SavedProposalParty): ProposalParty =>
  createParty({
    id: party.id,
    nomeCompleto: party.full_name || '',
    cpf: party.cpf || '',
    rg: party.rg || '',
    celular: party.phone || '',
    email: party.email || '',
    empresa: Boolean(party.is_company),
    assinaturaPor: party.signature_channel,
    assinadoPor: party.signed_by || '',
    statusAssinatura: party.signature_status,
  });

const savedHistoryToHistoryItem = (item: SavedProposalHistory): HistoryItem => ({
  id: item.id,
  label: item.label,
  detail: item.detail || '',
  date: item.created_at,
});

const savedProposalToUiState = (saved: SavedProposal): { proposal: ProposalItem; detail: ProposalDetailState } => {
  const stageId = isStageId(saved.stage_id) ? saved.stage_id : 'proposta-criada';
  const endereco: ProposalAddress = {
    cep: saved.cep || '',
    numero: saved.numero || '',
    logradouro: saved.logradouro || '',
    bairro: saved.bairro || '',
    complemento: saved.complemento || '',
    cidade: saved.cidade || '',
    uf: saved.uf || '',
  };
  const normalizedAddress = hasAddressData(endereco) ? endereco : undefined;
  const compradores = saved.parties
    .filter((party) => party.party_type === 'comprador')
    .map(savedPartyToProposalParty);
  const vendedores = saved.parties
    .filter((party) => party.party_type === 'vendedor')
    .map(savedPartyToProposalParty);
  const firstBuyerName = compradores.find((party) => party.nomeCompleto.trim())?.nomeCompleto.trim();
  const valor = toProposalNumber(saved.value);
  const propertyReference =
    saved.property_reference ||
    (saved.property_origin === 'externo' ? formatAddress(normalizedAddress) : 'Imóvel da carteira');

  const proposal: ProposalItem = {
    id: saved.id,
    source: 'draft',
    propertyOrigin: saved.property_origin,
    cliente: firstBuyerName || 'Proposta sem proponente',
    telefone: compradores.find((party) => party.celular)?.celular || null,
    corretor: saved.agent_name || 'Não atribuído',
    agenteResponsavel: saved.agent_name || '',
    valor,
    imovelRef: propertyReference,
    endereco: normalizedAddress,
    tipoNegocio: saved.business_type || 'Venda',
    tipoLead: saved.lead_type || 'Interessado',
    origem: saved.origin || 'Manual',
    temperatura: saved.temperature || 'Morno',
    status: saved.status || STAGE_BY_ID[stageId].dbStatus,
    stageId,
    criadaEm: saved.created_at,
    atualizadaEm: saved.updated_at,
    observacoes: saved.specific_conditions || null,
  };

  const historico = saved.history.map(savedHistoryToHistoryItem);

  return {
    proposal,
    detail: {
      compradores,
      vendedores,
      pagamento: {
        formaPagamento: saved.payment_method || 'Compra e venda',
        valor: valor ? formatCurrency(valor) : '',
        comFinanciamento: Boolean(saved.has_financing),
        financiamentoAproximado: saved.financing_amount || '',
        sinalArras: saved.down_payment || '',
        assessoriaBancaria: saved.banking_support || 'suporte',
        condicoesEspecificas: saved.specific_conditions || '',
      },
      propertyOrigin: saved.property_origin,
      endereco: normalizedAddress,
      agenteResponsavel: saved.agent_name || '',
      parceirosExternos: Boolean(saved.external_partners),
      revisado: Boolean(saved.reviewed),
      enviadoProponente: Boolean(saved.sent_to_proponent),
      enviadoProprietario: Boolean(saved.sent_to_owner),
      historico: historico.length > 0 ? historico : buildDefaultProposalDetail(proposal).historico,
    },
  };
};

const proposalPartyToSaveInput = (
  party: ProposalParty,
  partyType: 'comprador' | 'vendedor',
): SaveProposalInput['parties'][number] => ({
  id: party.id,
  partyType,
  fullName: party.nomeCompleto.trim(),
  cpf: party.cpf.trim(),
  rg: party.rg.trim(),
  phone: party.celular.trim(),
  email: party.email.trim(),
  isCompany: party.empresa,
  signatureChannel: party.assinaturaPor,
  signedBy: party.assinadoPor.trim(),
  signatureStatus: party.statusAssinatura,
});

const historyItemToSaveInput = (item: HistoryItem): NonNullable<SaveProposalInput['history']>[number] => ({
  label: item.label,
  detail: item.detail,
  createdAt: item.date,
});

const proposalToSaveInput = (
  proposal: ProposalItem,
  detail: ProposalDetailState,
  tenantId: string,
  userId: string | null | undefined,
  history?: HistoryItem[],
): SaveProposalInput => {
  const address = detail.endereco || proposal.endereco || {
    cep: '',
    numero: '',
    logradouro: '',
    bairro: '',
    complemento: '',
    cidade: '',
    uf: '',
  };
  const paymentValue = parseCurrencyInput(detail.pagamento.valor);
  const currentStage = STAGE_BY_ID[proposal.stageId];

  return {
    id: proposal.id,
    tenantId,
    userId,
    leadId: proposal.source === 'crm' ? proposal.id : null,
    source: proposal.source,
    propertyOrigin: detail.propertyOrigin || proposal.propertyOrigin,
    propertyReference: proposal.imovelRef,
    cep: address.cep.trim(),
    numero: address.numero.trim(),
    logradouro: address.logradouro.trim(),
    bairro: address.bairro.trim(),
    complemento: address.complemento.trim(),
    cidade: address.cidade.trim(),
    uf: address.uf.trim().toUpperCase(),
    agentUserId: userId || null,
    agentName: detail.agenteResponsavel || proposal.agenteResponsavel || proposal.corretor,
    businessType: proposal.tipoNegocio,
    leadType: proposal.tipoLead,
    origin: proposal.origem,
    temperature: proposal.temperatura,
    status: proposal.status || currentStage.dbStatus,
    stageId: proposal.stageId,
    value: paymentValue || proposal.valor,
    paymentMethod: detail.pagamento.formaPagamento || 'Compra e venda',
    hasFinancing: detail.pagamento.comFinanciamento,
    financingAmount: detail.pagamento.financiamentoAproximado,
    downPayment: detail.pagamento.sinalArras,
    bankingSupport: detail.pagamento.assessoriaBancaria,
    specificConditions: detail.pagamento.condicoesEspecificas,
    externalPartners: detail.parceirosExternos,
    reviewed: detail.revisado,
    sentToProponent: detail.enviadoProponente,
    sentToOwner: detail.enviadoProprietario,
    parties: [
      ...detail.compradores.map((party) => proposalPartyToSaveInput(party, 'comprador')),
      ...detail.vendedores.map((party) => proposalPartyToSaveInput(party, 'vendedor')),
    ],
    history: history?.map(historyItemToSaveInput),
  };
};

const signatureStatusLabel: Record<SignatureStatus, string> = {
  pendente: 'Pendente',
  enviado: 'Enviado',
  assinado: 'Assinado',
  recusado: 'Recusado',
};

const signatureStatusClass: Record<SignatureStatus, string> = {
  pendente: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  enviado: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  assinado: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  recusado: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
};

const signatureChannelLabel: Record<SignatureChannel, string> = {
  whatsapp: 'Aceite WhatsApp',
  email: 'Email',
};

type RequiredPartyField = 'nomeCompleto' | 'cpf' | 'celular' | 'email' | 'assinaturaPor';

const partyRequiredFieldLabels: Record<RequiredPartyField, string> = {
  nomeCompleto: 'Nome completo',
  cpf: 'CPF',
  celular: 'Celular',
  email: 'Email',
  assinaturaPor: 'Assinar por',
};

const getPartyMissingFields = (party: ProposalParty): RequiredPartyField[] =>
  (Object.keys(partyRequiredFieldLabels) as RequiredPartyField[]).filter((field) => {
    if (field === 'assinaturaPor') return !party.assinaturaPor;
    return !String(party[field] || '').trim();
  });

function DetailSection({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Icon className="h-4 w-4" />
          </span>
          <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PartyEditor({
  party,
  label,
  participantType,
  isCollapsed,
  onToggleCollapsed,
  onChange,
  onRemove,
}: {
  party: ProposalParty;
  label: string;
  participantType: 'proponente' | 'proprietario';
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onChange: (updates: Partial<ProposalParty>) => void;
  onRemove?: () => void;
}) {
  const missingFields = getPartyMissingFields(party);
  const isMissing = (field: RequiredPartyField) => missingFields.includes(field);
  const inputClass = (field: RequiredPartyField) =>
    cn(
      'h-9 text-[13px]',
      isMissing(field) && 'border-rose-300 focus-visible:ring-rose-100 dark:border-rose-900 dark:focus-visible:ring-rose-950/40',
    );

  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className={cn('flex items-center justify-between gap-3', !isCollapsed && 'mb-3')}>
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
            {getInitials(party.nomeCompleto || label)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">{label}</p>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
              {party.email || party.celular || `Dados do ${participantType === 'proponente' ? 'proponente' : 'proprietário'} pendentes`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', signatureStatusClass[party.statusAssinatura])}>
            {signatureStatusLabel[party.statusAssinatura]}
          </span>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            title={isCollapsed ? 'Expandir participante' : 'Minimizar participante'}
          >
            <ChevronRight className={cn('h-4 w-4 transition-transform', !isCollapsed && 'rotate-90')} />
          </button>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800"
              title="Remover"
            >
              <XCircle className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {isCollapsed ? (
        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500 dark:text-slate-400">
            <span>{party.cpf || 'CPF pendente'}</span>
            <span>{party.celular || 'Celular pendente'}</span>
            <span>{signatureChannelLabel[party.assinaturaPor]}</span>
            {party.empresa && <span className="font-semibold text-blue-600 dark:text-blue-300">Empresa</span>}
          </div>
          {missingFields.length > 0 && (
            <p className="mt-1 text-[12px] font-medium text-rose-600 dark:text-rose-300">
              Pendências: {missingFields.length}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
            <p className="text-[12px] font-semibold text-slate-900 dark:text-slate-100">Dados do cliente/representante</p>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">* campos obrigatórios</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Nome completo: *</label>
              <Input
                value={party.nomeCompleto}
                onChange={(event) => onChange({ nomeCompleto: event.target.value })}
                placeholder="Nome completo"
                aria-required="true"
                aria-invalid={isMissing('nomeCompleto')}
                className={inputClass('nomeCompleto')}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">CPF: *</label>
              <Input
                value={party.cpf}
                onChange={(event) => onChange({ cpf: event.target.value })}
                placeholder="000.000.000-00"
                aria-required="true"
                aria-invalid={isMissing('cpf')}
                className={inputClass('cpf')}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">RG:</label>
              <Input
                value={party.rg}
                onChange={(event) => onChange({ rg: event.target.value })}
                placeholder="RG"
                className="h-9 text-[13px]"
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Celular: *</label>
              <Input
                value={party.celular}
                onChange={(event) => onChange({ celular: event.target.value })}
                placeholder="(00) 00000-0000"
                aria-required="true"
                aria-invalid={isMissing('celular')}
                className={inputClass('celular')}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Email: *</label>
              <Input
                value={party.email}
                onChange={(event) => onChange({ email: event.target.value })}
                placeholder="email@dominio.com"
                aria-required="true"
                aria-invalid={isMissing('email')}
                className={inputClass('email')}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Representa uma empresa?</label>
              <button
                type="button"
                onClick={() => onChange({ empresa: !party.empresa })}
                className={cn(
                  'inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-[12px] font-semibold transition-colors',
                  party.empresa
                    ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
                )}
              >
                <Building2 className="h-3.5 w-3.5" />
                {party.empresa ? 'Sim' : 'Não'}
              </button>
            </div>
            <div className="grid gap-1.5">
              <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Assinar por: *</label>
              <div
                className={cn(
                  'grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800',
                  isMissing('assinaturaPor') && 'border-rose-300 dark:border-rose-900',
                )}
              >
                {(['whatsapp', 'email'] as const).map((channel) => (
                  <button
                    key={channel}
                    type="button"
                    onClick={() => onChange({ assinaturaPor: channel })}
                    aria-pressed={party.assinaturaPor === channel}
                    className={cn(
                      'h-9 px-2 text-[12px] font-semibold transition-colors',
                      party.assinaturaPor === channel
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
                    )}
                  >
                    {signatureChannelLabel[channel]}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Status da assinatura</label>
              <Select
                value={party.statusAssinatura}
                onValueChange={(value) => onChange({ statusAssinatura: value as SignatureStatus })}
              >
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="enviado">Enviado</SelectItem>
                  <SelectItem value="assinado">Assinado</SelectItem>
                  <SelectItem value="recusado">Recusado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Assinado por</label>
              <Input
                value={party.assinadoPor}
                onChange={(event) => onChange({ assinadoPor: event.target.value })}
                placeholder="Nome de quem assinou ou aceitará"
                className="h-9 text-[13px]"
              />
            </div>
          </div>

          {missingFields.length > 0 && (
            <p className="mt-3 text-[12px] font-medium text-rose-600 dark:text-rose-300">
              Preencha: {missingFields.map((field) => partyRequiredFieldLabels[field]).join(', ')}.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function StagePill({ stageId, compact = false }: { stageId: ProposalStageId; compact?: boolean }) {
  const stage = STAGE_BY_ID[stageId];
  const Icon = stage.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-semibold',
        compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
      )}
      style={{
        borderColor: `${stage.color}33`,
        backgroundColor: `${stage.color}12`,
        color: stage.color,
      }}
    >
      <Icon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      {stage.label}
    </span>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: 'blue' | 'emerald' | 'amber' | 'rose';
}) {
  const toneClass = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300',
  }[tone];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 truncate text-xl font-semibold text-slate-950 dark:text-slate-50">{value}</p>
        </div>
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', toneClass)}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-[12px] text-slate-500 dark:text-slate-400">{detail}</p>
    </div>
  );
}

function ProposalCardContent({
  proposal,
  dragHandle,
  isDragging,
  onOpen,
}: {
  proposal: ProposalItem;
  dragHandle?: React.ReactNode;
  isDragging?: boolean;
  onOpen: (proposal: ProposalItem) => void;
}) {
  const stage = STAGE_BY_ID[proposal.stageId];
  const age = daysSince(proposal.atualizadaEm);

  return (
    <article
      className={cn(
        'rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-all hover:border-blue-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-900/70',
        isDragging && 'opacity-40',
      )}
    >
      <div className="flex items-start gap-2">
        {dragHandle}
        <button
          type="button"
          onClick={() => onOpen(proposal)}
          className="min-w-0 flex-1 text-left focus:outline-none"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ backgroundColor: stage.color }}
              >
                {getInitials(proposal.cliente)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                  {proposal.cliente}
                </p>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {proposal.corretor}
                </p>
              </div>
            </div>
            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="truncate text-base font-bold text-slate-950 dark:text-slate-50">
              {formatCurrency(proposal.valor)}
            </p>
            <Badge variant="outline" className="h-5 shrink-0 px-2 text-[10px]">
              {proposal.tipoNegocio}
            </Badge>
          </div>

          <div className="mt-3 rounded-md bg-slate-50 px-2.5 py-2 dark:bg-slate-800/60">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-200">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              <span className="truncate">{proposal.imovelRef}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-[10.5px] text-slate-500 dark:text-slate-400">
              <span className="truncate">{proposal.origem}</span>
              <span>{age === null ? 'Sem atualização' : `${age}d sem mov.`}</span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <StagePill stageId={proposal.stageId} compact />
            {proposal.source === 'draft' && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                Rascunho
              </span>
            )}
          </div>

          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full"
              style={{ width: `${stage.probability}%`, backgroundColor: stage.color }}
            />
          </div>
        </button>
      </div>
    </article>
  );
}

function DraggableProposalCard({
  proposal,
  onOpen,
}: {
  proposal: ProposalItem;
  onOpen: (proposal: ProposalItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: proposal.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className="touch-none"
    >
      <ProposalCardContent
        proposal={proposal}
        isDragging={isDragging}
        onOpen={onOpen}
        dragHandle={
          <button
            type="button"
            className="mt-1 flex h-6 w-5 shrink-0 cursor-grab items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing dark:hover:bg-slate-800"
            aria-label="Mover proposta"
            title="Mover proposta"
            {...listeners}
            {...attributes}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        }
      />
    </div>
  );
}

function KanbanColumn({
  stage,
  proposals,
  onOpen,
}: {
  stage: ProposalStage;
  proposals: ProposalItem[];
  onOpen: (proposal: ProposalItem) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = proposals.reduce((sum, proposal) => sum + proposal.valor, 0);
  const Icon = stage.icon;

  return (
    <section
      className="flex h-full w-[286px] shrink-0 flex-col overflow-hidden rounded-lg border bg-slate-50 dark:bg-slate-950/40"
      style={{
        borderColor: isOver ? stage.color : undefined,
        boxShadow: isOver ? `0 0 0 2px ${stage.color}22` : undefined,
      }}
    >
      <header className="border-b border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
              style={{ backgroundColor: `${stage.color}14`, color: stage.color }}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[12px] font-semibold text-slate-900 dark:text-slate-100">
                {stage.label}
              </h2>
              <p className="truncate text-[10.5px] text-slate-500 dark:text-slate-400">
                {formatCurrency(total)}
              </p>
            </div>
          </div>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{ backgroundColor: `${stage.color}14`, color: stage.color }}
          >
            {proposals.length}
          </span>
        </div>
      </header>

      <div ref={setNodeRef} className="flex-1 space-y-2 overflow-y-auto p-2.5">
        {proposals.length === 0 ? (
          <div
            className={cn(
              'flex min-h-[130px] items-center justify-center rounded-lg border border-dashed px-4 text-center text-[12px] text-slate-400 transition-colors dark:text-slate-500',
              isOver ? 'bg-white dark:bg-slate-900' : 'border-slate-200 dark:border-slate-800',
            )}
            style={{ borderColor: isOver ? stage.color : undefined }}
          >
            Solte uma proposta aqui
          </div>
        ) : (
          proposals.map((proposal) => (
            <DraggableProposalCard key={proposal.id} proposal={proposal} onOpen={onOpen} />
          ))
        )}
      </div>
    </section>
  );
}

export const PropostaPage = () => {
  const { toast } = useToast();
  const { user, tenantId } = useAuth();
  const { leads, isLoading, error, refetch } = useLeadsMetrics();
  const currentTenantId = tenantId && tenantId !== 'owner' ? tenantId : null;
  const [view, setView] = useState<ViewMode>('kanban');
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<ProposalStageId | 'todos'>('todos');
  const [agentFilter, setAgentFilter] = useState('todos');
  const [typeFilter, setTypeFilter] = useState('todos');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedProposal, setSelectedProposal] = useState<ProposalItem | null>(null);
  const [drafts, setDrafts] = useState<ProposalItem[]>([]);
  const [stageOverrides, setStageOverrides] = useState<Record<string, ProposalStageId>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [draftForm, setDraftForm] = useState<DraftFormState>(INITIAL_DRAFT_FORM);
  const [draftStartedAt, setDraftStartedAt] = useState(new Date().toISOString());
  const [proposalDetails, setProposalDetails] = useState<Record<string, ProposalDetailState>>({});
  const [collapsedPartyIds, setCollapsedPartyIds] = useState<Set<string>>(() => new Set());
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const loadSavedProposalDrafts = useCallback(async () => {
    if (!currentTenantId) {
      setDrafts([]);
      setSavedError(null);
      return;
    }

    setSavedLoading(true);
    setSavedError(null);

    try {
      const saved = await fetchSavedProposals(currentTenantId);
      const converted = saved.map(savedProposalToUiState);

      setDrafts(converted.map((item) => item.proposal));
      setProposalDetails((previous) => {
        const next = { ...previous };
        converted.forEach(({ proposal, detail }) => {
          next[proposal.id] = detail;
        });
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar propostas salvas.';
      setSavedError(message);
      console.error('Erro ao carregar propostas salvas:', err);
    } finally {
      setSavedLoading(false);
    }
  }, [currentTenantId]);

  useEffect(() => {
    void loadSavedProposalDrafts();
  }, [loadSavedProposalDrafts]);

  useEffect(() => {
    const timers = saveTimersRef.current;
    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const proposals = useMemo(() => {
    const crmProposals = leads
      .map(leadToProposal)
      .filter((proposal): proposal is ProposalItem => proposal !== null);

    return [...drafts, ...crmProposals]
      .map((proposal) => {
        const override = stageOverrides[proposal.id];
        if (!override) return proposal;
        return {
          ...proposal,
          stageId: override,
          status: STAGE_BY_ID[override].dbStatus,
        };
      })
      .sort((a, b) => new Date(b.atualizadaEm).getTime() - new Date(a.atualizadaEm).getTime());
  }, [drafts, leads, stageOverrides]);

  const agents = useMemo(() => {
    return Array.from(new Set(proposals.map((proposal) => proposal.corretor).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'pt-BR'),
    );
  }, [proposals]);

  const filtered = useMemo(() => {
    const q = normalize(search);

    return proposals.filter((proposal) => {
      const matchesSearch =
        !q ||
        normalize(proposal.cliente).includes(q) ||
        normalize(proposal.corretor).includes(q) ||
        normalize(proposal.imovelRef).includes(q) ||
        normalize(proposal.origem).includes(q) ||
        normalize(proposal.status).includes(q);

      const matchesStage = stageFilter === 'todos' || proposal.stageId === stageFilter;
      const matchesAgent = agentFilter === 'todos' || proposal.corretor === agentFilter;
      const matchesType = typeFilter === 'todos' || proposal.tipoNegocio === typeFilter;

      return matchesSearch && matchesStage && matchesAgent && matchesType;
    });
  }, [agentFilter, proposals, search, stageFilter, typeFilter]);

  const metrics = useMemo(() => {
    const signed = filtered.filter((proposal) => proposal.stageId === 'proposta-assinada');
    const archived = filtered.filter((proposal) => proposal.stageId === 'arquivado');
    const active = filtered.length - signed.length - archived.length;
    const totalValue = filtered.reduce((sum, proposal) => sum + proposal.valor, 0);
    const signedValue = signed.reduce((sum, proposal) => sum + proposal.valor, 0);
    const conversion = filtered.length ? Math.round((signed.length / filtered.length) * 100) : 0;

    return {
      total: filtered.length,
      active,
      signed: signed.length,
      totalValue,
      signedValue,
      conversion,
    };
  }, [filtered]);

  const activeCard = proposals.find((proposal) => proposal.id === activeId) || null;

  const selectedDetail = selectedProposal
    ? proposalDetails[selectedProposal.id] ?? buildDefaultProposalDetail(selectedProposal)
    : null;
  const buyerValidationIssues = selectedDetail
    ? selectedDetail.compradores.flatMap((party, index) =>
        getPartyMissingFields(party).map((field) => `Comprador ${index + 1}: ${partyRequiredFieldLabels[field]}`),
      )
    : [];
  const ownerValidationIssues = selectedDetail
    ? selectedDetail.vendedores.flatMap((party, index) =>
        getPartyMissingFields(party).map((field) => `Proprietário ${index + 1}: ${partyRequiredFieldLabels[field]}`),
      )
    : [];
  const canSendToProponent = Boolean(
    selectedDetail?.revisado &&
      selectedDetail.compradores.length > 0 &&
      buyerValidationIssues.length === 0,
  );
  const canSendToOwner = Boolean(
    selectedDetail?.revisado &&
      selectedDetail.vendedores.length > 0 &&
      ownerValidationIssues.length === 0,
  );
  const draftBuyerValidationIssues = draftForm.compradores.flatMap((party, index) =>
    getPartyMissingFields(party).map((field) => `Comprador ${index + 1}: ${partyRequiredFieldLabels[field]}`),
  );
  const canSendDraftToProponent = Boolean(
    draftForm.revisado &&
      draftForm.compradores.length > 0 &&
      draftBuyerValidationIssues.length === 0,
  );

  const persistExistingProposal = useCallback(
    async (proposal: ProposalItem, detail: ProposalDetailState) => {
      if (!currentTenantId || proposal.source !== 'draft' || !isUuidLike(proposal.id)) return;

      try {
        const payload = proposalToSaveInput(proposal, detail, currentTenantId, user?.id);
        await updateSavedProposal({ ...payload, id: proposal.id });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao salvar proposta.';
        setSavedError(message);
        console.error('Erro ao salvar proposta:', err);
      }
    },
    [currentTenantId, user?.id],
  );

  const schedulePersistProposal = useCallback(
    (proposal: ProposalItem, detail: ProposalDetailState) => {
      if (!currentTenantId || proposal.source !== 'draft' || !isUuidLike(proposal.id)) return;

      const previousTimer = saveTimersRef.current[proposal.id];
      if (previousTimer) clearTimeout(previousTimer);

      saveTimersRef.current[proposal.id] = setTimeout(() => {
        delete saveTimersRef.current[proposal.id];
        void persistExistingProposal(proposal, detail);
      }, 650);
    },
    [currentTenantId, persistExistingProposal],
  );

  const updateProposalDetail = (
    proposal: ProposalItem,
    updater: (detail: ProposalDetailState) => ProposalDetailState,
  ) => {
    setProposalDetails((previous) => {
      const current = previous[proposal.id] ?? buildDefaultProposalDetail(proposal);
      const next = updater(current);
      schedulePersistProposal(proposal, next);
      return {
        ...previous,
        [proposal.id]: next,
      };
    });
  };

  const appendHistory = (proposal: ProposalItem, label: string, detail: string) => {
    const historyItem: HistoryItem = {
      id: createLocalId('hist'),
      label,
      detail,
      date: new Date().toISOString(),
    };

    updateProposalDetail(proposal, (current) => ({
      ...current,
      historico: [historyItem, ...current.historico],
    }));

    if (currentTenantId && proposal.source === 'draft' && isUuidLike(proposal.id)) {
      void appendSavedProposalHistoryItems({
        proposalId: proposal.id,
        tenantId: currentTenantId,
        userId: user?.id,
        items: [historyItemToSaveInput(historyItem)],
      }).catch((err) => {
        const message = err instanceof Error ? err.message : 'Erro ao salvar histórico da proposta.';
        setSavedError(message);
        console.error('Erro ao salvar histórico da proposta:', err);
      });
    }
  };

  const openCreateProposal = () => {
    setDraftForm(INITIAL_DRAFT_FORM);
    setDraftStartedAt(new Date().toISOString());
    setCollapsedPartyIds(new Set());
    setCreateOpen(true);
  };

  const togglePartyCollapsed = (partyId: string) => {
    setCollapsedPartyIds((previous) => {
      const next = new Set(previous);
      if (next.has(partyId)) {
        next.delete(partyId);
      } else {
        next.add(partyId);
      }
      return next;
    });
  };

  const forgetCollapsedParty = (partyId: string) => {
    setCollapsedPartyIds((previous) => {
      if (!previous.has(partyId)) return previous;
      const next = new Set(previous);
      next.delete(partyId);
      return next;
    });
  };

  const updateParty = (
    proposal: ProposalItem,
    group: 'compradores' | 'vendedores',
    partyId: string,
    updates: Partial<ProposalParty>,
  ) => {
    updateProposalDetail(proposal, (current) => ({
      ...current,
      [group]: current[group].map((party) =>
        party.id === partyId ? { ...party, ...updates } : party,
      ),
    }));
  };

  const addParty = (proposal: ProposalItem, group: 'compradores' | 'vendedores') => {
    const label = group === 'compradores' ? 'Comprador adicionado' : 'Proprietário adicionado';
    const current = proposalDetails[proposal.id] ?? buildDefaultProposalDetail(proposal);
    const newParty = createParty();
    setCollapsedPartyIds((previous) => {
      const next = new Set(previous);
      current[group].forEach((party) => next.add(party.id));
      next.delete(newParty.id);
      return next;
    });
    updateProposalDetail(proposal, (current) => ({
      ...current,
      [group]: [...current[group], newParty],
    }));
    appendHistory(proposal, label, 'Novo participante incluído na proposta.');
  };

  const removeParty = (proposal: ProposalItem, group: 'compradores' | 'vendedores', partyId: string) => {
    forgetCollapsedParty(partyId);
    updateProposalDetail(proposal, (current) => ({
      ...current,
      [group]: current[group].filter((party) => party.id !== partyId),
    }));
  };

  const addDraftParty = (group: 'compradores' | 'vendedores') => {
    const newParty = createParty();
    setDraftForm((previous) => ({
      ...previous,
      [group]: [...previous[group], newParty],
    }));
    setCollapsedPartyIds((previous) => {
      const next = new Set(previous);
      draftForm[group].forEach((party) => next.add(party.id));
      next.delete(newParty.id);
      return next;
    });
  };

  const updateDraftParty = (
    group: 'compradores' | 'vendedores',
    partyId: string,
    updates: Partial<ProposalParty>,
  ) => {
    setDraftForm((previous) => ({
      ...previous,
      [group]: previous[group].map((party) =>
        party.id === partyId ? { ...party, ...updates } : party,
      ),
    }));
  };

  const removeDraftParty = (group: 'compradores' | 'vendedores', partyId: string) => {
    forgetCollapsedParty(partyId);
    setDraftForm((previous) => ({
      ...previous,
      [group]: previous[group].filter((party) => party.id !== partyId),
    }));
  };

  const updatePayment = (proposal: ProposalItem, updates: Partial<PaymentDetails>) => {
    updateProposalDetail(proposal, (current) => ({
      ...current,
      pagamento: {
        ...current.pagamento,
        ...updates,
      },
    }));

    if (updates.valor !== undefined) {
      const nextValue = parseCurrencyInput(updates.valor);
      if (nextValue > 0) {
        setDrafts((previous) =>
          previous.map((item) =>
            item.id === proposal.id ? { ...item, valor: nextValue, atualizadaEm: new Date().toISOString() } : item,
          ),
        );
        setSelectedProposal((current) =>
          current?.id === proposal.id ? { ...current, valor: nextValue, atualizadaEm: new Date().toISOString() } : current,
        );
      }
    }
  };

  const changeProposalStage = async (proposalId: string, nextStage: ProposalStageId) => {
    const proposal = proposals.find((item) => item.id === proposalId);
    if (!proposal || proposal.stageId === nextStage) return;

    if (proposal.source === 'draft') {
      const updatedProposal: ProposalItem = {
        ...proposal,
        stageId: nextStage,
        status: STAGE_BY_ID[nextStage].dbStatus,
        atualizadaEm: new Date().toISOString(),
      };

      setDrafts((previous) =>
        previous.map((item) =>
          item.id === proposalId ? updatedProposal : item,
        ),
      );
      setSelectedProposal((current) =>
        current?.id === proposalId ? updatedProposal : current,
      );
      appendHistory(updatedProposal, 'Etapa alterada', `Movida para ${STAGE_BY_ID[nextStage].label}.`);
      return;
    }

    const previousStage = proposal.stageId;
    setUpdatingId(proposalId);
    setStageOverrides((previous) => ({ ...previous, [proposalId]: nextStage }));
    setSelectedProposal((current) =>
      current?.id === proposalId
        ? { ...current, stageId: nextStage, status: STAGE_BY_ID[nextStage].dbStatus }
        : current,
    );

    const result = await atualizarStatusLeadCRM(proposalId, nextStage);

    if (!result.success) {
      setStageOverrides((previous) => {
        const next = { ...previous };
        if (previousStage) next[proposalId] = previousStage;
        return next;
      });
      setSelectedProposal((current) =>
        current?.id === proposalId
          ? { ...current, stageId: previousStage, status: STAGE_BY_ID[previousStage].dbStatus }
          : current,
      );
      toast({
        title: 'Não foi possível mover a proposta',
        description: result.message,
        variant: 'destructive',
      });
      setUpdatingId(null);
      return;
    }

    toast({
      title: 'Proposta atualizada',
      description: `${proposal.cliente} agora está em ${STAGE_BY_ID[nextStage].label}.`,
    });

    appendHistory(proposal, 'Etapa alterada', `Movida para ${STAGE_BY_ID[nextStage].label}.`);

    await refetch();
    setStageOverrides((previous) => {
      const next = { ...previous };
      delete next[proposalId];
      return next;
    });
    setUpdatingId(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const proposalId = String(event.active.id);
    const nextStage = event.over ? String(event.over.id) : '';
    setActiveId(null);

    if (!isStageId(nextStage)) return;
    void changeProposalStage(proposalId, nextStage);
  };

  const handleCreateDraft = async (sendToProponent = false) => {
    if (sendToProponent && !canSendDraftToProponent) {
      toast({
        title: 'Complete os proponentes',
        description: draftForm.compradores.length === 0
          ? 'Adicione ao menos um proponente antes de enviar.'
          : `Preencha: ${draftBuyerValidationIssues.join('; ')}.`,
        variant: 'destructive',
      });
      return;
    }

    if (!currentTenantId) {
      toast({
        title: 'Tenant não encontrado',
        description: 'Selecione uma imobiliária antes de criar uma proposta.',
        variant: 'destructive',
      });
      return;
    }

    const valor = parseCurrencyInput(draftForm.valor);
    if (valor <= 0) {
      toast({
        title: 'Informe o valor',
        description: 'O valor da proposta é obrigatório para criar o rascunho.',
        variant: 'destructive',
      });
      return;
    }

    const stage = STAGE_BY_ID[draftForm.stageId];
    const now = new Date().toISOString();
    const firstBuyerName = draftForm.compradores.find((party) => party.nomeCompleto.trim())?.nomeCompleto.trim();
    const endereco: ProposalAddress = {
      cep: draftForm.cep.trim(),
      numero: draftForm.numero.trim(),
      logradouro: draftForm.logradouro.trim(),
      bairro: draftForm.bairro.trim(),
      complemento: draftForm.complemento.trim(),
      cidade: draftForm.cidade.trim(),
      uf: draftForm.uf.trim().toUpperCase(),
    };
    const enderecoInformado = Object.values(endereco).some(Boolean);
    const imovelRef =
      draftForm.propertyOrigin === 'interno'
        ? draftForm.imovelRef.trim() || 'Imóvel da carteira'
        : formatAddress(enderecoInformado ? endereco : undefined);

    const draft: ProposalItem = {
      id: `draft-${Date.now()}`,
      source: 'draft',
      propertyOrigin: draftForm.propertyOrigin,
      cliente: firstBuyerName || 'Proposta sem proponente',
      corretor: draftForm.agenteResponsavel.trim() || '',
      agenteResponsavel: draftForm.agenteResponsavel.trim() || '',
      valor,
      imovelRef,
      endereco: enderecoInformado ? endereco : undefined,
      tipoNegocio: draftForm.tipoNegocio,
      tipoLead: 'Interessado',
      origem: 'Manual',
      temperatura: 'Morno',
      status: stage.dbStatus,
      stageId: stage.id,
      criadaEm: now,
      atualizadaEm: now,
      observacoes: 'Rascunho criado na tela de propostas.',
    };

    const initialHistory: HistoryItem[] = [
      ...(sendToProponent
        ? [{
            id: `hist-send-proponent-${Date.now()}`,
            label: 'Enviada proponentes',
            detail: 'Proposta marcada como enviada para aceite dos compradores.',
            date: now,
          }]
        : []),
      {
        id: `hist-created-${draft.id}`,
        label: 'Rascunho',
        detail: `${draft.propertyOrigin === 'interno' ? 'Imóvel interno' : 'Imóvel externo'} - ${draft.imovelRef}`,
        date: now,
      },
    ];

    const detail: ProposalDetailState = {
      compradores: draftForm.compradores.map((party) => ({ ...party })),
      vendedores: draftForm.vendedores.map((party) => ({ ...party })),
      pagamento: {
        formaPagamento: draftForm.comFinanciamento ? 'Com financiamento' : 'Sem financiamento',
        valor: draftForm.valor,
        comFinanciamento: draftForm.comFinanciamento,
        financiamentoAproximado: draftForm.financiamentoAproximado,
        sinalArras: draftForm.sinalArras,
        assessoriaBancaria: 'suporte',
        condicoesEspecificas: draftForm.condicoesEspecificas,
      },
      propertyOrigin: draft.propertyOrigin,
      endereco: draft.endereco,
      agenteResponsavel: draft.agenteResponsavel,
      parceirosExternos: draftForm.parceirosExternos,
      revisado: draftForm.revisado,
      enviadoProponente: sendToProponent,
      enviadoProprietario: false,
      historico: initialHistory,
    };

    setSavingDraft(true);
    setSavedError(null);

    try {
      const saved = await createSavedProposal(
        proposalToSaveInput(draft, detail, currentTenantId, user?.id, detail.historico),
      );
      const savedState = savedProposalToUiState(saved);

      setDrafts((previous) => [savedState.proposal, ...previous.filter((item) => item.id !== savedState.proposal.id)]);
      setProposalDetails((previous) => ({ ...previous, [savedState.proposal.id]: savedState.detail }));
      setDraftForm(INITIAL_DRAFT_FORM);
      setCreateOpen(false);
      toast({
        title: sendToProponent ? 'Proposta enviada para proponente' : 'Rascunho criado',
        description: `${savedState.proposal.imovelRef} entrou no pipeline de propostas.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível salvar a proposta.';
      setSavedError(message);
      toast({
        title: 'Não foi possível salvar a proposta',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSavingDraft(false);
    }
  };

  const handleExport = () => {
    const rows = [
      ['Cliente', 'Corretor', 'Imóvel', 'Valor', 'Etapa', 'Tipo', 'Origem', 'Atualizado em'],
      ...filtered.map((proposal) => [
        proposal.cliente,
        proposal.corretor,
        proposal.imovelRef,
        proposal.valor,
        STAGE_BY_ID[proposal.stageId].label,
        proposal.tipoNegocio,
        proposal.origem,
        formatDate(proposal.atualizadaEm),
      ]),
    ];

    const csv = rows.map((row) => row.map(csvEscape).join(';')).join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `propostas-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleRefresh = () => {
    void refetch();
    void loadSavedProposalDrafts();
  };

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 px-6 py-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                  <FileText className="h-4 w-4" />
                </span>
                <div>
                  <h1 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                    Propostas
                  </h1>
                  <p className="text-[13px] text-slate-500 dark:text-slate-400">
                    Pipeline comercial para acompanhar criação, envio, resposta e assinatura.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isLoading || savedLoading}
                className="h-9"
              >
                {isLoading || savedLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Atualizar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={filtered.length === 0}
                className="h-9"
              >
                <Download className="mr-2 h-4 w-4" />
                Exportar
              </Button>
              <Button type="button" size="sm" onClick={openCreateProposal} className="h-9 bg-blue-600 text-white hover:bg-blue-700">
                <Plus className="mr-2 h-4 w-4" />
                Nova proposta
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Propostas filtradas"
              value={String(metrics.total)}
              detail={`${metrics.active} em andamento`}
              icon={FileText}
              tone="blue"
            />
            <MetricCard
              label="Valor em pipeline"
              value={formatCurrency(metrics.totalValue)}
              detail="Soma das propostas visíveis"
              icon={DollarSign}
              tone="emerald"
            />
            <MetricCard
              label="Assinadas"
              value={String(metrics.signed)}
              detail={formatCurrency(metrics.signedValue)}
              icon={CheckCircle2}
              tone="amber"
            />
            <MetricCard
              label="Conversão"
              value={`${metrics.conversion}%`}
              detail="Assinadas sobre propostas visíveis"
              icon={TrendingUp}
              tone="rose"
            />
          </div>
        </div>
      </div>

      <div className="px-6 py-4">
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar cliente, corretor, imóvel ou etapa..."
                className="h-9 pl-9 text-[13px]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setFiltersOpen((value) => !value)}
                className="h-9"
              >
                <Filter className="mr-2 h-4 w-4" />
                Filtros
              </Button>

              <div className="flex overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setView('kanban')}
                  title="Kanban"
                  className={cn(
                    'flex h-9 w-10 items-center justify-center transition-colors',
                    view === 'kanban'
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                      : 'bg-white text-slate-500 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800',
                  )}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setView('lista')}
                  title="Lista"
                  className={cn(
                    'flex h-9 w-10 items-center justify-center border-l border-slate-200 transition-colors dark:border-slate-800',
                    view === 'lista'
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                      : 'bg-white text-slate-500 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800',
                  )}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {filtersOpen && (
            <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 dark:border-slate-800 sm:grid-cols-3">
              <Select value={stageFilter} onValueChange={(value) => setStageFilter(value as ProposalStageId | 'todos')}>
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue placeholder="Etapa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as etapas</SelectItem>
                  {PROPOSAL_STAGES.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>{stage.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={agentFilter} onValueChange={setAgentFilter}>
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue placeholder="Corretor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os corretores</SelectItem>
                  {agents.map((agent) => (
                    <SelectItem key={agent} value={agent}>{agent}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Venda e locação</SelectItem>
                  <SelectItem value="Venda">Venda</SelectItem>
                  <SelectItem value="Locação">Locação</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            {error}
          </div>
        )}

        {savedError && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
            {savedError}
          </div>
        )}

        {(isLoading || savedLoading) && proposals.length === 0 ? (
          <div className="flex min-h-[360px] items-center justify-center">
            <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando propostas...
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-4 flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
            <div className="max-w-sm">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <FileText className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                Nenhuma proposta encontrada
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Ajuste os filtros ou crie um rascunho para iniciar o acompanhamento.
              </p>
            </div>
          </div>
        ) : view === 'kanban' ? (
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="mt-4 overflow-x-auto pb-3">
              <div className="flex h-[calc(100vh-332px)] min-h-[520px] gap-3">
                {PROPOSAL_STAGES.map((stage) => (
                  <KanbanColumn
                    key={stage.id}
                    stage={stage}
                    proposals={filtered.filter((proposal) => proposal.stageId === stage.id)}
                    onOpen={setSelectedProposal}
                  />
                ))}
              </div>
            </div>

            <DragOverlay>
              {activeCard && (
                <div className="w-[270px] rotate-2 shadow-2xl">
                  <ProposalCardContent
                    proposal={activeCard}
                    onOpen={setSelectedProposal}
                    dragHandle={
                      <span className="mt-1 flex h-6 w-5 shrink-0 items-center justify-center text-slate-400">
                        <GripVertical className="h-4 w-4" />
                      </span>
                    }
                  />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Cliente</th>
                    <th className="px-4 py-3 font-semibold">Imóvel</th>
                    <th className="px-4 py-3 font-semibold">Corretor</th>
                    <th className="px-4 py-3 font-semibold">Valor</th>
                    <th className="px-4 py-3 font-semibold">Etapa</th>
                    <th className="px-4 py-3 font-semibold">Origem</th>
                    <th className="px-4 py-3 font-semibold">Atualização</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map((proposal) => (
                    <tr
                      key={proposal.id}
                      className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      onClick={() => setSelectedProposal(proposal)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                            style={{ backgroundColor: STAGE_BY_ID[proposal.stageId].color }}
                          >
                            {getInitials(proposal.cliente)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                              {proposal.cliente}
                            </p>
                            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                              {proposal.tipoLead}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[13px] font-medium text-slate-700 dark:text-slate-200">
                        {proposal.imovelRef}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-slate-600 dark:text-slate-300">
                        {proposal.corretor}
                      </td>
                      <td className="px-4 py-3 text-[13px] font-semibold text-slate-950 dark:text-slate-50">
                        {formatCurrency(proposal.valor)}
                      </td>
                      <td className="px-4 py-3">
                        <StagePill stageId={proposal.stageId} compact />
                      </td>
                      <td className="px-4 py-3 text-[13px] text-slate-600 dark:text-slate-300">
                        {proposal.origem}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-slate-500 dark:text-slate-400">
                        {formatDate(proposal.atualizadaEm)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!selectedProposal} onOpenChange={(open) => !open && setSelectedProposal(null)}>
        {selectedProposal && selectedDetail && (
          <DialogContent className="max-h-[92vh] max-w-6xl gap-0 overflow-hidden p-0">
            <DialogHeader className="border-b border-slate-200 px-6 py-5 dark:border-slate-800">
              <div className="flex items-start justify-between gap-4 pr-8">
                <div className="min-w-0">
                  <DialogTitle className="truncate text-xl text-slate-950 dark:text-slate-50">
                    {selectedProposal.cliente}
                  </DialogTitle>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StagePill stageId={selectedProposal.stageId} />
                    <Badge variant="outline">{selectedProposal.tipoNegocio}</Badge>
                    <Badge variant="outline">{selectedProposal.tipoLead}</Badge>
                    {selectedProposal.source === 'draft' && <Badge variant="secondary">Rascunho</Badge>}
                  </div>
                </div>
                {updatingId === selectedProposal.id && (
                  <div className="flex shrink-0 items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Salvando
                  </div>
                )}
              </div>
            </DialogHeader>

            <div className="max-h-[calc(92vh-92px)] overflow-y-auto bg-slate-50 px-6 py-5 dark:bg-slate-950">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex items-center gap-2 text-[12px] font-medium text-slate-500 dark:text-slate-400">
                        <DollarSign className="h-4 w-4" />
                        Valor
                      </div>
                      <p className="mt-2 text-lg font-semibold text-slate-950 dark:text-slate-50">
                        {formatCurrency(selectedProposal.valor)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex items-center gap-2 text-[12px] font-medium text-slate-500 dark:text-slate-400">
                        <Building2 className="h-4 w-4" />
                        Imóvel
                      </div>
                      <p className="mt-2 truncate text-lg font-semibold text-slate-950 dark:text-slate-50">
                        {selectedProposal.imovelRef}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex items-center gap-2 text-[12px] font-medium text-slate-500 dark:text-slate-400">
                        <CalendarDays className="h-4 w-4" />
                        Atualização
                      </div>
                      <p className="mt-2 text-lg font-semibold text-slate-950 dark:text-slate-50">
                        {formatDate(selectedProposal.atualizadaEm)}
                      </p>
                    </div>
                  </div>

                  <DetailSection title="Imóvel e responsáveis" icon={MapPin}>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                        <p className="text-[11px] font-semibold uppercase text-slate-400">Origem do imóvel</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {selectedDetail.propertyOrigin === 'interno' ? 'Interno' : 'Externo'}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                        <p className="text-[11px] font-semibold uppercase text-slate-400">Agente responsável</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {selectedDetail.agenteResponsavel}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60 md:col-span-2">
                        <p className="text-[11px] font-semibold uppercase text-slate-400">Endereço</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {formatAddress(selectedDetail.endereco)}
                        </p>
                        {selectedDetail.endereco?.cep && (
                          <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                            CEP {selectedDetail.endereco.cep}
                            {selectedDetail.endereco.complemento ? ` | ${selectedDetail.endereco.complemento}` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  </DetailSection>

                  <DetailSection title="Linha do tempo" icon={History}>
                    <div className="space-y-3">
                      {getFlowSteps(selectedProposal, selectedDetail).map((item, index, steps) => (
                        <div key={item.label} className="relative flex gap-3">
                          {index < steps.length - 1 && (
                            <span className="absolute left-[15px] top-8 h-[calc(100%+8px)] w-px bg-slate-200 dark:bg-slate-800" />
                          )}
                          <span
                            className={cn(
                              'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white dark:ring-slate-900',
                              item.done
                                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
                            )}
                          >
                            {item.done ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
                          </span>
                          <div className="min-w-0 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.label}</p>
                            <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">{item.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {selectedDetail.historico.length > 0 && (
                      <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
                        <p className="mb-3 text-[12px] font-semibold uppercase text-slate-400">Histórico</p>
                        <div className="space-y-2">
                          {selectedDetail.historico.map((item) => (
                            <div key={item.id} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                              <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">{item.label}</p>
                              <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">{item.detail}</p>
                              <p className="mt-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">{formatDateTime(item.date)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </DetailSection>

                  <DetailSection
                    title="Proponentes (Compradores)"
                    icon={Users}
                    action={
                      <Button type="button" variant="outline" size="sm" onClick={() => addParty(selectedProposal, 'compradores')}>
                        <Plus className="mr-2 h-3.5 w-3.5" />
                        Adicionar proponente
                      </Button>
                    }
                  >
                    <div className="space-y-3">
                      {selectedDetail.compradores.length === 0 && (
                        <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                          Ainda não há proponentes cadastrados. Crie-os, clicando no ícone acima.
                        </div>
                      )}
                      {selectedDetail.compradores.map((party, index) => (
                        <PartyEditor
                          key={party.id}
                          party={party}
                          label={`Comprador ${index + 1}`}
                          participantType="proponente"
                          isCollapsed={collapsedPartyIds.has(party.id)}
                          onToggleCollapsed={() => togglePartyCollapsed(party.id)}
                          onChange={(updates) => updateParty(selectedProposal, 'compradores', party.id, updates)}
                          onRemove={() => removeParty(selectedProposal, 'compradores', party.id)}
                        />
                      ))}
                    </div>
                  </DetailSection>

                  <DetailSection
                    title="Proprietários (Vendedores)"
                    icon={Building2}
                    action={
                      <Button type="button" variant="outline" size="sm" onClick={() => addParty(selectedProposal, 'vendedores')}>
                        <Plus className="mr-2 h-3.5 w-3.5" />
                        Adicionar proprietário (vendedor)
                      </Button>
                    }
                  >
                    <div className="space-y-3">
                      {selectedDetail.vendedores.length === 0 && (
                        <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                          Ainda não há proprietários cadastrados. Crie-os, clicando no ícone acima.
                        </div>
                      )}
                      {selectedDetail.vendedores.map((party, index) => (
                        <PartyEditor
                          key={party.id}
                          party={party}
                          label={`Proprietário ${index + 1}`}
                          participantType="proprietario"
                          isCollapsed={collapsedPartyIds.has(party.id)}
                          onToggleCollapsed={() => togglePartyCollapsed(party.id)}
                          onChange={(updates) => updateParty(selectedProposal, 'vendedores', party.id, updates)}
                          onRemove={() => removeParty(selectedProposal, 'vendedores', party.id)}
                        />
                      ))}
                    </div>
                  </DetailSection>

                  <DetailSection title="Forma de pagamento" icon={CreditCard}>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="grid gap-1.5">
                        <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Forma de pagamento</label>
                        <Input
                          value={selectedDetail.pagamento.formaPagamento}
                          onChange={(event) => updatePayment(selectedProposal, { formaPagamento: event.target.value })}
                          placeholder="À vista, financiamento, permuta..."
                          className="h-9 text-[13px]"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Valor</label>
                        <Input
                          value={selectedDetail.pagamento.valor}
                          onChange={(event) => updatePayment(selectedProposal, { valor: event.target.value })}
                          placeholder="R$ 0,00"
                          className="h-9 text-[13px]"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Financiamento</label>
                        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => updatePayment(selectedProposal, { comFinanciamento: true })}
                            className={cn(
                              'h-9 text-[12px] font-semibold transition-colors',
                              selectedDetail.pagamento.comFinanciamento
                                ? 'bg-blue-600 text-white'
                                : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
                            )}
                          >
                            Com financiamento
                          </button>
                          <button
                            type="button"
                            onClick={() => updatePayment(selectedProposal, { comFinanciamento: false })}
                            className={cn(
                              'h-9 border-l border-slate-200 text-[12px] font-semibold transition-colors dark:border-slate-800',
                              !selectedDetail.pagamento.comFinanciamento
                                ? 'bg-blue-600 text-white'
                                : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
                            )}
                          >
                            Sem financiamento
                          </button>
                        </div>
                      </div>
                      <div className="grid gap-1.5">
                        <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Financiamento aprox.</label>
                        <Input
                          value={selectedDetail.pagamento.financiamentoAproximado}
                          onChange={(event) => updatePayment(selectedProposal, { financiamentoAproximado: event.target.value })}
                          placeholder="R$ 0,00"
                          className="h-9 text-[13px]"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Sinal (arras)</label>
                        <Input
                          value={selectedDetail.pagamento.sinalArras}
                          onChange={(event) => updatePayment(selectedProposal, { sinalArras: event.target.value })}
                          placeholder="R$ 0,00"
                          className="h-9 text-[13px]"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Assessoria bancária</label>
                        <Select
                          value={selectedDetail.pagamento.assessoriaBancaria}
                          onValueChange={(value) => updatePayment(selectedProposal, { assessoriaBancaria: value as CreditSupport })}
                        >
                          <SelectTrigger className="h-9 text-[13px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="aprovado">Já tenho aprovação de crédito e assessoria financeira</SelectItem>
                            <SelectItem value="suporte">Gostaria de mais suportes quanto ao meu crédito bancário</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </DetailSection>

                  <DetailSection title="Condições específicas" icon={FileText}>
                    <textarea
                      value={selectedDetail.pagamento.condicoesEspecificas}
                      onChange={(event) => updatePayment(selectedProposal, { condicoesEspecificas: event.target.value })}
                      placeholder="Detalhes da negociação, prazos, inclusões, mobília, taxas, comissão, contraproposta..."
                      className="min-h-[120px] w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:focus:border-blue-700 dark:focus:ring-blue-950/40"
                    />
                  </DetailSection>

                  <DetailSection title="Condições gerais" icon={ShieldCheck}>
                    <ol className="space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                      {GENERAL_CONDITIONS.map((condition, index) => (
                        <li key={condition} className="flex gap-3">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {index + 1}
                          </span>
                          <span>{condition}</span>
                        </li>
                      ))}
                    </ol>

                    <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Contra proposta</p>
                      <div className="mt-3 grid gap-2 text-sm text-slate-500 dark:text-slate-400 sm:grid-cols-2">
                        <span>Valor: _______________________________</span>
                        <span>Comissão: ____________________________</span>
                        <span>Proprietário(a): ______________________</span>
                        <span>Proprietário(a): ______________________</span>
                      </div>
                    </div>
                  </DetailSection>
                </div>

                <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
                  <DetailSection title="Resumo da assinatura" icon={Mail}>
                    <div className="space-y-3">
                      {[...selectedDetail.compradores, ...selectedDetail.vendedores].map((party) => (
                        <div key={party.id} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                                {party.nomeCompleto || 'Participante sem nome'}
                              </p>
                              <p className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                                {party.assinaturaPor === 'email' ? <Mail className="h-3 w-3" /> : <Phone className="h-3 w-3" />}
                                {signatureChannelLabel[party.assinaturaPor]}
                              </p>
                            </div>
                            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', signatureStatusClass[party.statusAssinatura])}>
                              {signatureStatusLabel[party.statusAssinatura]}
                            </span>
                          </div>
                          <p className="mt-2 truncate text-[11px] text-slate-500 dark:text-slate-400">
                            Assinado por: {party.assinadoPor || 'pendente'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </DetailSection>

                  <DetailSection title="Mover etapa" icon={TrendingUp}>
                    <div className="space-y-2">
                      {PROPOSAL_STAGES.map((stage) => {
                        const Icon = stage.icon;
                        const active = selectedProposal.stageId === stage.id;
                        return (
                          <button
                            key={stage.id}
                            type="button"
                            onClick={() => void changeProposalStage(selectedProposal.id, stage.id)}
                            disabled={updatingId === selectedProposal.id}
                            className={cn(
                              'flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-60',
                              active
                                ? 'border-transparent text-white'
                                : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800',
                            )}
                            style={active ? { backgroundColor: stage.color } : undefined}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <Icon className="h-4 w-4 shrink-0" />
                              <span className="truncate text-sm font-semibold">{stage.label}</span>
                            </span>
                            <span className={cn('text-xs font-semibold', active ? 'text-white/80' : 'text-slate-400')}>
                              {stage.probability}%
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </DetailSection>

                  <DetailSection title="Revisão e envio" icon={WalletCards}>
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={() => {
                          updateProposalDetail(selectedProposal, (current) => ({
                            ...current,
                            parceirosExternos: !current.parceirosExternos,
                          }));
                        }}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors',
                          selectedDetail.parceirosExternos
                            ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
                        )}
                      >
                        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded border', selectedDetail.parceirosExternos ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300')}>
                          {selectedDetail.parceirosExternos && <CheckCircle2 className="h-3.5 w-3.5" />}
                        </span>
                        <span className="text-sm font-semibold">Envolver parceiros externos?</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          updateProposalDetail(selectedProposal, (current) => ({
                            ...current,
                            revisado: !current.revisado,
                          }));
                          if (!selectedDetail.revisado) {
                            appendHistory(selectedProposal, 'Dados revisados', 'Usuário confirmou a revisão dos dados da proposta.');
                          }
                        }}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors',
                          selectedDetail.revisado
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
                        )}
                      >
                        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded border', selectedDetail.revisado ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300')}>
                          {selectedDetail.revisado && <CheckCircle2 className="h-3.5 w-3.5" />}
                        </span>
                        <span className="text-sm font-semibold">Clique para confirmar que revisou os dados da proposta</span>
                      </button>

                      <Button
                        type="button"
                        className="w-full bg-blue-600 text-white hover:bg-blue-700"
                        disabled={!canSendToProponent}
                        onClick={() => {
                          updateProposalDetail(selectedProposal, (current) => ({
                            ...current,
                            enviadoProponente: true,
                          }));
                          appendHistory(selectedProposal, 'Enviada proponentes', 'Proposta marcada como enviada para aceite dos compradores.');
                          toast({
                            title: 'Proposta enviada para proponente',
                            description: 'O envio foi registrado no histórico da proposta.',
                          });
                        }}
                      >
                        {selectedDetail.enviadoProponente ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />}
                        {selectedDetail.enviadoProponente ? 'Enviada para proponente' : 'Enviar para proponente'}
                      </Button>

                      <Button
                        type="button"
                        className="w-full bg-blue-600 text-white hover:bg-blue-700"
                        disabled={!canSendToOwner}
                        onClick={() => {
                          updateProposalDetail(selectedProposal, (current) => ({
                            ...current,
                            enviadoProprietario: true,
                          }));
                          appendHistory(selectedProposal, 'Enviada proprietários', 'Proposta marcada como enviada para aceite do vendedor.');
                          toast({
                            title: 'Proposta enviada para proprietário',
                            description: 'O envio foi registrado no histórico da proposta.',
                          });
                        }}
                      >
                        {selectedDetail.enviadoProprietario ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />}
                        {selectedDetail.enviadoProprietario ? 'Enviado para proprietário' : 'Enviar para proprietário'}
                      </Button>

                      {!selectedDetail.revisado && (
                        <p className="text-[12px] text-slate-500 dark:text-slate-400">
                          Confirme a revisão antes de liberar o envio.
                        </p>
                      )}
                      {selectedDetail.revisado && selectedDetail.compradores.length === 0 && (
                        <p className="text-[12px] text-rose-600 dark:text-rose-300">
                          Adicione ao menos um proponente comprador para enviar ao proponente.
                        </p>
                      )}
                      {selectedDetail.revisado && buyerValidationIssues.length > 0 && (
                        <p className="text-[12px] text-rose-600 dark:text-rose-300">
                          Complete os dados do proponente: {buyerValidationIssues.join('; ')}.
                        </p>
                      )}
                      {selectedDetail.revisado && selectedDetail.vendedores.length === 0 && (
                        <p className="text-[12px] text-rose-600 dark:text-rose-300">
                          Adicione ao menos um proprietário vendedor para enviar ao proprietário.
                        </p>
                      )}
                      {selectedDetail.revisado && ownerValidationIssues.length > 0 && (
                        <p className="text-[12px] text-rose-600 dark:text-rose-300">
                          Complete os dados do proprietário: {ownerValidationIssues.join('; ')}.
                        </p>
                      )}
                    </div>
                  </DetailSection>
                </aside>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[92vh] max-w-5xl gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-slate-200 px-6 py-5 dark:border-slate-800">
            <DialogTitle className="text-xl text-slate-950 dark:text-slate-50">Nova proposta</DialogTitle>
          </DialogHeader>

          <div className="max-h-[calc(92vh-148px)] overflow-y-auto bg-slate-50 px-6 py-5 dark:bg-slate-950">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="space-y-4">
                <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Proposta em imóvel da carteira, ou de fora?
                    </h3>
                  </div>

                  <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                    {(['interno', 'externo'] as const).map((origin) => (
                      <button
                        key={origin}
                        type="button"
                        onClick={() => setDraftForm((previous) => ({ ...previous, propertyOrigin: origin }))}
                        className={cn(
                          'h-10 text-sm font-semibold transition-colors',
                          origin === 'externo' && 'border-l border-slate-200 dark:border-slate-800',
                          draftForm.propertyOrigin === origin
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
                        )}
                      >
                        {origin === 'interno' ? 'Interno' : 'Externo'}
                      </button>
                    ))}
                  </div>

                  {draftForm.propertyOrigin === 'interno' && (
                    <div className="mt-4 grid gap-2">
                      <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Imóvel da carteira</label>
                      <Input
                        value={draftForm.imovelRef}
                        onChange={(event) => setDraftForm((previous) => ({ ...previous, imovelRef: event.target.value }))}
                        placeholder="Código, endereço ou referência do imóvel"
                        className="h-9 text-[13px]"
                      />
                    </div>
                  )}
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <MapPin className="h-4 w-4" />
                    </span>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Endereço</h3>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-6">
                    <div className="grid gap-1.5 sm:col-span-2">
                      <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">CEP</label>
                      <Input value={draftForm.cep} onChange={(event) => setDraftForm((previous) => ({ ...previous, cep: event.target.value }))} placeholder="00000-000" className="h-9 text-[13px]" />
                    </div>
                    <div className="grid gap-1.5 sm:col-span-3">
                      <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Logradouro</label>
                      <Input value={draftForm.logradouro} onChange={(event) => setDraftForm((previous) => ({ ...previous, logradouro: event.target.value }))} placeholder="Rua, avenida..." className="h-9 text-[13px]" />
                    </div>
                    <div className="grid gap-1.5">
                      <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Número</label>
                      <Input value={draftForm.numero} onChange={(event) => setDraftForm((previous) => ({ ...previous, numero: event.target.value }))} placeholder="Nº" className="h-9 text-[13px]" />
                    </div>
                    <div className="grid gap-1.5 sm:col-span-2">
                      <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Bairro</label>
                      <Input value={draftForm.bairro} onChange={(event) => setDraftForm((previous) => ({ ...previous, bairro: event.target.value }))} placeholder="Bairro" className="h-9 text-[13px]" />
                    </div>
                    <div className="grid gap-1.5 sm:col-span-2">
                      <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Complemento</label>
                      <Input value={draftForm.complemento} onChange={(event) => setDraftForm((previous) => ({ ...previous, complemento: event.target.value }))} placeholder="Apto, bloco, casa..." className="h-9 text-[13px]" />
                    </div>
                    <div className="grid gap-1.5 sm:col-span-1">
                      <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Cidade</label>
                      <Input value={draftForm.cidade} onChange={(event) => setDraftForm((previous) => ({ ...previous, cidade: event.target.value }))} placeholder="Cidade" className="h-9 text-[13px]" />
                    </div>
                    <div className="grid gap-1.5">
                      <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">UF</label>
                      <Input value={draftForm.uf} onChange={(event) => setDraftForm((previous) => ({ ...previous, uf: event.target.value.toUpperCase().slice(0, 2) }))} placeholder="SP" className="h-9 text-[13px]" />
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Agente responsável</label>
                      <Input
                        value={draftForm.agenteResponsavel}
                        onChange={(event) => setDraftForm((previous) => ({ ...previous, agenteResponsavel: event.target.value }))}
                        placeholder="Nome Corretor"
                        className="h-9 text-[13px]"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Tipo</label>
                      <Select value={draftForm.tipoNegocio} onValueChange={(value) => setDraftForm((previous) => ({ ...previous, tipoNegocio: value }))}>
                        <SelectTrigger className="h-9 text-[13px]">
                          <SelectValue placeholder="Tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Venda">Venda</SelectItem>
                          <SelectItem value="Locação">Locação</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <Users className="h-4 w-4" />
                      </span>
                      <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">Proponentes (Compradores)</h3>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => addDraftParty('compradores')}>
                      <Plus className="mr-2 h-3.5 w-3.5" />
                      Adicionar proponente
                    </Button>
                  </div>
                  <div className="mt-4 space-y-3">
                    {draftForm.compradores.length === 0 && (
                      <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        Ainda não há proponentes cadastrados. Crie-os, clicando no ícone acima.
                      </div>
                    )}
                    {draftForm.compradores.map((party, index) => (
                      <PartyEditor
                        key={party.id}
                        party={party}
                        label={`Comprador ${index + 1}`}
                        participantType="proponente"
                        isCollapsed={collapsedPartyIds.has(party.id)}
                        onToggleCollapsed={() => togglePartyCollapsed(party.id)}
                        onChange={(updates) => updateDraftParty('compradores', party.id, updates)}
                        onRemove={() => removeDraftParty('compradores', party.id)}
                      />
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <Building2 className="h-4 w-4" />
                      </span>
                      <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">Proprietários (Vendedores)</h3>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => addDraftParty('vendedores')}>
                      <Plus className="mr-2 h-3.5 w-3.5" />
                      Adicionar proprietário
                    </Button>
                  </div>
                  <div className="mt-4 space-y-3">
                    {draftForm.vendedores.length === 0 && (
                      <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        Ainda não há proprietários cadastrados. Crie-os, clicando no ícone acima.
                      </div>
                    )}
                    {draftForm.vendedores.map((party, index) => (
                      <PartyEditor
                        key={party.id}
                        party={party}
                        label={`Proprietário ${index + 1}`}
                        participantType="proprietario"
                        isCollapsed={collapsedPartyIds.has(party.id)}
                        onToggleCollapsed={() => togglePartyCollapsed(party.id)}
                        onChange={(updates) => updateDraftParty('vendedores', party.id, updates)}
                        onRemove={() => removeDraftParty('vendedores', party.id)}
                      />
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <Landmark className="h-4 w-4" />
                    </span>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Forma de Pagamento</h3>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="grid gap-1.5">
                      <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Valor</label>
                      <Input value={draftForm.valor} onChange={(event) => setDraftForm((previous) => ({ ...previous, valor: event.target.value }))} placeholder="R$ 0,00" className="h-9 text-[13px]" />
                    </div>
                    <div className="grid gap-1.5">
                      <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Financiamento</label>
                      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => setDraftForm((previous) => ({ ...previous, comFinanciamento: true }))}
                          className={cn('h-9 text-[12px] font-semibold transition-colors', draftForm.comFinanciamento ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800')}
                        >
                          Com Financiamento
                        </button>
                        <button
                          type="button"
                          onClick={() => setDraftForm((previous) => ({ ...previous, comFinanciamento: false, financiamentoAproximado: '' }))}
                          className={cn('h-9 border-l border-slate-200 text-[12px] font-semibold transition-colors dark:border-slate-800', !draftForm.comFinanciamento ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800')}
                        >
                          Sem Financiamento
                        </button>
                      </div>
                    </div>
                    <div className="grid gap-1.5">
                      <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Financiamento (aprox.)</label>
                      <Input value={draftForm.financiamentoAproximado} onChange={(event) => setDraftForm((previous) => ({ ...previous, financiamentoAproximado: event.target.value }))} placeholder="R$ 0,00" disabled={!draftForm.comFinanciamento} className="h-9 text-[13px]" />
                    </div>
                    <div className="grid gap-1.5">
                      <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Sinal (arras)</label>
                      <Input value={draftForm.sinalArras} onChange={(event) => setDraftForm((previous) => ({ ...previous, sinalArras: event.target.value }))} placeholder="R$ 0,00" className="h-9 text-[13px]" />
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Condições Específicas (detalhes)</h3>
                    <span className="text-[12px] text-slate-400">{draftForm.condicoesEspecificas.length}/2000 caracteres</span>
                  </div>
                  <textarea
                    value={draftForm.condicoesEspecificas}
                    maxLength={2000}
                    onChange={(event) => setDraftForm((previous) => ({ ...previous, condicoesEspecificas: event.target.value }))}
                    placeholder="Detalhes da negociação, prazos, condições e observações."
                    className="mt-4 min-h-[132px] w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:focus:border-blue-700 dark:focus:ring-blue-950/40"
                  />
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <ShieldCheck className="h-4 w-4" />
                    </span>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Condições Gerais</h3>
                  </div>
                  <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {GENERAL_CONDITIONS.map((condition, index) => (
                      <li key={condition} className="flex gap-3">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {index + 1}
                        </span>
                        <span>{condition}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>

              <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
                <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <History className="h-4 w-4" />
                    </span>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Linha do tempo</h3>
                  </div>
                  <div className="mt-4 space-y-3">
                    {([
                      ['Rascunho', formatDateTime(draftStartedAt), true],
                      ['Enviada proponentes', 'Aguardando...', false],
                      ['Assinada proponentes', 'Aguardando...', false],
                      ['Enviada proprietários', 'Aguardando...', false],
                      ['Assinado proprietários', 'Aguardando...', false],
                      ['Virou Negócio', 'Aguardando...', false],
                    ] as Array<[string, string, boolean]>).map(([label, detail, done], index, steps) => (
                      <div key={String(label)} className="relative flex gap-3">
                        {index < steps.length - 1 && (
                          <span className="absolute left-[15px] top-8 h-[calc(100%+8px)] w-px bg-slate-200 dark:bg-slate-800" />
                        )}
                        <span className={cn('relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white dark:ring-slate-900', done ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500')}>
                          {done ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</p>
                          <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">{detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => setDraftForm((previous) => ({ ...previous, parceirosExternos: !previous.parceirosExternos }))}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors',
                        draftForm.parceirosExternos
                          ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
                      )}
                    >
                      <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded border', draftForm.parceirosExternos ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300')}>
                        {draftForm.parceirosExternos && <CheckCircle2 className="h-3.5 w-3.5" />}
                      </span>
                      <span className="text-sm font-semibold">Envolver parceiros externos?</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDraftForm((previous) => ({ ...previous, revisado: !previous.revisado }))}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors',
                        draftForm.revisado
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
                      )}
                    >
                      <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded border', draftForm.revisado ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300')}>
                        {draftForm.revisado && <CheckCircle2 className="h-3.5 w-3.5" />}
                      </span>
                      <span className="text-sm font-semibold">Clique para confirmar que revisou os dados da proposta</span>
                    </button>

                    <Button type="button" variant="outline" className="w-full" disabled={savingDraft} onClick={() => void handleCreateDraft(false)}>
                      {savingDraft && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Criar rascunho
                    </Button>
                    <Button type="button" className="w-full bg-blue-600 text-white hover:bg-blue-700" disabled={savingDraft || !canSendDraftToProponent} onClick={() => void handleCreateDraft(true)}>
                      {savingDraft ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      Enviar para proponente
                    </Button>
                    {!draftForm.revisado && (
                      <p className="text-[12px] text-slate-500 dark:text-slate-400">Confirme a revisão antes de liberar o envio.</p>
                    )}
                    {draftForm.revisado && draftForm.compradores.length === 0 && (
                      <p className="text-[12px] text-rose-600 dark:text-rose-300">
                        Adicione ao menos um proponente comprador para enviar ao proponente.
                      </p>
                    )}
                    {draftForm.revisado && draftBuyerValidationIssues.length > 0 && (
                      <p className="text-[12px] text-rose-600 dark:text-rose-300">
                        Complete os dados do proponente: {draftBuyerValidationIssues.join('; ')}.
                      </p>
                    )}
                  </div>
                </section>
              </aside>
            </div>
          </div>

          <DialogFooter className="border-t border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

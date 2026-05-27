import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Copy,
  CreditCard,
  DollarSign,
  Download,
  FileSignature,
  FileText,
  FileUp,
  Filter,
  GripVertical,
  History,
  Landmark,
  LayoutGrid,
  Link,
  List,
  Loader2,
  MapPin,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  TrendingUp,
  UserPlus,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
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
  type SavedProposalTransactionForm,
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

type TransactionFormData = SavedProposalTransactionForm;

interface ProposalDetailState {
  compradores: ProposalParty[];
  vendedores: ProposalParty[];
  pagamento: PaymentDetails;
  transactionForm: TransactionFormData;
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

const DEAL_NAV_ITEMS = [
  { id: 'negocios', label: 'Negócios', icon: BriefcaseBusiness },
  { id: 'formulario', label: 'Formulário', icon: ClipboardList },
  { id: 'documentos', label: 'Documentos', icon: FileText },
  { id: 'certidoes', label: 'Certidões', icon: ShieldCheck },
  { id: 'participantes', label: 'Participantes', icon: Users },
  { id: 'historico', label: 'Histórico', icon: History },
  { id: 'ccv', label: 'CCV Conjurer', icon: FileSignature },
  { id: 'escriturar', label: 'Escriturar', icon: Landmark },
  { id: 'convidar', label: 'Convidar', icon: UserPlus },
  { id: 'agenda', label: 'Agenda', icon: CalendarPlus },
  { id: 'solicitacao', label: 'Solicitação', icon: ClipboardCheck },
  { id: 'assinatura', label: 'Assinatura eletrônica', icon: FileUp },
] as const;

type DealTabId = (typeof DEAL_NAV_ITEMS)[number]['id'];

interface DealWorkflowItem {
  id: string;
  label: string;
  owner: string;
  stageId: ProposalStageId;
  targetTab: DealTabId;
}

interface DealWorkflowGroup {
  id: string;
  title: string;
  status: string;
  stageId: ProposalStageId;
  items: readonly DealWorkflowItem[];
}

const DEAL_WORKFLOW_GROUPS_FINANCIADO = [
  {
    id: 'feitura-contrato',
    title: 'Feitura de Contrato',
    status: 'Contrato',
    stageId: 'feitura-contrato',
    items: [
      { id: 'proposta-anexada', label: 'Anexar proposta no iList', owner: 'Corretor', stageId: 'feitura-contrato', targetTab: 'documentos' },
      { id: 'comissao-cadastrada', label: 'Completar valor total de comissão e nome dos corretores', owner: 'Financeiro', stageId: 'feitura-contrato', targetTab: 'formulario' },
      { id: 'docs-vendedor', label: 'Documentos do vendedor', owner: 'Vendedor', stageId: 'feitura-contrato', targetTab: 'participantes' },
      { id: 'docs-comprador', label: 'Documentos dos compradores', owner: 'Comprador', stageId: 'feitura-contrato', targetTab: 'participantes' },
      { id: 'comissoes-erick', label: 'Comissões', owner: 'Financeiro', stageId: 'feitura-contrato', targetTab: 'formulario' },
      { id: 'baixa-portais', label: 'Baixa do imóvel em veículos promocionais (site e portais)', owner: 'Operações', stageId: 'feitura-contrato', targetTab: 'documentos' },
      { id: 'certidoes-atualizadas', label: 'JURÍDICO - Atualizações de certidões reais e pessoais reipersecutórias', owner: 'Jurídico', stageId: 'feitura-contrato', targetTab: 'certidoes' },
      { id: 'contrato-assinado-upload', label: 'Upload do contrato assinado via Clicksign ou pessoalmente', owner: 'Jurídico', stageId: 'feitura-contrato', targetTab: 'assinatura' },
    ],
  },
  {
    id: 'em-analise-andamento',
    title: 'Em análise / Andamento',
    status: 'Leitura',
    stageId: 'proposta-assinada',
    items: [
      { id: 'cartorio-documentacao', label: 'Enviar ao CARTÓRIO documentação para feitura da ESCRITURA', owner: 'Jurídico', stageId: 'proposta-assinada', targetTab: 'escriturar' },
      { id: 'boleto-quitacao', label: 'CORRETOR - Informar ao COMPRADOR data da quitação do boleto', owner: 'Corretor', stageId: 'proposta-assinada', targetTab: 'agenda' },
      { id: 'itbi-custas', label: 'CORRETOR - Informar ao COMPRADOR valores de ITBI e custas cartorárias', owner: 'Corretor', stageId: 'proposta-assinada', targetTab: 'certidoes' },
    ],
  },
  {
    id: 'recebido',
    title: 'Recebido',
    status: 'Em andamento',
    stageId: 'proposta-assinada',
    items: [
      { id: 'titularidade-transferencias', label: 'Transferências de titularidades - COND, CPFL, CONGAS (consultar), DAE', owner: 'Pós-venda', stageId: 'proposta-assinada', targetTab: 'solicitacao' },
      { id: 'iptu-matricula-upload', label: 'Upload da certidão de IPTU, matrícula e mudança com data', owner: 'Pós-venda', stageId: 'proposta-assinada', targetTab: 'documentos' },
      { id: 'agua-orientacao', label: 'PÓS-VENDAS GRV: Instruir Proprietário como alterar conta de água', owner: 'Pós-venda', stageId: 'proposta-assinada', targetTab: 'solicitacao' },
      { id: 'entrega-chaves', label: 'CORRETOR - Agendar data da entrega das chaves aos COMPRADORES', owner: 'Corretor', stageId: 'proposta-assinada', targetTab: 'agenda' },
      { id: 'pagamento-comissoes', label: 'Pagamento de comissões e emissões de NFs, recibos e RPAs', owner: 'Financeiro', stageId: 'proposta-assinada', targetTab: 'formulario' },
    ],
  },
] as const satisfies readonly DealWorkflowGroup[];

const DEAL_WORKFLOW_GROUPS_VISTA = [
  {
    id: 'feitura-contrato',
    title: 'Feitura de Contrato',
    status: 'Contrato',
    stageId: 'feitura-contrato',
    items: [
      { id: 'proposta-anexada', label: 'Anexar proposta', owner: 'Corretor', stageId: 'feitura-contrato', targetTab: 'documentos' },
      { id: 'kenlo-vendido', label: 'Colocar como VENDIDO no Kenlo', owner: 'Corretor', stageId: 'feitura-contrato', targetTab: 'documentos' },
      { id: 'docs-comprador', label: 'Documentos dos compradores', owner: 'Comprador', stageId: 'feitura-contrato', targetTab: 'participantes' },
      { id: 'docs-vendedor', label: 'Documentos dos vendedores', owner: 'Vendedor', stageId: 'feitura-contrato', targetTab: 'participantes' },
      { id: 'comissao-gabi', label: 'Cálculo de comissões', owner: 'Financeiro', stageId: 'feitura-contrato', targetTab: 'formulario' },
      { id: 'contrato-assinado-upload', label: 'Upload do contrato assinado via Clicksign ou pessoalmente', owner: 'Jurídico', stageId: 'feitura-contrato', targetTab: 'assinatura' },
    ],
  },
  {
    id: 'em-analise',
    title: 'Em análise',
    status: 'Leitura',
    stageId: 'proposta-assinada',
    items: [
      { id: 'quitacao-totalidade', label: 'CORRETOR - VERIFICAR: quitação da totalidade com recursos próprios', owner: 'Corretor', stageId: 'proposta-assinada', targetTab: 'formulario' },
      { id: 'venda-parada-juridico', label: 'Venda parada - JURÍDICO', owner: 'Jurídico', stageId: 'proposta-assinada', targetTab: 'certidoes' },
    ],
  },
  {
    id: 'recebido',
    title: 'Recebido',
    status: 'Em andamento',
    stageId: 'proposta-assinada',
    items: [
      { id: 'titularidade-transferencias', label: 'Transferências de titularidades: COND, CPFL, CONGAS, DAE', owner: 'Pós-venda', stageId: 'proposta-assinada', targetTab: 'solicitacao' },
      { id: 'matricula-iptu', label: 'Anexar matrícula e trocar IPTU', owner: 'Pós-venda', stageId: 'proposta-assinada', targetTab: 'documentos' },
      { id: 'entrega-chaves', label: 'Entrega de chaves', owner: 'Corretor', stageId: 'proposta-assinada', targetTab: 'agenda' },
    ],
  },
] as const satisfies readonly DealWorkflowGroup[];

const getDealWorkflowGroups = (comFinanciamento: boolean): readonly DealWorkflowGroup[] =>
  comFinanciamento ? DEAL_WORKFLOW_GROUPS_FINANCIADO : DEAL_WORKFLOW_GROUPS_VISTA;

const DOCUMENT_CHECKLIST = [
  'Proposta anexada',
  'Contrato assinado via Clicksign ou presencialmente',
  'Documentos do vendedor',
  'Documentos dos compradores',
  'Comissões conferidas',
  'Baixa do imóvel em site e portais',
] as const;

const CERTIFICATE_CHECKLIST = [
  'Matrícula atualizada',
  'Certidão de IPTU',
  'Certidões reais e pessoais reipersecutórias',
  'Certidões de protesto dos vendedores',
  'Guia de ITBI',
  'Custas cartorárias calculadas',
] as const;

const SERVICE_REQUEST_OPTIONS = [
  { title: 'Aditamento/Alteração de minuta', deadline: 'Sem prazo mínimo informado', price: 'Solicitação gratuita' },
  { title: 'Agendamento da escrituração pública, digitalmente', deadline: 'Mínimo de 4 dias úteis de antecedência', price: 'Solicitação gratuita' },
  { title: 'Agendar/encaminhar procuração pública (física) outorgando plenos poderes', deadline: 'Mínimo de 4 dias úteis de antecedência', price: 'Solicitação gratuita' },
  { title: 'Agendar/encaminhar procuração pública outorgando plenos poderes, digitalmente', deadline: 'Mínimo de 4 dias úteis de antecedência', price: 'Solicitação gratuita' },
  { title: 'Apurar e gerar guia de ITBI', deadline: 'Até 2 dias úteis', price: 'Solicitação gratuita' },
  { title: 'Calcular custos e emolumentos da transação, para comprador', deadline: 'Até 1 dia útil', price: 'Solicitação gratuita' },
  { title: 'Diligência de motoboy para entrega/busca de documentos, e outros', deadline: 'Até 1 dia útil', price: 'Solicitação gratuita' },
  { title: 'Elaborar/gerar Termo de Imissão de Comprador à posse do Imóvel', deadline: 'Até 2 dias úteis', price: 'Solicitação gratuita' },
  { title: 'Enviar CCV para assinatura (eletrônica) das partes', deadline: '1 dia útil', price: 'Solicitação gratuita' },
  { title: 'Mídias Sociais: responder formalmente a questionamento/reclamação', deadline: 'Até 3 dias úteis', price: 'Solicitação gratuita' },
  { title: 'Modificar a minuta do Contrato de Compromisso', deadline: 'Em até 1 dia útil', price: 'Solicitação gratuita' },
  { title: 'Modificar a minuta do Termo de Autorização de Benfeitorias', deadline: 'Em até 2 dias úteis', price: 'Solicitação gratuita' },
  { title: 'Modificar a minuta do Termo de Imissão na Posse', deadline: 'Em até 2 dias úteis', price: 'Solicitação gratuita' },
  { title: 'Preparar mini-recepção/coquetel para clientes (com lembrancinhas)', deadline: 'Até 2 dias úteis de antecedência', price: 'Solicitação paga (R$100,00)' },
  { title: 'Preparar mini-recepção/coquetel para clientes (sem lembrancinhas)', deadline: 'Até 2 dias úteis de antecedência', price: 'Solicitação paga (R$50,00)' },
  { title: 'Puxar/pegar certidão atualizada de matrícula', deadline: 'Até 1 dia útil', price: 'Solicitação gratuita' },
  { title: 'Puxar/pegar Certidões de Protesto dos vendedores', deadline: 'Até 3 dias úteis', price: 'Solicitação gratuita' },
  { title: 'Simular custo do GCAP para Vendedor', deadline: 'Até 3 dias úteis', price: 'Solicitação gratuita' },
] as const;

const TRANSACTION_FORM_NAV = [
  'Negócio',
  'Documentos',
  'Certidões',
  'Participantes',
  'Histórico',
] as const;

const TRANSACTION_FORM_SECTIONS = [
  'Imóvel & Valores',
  'Vendedores',
  'Compradores',
  'Negociações',
  'Comissões',
  'Parceiros',
] as const;

type TransactionFormSection = (typeof TRANSACTION_FORM_SECTIONS)[number];

const PROPERTY_VALUE_SECTIONS = [
  'Código',
  'Endereço',
  'Matrícula',
  'Propriedade atual',
  'Valor e Natureza',
  'Pagamento',
  'Cartório de Notas',
] as const;

const PROPERTY_STATUS_OPTIONS = [
  'Financiamento consta à matrícula (alienação fiduciária registrada), mas já foi quitado',
  'Imóvel atualmente financiado (com saldo devedor)',
  'Imóvel quitado e registrado (sem ônus à matrícula)',
  'Outra situação',
] as const;

const PRICE_COMPOSITION_ITEMS = [
  '1. Sinal e princípio de pagamento',
  '2. Parcela(s) anteriormente à escritura',
  '3. Parcela concomitante à escritura',
  '4. Parcela(s) posteriormente à escritura',
  '5. Recursos provenientes do FGTS',
  '6. Imóvel como parte de pagamento',
  '7. Veículo como parte de pagamento',
  '8. Cessão de cota não contemplada de consórcio',
  '9. Outras formas',
] as const;

const COMMISSION_PAYERS = ['Vendedor', 'Comprador', 'Outra composição'] as const;
const COMMISSION_MOMENTS = ['Sinal', 'CCV', 'Escrituração', 'Crédito AF', 'Outros'] as const;
const COMMISSION_ROLES = ['corretor', 'imobiliária'] as const;
const TRANSACTION_FORM_DATA_MARKER = '\n\n---OCTODASH_TRANSACTION_FORM_JSON---\n';

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

const formatCurrencyWithCents = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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

const formatFullAddress = (address?: ProposalAddress) => {
  if (!address) return '';
  const street = [address.logradouro, address.numero].filter(Boolean).join(', ');
  const complement = address.complemento ? `, ${address.complemento}` : '';
  const city = [address.cidade, address.uf].filter(Boolean).join(' - ');
  const cep = address.cep ? `CEP ${address.cep.replace(/\D/g, '')}` : '';
  return [street ? `${street}${complement}` : '', address.bairro, city, cep].filter(Boolean).join(', ');
};

const splitSpecificConditions = (value: string | null | undefined) => {
  const source = String(value || '');
  const markerIndex = source.indexOf(TRANSACTION_FORM_DATA_MARKER);
  if (markerIndex === -1) {
    return { text: source, transactionForm: {} as TransactionFormData };
  }

  const text = source.slice(0, markerIndex).trimEnd();
  const rawJson = source.slice(markerIndex + TRANSACTION_FORM_DATA_MARKER.length);

  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { text, transactionForm: {} as TransactionFormData };
    }

    return {
      text,
      transactionForm: Object.fromEntries(
        Object.entries(parsed).map(([key, fieldValue]) => [key, String(fieldValue ?? '')]),
      ) as TransactionFormData,
    };
  } catch {
    return { text, transactionForm: {} as TransactionFormData };
  }
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
  transactionForm: {},
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
  const legacySpecificConditions = splitSpecificConditions(saved.specific_conditions);
  const savedTransactionForm =
    saved.transaction_form && typeof saved.transaction_form === 'object'
      ? Object.fromEntries(
          Object.entries(saved.transaction_form).map(([key, value]) => [key, String(value ?? '')]),
        ) as TransactionFormData
      : {};
  const transactionForm = {
    ...legacySpecificConditions.transactionForm,
    ...savedTransactionForm,
  };
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
    observacoes: legacySpecificConditions.text || null,
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
        condicoesEspecificas: legacySpecificConditions.text,
      },
      transactionForm,
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
    transactionForm: detail.transactionForm,
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

function InfoTile({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  detail?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-slate-400">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div className="mt-1 break-words text-sm font-semibold text-slate-900 dark:text-slate-100">{value}</div>
      {detail && <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">{detail}</p>}
    </div>
  );
}

function WorkflowChecklist({
  group,
  activeItemId,
  pendingItemId,
  currentStageId,
  onSelectItem,
  onActivateItem,
}: {
  group: DealWorkflowGroup;
  activeItemId?: string;
  pendingItemId?: string | null;
  currentStageId: ProposalStageId;
  onSelectItem: (itemId: string) => void;
  onActivateItem: (item: DealWorkflowItem) => void;
}) {
  const groupStage = STAGE_BY_ID[group.stageId];
  const GroupIcon = groupStage.icon;

  return (
    <div
      className="rounded-lg border bg-white p-4 dark:bg-slate-900"
      style={{
        borderColor: currentStageId === group.stageId ? `${groupStage.color}66` : undefined,
        boxShadow: currentStageId === group.stageId ? `0 0 0 1px ${groupStage.color}14` : undefined,
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
            style={{ backgroundColor: `${groupStage.color}14`, color: groupStage.color }}
          >
            <GroupIcon className="h-3.5 w-3.5" />
          </span>
          <h4 className="truncate text-sm font-semibold text-slate-950 dark:text-slate-50">{group.title}</h4>
        </div>
        <Badge variant="outline" className="text-[11px]">{group.status}</Badge>
      </div>
      <div className="mt-3 grid gap-2">
        {group.items.map((item, index) => {
          const isActive = activeItemId === item.id;
          const isPending = pendingItemId === item.id;
          const isSameStage = currentStageId === item.stageId;
          const itemStage = STAGE_BY_ID[item.stageId];

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectItem(pendingItemId === item.id ? '' : item.id)}
              className={cn(
                'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
                isActive
                  ? 'border-transparent bg-emerald-50 dark:bg-emerald-950/30'
                  : isPending
                    ? 'bg-white dark:bg-slate-950'
                    : 'border-slate-200 bg-slate-50 hover:bg-white dark:border-slate-800 dark:bg-slate-800/60 dark:hover:bg-slate-950',
              )}
              style={
                isActive
                  ? { borderColor: '#10b98133' }
                  : isPending
                    ? { borderColor: `${itemStage.color}66` }
                    : undefined
              }
            >
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                    isActive
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-slate-500 dark:bg-slate-900 dark:text-slate-400',
                  )}
                >
                  {isActive ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-5 text-slate-800 dark:text-slate-100">{item.label}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>{item.owner}</span>
                    <span
                      className="rounded-full px-2 py-0.5 font-semibold"
                      style={{ backgroundColor: `${itemStage.color}12`, color: itemStage.color }}
                    >
                      {itemStage.label}
                    </span>
                    {isSameStage && !isActive && <span>etapa atual</span>}
                  </span>
                </span>
              </div>
              {isPending && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <span className="text-[12px] text-slate-500 dark:text-slate-400">
                    Ativar esta subetapa no negócio.
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isActive}
                    onClick={(event) => {
                      event.stopPropagation();
                      onActivateItem(item);
                    }}
                    className="h-8"
                  >
                    <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                    {isActive ? 'Subetapa ativa' : 'Ativar subetapa'}
                  </Button>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SimpleChecklist({
  items,
  completedCount,
}: {
  items: readonly string[];
  completedCount: number;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map((item, index) => {
        const done = index < completedCount;
        return (
          <div
            key={item}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
              done
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                : 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
            )}
          >
            <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full', done ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400 dark:bg-slate-800')}>
              {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
            </span>
            <span className="min-w-0 truncate font-medium">{item}</span>
          </div>
        );
      })}
    </div>
  );
}

function TransactionField({
  label,
  value,
  defaultValue,
  placeholder,
  type = 'text',
  className,
  onChange,
}: {
  label: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  className?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <label className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">{label}</label>
      <Input
        type={type}
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        className="h-9 bg-white text-[13px] dark:bg-slate-950"
      />
    </div>
  );
}

function SegmentedChoice({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly string[];
  selected?: string;
  onChange?: (value: string) => void;
}) {
  const [currentValue, setCurrentValue] = useState(selected || options[0] || '');

  useEffect(() => {
    setCurrentValue(selected || options[0] || '');
  }, [options, selected]);

  return (
    <div className="grid gap-1.5">
      <span className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">{label}</span>
      <div className="grid overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((option, index) => {
          const active = option === currentValue;
          return (
            <button
              key={option}
              type="button"
              onClick={() => {
                setCurrentValue(option);
                onChange?.(option);
              }}
              className={cn(
                'h-9 min-w-0 px-3 text-[12px] font-semibold transition-colors',
                index > 0 && 'border-l border-slate-200 dark:border-slate-800',
                active
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                  : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900',
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PriceCompositionRow({
  label,
  value,
  detail,
  onValueChange,
  onDetailChange,
}: {
  label: string;
  value?: string;
  detail?: string;
  onValueChange?: (value: string) => void;
  onDetailChange?: (value: string) => void;
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60 md:grid-cols-[minmax(0,1fr)_150px_minmax(0,1.2fr)]">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-800">
          <Plus className="h-3.5 w-3.5" />
        </span>
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      </div>
      <Input value={value || ''} onChange={(event) => onValueChange?.(event.target.value)} placeholder="Valor" className="h-9 bg-white text-[13px] dark:bg-slate-900" />
      <Input value={detail || ''} onChange={(event) => onDetailChange?.(event.target.value)} placeholder="Detalhamento" className="h-9 bg-white text-[13px] dark:bg-slate-900" />
    </div>
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

interface PropostaPageProps {
  embeddedProposalId?: string | null;
  embeddedProposal?: SavedProposal | null;
  onEmbeddedClose?: () => void;
}

export const PropostaPage = ({
  embeddedProposalId = null,
  embeddedProposal = null,
  onEmbeddedClose,
}: PropostaPageProps = {}) => {
  const isEmbedded = Boolean(embeddedProposalId);
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
  const [activeDetailTab, setActiveDetailTab] = useState<DealTabId>('negocios');
  const [activeTransactionFormSection, setActiveTransactionFormSection] = useState<TransactionFormSection>('Imóvel & Valores');
  const [activePropertyValueSection, setActivePropertyValueSection] = useState<(typeof PROPERTY_VALUE_SECTIONS)[number]>('Código');
  const [showSellerParticipations, setShowSellerParticipations] = useState(false);
  const [showBuyerParticipations, setShowBuyerParticipations] = useState(false);
  const [showCommissionPercent, setShowCommissionPercent] = useState(false);
  const [agendaDraft, setAgendaDraft] = useState({ title: 'Escritura pública', date: '', time: '' });
  const [requestDraft, setRequestDraft] = useState({
    hasProperty: 'sim',
    area: 'Jurídico',
    keyword: '',
    property: '',
  });
  const [signatureDocumentName, setSignatureDocumentName] = useState('');
  const [pendingWorkflowItemId, setPendingWorkflowItemId] = useState<string | null>(null);
  const [linkLeadTarget, setLinkLeadTarget] = useState<
    | { mode: 'detail'; proposalId: string; group: 'compradores' | 'vendedores' }
    | { mode: 'draft'; group: 'compradores' | 'vendedores' }
    | null
  >(null);
  const [linkLeadSearch, setLinkLeadSearch] = useState('');
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const autosaveResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const detailTabsScrollRef = useRef<HTMLDivElement>(null);

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
      if (autosaveResetRef.current) clearTimeout(autosaveResetRef.current);
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
  const selectedAddressText = selectedDetail ? formatFullAddress(selectedDetail.endereco) : '';
  const selectedDealAddress = selectedAddressText || 'Endereço não informado';
  const selectedDealTitle = selectedDetail?.endereco?.logradouro
    ? [selectedDetail.endereco.logradouro, selectedDetail.endereco.numero, selectedDetail.endereco.complemento].filter(Boolean).join(', ')
    : selectedProposal?.imovelRef || 'Imóvel sem identificação';
  const selectedSellerName = selectedDetail?.vendedores.find((party) => party.nomeCompleto.trim())?.nomeCompleto.trim() || 'A definir';
  const selectedCommission = selectedProposal ? selectedProposal.valor * 0.055 : 0;
  const selectedInviteLink = selectedProposal
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/propostas/${selectedProposal.id}`
    : '';
  const selectedInviteCode = selectedProposal?.id.slice(0, 8).toUpperCase() || '';
  const transactionForm = selectedDetail?.transactionForm ?? {};
  const sellerMediaOrigin = transactionForm.sellerMediaOrigin || 'Mídia de Origem';
  const buyerMediaOrigin = transactionForm.buyerMediaOrigin || 'Mídia de Origem';
  const commissionPayer = transactionForm.commissionPayer || 'Vendedor';
  const commissionMoment = transactionForm.commissionMoment || 'Escrituração';
  const commissionRole = transactionForm.commissionRole || 'corretor';
  const commissionedPeople = (transactionForm.commissionedPeople || 'Comissionado principal')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
  const getTransactionFormValue = (key: string, fallback = '') => transactionForm[key] ?? fallback;
  const activeDealSubstageId = getTransactionFormValue('activeDealSubstageId');
  const activeDealSubstageLabel = getTransactionFormValue('activeDealSubstageLabel');
  const isFinanciado = Boolean(selectedDetail?.pagamento.comFinanciamento);
  const dealWorkflowGroups = getDealWorkflowGroups(isFinanciado);

  const persistExistingProposal = useCallback(
    async (proposal: ProposalItem, detail: ProposalDetailState) => {
      if (!currentTenantId || proposal.source !== 'draft' || !isUuidLike(proposal.id)) return;

      setAutosaveStatus('saving');
      try {
        const payload = proposalToSaveInput(proposal, detail, currentTenantId, user?.id);
        await updateSavedProposal({ ...payload, id: proposal.id });
        setAutosaveStatus('saved');
        if (autosaveResetRef.current) clearTimeout(autosaveResetRef.current);
        autosaveResetRef.current = setTimeout(() => setAutosaveStatus('idle'), 2500);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao salvar proposta.';
        setSavedError(message);
        setAutosaveStatus('error');
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

  const openLinkLeadDialog = (
    target:
      | { mode: 'detail'; proposalId: string; group: 'compradores' | 'vendedores' }
      | { mode: 'draft'; group: 'compradores' | 'vendedores' },
  ) => {
    setLinkLeadSearch('');
    setLinkLeadTarget(target);
  };

  const partyFromLead = (lead: CRMLead): ProposalParty =>
    createParty({
      nomeCompleto: lead.name || '',
      celular: lead.phone || '',
      email: lead.email || '',
    });

  const linkLeadAsParty = (lead: CRMLead) => {
    if (!linkLeadTarget) return;
    const newParty = partyFromLead(lead);
    const groupLabel = linkLeadTarget.group === 'compradores' ? 'comprador' : 'proprietário';

    if (linkLeadTarget.mode === 'detail') {
      const proposal = proposals.find((item) => item.id === linkLeadTarget.proposalId);
      if (!proposal) {
        setLinkLeadTarget(null);
        return;
      }
      const current = proposalDetails[proposal.id] ?? buildDefaultProposalDetail(proposal);
      setCollapsedPartyIds((previous) => {
        const next = new Set(previous);
        current[linkLeadTarget.group].forEach((party) => next.add(party.id));
        next.delete(newParty.id);
        return next;
      });
      updateProposalDetail(proposal, (currentDetail) => ({
        ...currentDetail,
        [linkLeadTarget.group]: [...currentDetail[linkLeadTarget.group], newParty],
      }));
      appendHistory(
        proposal,
        `Vinculado ${groupLabel} do CRM`,
        `${lead.name || 'Lead sem nome'} (${lead.email || lead.phone || 'sem contato'}) vinculado à proposta.`,
      );
    } else {
      setCollapsedPartyIds((previous) => {
        const next = new Set(previous);
        draftForm[linkLeadTarget.group].forEach((party) => next.add(party.id));
        next.delete(newParty.id);
        return next;
      });
      setDraftForm((previous) => ({
        ...previous,
        [linkLeadTarget.group]: [...previous[linkLeadTarget.group], newParty],
      }));
    }

    toast({
      title: 'Cadastro vinculado',
      description: `${lead.name || 'Lead sem nome'} foi adicionado como ${groupLabel}.`,
    });
    setLinkLeadTarget(null);
  };

  const linkLeadCandidates = useMemo(() => {
    const q = normalize(linkLeadSearch);
    return leads
      .filter((lead) => {
        if (!q) return true;
        return (
          normalize(lead.name).includes(q) ||
          normalize(lead.phone || '').includes(q) ||
          normalize(lead.email || '').includes(q) ||
          normalize(lead.property_code || '').includes(q) ||
          normalize(lead.assigned_agent_name || '').includes(q)
        );
      })
      .slice(0, 60);
  }, [leads, linkLeadSearch]);

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

  const updateAddress = (proposal: ProposalItem, updates: Partial<ProposalAddress>) => {
    updateProposalDetail(proposal, (current) => ({
      ...current,
      endereco: {
        cep: '',
        numero: '',
        logradouro: '',
        bairro: '',
        complemento: '',
        cidade: '',
        uf: '',
        ...current.endereco,
        ...updates,
      },
    }));
  };

  const updateTransactionForm = (proposal: ProposalItem, key: string, value: string) => {
    updateProposalDetail(proposal, (current) => ({
      ...current,
      transactionForm: {
        ...current.transactionForm,
        [key]: value,
      },
    }));
  };

  const addCommissionedPerson = (proposal: ProposalItem, label: string) => {
    const current = (proposalDetails[proposal.id] ?? buildDefaultProposalDetail(proposal)).transactionForm.commissionedPeople;
    const people = (current || 'Comissionado principal')
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    updateTransactionForm(proposal, 'commissionedPeople', [...people, label].join('\n'));
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

  const activateDealSubstage = (proposal: ProposalItem, group: DealWorkflowGroup, item: DealWorkflowItem) => {
    const activatedAt = new Date().toISOString();

    updateProposalDetail(proposal, (current) => ({
      ...current,
      transactionForm: {
        ...current.transactionForm,
        activeDealSubstageId: item.id,
        activeDealSubstageLabel: item.label,
        activeDealSubstageGroup: group.title,
        activeDealSubstageOwner: item.owner,
        activeDealSubstageActivatedAt: activatedAt,
      },
    }));

    appendHistory(proposal, 'Subetapa ativada', `${group.title}: ${item.label}. Responsável: ${item.owner}.`);
    setPendingWorkflowItemId(null);
    setActiveDetailTab(item.targetTab);

    if (proposal.stageId !== item.stageId) {
      void changeProposalStage(proposal.id, item.stageId);
    }

    toast({
      title: 'Subetapa ativada',
      description: item.label,
    });
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
      transactionForm: {},
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

  const downloadTextFile = (filename: string, content: string, type = 'text/plain;charset=utf-8') => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const buildInviteMessage = () => {
    if (!selectedProposal) return '';
    return [
      `Olá, você foi convidado para acompanhar o negócio ${selectedProposal.imovelRef}.`,
      `Link: ${selectedInviteLink}`,
      `Código: ${selectedInviteCode}`,
    ].join('\n');
  };

  const getInviteRecipients = () => {
    if (!selectedDetail) return { emails: '', whatsappPhone: '' };
    const parties = [...selectedDetail.compradores, ...selectedDetail.vendedores];
    const emails = parties.map((party) => party.email.trim()).filter(Boolean).join(',');
    const whatsappPhone = parties.find((party) => party.celular.trim())?.celular.replace(/\D/g, '') || '';
    return { emails, whatsappPhone };
  };

  const openProposalDetail = (proposal: ProposalItem) => {
    const detail = proposalDetails[proposal.id] ?? buildDefaultProposalDetail(proposal);
    setSelectedProposal(proposal);
    setActiveDetailTab('negocios');
    setPendingWorkflowItemId(null);
    setSignatureDocumentName(detail.transactionForm.signatureDocumentName || '');
    setRequestDraft((previous) => ({
      ...previous,
      property: proposal.imovelRef,
    }));
  };

  const [searchParams, setSearchParams] = useSearchParams();
  const requestedProposalId = isEmbedded ? embeddedProposalId : searchParams.get('id');
  const consumedProposalIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!requestedProposalId) {
      consumedProposalIdRef.current = null;
      return;
    }
    if (consumedProposalIdRef.current === requestedProposalId) return;
    if (selectedProposal?.id === requestedProposalId) return;

    let match = proposals.find((proposal) => proposal.id === requestedProposalId);

    if (!match && isEmbedded && embeddedProposal && embeddedProposal.id === requestedProposalId) {
      const converted = savedProposalToUiState(embeddedProposal);
      setProposalDetails((previous) => ({ ...previous, [converted.proposal.id]: converted.detail }));
      setDrafts((previous) => [
        converted.proposal,
        ...previous.filter((item) => item.id !== converted.proposal.id),
      ]);
      match = converted.proposal;
    }

    if (!match) return;

    consumedProposalIdRef.current = requestedProposalId;
    openProposalDetail(match);

    if (!isEmbedded) {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete('id');
          return next;
        },
        { replace: true },
      );
    }
    // openProposalDetail captures setters that are stable; safe to omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedProposalId, proposals, selectedProposal?.id, setSearchParams, isEmbedded, embeddedProposal]);

  const registerInviteAction = (channel: string) => {
    if (!selectedProposal) return;
    appendHistory(selectedProposal, 'Convite enviado', `Canal: ${channel}. Código ${selectedInviteCode}.`);
    toast({
      title: 'Convite registrado',
      description: `O convite por ${channel} entrou no histórico do negócio.`,
    });
  };

  const copyInviteLink = async () => {
    if (!selectedProposal || !selectedInviteLink) return;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(selectedInviteLink);
      }
      registerInviteAction('link');
    } catch (err) {
      toast({
        title: 'Não foi possível copiar automaticamente',
        description: selectedInviteLink,
        variant: 'destructive',
      });
    }
  };

  const copyInviteCode = async () => {
    if (!selectedProposal || !selectedInviteCode) return;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(selectedInviteCode);
      }
      registerInviteAction('código');
    } catch (err) {
      toast({
        title: 'Não foi possível copiar automaticamente',
        description: selectedInviteCode,
        variant: 'destructive',
      });
    }
  };

  const sendInviteByEmail = () => {
    if (!selectedProposal) return;
    const { emails } = getInviteRecipients();
    const subject = encodeURIComponent(`Convite para acompanhar ${selectedProposal.imovelRef}`);
    const body = encodeURIComponent(buildInviteMessage());
    window.location.href = `mailto:${emails}?subject=${subject}&body=${body}`;
    registerInviteAction('email');
  };

  const sendInviteByWhatsapp = () => {
    if (!selectedProposal) return;
    const { whatsappPhone } = getInviteRecipients();
    const phone = whatsappPhone.length >= 10 ? `55${whatsappPhone.replace(/^55/, '')}` : '';
    const message = encodeURIComponent(buildInviteMessage());
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank', 'noopener,noreferrer');
    registerInviteAction('whatsapp');
  };

  const addAgendaEvent = () => {
    if (!selectedProposal) return;
    if (!agendaDraft.date) {
      toast({
        title: 'Informe a data do evento',
        description: 'A agenda precisa de uma data para gerar o compromisso.',
        variant: 'destructive',
      });
      return;
    }

    const dateLabel = [agendaDraft.date, agendaDraft.time].filter(Boolean).join(' às ') || 'data a definir';
    const time = agendaDraft.time || '09:00';
    const start = `${agendaDraft.date.replace(/-/g, '')}T${time.replace(':', '')}00`;
    const endHour = String(Math.min(Number(time.slice(0, 2)) + 1, 23)).padStart(2, '0');
    const end = `${agendaDraft.date.replace(/-/g, '')}T${endHour}${time.slice(3, 5)}00`;
    const title = agendaDraft.title || 'Evento do negócio';
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//OctoDash//Propostas//PT-BR',
      'BEGIN:VEVENT',
      `UID:${selectedProposal.id}-${agendaDraft.date}@octodash`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${title}`,
      `DESCRIPTION:${selectedProposal.cliente} - ${selectedProposal.imovelRef}`,
      `LOCATION:${selectedDealAddress}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    downloadTextFile(`agenda-${selectedProposal.imovelRef || selectedProposal.id}.ics`, ics, 'text/calendar;charset=utf-8');
    updateTransactionForm(selectedProposal, 'lastAgendaEvent', JSON.stringify({ title, date: agendaDraft.date, time }));
    appendHistory(selectedProposal, 'Evento programado', `${agendaDraft.title || 'Evento'}: ${dateLabel}.`);
    toast({
      title: 'Evento adicionado',
      description: `${agendaDraft.title || 'Evento'} foi registrado e o arquivo de calendário foi gerado.`,
    });
  };

  const createServiceRequest = (title: string) => {
    if (!selectedProposal) return;
    updateTransactionForm(selectedProposal, 'lastServiceRequest', title);
    appendHistory(
      selectedProposal,
      'Solicitação criada',
      `${title}. Imóvel: ${requestDraft.property || selectedProposal.imovelRef}. Área: ${requestDraft.area}. Palavra-chave: ${requestDraft.keyword || 'não informada'}.`,
    );
    toast({
      title: 'Solicitação criada',
      description: title,
    });
  };

  const registerCcvAction = (label: string, detail: string) => {
    if (!selectedProposal) return;
    appendHistory(selectedProposal, label, detail);
    toast({
      title: label,
      description: detail,
    });
  };

  const generateCcvDraft = () => {
    if (!selectedProposal || !selectedDetail) return;
    const buyers = selectedDetail.compradores.map((party) => party.nomeCompleto || 'Comprador sem nome').join(', ') || 'Compradores pendentes';
    const sellers = selectedDetail.vendedores.map((party) => party.nomeCompleto || 'Vendedor sem nome').join(', ') || selectedSellerName;
    const content = [
      'CONTRATO DE COMPROMISSO DE COMPRA E VENDA',
      '',
      `Imóvel: ${selectedProposal.imovelRef}`,
      `Endereço: ${selectedDealAddress}`,
      `Compradores: ${buyers}`,
      `Vendedores: ${sellers}`,
      `Valor do negócio: ${formatCurrencyWithCents(selectedProposal.valor)}`,
      `Comissão geral: ${formatCurrencyWithCents(selectedCommission)}`,
      `Forma de pagamento: ${selectedDetail.pagamento.formaPagamento}`,
      '',
      'Condições específicas:',
      selectedDetail.pagamento.condicoesEspecificas || 'Sem condições específicas cadastradas.',
      '',
      'Condições gerais:',
      ...GENERAL_CONDITIONS.map((condition, index) => `${index + 1}. ${condition}`),
    ].join('\n');

    downloadTextFile(`ccv-${selectedProposal.imovelRef || selectedProposal.id}.txt`, content);
    updateTransactionForm(selectedProposal, 'ccvDraftGeneratedAt', new Date().toISOString());
    registerCcvAction('CCV Conjurer', 'Minuta de CCV gerada para conferência.');
  };

  const sendCcvToSignature = () => {
    if (!selectedProposal) return;
    updateProposalDetail(selectedProposal, (current) => ({
      ...current,
      enviadoProponente: true,
      enviadoProprietario: true,
      compradores: current.compradores.map((party) => ({
        ...party,
        statusAssinatura: party.statusAssinatura === 'pendente' ? 'enviado' : party.statusAssinatura,
      })),
      vendedores: current.vendedores.map((party) => ({
        ...party,
        statusAssinatura: party.statusAssinatura === 'pendente' ? 'enviado' : party.statusAssinatura,
      })),
    }));
    setActiveDetailTab('assinatura');
    updateTransactionForm(selectedProposal, 'ccvSentToSignatureAt', new Date().toISOString());
    registerCcvAction('CCV enviado', 'CCV enviado para assinatura eletrônica das partes.');
  };

  const markCcvSigned = () => {
    if (!selectedProposal) return;
    updateProposalDetail(selectedProposal, (current) => ({
      ...current,
      compradores: current.compradores.map((party) => ({
        ...party,
        assinadoPor: party.assinadoPor || party.nomeCompleto,
        statusAssinatura: 'assinado',
      })),
      vendedores: current.vendedores.map((party) => ({
        ...party,
        assinadoPor: party.assinadoPor || party.nomeCompleto,
        statusAssinatura: 'assinado',
      })),
    }));
    updateTransactionForm(selectedProposal, 'ccvSignedAt', new Date().toISOString());
    registerCcvAction('CCV assinado', 'Contrato marcado como assinado.');
    void changeProposalStage(selectedProposal.id, 'proposta-assinada');
  };

  const handleSignatureDocument = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedProposal) return;
    setSignatureDocumentName(file.name);
    updateTransactionForm(selectedProposal, 'signatureDocumentName', file.name);
    appendHistory(selectedProposal, 'Documento enviado para assinatura eletrônica', file.name);
    toast({
      title: 'PDF recebido',
      description: 'O documento foi registrado no histórico da proposta.',
    });
  };

  const handleProposalAttachments = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedProposal) return;
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const acceptedFiles = files.filter((file) => file.size <= 10 * 1024 * 1024);
    const fileNames = acceptedFiles.map((file) => file.name);
    updateTransactionForm(selectedProposal, 'proposalAttachmentNames', fileNames.join('\n'));

    if (acceptedFiles.length !== files.length) {
      toast({
        title: 'Alguns arquivos foram ignorados',
        description: 'Apenas documentos com até 10Mb foram registrados.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Anexos registrados',
        description: `${fileNames.length} documento(s) vinculado(s) ao formulário.`,
      });
    }
  };

  const sendSignatureDocument = () => {
    if (!selectedProposal) return;
    if (!signatureDocumentName) {
      toast({
        title: 'Anexe um PDF',
        description: 'Selecione um documento antes de enviar para assinatura.',
        variant: 'destructive',
      });
      return;
    }

    updateProposalDetail(selectedProposal, (current) => ({
      ...current,
      compradores: current.compradores.map((party) => ({
        ...party,
        statusAssinatura: party.statusAssinatura === 'pendente' ? 'enviado' : party.statusAssinatura,
      })),
      vendedores: current.vendedores.map((party) => ({
        ...party,
        statusAssinatura: party.statusAssinatura === 'pendente' ? 'enviado' : party.statusAssinatura,
      })),
    }));
    appendHistory(selectedProposal, 'Assinatura eletrônica enviada', signatureDocumentName);
    toast({
      title: 'Assinatura enviada',
      description: 'Os participantes pendentes foram marcados como enviados.',
    });
  };

  return (
    <div className={isEmbedded ? 'hidden' : 'min-h-full bg-slate-50 dark:bg-slate-950'}>
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
                    onOpen={openProposalDetail}
                  />
                ))}
              </div>
            </div>

            <DragOverlay>
              {activeCard && (
                <div className="w-[270px] rotate-2 shadow-2xl">
                  <ProposalCardContent
                    proposal={activeCard}
                    onOpen={openProposalDetail}
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
                      onClick={() => openProposalDetail(proposal)}
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

      <Dialog
        open={!!selectedProposal}
        onOpenChange={(open) => {
          if (open) return;
          setSelectedProposal(null);
          if (isEmbedded) {
            consumedProposalIdRef.current = null;
            onEmbeddedClose?.();
          }
        }}
      >
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
                <div className="flex shrink-0 items-center gap-2">
                  {selectedProposal.source === 'draft' && (
                    autosaveStatus === 'saving' ? (
                      <div className="flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Salvando
                      </div>
                    ) : autosaveStatus === 'saved' ? (
                      <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Salvo
                      </div>
                    ) : autosaveStatus === 'error' ? (
                      <div className="flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Erro ao salvar
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Sincronizado
                      </div>
                    )
                  )}
                  {updatingId === selectedProposal.id && (
                    <div className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Movendo etapa
                    </div>
                  )}
                </div>
              </div>
            </DialogHeader>

            <div className="max-h-[calc(92vh-92px)] overflow-y-auto bg-slate-50 px-6 py-5 dark:bg-slate-950">
              <Tabs value={activeDetailTab} onValueChange={(value) => setActiveDetailTab(value as DealTabId)} className="min-w-0 max-w-full space-y-4">
                <div
                  ref={detailTabsScrollRef}
                  className="-mx-1 min-w-0 max-w-full overflow-x-auto overscroll-contain scroll-smooth px-1 pb-1"
                >
                  <TabsList className="inline-flex h-auto min-w-max justify-start gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
                    {DEAL_NAV_ITEMS.map((item) => {
                      const Icon = item.icon;
                      return (
                        <TabsTrigger
                          key={item.id}
                          value={item.id}
                          className="h-9 gap-2 rounded-md px-3 text-[12px] data-[state=active]:bg-slate-900 data-[state=active]:text-white dark:data-[state=active]:bg-slate-100 dark:data-[state=active]:text-slate-950"
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {item.label}
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                </div>

                <TabsContent value="negocios" className="mt-0 space-y-4">
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="space-y-4">
                      <DetailSection title="Negócios" icon={BriefcaseBusiness}>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0">
                              <p className="text-[12px] font-semibold uppercase text-slate-400">Imóvel sendo vendido</p>
                              <h3 className="mt-1 text-lg font-semibold text-slate-950 dark:text-slate-50">{selectedDealTitle}</h3>
                              <p className="mt-2 text-sm leading-5 text-slate-600 dark:text-slate-300">{selectedDealAddress}</p>
                              <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                                {selectedDetail.pagamento.comFinanciamento ? 'com análise de financiamento' : 'sem alienação fiduciária'}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  'font-semibold',
                                  isFinanciado
                                    ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300'
                                    : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
                                )}
                              >
                                Fluxo: {isFinanciado ? 'Financiado' : 'À vista'}
                              </Badge>
                              <Badge variant="outline">Clientes</Badge>
                              <Badge variant="outline">Parceiros</Badge>
                              <Badge variant="outline">Contratos</Badge>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <InfoTile label="Código do Imóvel" value={selectedProposal.imovelRef || 'Sem código'} icon={Building2} />
                          <InfoTile label="Valor do Negócio" value={formatCurrencyWithCents(selectedProposal.valor)} icon={DollarSign} />
                          <InfoTile label="Comissão Geral" value={formatCurrencyWithCents(selectedCommission)} detail="Estimativa de 5,5%" icon={WalletCards} />
                          <InfoTile label="Subida Negócio" value={formatDate(selectedProposal.criadaEm)} icon={CalendarDays} />
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          {[
                            ['CCV Assinado', selectedProposal.stageId === 'proposta-assinada' ? 'Concluído' : 'Pendente'],
                            ['Data Escritura', 'A programar'],
                            ['Comissão Paga', selectedProposal.stageId === 'proposta-assinada' ? 'Validar pagamento' : 'Aguardando'],
                            ['Entrega Chaves', 'A programar'],
                          ].map(([label, value]) => (
                            <InfoTile key={label} label={label} value={value} />
                          ))}
                        </div>
                        {activeDealSubstageLabel && (
                          <div className="mt-4">
                            <InfoTile
                              label="Subetapa ativa"
                              value={activeDealSubstageLabel}
                              detail={getTransactionFormValue('activeDealSubstageGroup')}
                              icon={ClipboardCheck}
                            />
                          </div>
                        )}
                      </DetailSection>

                      <div className="grid gap-3">
                        {dealWorkflowGroups.map((group) => (
                          <WorkflowChecklist
                            key={group.id}
                            group={group}
                            activeItemId={activeDealSubstageId}
                            pendingItemId={pendingWorkflowItemId}
                            currentStageId={selectedProposal.stageId}
                            onSelectItem={(itemId) => setPendingWorkflowItemId(itemId || null)}
                            onActivateItem={(item) => activateDealSubstage(selectedProposal, group, item)}
                          />
                        ))}
                      </div>
                    </div>

                    <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
                      <DetailSection title="Responsáveis" icon={Users}>
                        <div className="space-y-3">
                          <InfoTile label="Vendedor" value={selectedSellerName} />
                          <InfoTile label="Corretor" value={selectedProposal.corretor || 'Não atribuído'} />
                          <InfoTile label="Agente responsável" value={selectedDetail.agenteResponsavel || selectedProposal.agenteResponsavel || 'Não atribuído'} />
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
                    </aside>
                  </div>
                </TabsContent>

                <TabsContent value="formulario" className="mt-0 space-y-4">
                  <DetailSection title="Formulário de Transação" icon={ClipboardList}>
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-4">
                        <InfoTile label="Cliente" value={selectedProposal.cliente || 'Sem proponente'} icon={Users} />
                        <InfoTile label="Código do Imóvel" value={selectedProposal.imovelRef || 'Sem código'} icon={Building2} />
                        <InfoTile label="Valor do Negócio" value={formatCurrencyWithCents(selectedProposal.valor)} icon={DollarSign} />
                        <InfoTile label="Envio da Venda" value="CompraSegura" icon={ShieldCheck} />
                      </div>

                      <div className="overflow-x-auto">
                        <div className="inline-flex min-w-max rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950">
                          {TRANSACTION_FORM_NAV.map((item, index) => (
                            <button
                              key={item}
                              type="button"
                              onClick={() => {
                                const targetTab =
                                  item === 'Negócio' ? 'negocios'
                                  : item === 'Documentos' ? 'documentos'
                                  : item === 'Certidões' ? 'certidoes'
                                  : item === 'Participantes' ? 'participantes'
                                  : 'historico';
                                setActiveDetailTab(targetTab as DealTabId);
                              }}
                              className={cn(
                                'h-8 rounded-md px-3 text-[12px] font-semibold transition-colors',
                                index === 0
                                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                                  : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-900',
                              )}
                            >
                              {item}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <div className="inline-flex min-w-max gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
                          {TRANSACTION_FORM_SECTIONS.map((item) => (
                            <button
                              key={item}
                              type="button"
                              onClick={() => setActiveTransactionFormSection(item)}
                              className={cn(
                                'h-8 rounded-md px-3 text-[12px] font-semibold transition-colors',
                                activeTransactionFormSection === item
                                  ? 'bg-blue-600 text-white'
                                  : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800',
                              )}
                            >
                              {item}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </DetailSection>

                  {activeTransactionFormSection === 'Imóvel & Valores' && (
                  <DetailSection title="Imóvel & Valores" icon={Building2}>
                    <div className="space-y-5">
                      <div className="overflow-x-auto">
                        <div className="inline-flex min-w-max gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
                          {PROPERTY_VALUE_SECTIONS.map((item) => (
                            <button
                              key={item}
                              type="button"
                              onClick={() => setActivePropertyValueSection(item)}
                              className={cn(
                                'h-8 rounded-md px-3 text-[12px] font-semibold transition-colors',
                                activePropertyValueSection === item
                                  ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                                  : 'text-slate-500 hover:bg-white/70 dark:text-slate-400 dark:hover:bg-slate-900/70',
                              )}
                            >
                              {item}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                        <div className="mb-4">
                          <h4 className="text-sm font-semibold text-slate-950 dark:text-slate-50">Identificação do imóvel e status da propriedade</h4>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-6">
                          <TransactionField label="CEP" value={selectedDetail.endereco?.cep || ''} onChange={(value) => updateAddress(selectedProposal, { cep: value })} className="sm:col-span-2" />
                          <TransactionField label="Número" value={selectedDetail.endereco?.numero || ''} onChange={(value) => updateAddress(selectedProposal, { numero: value })} />
                          <TransactionField label="Complemento" value={selectedDetail.endereco?.complemento || ''} onChange={(value) => updateAddress(selectedProposal, { complemento: value })} className="sm:col-span-3" />
                          <TransactionField label="Logradouro" value={selectedDetail.endereco?.logradouro || ''} onChange={(value) => updateAddress(selectedProposal, { logradouro: value })} className="sm:col-span-3" />
                          <TransactionField label="Bairro" value={selectedDetail.endereco?.bairro || ''} onChange={(value) => updateAddress(selectedProposal, { bairro: value })} className="sm:col-span-2" />
                          <TransactionField label="Cidade" value={selectedDetail.endereco?.cidade || ''} onChange={(value) => updateAddress(selectedProposal, { cidade: value })} className="sm:col-span-2" />
                          <TransactionField label="UF" value={selectedDetail.endereco?.uf || ''} onChange={(value) => updateAddress(selectedProposal, { uf: value })} />
                          <TransactionField label="Código do Imóvel" value={getTransactionFormValue('propertyCode', selectedProposal.imovelRef || '')} onChange={(value) => updateTransactionForm(selectedProposal, 'propertyCode', value)} placeholder="Código do imóvel" className="sm:col-span-2" />
                          <TransactionField label="Código Alternativo" value={getTransactionFormValue('alternativeCode')} onChange={(value) => updateTransactionForm(selectedProposal, 'alternativeCode', value)} placeholder="Código alternativo" className="sm:col-span-2" />
                          <TransactionField label="Matrícula" value={getTransactionFormValue('registryNumber')} onChange={(value) => updateTransactionForm(selectedProposal, 'registryNumber', value)} placeholder="Número da matrícula" className="sm:col-span-2" />
                          <TransactionField label="Cartório de Imóveis" value={getTransactionFormValue('propertyRegistryOffice')} onChange={(value) => updateTransactionForm(selectedProposal, 'propertyRegistryOffice', value)} placeholder="Cartório responsável" className="sm:col-span-3" />
                          <TransactionField label="Contribuinte da Prefeitura" value={getTransactionFormValue('municipalTaxpayer')} onChange={(value) => updateTransactionForm(selectedProposal, 'municipalTaxpayer', value)} placeholder="Inscrição municipal" className="sm:col-span-3" />
                          <div className="grid gap-1.5 sm:col-span-6">
                            <label className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Descrição Jurídica</label>
                            <Textarea value={getTransactionFormValue('legalDescription')} onChange={(event) => updateTransactionForm(selectedProposal, 'legalDescription', event.target.value)} placeholder="Descrição jurídica do imóvel conforme matrícula." className="min-h-[88px] resize-y bg-white text-[13px] dark:bg-slate-950" />
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <h4 className="text-sm font-semibold text-slate-950 dark:text-slate-50">Serviços e Concessionárias</h4>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => {
                              const currentCount = Number(getTransactionFormValue('additionalUtilitiesCount', '0')) || 0;
                              updateTransactionForm(selectedProposal, 'additionalUtilitiesCount', String(currentCount + 1));
                            }}
                          >
                            <Plus className="mr-2 h-3.5 w-3.5" />
                            incluir nova
                          </Button>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-4">
                          <TransactionField label="Empreendimento" value={getTransactionFormValue('development')} onChange={(value) => updateTransactionForm(selectedProposal, 'development', value)} placeholder="Nome do empreendimento" className="sm:col-span-2" />
                          <TransactionField label="Adm. Condomínio" value={getTransactionFormValue('condoAdmin')} onChange={(value) => updateTransactionForm(selectedProposal, 'condoAdmin', value)} placeholder="Administradora" className="sm:col-span-2" />
                          <TransactionField label="RIP" value={getTransactionFormValue('rip')} onChange={(value) => updateTransactionForm(selectedProposal, 'rip', value)} placeholder="RIP" />
                          <TransactionField label="Água" value={getTransactionFormValue('waterUtility')} onChange={(value) => updateTransactionForm(selectedProposal, 'waterUtility', value)} placeholder="Concessionária" />
                          <TransactionField label="Energia Elétrica" value={getTransactionFormValue('electricUtility')} onChange={(value) => updateTransactionForm(selectedProposal, 'electricUtility', value)} placeholder="Concessionária" />
                          <TransactionField label="Gás" value={getTransactionFormValue('gasUtility')} onChange={(value) => updateTransactionForm(selectedProposal, 'gasUtility', value)} placeholder="Concessionária" />
                          {Array.from({ length: Number(getTransactionFormValue('additionalUtilitiesCount', '0')) || 0 }).map((_, index) => (
                            <TransactionField
                              key={`additional-utility-${index}`}
                              label={`Concessionária ${index + 1}`}
                              value={getTransactionFormValue(`additionalUtility.${index}`)}
                              onChange={(value) => updateTransactionForm(selectedProposal, `additionalUtility.${index}`, value)}
                              placeholder="Serviço ou concessionária"
                            />
                          ))}
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                        <h4 className="mb-4 text-sm font-semibold text-slate-950 dark:text-slate-50">Dados Comerciais</h4>
                        <div className="grid gap-3 sm:grid-cols-6">
                          <TransactionField label="Tipologia" value={getTransactionFormValue('typology')} onChange={(value) => updateTransactionForm(selectedProposal, 'typology', value)} placeholder="Casa, terreno, apto..." className="sm:col-span-2" />
                          <TransactionField label="Área Útil" value={getTransactionFormValue('usableArea')} onChange={(value) => updateTransactionForm(selectedProposal, 'usableArea', value)} placeholder="m²" />
                          <TransactionField label="Área Total" value={getTransactionFormValue('totalArea')} onChange={(value) => updateTransactionForm(selectedProposal, 'totalArea', value)} placeholder="m²" />
                          <TransactionField label="Qtd. Quartos" value={getTransactionFormValue('bedrooms')} onChange={(value) => updateTransactionForm(selectedProposal, 'bedrooms', value)} type="number" />
                          <TransactionField label="Qtd. Banheiros" value={getTransactionFormValue('bathrooms')} onChange={(value) => updateTransactionForm(selectedProposal, 'bathrooms', value)} type="number" />
                          <TransactionField label="Qtd. Vagas" value={getTransactionFormValue('parkingSpaces')} onChange={(value) => updateTransactionForm(selectedProposal, 'parkingSpaces', value)} type="number" />
                          <TransactionField label="Ano Construção" value={getTransactionFormValue('constructionYear')} onChange={(value) => updateTransactionForm(selectedProposal, 'constructionYear', value)} type="number" />
                          <TransactionField label="IPTU anual" value={getTransactionFormValue('annualIptu')} onChange={(value) => updateTransactionForm(selectedProposal, 'annualIptu', value)} placeholder="R$" />
                          <TransactionField label="Condomínio Mensal" value={getTransactionFormValue('monthlyCondo')} onChange={(value) => updateTransactionForm(selectedProposal, 'monthlyCondo', value)} placeholder="R$" />
                          <div className="sm:col-span-2">
                            <SegmentedChoice label="Uso Predominante" options={['Residencial', 'Comercial']} selected={getTransactionFormValue('predominantUse', 'Residencial')} onChange={(value) => updateTransactionForm(selectedProposal, 'predominantUse', value)} />
                          </div>
                          <SegmentedChoice label="Público" options={['Sim', 'Não']} selected={getTransactionFormValue('isPublic', 'Não')} onChange={(value) => updateTransactionForm(selectedProposal, 'isPublic', value)} />
                          <SegmentedChoice label="Tem Placa" options={['Sim', 'Não']} selected={getTransactionFormValue('hasSign', 'Não')} onChange={(value) => updateTransactionForm(selectedProposal, 'hasSign', value)} />
                          <SegmentedChoice label="Exclusivo" options={['Sim', 'Não']} selected={getTransactionFormValue('isExclusive', 'Não')} onChange={(value) => updateTransactionForm(selectedProposal, 'isExclusive', value)} />
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                        <h4 className="mb-4 text-sm font-semibold text-slate-950 dark:text-slate-50">Propriedade atual</h4>
                        <div className="grid gap-2">
                          {PROPERTY_STATUS_OPTIONS.map((option, index) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => updateTransactionForm(selectedProposal, 'propertyStatus', option)}
                              className={cn(
                                'rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors',
                                getTransactionFormValue('propertyStatus', PROPERTY_STATUS_OPTIONS[2]) === option
                                  ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200'
                                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900',
                              )}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                          <h4 className="text-sm font-semibold text-slate-950 dark:text-slate-50">Valor e Forma de Pagamento</h4>
                          <div className="grid w-full max-w-sm grid-cols-2 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                            <button
                              type="button"
                              onClick={() => updateTransactionForm(selectedProposal, 'fiduciaryAlienation', 'Sem alienação fiduciária')}
                              className={cn(
                                'h-9 px-3 text-[12px] font-semibold',
                                getTransactionFormValue('fiduciaryAlienation', 'Sem alienação fiduciária') === 'Sem alienação fiduciária'
                                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                                  : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900',
                              )}
                            >
                              Sem alienação fiduciária
                            </button>
                            <button
                              type="button"
                              onClick={() => updateTransactionForm(selectedProposal, 'fiduciaryAlienation', 'Com alienação fiduciária')}
                              className={cn(
                                'h-9 border-l border-slate-200 px-3 text-[12px] font-semibold dark:border-slate-800',
                                getTransactionFormValue('fiduciaryAlienation', 'Sem alienação fiduciária') === 'Com alienação fiduciária'
                                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                                  : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900',
                              )}
                            >
                              Com alienação fiduciária
                            </button>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-4">
                          <TransactionField label="Valor da Transação" value={selectedDetail.pagamento.valor} onChange={(value) => updatePayment(selectedProposal, { valor: value })} />
                          <TransactionField label="Comissão R$" value={getTransactionFormValue('commissionAmount', formatCurrencyWithCents(selectedCommission))} onChange={(value) => updateTransactionForm(selectedProposal, 'commissionAmount', value)} />
                          <TransactionField label="Comissão %" value={getTransactionFormValue('commissionPercent', '5,5%')} onChange={(value) => updateTransactionForm(selectedProposal, 'commissionPercent', value)} />
                          <TransactionField label="Forma de pagamento" value={selectedDetail.pagamento.formaPagamento} onChange={(value) => updatePayment(selectedProposal, { formaPagamento: value })} />
                        </div>

                        <div className="mt-5 space-y-3">
                          <div>
                            <h5 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Composição do Preço</h5>
                            <p className="text-[12px] text-slate-500 dark:text-slate-400">Informe valores e detalhes, e adicione clicando no sinal.</p>
                          </div>
                          {PRICE_COMPOSITION_ITEMS.map((item, index) => (
                            <PriceCompositionRow
                              key={item}
                              label={item}
                              value={getTransactionFormValue(`priceComposition.${index}.value`, index === 0 ? selectedDetail.pagamento.sinalArras : '')}
                              detail={getTransactionFormValue(`priceComposition.${index}.detail`)}
                              onValueChange={(value) => {
                                updateTransactionForm(selectedProposal, `priceComposition.${index}.value`, value);
                                if (index === 0) updatePayment(selectedProposal, { sinalArras: value });
                              }}
                              onDetailChange={(value) => updateTransactionForm(selectedProposal, `priceComposition.${index}.detail`, value)}
                            />
                          ))}
                          <div className="grid gap-3 rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-950 sm:grid-cols-2">
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-semibold text-slate-600 dark:text-slate-300">Subtotal</span>
                              <span className="font-bold text-slate-950 dark:text-slate-50">{formatCurrencyWithCents(selectedProposal.valor)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-semibold text-slate-600 dark:text-slate-300">Saldo</span>
                              <span className="font-bold text-emerald-700 dark:text-emerald-300">Tudo certo!</span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-1.5">
                          <label className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Condições específicas</label>
                          <Textarea
                            value={selectedDetail.pagamento.condicoesEspecificas}
                            onChange={(event) => updatePayment(selectedProposal, { condicoesEspecificas: event.target.value })}
                            placeholder="Detalhes da negociação, prazos, inclusões, mobília, taxas, comissão, contraproposta..."
                            className="min-h-[96px] resize-y bg-white text-[13px] dark:bg-slate-950"
                          />
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                        <h4 className="mb-4 text-sm font-semibold text-slate-950 dark:text-slate-50">Em qual cartório será lavrada a Escritura Pública?</h4>
                        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_220px]">
                          <button
                            type="button"
                            onClick={() => updateTransactionForm(selectedProposal, 'notaryDefinition', 'definido')}
                            className={cn(
                              'rounded-lg border px-3 py-3 text-left text-sm font-semibold',
                              getTransactionFormValue('notaryDefinition', 'definido') === 'definido'
                                ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200'
                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900',
                            )}
                          >
                            Já há definição do Cartório de Notas que se pretende usar
                          </button>
                          <button
                            type="button"
                            onClick={() => updateTransactionForm(selectedProposal, 'notaryDefinition', 'indefinido')}
                            className={cn(
                              'rounded-lg border px-3 py-3 text-left text-sm font-semibold',
                              getTransactionFormValue('notaryDefinition', 'definido') === 'indefinido'
                                ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200'
                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900',
                            )}
                          >
                            Ainda não há definição do Cartório de Notas
                          </button>
                          <TransactionField label="Cartório de Notas" value={getTransactionFormValue('notaryOffice')} onChange={(value) => updateTransactionForm(selectedProposal, 'notaryOffice', value)} placeholder="Nome do cartório" />
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                        <h4 className="mb-4 text-sm font-semibold text-slate-950 dark:text-slate-50">Anexo da formalização da Proposta de Compra</h4>
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                          <div className="space-y-3">
                            <SegmentedChoice label="Este negócio nasceu de uma Proposta que foi conduzida dentro do PipeImob?" options={['Não', 'Sim']} selected={getTransactionFormValue('cameFromPipeImob', 'Não')} onChange={(value) => updateTransactionForm(selectedProposal, 'cameFromPipeImob', value)} />
                            {getTransactionFormValue('cameFromPipeImob', 'Não') === 'Sim' && (
                              <TransactionField
                                label="Código da proposta PipeImob"
                                value={getTransactionFormValue('pipeImobProposalRef')}
                                onChange={(value) => updateTransactionForm(selectedProposal, 'pipeImobProposalRef', value)}
                                placeholder="Ex.: PRP-000123"
                              />
                            )}
                          </div>
                          <label className="flex min-h-[112px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center transition-colors hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-blue-900 dark:hover:bg-blue-950/20">
                            <FileUp className="h-7 w-7 text-slate-400" />
                            <span className="mt-2 text-[12px] font-semibold text-slate-700 dark:text-slate-200">Clique para anexar outros documentos da Proposta</span>
                            <span className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{getTransactionFormValue('proposalAttachmentNames') || 'máximo 10Mb'}</span>
                            <input type="file" multiple className="sr-only" onChange={handleProposalAttachments} />
                          </label>
                        </div>
                      </div>
                    </div>
                  </DetailSection>
                  )}

                  {activeTransactionFormSection === 'Vendedores' && (
                    <DetailSection
                      title="Vendedores"
                      icon={Users}
                      action={
                        <Button type="button" size="sm" onClick={() => addParty(selectedProposal, 'vendedores')}>
                          <Plus className="mr-2 h-3.5 w-3.5" />
                          Cadastrar vendedor
                        </Button>
                      }
                    >
                      <div className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-3">
                          <InfoTile label="Vendedor com cadastro completo" value={ownerValidationIssues.length === 0 && selectedDetail.vendedores.length > 0 ? 'Sim' : 'Pendente'} icon={CheckCircle2} />
                          <InfoTile label="Mídia de origem dos Vendedores" value={sellerMediaOrigin} icon={Filter} />
                          <InfoTile label="Vendedores cadastrados" value={selectedDetail.vendedores.length || 'Nenhum'} icon={Users} />
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setShowSellerParticipations((current) => !current)}>
                            Ver participações %
                          </Button>
                          {['Mídia de Origem', 'Indicação', 'Portal', 'Carteira', 'Outro'].map((item) => (
                            <button
                              key={item}
                              type="button"
                              onClick={() => updateTransactionForm(selectedProposal, 'sellerMediaOrigin', item)}
                              className={cn(
                                'h-8 rounded-md border px-3 text-[12px] font-semibold transition-colors',
                                sellerMediaOrigin === item
                                  ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200'
                                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900',
                              )}
                            >
                              {item}
                            </button>
                          ))}
                        </div>

                        <div className="space-y-3">
                          {selectedDetail.vendedores.length === 0 && (
                            <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                              Nenhum vendedor cadastrado ainda.
                              <div className="mt-3">
                                <Button type="button" variant="outline" size="sm" onClick={() => addParty(selectedProposal, 'vendedores')}>
                                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                                  Cadastrar vendedor
                                </Button>
                                <span className="mx-3 text-xs text-slate-400">ou</span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openLinkLeadDialog({ mode: 'detail', proposalId: selectedProposal.id, group: 'vendedores' })}
                                >
                                  <Link className="mr-1.5 h-3.5 w-3.5" />
                                  Vincular cadastro existente
                                </Button>
                              </div>
                            </div>
                          )}

                          {selectedDetail.vendedores.map((party, index) => (
                            <div key={party.id} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">{party.nomeCompleto || `Vendedor ${index + 1}`}</p>
                                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">PF</p>
                                </div>
                                <Badge variant={getPartyMissingFields(party).length === 0 ? 'default' : 'secondary'}>
                                  {getPartyMissingFields(party).length === 0 ? 'Cadastro completo' : 'Cadastro pendente'}
                                </Badge>
                              </div>
                              {showSellerParticipations && (
                                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                                  <TransactionField label="Participação" value={getTransactionFormValue(`seller.${party.id}.participation`, `${Math.round(100 / Math.max(selectedDetail.vendedores.length, 1))}%`)} onChange={(value) => updateTransactionForm(selectedProposal, `seller.${party.id}.participation`, value)} />
                                  <TransactionField label="Mídia de Origem" value={getTransactionFormValue(`seller.${party.id}.mediaOrigin`, sellerMediaOrigin)} onChange={(value) => updateTransactionForm(selectedProposal, `seller.${party.id}.mediaOrigin`, value)} />
                                  <TransactionField label="Tipo" value={getTransactionFormValue(`seller.${party.id}.personType`, 'PF')} onChange={(value) => updateTransactionForm(selectedProposal, `seller.${party.id}.personType`, value)} />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </DetailSection>
                  )}

                  {activeTransactionFormSection === 'Compradores' && (
                    <DetailSection
                      title="Compradores"
                      icon={UserPlus}
                      action={
                        <Button type="button" size="sm" onClick={() => addParty(selectedProposal, 'compradores')}>
                          <Plus className="mr-2 h-3.5 w-3.5" />
                          Cadastrar comprador
                        </Button>
                      }
                    >
                      <div className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-3">
                          <InfoTile label="Comprador com cadastro completo" value={buyerValidationIssues.length === 0 && selectedDetail.compradores.length > 0 ? 'Sim' : 'Pendente'} icon={CheckCircle2} />
                          <InfoTile label="Mídia de origem dos Compradores" value={buyerMediaOrigin} icon={Filter} />
                          <InfoTile label="Compradores cadastrados" value={selectedDetail.compradores.length || 'Nenhum'} icon={Users} />
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setShowBuyerParticipations((current) => !current)}>
                            Ver participações %
                          </Button>
                          {['Mídia de Origem', 'Indicação', 'Portal', 'Carteira', 'Outro'].map((item) => (
                            <button
                              key={item}
                              type="button"
                              onClick={() => updateTransactionForm(selectedProposal, 'buyerMediaOrigin', item)}
                              className={cn(
                                'h-8 rounded-md border px-3 text-[12px] font-semibold transition-colors',
                                buyerMediaOrigin === item
                                  ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200'
                                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900',
                              )}
                            >
                              {item}
                            </button>
                          ))}
                        </div>

                        <div className="space-y-3">
                          {selectedDetail.compradores.length === 0 && (
                            <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                              Nenhum comprador cadastrado ainda.
                              <div className="mt-3">
                                <Button type="button" variant="outline" size="sm" onClick={() => addParty(selectedProposal, 'compradores')}>
                                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                                  Cadastrar comprador
                                </Button>
                                <span className="mx-3 text-xs text-slate-400">ou</span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openLinkLeadDialog({ mode: 'detail', proposalId: selectedProposal.id, group: 'compradores' })}
                                >
                                  <Link className="mr-1.5 h-3.5 w-3.5" />
                                  Vincular cadastro existente
                                </Button>
                              </div>
                            </div>
                          )}

                          {selectedDetail.compradores.map((party, index) => (
                            <div key={party.id} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">{party.nomeCompleto || `Comprador ${index + 1}`}</p>
                                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">PF</p>
                                </div>
                                <Badge variant={getPartyMissingFields(party).length === 0 ? 'default' : 'secondary'}>
                                  {getPartyMissingFields(party).length === 0 ? 'Cadastro completo' : 'Cadastro pendente'}
                                </Badge>
                              </div>
                              {showBuyerParticipations && (
                                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                                  <TransactionField label="Participação" value={getTransactionFormValue(`buyer.${party.id}.participation`, `${Math.round(100 / Math.max(selectedDetail.compradores.length, 1))}%`)} onChange={(value) => updateTransactionForm(selectedProposal, `buyer.${party.id}.participation`, value)} />
                                  <TransactionField label="Mídia de Origem" value={getTransactionFormValue(`buyer.${party.id}.mediaOrigin`, buyerMediaOrigin)} onChange={(value) => updateTransactionForm(selectedProposal, `buyer.${party.id}.mediaOrigin`, value)} />
                                  <TransactionField label="Tipo" value={getTransactionFormValue(`buyer.${party.id}.personType`, 'PF')} onChange={(value) => updateTransactionForm(selectedProposal, `buyer.${party.id}.personType`, value)} />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </DetailSection>
                  )}

                  {activeTransactionFormSection === 'Negociações' && (
                    <DetailSection title="Negociações" icon={MessageCircle}>
                      <div className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-4">
                          <InfoTile label="Incluso no preço" value="A conferir" />
                          <InfoTile label="Ocupação atual" value="A informar" />
                          <InfoTile label="Entrega das chaves" value="A combinar" />
                          <InfoTile label="Débitos" value="A verificar" />
                        </div>
                        <div className="grid gap-4 lg:grid-cols-2">
                          <div className="grid gap-1.5">
                            <label className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">O que está incluso no preço?</label>
                            <Textarea value={getTransactionFormValue('includedInPrice')} onChange={(event) => updateTransactionForm(selectedProposal, 'includedInPrice', event.target.value)} placeholder="Mobília, planejados, eletros, benfeitorias ou exclusões negociadas." className="min-h-[100px] bg-white text-[13px] dark:bg-slate-950" />
                          </div>
                          <div className="grid gap-1.5">
                            <label className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Ocupação e Entrega da Posse</label>
                            <Textarea value={getTransactionFormValue('occupancyAndPossession')} onChange={(event) => updateTransactionForm(selectedProposal, 'occupancyAndPossession', event.target.value)} placeholder="Imóvel ocupado, desocupado, locado, prazo de desocupação e entrega das chaves." className="min-h-[100px] bg-white text-[13px] dark:bg-slate-950" />
                          </div>
                          <div className="grid gap-1.5">
                            <label className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Débitos sobre o imóvel</label>
                            <Textarea value={getTransactionFormValue('propertyDebts')} onChange={(event) => updateTransactionForm(selectedProposal, 'propertyDebts', event.target.value)} placeholder="IPTU, condomínio, água, energia, gás, financiamento, alienação ou outros débitos." className="min-h-[100px] bg-white text-[13px] dark:bg-slate-950" />
                          </div>
                          <div className="space-y-3">
                            <SegmentedChoice label="O imóvel pertence a algum condomínio?" options={['Sim', 'Não']} selected={getTransactionFormValue('belongsToCondo', 'Não')} onChange={(value) => updateTransactionForm(selectedProposal, 'belongsToCondo', value)} />
                            <div className="grid gap-1.5">
                              <label className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Alguma outra observação/especificidade negociada relevante?</label>
                              <Textarea value={selectedDetail.pagamento.condicoesEspecificas} onChange={(event) => updatePayment(selectedProposal, { condicoesEspecificas: event.target.value })} placeholder="Observações relevantes da negociação." className="min-h-[100px] bg-white text-[13px] dark:bg-slate-950" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </DetailSection>
                  )}

                  {activeTransactionFormSection === 'Comissões' && (
                    <DetailSection title="Comissões" icon={WalletCards}>
                      <div className="space-y-5">
                        <div className="grid gap-3 md:grid-cols-4">
                          <InfoTile label="Quem paga comissão" value={commissionPayer} />
                          <InfoTile label="Quando paga comissão" value={commissionMoment} />
                          <InfoTile label="Comissionados" value={commissionedPeople.length} />
                          <InfoTile label="Participações dos Comissionados" value={showCommissionPercent ? 'Visível' : 'Oculta'} />
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                          <div className="space-y-3">
                            <span className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Quem pagará a comissão?</span>
                            <div className="flex flex-wrap gap-2">
                              {COMMISSION_PAYERS.map((item) => (
                                <Button key={item} type="button" variant={commissionPayer === item ? 'default' : 'outline'} size="sm" onClick={() => updateTransactionForm(selectedProposal, 'commissionPayer', item)}>
                                  {item}
                                </Button>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-3">
                            <span className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Quando será paga a comissão?</span>
                            <div className="flex flex-wrap gap-2">
                              {COMMISSION_MOMENTS.map((item) => (
                                <Button key={item} type="button" variant={commissionMoment === item ? 'default' : 'outline'} size="sm" onClick={() => updateTransactionForm(selectedProposal, 'commissionMoment', item)}>
                                  {item}
                                </Button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-semibold text-slate-950 dark:text-slate-50">Estrutura de Comissionados</h4>
                              <p className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">comissão total {formatCurrencyWithCents(selectedCommission)}</p>
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={() => setShowCommissionPercent((current) => !current)}>
                              ver %
                            </Button>
                          </div>

                          <div className="mb-4 flex flex-wrap gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => addCommissionedPerson(selectedProposal, 'Usuário PipeImob da agência')}>
                              incluir comissionado da base da Agência
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => addCommissionedPerson(selectedProposal, 'Parceiro externo')}>
                              incluir parceiro externo
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => addCommissionedPerson(selectedProposal, 'Usuário PipeImob externo')}>
                              incluir imobiliária/corretor externo
                            </Button>
                          </div>

                          <div className="mb-4 flex flex-wrap gap-2">
                            {COMMISSION_ROLES.map((item) => (
                              <Button key={item} type="button" variant={commissionRole === item ? 'default' : 'outline'} size="sm" onClick={() => updateTransactionForm(selectedProposal, 'commissionRole', item)}>
                                {item}
                              </Button>
                            ))}
                          </div>

                          <div className="space-y-3">
                            {commissionedPeople.map((label, index) => (
                              <div key={`${label}-${index}`} className="grid gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-950 md:grid-cols-[minmax(0,1.4fr)_150px_120px_120px_120px]">
                                <TransactionField label="Nome Completo" value={getTransactionFormValue(`commissioned.${index}.name`, index === 0 ? selectedProposal.corretor || label : label)} onChange={(value) => updateTransactionForm(selectedProposal, `commissioned.${index}.name`, value)} />
                                <TransactionField label="CPF/CNPJ" value={getTransactionFormValue(`commissioned.${index}.document`)} onChange={(value) => updateTransactionForm(selectedProposal, `commissioned.${index}.document`, value)} placeholder="Documento" />
                                <TransactionField label="CRECI" value={getTransactionFormValue(`commissioned.${index}.creci`)} onChange={(value) => updateTransactionForm(selectedProposal, `commissioned.${index}.creci`, value)} placeholder="CRECI" />
                                <TransactionField label="Comissão" value={getTransactionFormValue(`commissioned.${index}.commission`, index === 0 ? formatCurrencyWithCents(selectedCommission) : '')} onChange={(value) => updateTransactionForm(selectedProposal, `commissioned.${index}.commission`, value)} />
                                {showCommissionPercent ? <TransactionField label="Participação" value={getTransactionFormValue(`commissioned.${index}.participation`, index === 0 ? '100%' : '0%')} onChange={(value) => updateTransactionForm(selectedProposal, `commissioned.${index}.participation`, value)} /> : <InfoTile label="Participação" value="Oculta" />}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="grid gap-1.5">
                          <label className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Detalhes sobre o pagamento da comissão</label>
                          <Textarea value={getTransactionFormValue('commissionPaymentDetails')} onChange={(event) => updateTransactionForm(selectedProposal, 'commissionPaymentDetails', event.target.value)} placeholder="Condições, divisão, datas, responsáveis e observações sobre comissão." className="min-h-[96px] bg-white text-[13px] dark:bg-slate-950" />
                        </div>
                        <SegmentedChoice label="Há bonificações que não constarão ao contrato?" options={['Sim', 'Não']} selected={getTransactionFormValue('hasOffContractBonuses', 'Não')} onChange={(value) => updateTransactionForm(selectedProposal, 'hasOffContractBonuses', value)} />
                      </div>
                    </DetailSection>
                  )}

                  {activeTransactionFormSection === 'Parceiros' && (
                    <DetailSection title="Parceiros" icon={Users}>
                      <div className="grid gap-3 md:grid-cols-2">
                        <TransactionField label="Parceiro externo" value={getTransactionFormValue('externalPartner')} onChange={(value) => updateTransactionForm(selectedProposal, 'externalPartner', value)} placeholder="Corretor, imobiliária ou parceiro homologado" />
                        <TransactionField label="Contato" value={getTransactionFormValue('externalPartnerContact')} onChange={(value) => updateTransactionForm(selectedProposal, 'externalPartnerContact', value)} placeholder="Telefone ou email" />
                        <Textarea value={getTransactionFormValue('externalPartnerNotes')} onChange={(event) => updateTransactionForm(selectedProposal, 'externalPartnerNotes', event.target.value)} placeholder="Observações sobre participação de parceiros externos." className="min-h-[96px] bg-white text-[13px] dark:bg-slate-950 md:col-span-2" />
                      </div>
                    </DetailSection>
                  )}
                </TabsContent>

                <TabsContent value="documentos" className="mt-0">
                  <DetailSection title="Documentos" icon={FileText}>
                    <SimpleChecklist items={DOCUMENT_CHECKLIST} completedCount={selectedDetail.enviadoProponente ? 3 : 1} />
                  </DetailSection>
                </TabsContent>

                <TabsContent value="certidoes" className="mt-0">
                  <DetailSection title="Certidões" icon={ShieldCheck}>
                    <SimpleChecklist items={CERTIFICATE_CHECKLIST} completedCount={selectedProposal.stageId === 'proposta-assinada' ? 4 : 1} />
                  </DetailSection>
                </TabsContent>

                <TabsContent value="participantes" className="mt-0 space-y-4">
                  <DetailSection
                    title="Proponentes (Compradores)"
                    icon={Users}
                    action={
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => openLinkLeadDialog({ mode: 'detail', proposalId: selectedProposal.id, group: 'compradores' })}>
                          <Link className="mr-2 h-3.5 w-3.5" />
                          Vincular cadastro
                        </Button>
                        <Button type="button" size="sm" onClick={() => addParty(selectedProposal, 'compradores')}>
                          <Plus className="mr-2 h-3.5 w-3.5" />
                          Adicionar proponente
                        </Button>
                      </div>
                    }
                  >
                    <div className="space-y-3">
                      {selectedDetail.compradores.length === 0 && (
                        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                          <Users className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                          <span>Ainda não há proponentes cadastrados.</span>
                          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                            <Button type="button" variant="outline" size="sm" onClick={() => addParty(selectedProposal, 'compradores')}>
                              <Plus className="mr-1.5 h-3.5 w-3.5" />
                              Adicionar manualmente
                            </Button>
                            <Button type="button" size="sm" onClick={() => openLinkLeadDialog({ mode: 'detail', proposalId: selectedProposal.id, group: 'compradores' })}>
                              <Link className="mr-1.5 h-3.5 w-3.5" />
                              Vincular do CRM
                            </Button>
                          </div>
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
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => openLinkLeadDialog({ mode: 'detail', proposalId: selectedProposal.id, group: 'vendedores' })}>
                          <Link className="mr-2 h-3.5 w-3.5" />
                          Vincular cadastro
                        </Button>
                        <Button type="button" size="sm" onClick={() => addParty(selectedProposal, 'vendedores')}>
                          <Plus className="mr-2 h-3.5 w-3.5" />
                          Adicionar proprietário
                        </Button>
                      </div>
                    }
                  >
                    <div className="space-y-3">
                      {selectedDetail.vendedores.length === 0 && (
                        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                          <Building2 className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                          <span>Ainda não há proprietários cadastrados.</span>
                          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                            <Button type="button" variant="outline" size="sm" onClick={() => addParty(selectedProposal, 'vendedores')}>
                              <Plus className="mr-1.5 h-3.5 w-3.5" />
                              Adicionar manualmente
                            </Button>
                            <Button type="button" size="sm" onClick={() => openLinkLeadDialog({ mode: 'detail', proposalId: selectedProposal.id, group: 'vendedores' })}>
                              <Link className="mr-1.5 h-3.5 w-3.5" />
                              Vincular do CRM
                            </Button>
                          </div>
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
                </TabsContent>

                <TabsContent value="historico" className="mt-0">
                  <DetailSection title="Histórico" icon={History}>
                    <div className="space-y-3">
                      {selectedDetail.historico.map((item) => (
                        <div key={item.id} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                          <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">{item.label}</p>
                          <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">{item.detail}</p>
                          <p className="mt-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">{formatDateTime(item.date)}</p>
                        </div>
                      ))}
                    </div>
                  </DetailSection>
                </TabsContent>

                <TabsContent value="ccv" className="mt-0">
                  <DetailSection title="CCV Conjurer" icon={FileSignature}>
                    <div className="grid gap-3 md:grid-cols-3">
                      <Button type="button" variant="outline" onClick={generateCcvDraft}>
                        <FileSignature className="mr-2 h-4 w-4" />
                        Gerar CCV
                      </Button>
                      <Button type="button" variant="outline" onClick={sendCcvToSignature}>
                        <Send className="mr-2 h-4 w-4" />
                        Enviar CCV
                      </Button>
                      <Button type="button" variant="outline" onClick={markCcvSigned}>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Marcar assinado
                      </Button>
                    </div>
                  </DetailSection>
                </TabsContent>

                <TabsContent value="escriturar" className="mt-0 space-y-4">
                  <DetailSection title="Escriturar" icon={Landmark}>
                    <div className="grid gap-3">
                      {dealWorkflowGroups.slice(1).map((group) => (
                        <WorkflowChecklist
                          key={group.id}
                          group={group}
                          activeItemId={activeDealSubstageId}
                          pendingItemId={pendingWorkflowItemId}
                          currentStageId={selectedProposal.stageId}
                          onSelectItem={(itemId) => setPendingWorkflowItemId(itemId || null)}
                          onActivateItem={(item) => activateDealSubstage(selectedProposal, group, item)}
                        />
                      ))}
                    </div>
                  </DetailSection>
                </TabsContent>

                <TabsContent value="convidar" className="mt-0">
                  <DetailSection title="Convidar" icon={UserPlus}>
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                      <div className="grid gap-3">
                        <InfoTile label="Link de convite" value={selectedInviteLink} icon={Link} />
                        <InfoTile label="Código de acesso" value={selectedInviteCode} icon={Copy} />
                      </div>
                      <div className="grid gap-2">
                        <Button type="button" variant="outline" onClick={() => void copyInviteLink()}>
                          <Copy className="mr-2 h-4 w-4" />
                          Copiar link
                        </Button>
                        <Button type="button" variant="outline" onClick={() => void copyInviteCode()}>
                          <ClipboardCheck className="mr-2 h-4 w-4" />
                          Copiar código
                        </Button>
                        <Button type="button" variant="outline" onClick={sendInviteByEmail}>
                          <Mail className="mr-2 h-4 w-4" />
                          Enviar por email
                        </Button>
                        <Button type="button" variant="outline" onClick={sendInviteByWhatsapp}>
                          <MessageCircle className="mr-2 h-4 w-4" />
                          Enviar por WhatsApp
                        </Button>
                      </div>
                    </div>
                  </DetailSection>
                </TabsContent>

                <TabsContent value="agenda" className="mt-0">
                  <DetailSection title="Agenda" icon={CalendarPlus}>
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_120px_auto]">
                      <Input value={agendaDraft.title} onChange={(event) => setAgendaDraft((previous) => ({ ...previous, title: event.target.value }))} placeholder="Evento programado" className="h-9 text-[13px]" />
                      <Input type="date" value={agendaDraft.date} onChange={(event) => setAgendaDraft((previous) => ({ ...previous, date: event.target.value }))} className="h-9 text-[13px]" />
                      <Input type="time" value={agendaDraft.time} onChange={(event) => setAgendaDraft((previous) => ({ ...previous, time: event.target.value }))} className="h-9 text-[13px]" />
                      <Button type="button" onClick={addAgendaEvent} className="h-9 bg-blue-600 text-white hover:bg-blue-700">
                        <CalendarPlus className="mr-2 h-4 w-4" />
                        Adicionar
                      </Button>
                    </div>
                  </DetailSection>
                </TabsContent>

                <TabsContent value="solicitacao" className="mt-0 space-y-4">
                  <DetailSection title="Nova solicitação" icon={ClipboardCheck}>
                    <div className="grid gap-3 md:grid-cols-4">
                      <Select value={requestDraft.hasProperty} onValueChange={(value) => setRequestDraft((previous) => ({ ...previous, hasProperty: value }))}>
                        <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="Tem imóvel?" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sim">Tem a ver com um imóvel</SelectItem>
                          <SelectItem value="nao">Não tem imóvel</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input value={requestDraft.area} onChange={(event) => setRequestDraft((previous) => ({ ...previous, area: event.target.value }))} placeholder="Área específica" className="h-9 text-[13px]" />
                      <Input value={requestDraft.keyword} onChange={(event) => setRequestDraft((previous) => ({ ...previous, keyword: event.target.value }))} placeholder="Palavra-chave" className="h-9 text-[13px]" />
                      <Input value={requestDraft.property} onChange={(event) => setRequestDraft((previous) => ({ ...previous, property: event.target.value }))} placeholder="Qual o imóvel?" className="h-9 text-[13px]" />
                    </div>
                  </DetailSection>

                  <div className="grid gap-3 md:grid-cols-2">
                    {SERVICE_REQUEST_OPTIONS.map((option) => (
                      <button
                        key={option.title}
                        type="button"
                        onClick={() => createServiceRequest(option.title)}
                        className="rounded-lg border border-slate-200 bg-white p-4 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-900 dark:hover:bg-blue-950/20"
                      >
                        <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">{option.title}</p>
                        <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">{option.deadline}</p>
                        <p className="mt-2 text-[12px] font-semibold text-emerald-700 dark:text-emerald-300">{option.price}</p>
                      </button>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="assinatura" className="mt-0">
                  <DetailSection title="Assinatura eletrônica" icon={FileUp}>
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
                      <label className="flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center transition-colors hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-900 dark:hover:bg-blue-950/20">
                        <FileUp className="h-8 w-8 text-slate-400" />
                        <span className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Enviar documento em PDF</span>
                        <span className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">{signatureDocumentName || 'Nenhum arquivo selecionado'}</span>
                        <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={handleSignatureDocument} />
                      </label>
                      <div className="space-y-3">
                        <Button type="button" className="w-full bg-blue-600 text-white hover:bg-blue-700" onClick={sendSignatureDocument}>
                          <Send className="mr-2 h-4 w-4" />
                          Enviar para assinatura
                        </Button>
                        <Button type="button" variant="outline" className="w-full" onClick={markCcvSigned}>
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Marcar todos como assinados
                        </Button>
                        {[...selectedDetail.compradores, ...selectedDetail.vendedores].map((party) => (
                          <div key={party.id} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                            <div className="flex items-start justify-between gap-3">
                              <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">{party.nomeCompleto || 'Participante sem nome'}</p>
                              <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', signatureStatusClass[party.statusAssinatura])}>
                                {signatureStatusLabel[party.statusAssinatura]}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">{signatureChannelLabel[party.assinaturaPor]}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </DetailSection>
                </TabsContent>
              </Tabs>

              <div className="hidden">
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
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => openLinkLeadDialog({ mode: 'draft', group: 'compradores' })}>
                        <Link className="mr-2 h-3.5 w-3.5" />
                        Vincular CRM
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => addDraftParty('compradores')}>
                        <Plus className="mr-2 h-3.5 w-3.5" />
                        Adicionar proponente
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {draftForm.compradores.length === 0 && (
                      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        <Users className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                        <span>Ainda não há proponentes cadastrados.</span>
                        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                          <Button type="button" variant="outline" size="sm" onClick={() => addDraftParty('compradores')}>
                            <Plus className="mr-1.5 h-3.5 w-3.5" />
                            Adicionar manualmente
                          </Button>
                          <Button type="button" size="sm" onClick={() => openLinkLeadDialog({ mode: 'draft', group: 'compradores' })}>
                            <Link className="mr-1.5 h-3.5 w-3.5" />
                            Vincular do CRM
                          </Button>
                        </div>
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
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => openLinkLeadDialog({ mode: 'draft', group: 'vendedores' })}>
                        <Link className="mr-2 h-3.5 w-3.5" />
                        Vincular CRM
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => addDraftParty('vendedores')}>
                        <Plus className="mr-2 h-3.5 w-3.5" />
                        Adicionar proprietário
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {draftForm.vendedores.length === 0 && (
                      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        <Building2 className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                        <span>Ainda não há proprietários cadastrados.</span>
                        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                          <Button type="button" variant="outline" size="sm" onClick={() => addDraftParty('vendedores')}>
                            <Plus className="mr-1.5 h-3.5 w-3.5" />
                            Adicionar manualmente
                          </Button>
                          <Button type="button" size="sm" onClick={() => openLinkLeadDialog({ mode: 'draft', group: 'vendedores' })}>
                            <Link className="mr-1.5 h-3.5 w-3.5" />
                            Vincular do CRM
                          </Button>
                        </div>
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

      <Dialog open={!!linkLeadTarget} onOpenChange={(open) => !open && setLinkLeadTarget(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Link className="h-4 w-4" />
              Vincular cadastro existente
            </DialogTitle>
            <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
              Selecione um lead do CRM para preencher automaticamente os dados do{' '}
              {linkLeadTarget?.group === 'compradores' ? 'comprador' : 'vendedor'}.
            </p>
          </DialogHeader>

          <div className="border-b border-slate-200 px-6 py-3 dark:border-slate-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={linkLeadSearch}
                onChange={(event) => setLinkLeadSearch(event.target.value)}
                placeholder="Buscar por nome, telefone, email, corretor ou código do imóvel..."
                className="h-9 pl-9 text-[13px]"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-[55vh] overflow-y-auto bg-slate-50 px-6 py-4 dark:bg-slate-950">
            {isLoading && leads.length === 0 ? (
              <div className="flex min-h-[160px] items-center justify-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando cadastros do CRM...
              </div>
            ) : linkLeadCandidates.length === 0 ? (
              <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                <Users className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                {linkLeadSearch
                  ? 'Nenhum cadastro corresponde à busca.'
                  : 'Nenhum lead disponível no CRM para este tenant.'}
              </div>
            ) : (
              <div className="space-y-2">
                {linkLeadCandidates.map((lead) => (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => linkLeadAsParty(lead)}
                    className="flex w-full items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-900 dark:hover:bg-blue-950/20"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
                      {getInitials(lead.name || '?')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                        {lead.name || 'Lead sem nome'}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-slate-500 dark:text-slate-400">
                        {lead.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {lead.phone}
                          </span>
                        )}
                        {lead.email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {lead.email}
                          </span>
                        )}
                        {lead.property_code && (
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="h-3 w-3" /> {lead.property_code}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                        <Badge variant="outline" className="px-1.5 py-0">
                          {lead.lead_type === 2 ? 'Proprietário' : 'Interessado'}
                        </Badge>
                        {lead.status && (
                          <Badge variant="secondary" className="px-1.5 py-0">
                            {lead.status}
                          </Badge>
                        )}
                        {lead.assigned_agent_name && (
                          <span className="text-slate-400">• {lead.assigned_agent_name}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between gap-2 border-t border-slate-200 bg-white px-6 py-3 text-[12px] text-slate-500 dark:border-slate-800 dark:bg-slate-900">
            <span>
              {linkLeadCandidates.length} resultado{linkLeadCandidates.length === 1 ? '' : 's'}
              {linkLeadCandidates.length === 60 ? ' (refine a busca)' : ''}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={() => setLinkLeadTarget(null)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/**
 * 🏠 Formulário de Criação de Imóvel
 * Inspirado no layout do Kenlo, adaptado ao design system OctoDash
 *
 * Três modos: novo (ainda não salvo), rascunho (status `rascunho`, com
 * autosave) e publicado (edição). Rascunho exige só o tipo (gera o código);
 * publicar segue validarPublicacaoImovel.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { useCaptadores } from '@/features/imoveis/hooks/useCaptadores';
import { buscarCep, formatarCepExibicao, validarCep } from '@/services/viaCepService';
import { supabase } from '@/lib/supabaseClient';
import { uploadImoveisFotos } from '@/lib/uploadImoveisFotos';
import { watermarkPhotoUrl } from '@/lib/watermarkUpload';
import { normalizeFotos } from './fotos-helpers';
import { formatCurrency, parseCurrency } from '@/features/imoveis/utils/buildEditDataFromLocal';
import { FotosUploader } from './FotosUploader';
import { PropertyCompleteness } from './PropertyCompleteness';
import { isHttpUrl, normalizeYouTubeUrl } from '@/features/imoveis/utils/mediaUrls';
import { validarPublicacaoImovel } from '@/features/imoveis/utils/validarPublicacaoImovel';
import { formularioAlterado } from '@/features/imoveis/utils/formularioAlterado';
import { STATUS_RASCUNHO, type StatusAprovacaoImovel } from '@/features/imoveis/utils/rascunho';
import { excluirRascunho } from '@/features/imoveis/services/rascunhosService';
import { ProprietarioAutocomplete } from './ProprietarioAutocomplete';
import { ImovelDuplicadoDialog } from './ImovelDuplicadoDialog';
import { ImovelHistorico } from './ImovelHistorico';
import {
  buscarProprietarioDoImovel,
  verificarImovelDuplicado,
  type ImovelDuplicadoMatch,
  type ProprietarioMatch,
} from '@/features/imoveis/services/proprietarioService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  User,
  Building2,
  MapPin,
  LayoutGrid,
  DollarSign,
  Image as ImageIcon,
  FileText,
  ChevronDown,
  ChevronUp,
  Save,
  X,
  Loader2,
  CheckCircle,
  AlertCircle,
  Home,
  Building,
  LandPlot,
  Store,
  Trees,
  HelpCircle,
  Upload,
  Trash2,
  Plus,
  Sofa,
  Dumbbell,
  Wrench,
  Shield,
  Sparkles,
  Lock,
  History,
  KeyRound,
  FilePen
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { sendMessageToAgent } from '@/features/agentes-ia/services/agentWebhookService';
import {
  TIPOS_RESIDENCIAL, TIPOS_COMERCIAL, TIPOS_INDUSTRIAL,
  TIPOS_RURAL, TIPOS_TEMPORADA, TIPOS_CORPORATIVA,
} from '@/lib/tiposImovel';

interface CondominioOption {
  id: string;
  nome: string;
  bairro: string | null;
  cidade: string | null;
  metragens_disponiveis: number[];
}

interface CriarImovelFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: Partial<ImovelFormData> & {
    codigo_imovel?: string;
    status_aprovacao?: StatusAprovacaoImovel;
    exclusivo?: Exclusividade;
    /** Só leitura: "Último salvamento" do rascunho. */
    updated_at?: string | null;
    /** Só leitura: autor do rascunho — é quem recebe a atribuição ao publicar. */
    criado_por?: string | null;
  };
  isEdit?: boolean;
}

/** Linha já gravada em imoveis_locais. `null` no estado = cadastro novo, ainda não salvo. */
interface RegistroSalvo {
  status: StatusAprovacaoImovel;
  atualizadoEm: string | null;
}

interface EstadoAutosave {
  estado: 'ocioso' | 'salvando' | 'salvo' | 'erro';
  em?: string;
  mensagem?: string;
}

const AUTOSAVE_MS = 5000;

/** O update condicional do rascunho não achou a linha: publicada ou excluída em outra tela. */
class RascunhoIndisponivelError extends Error {}

const mensagemDeErro = (err: unknown): string =>
  (err as { message?: string } | null)?.message || '';

const formatarDataHora = (iso: string, padrao = "dd/MM/yyyy 'às' HH:mm"): string => {
  try {
    return format(parseISO(iso), padrao);
  } catch {
    return iso;
  }
};

type Exclusividade = 'sim' | 'nao' | 'indiferente';

/** `exclusivo` no banco: NULL é "Indiferente" (migration 20260914_exclusivo_indiferente). */
const EXCLUSIVO_NO_BANCO: Record<Exclusividade, boolean | null> = {
  sim: true,
  nao: false,
  indiferente: null,
};

interface ImovelFormData {
  // Obrigatório
  codigo_imovel: string;
  exclusivo: Exclusividade;
  
  // Proprietário
  proprietario_nome: string;
  proprietario_tel_residencial: string;
  proprietario_tel_comercial: string;
  proprietario_celular: string;
  proprietario_email: string;
  midia_origem: string;
  envio_atividades: string;
  
  // Estrutura
  finalidade: 'residencial' | 'comercial' | 'industrial' | 'rural' | 'temporada' | 'corporativa' | '';
  tipo: string;
  
  // Localização
  pais: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  /** Nome do condomínio — o que o select exibe. */
  condominio: string;
  /** `imoveis_locais.condominio_id` — é ele que é salvo; o nome é só display. */
  condominio_id: string;
  
  // Características
  area_total: string;
  area_util: string;
  area_terreno: string;
  metragem_m2: string;
  quartos: string;
  suites: string;
  banheiros: string;
  vagas: string;
  salas: string;
  
  // Valores
  valor_venda: string;
  valor_locacao: string;
  valor_condominio: string;
  valor_iptu: string;
  
  // Descrição / Publicação
  titulo: string;
  descricao: string;
  anunciar: 'sim' | 'nao';
  destaque: 'sim' | 'nao';
  super_destaque: 'sim' | 'nao';
  
  // Mídia
  link_video: string;
  tour_virtual: string;
  fotos: import('./FotosUploader').Foto[];
  /** Fotos já vêm com marca d'água própria → o pipeline não aplica a do tenant. */
  sem_marca_dagua: boolean;
  
  // Placas e Faixas
  placa_local: 'sim' | 'nao';
  
  // Comissões e Condições
  tipo_comissao: string;
  /** user_id do captador principal. '' = sem captador (só registros legados). */
  captador_id: string;
  /** user_id do 2º captador (opcional). '' = sem 2º captador. */
  captador_2_id: string;
  captou_pretensao: 'venda_locacao' | 'somente_venda' | 'somente_locacao' | '';
  condicao_comercial: string;
  
  // Confidencial / Documentação
  codigo_iptu: string;
  numero_matricula: string;
  codigo_eletricidade: string;
  codigo_agua: string;
  titulos_direitos: string;
  aprovado_ambiental: string;
  projeto_aprovado: string;
  obs_documentacao: string;
  
  // Características / Amenidades
  caracteristicas: string[];
  aceita_troca: string;

  obs_interna: string;

  // Chaves
  /** '' = não informado. Demais valores: imobiliaria | portaria | proprietario | nao_temos. */
  chave_status: string;
  chave_local: string;
  /** user_id de quem está com a chave. '' = a chave está no lugar dela. */
  chave_com: string;
  /** Só leitura: quem carimba é o trigger tg_imoveis_locais_chave. */
  chave_retirada_em: string;
}

const initialFormData: ImovelFormData = {
  codigo_imovel: '',
  exclusivo: 'nao',
  proprietario_nome: '',
  proprietario_tel_residencial: '',
  proprietario_tel_comercial: '',
  proprietario_celular: '',
  proprietario_email: '',
  midia_origem: '',
  envio_atividades: 'nao_enviar',
  finalidade: '',
  tipo: '',
  pais: 'Brasil',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: 'SP',
  condominio: '',
  condominio_id: '',
  area_total: '',
  area_util: '',
  area_terreno: '',
  metragem_m2: '',
  quartos: '',
  suites: '',
  banheiros: '',
  vagas: '',
  salas: '',
  valor_venda: '',
  valor_locacao: '',
  valor_condominio: '',
  valor_iptu: '',
  titulo: '',
  descricao: '',
  anunciar: 'nao',
  destaque: 'nao',
  super_destaque: 'nao',
  link_video: '',
  tour_virtual: '',
  fotos: [],
  sem_marca_dagua: false,
  placa_local: 'nao',
  tipo_comissao: '',
  captador_id: '',
  captador_2_id: '',
  captou_pretensao: '',
  condicao_comercial: '',
  codigo_iptu: '',
  numero_matricula: '',
  codigo_eletricidade: '',
  codigo_agua: '',
  titulos_direitos: '',
  aprovado_ambiental: '',
  projeto_aprovado: '',
  obs_documentacao: '',
  caracteristicas: [],
  aceita_troca: 'nao',
  obs_interna: '',
  chave_status: '',
  chave_local: '',
  chave_com: '',
  chave_retirada_em: ''
};

const MIDIAS_ORIGEM = [
  'Facebook Ads', 'Facebook', 'Google', 'Instagram', 'E-mail MKT',
  'Evento', 'Folhetos', 'Indicação/Captação/Prospecção/Repescagem',
  'Plantão', 'Recepção', 'Placa/Faixa', 'Site da Imobiliária',
  'WhatsApp', 'Viva Real', 'ZAP', 'OLX', 'Imovel Web',
  'Chaves Na Mão', 'Não Informado / Outros'
];

const TIPOS_COMISSAO = [
  'Captador', 'Indicação', 'Promotor', 'Placa', 'Fotografia',
  'Exclusividade', 'Anúncio', 'Plantão', 'Vistoria'
];

const ESTADOS_BR = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO'
];

// Mapeamento de tipo de imóvel → prefixo (2 caracteres)
const TIPO_PREFIXO_MAP: Record<string, string> = {
  // Residencial
  'Apartamento': 'AP',
  'Apartamento Duplex': 'AP',
  'Apartamento Garden': 'AP',
  'Apartamento Triplex': 'AP',
  'Casa': 'CA',
  'Sobrado': 'CA',
  'Cobertura': 'CO',
  'Flat': 'FL',
  'Kitnet': 'KT',
  'Loft': 'LO',
  'Penthouse': 'PH',
  'Studio': 'ST',
  'Village': 'VL',
  'Terreno': 'TE',
  'Chácara': 'CH',
  'Sítio': 'SI',
  // Comercial
  'Sala Comercial': 'SA',
  'Loja': 'LJ',
  'Galpão': 'GA',
  'Prédio Comercial': 'PC',
  'Ponto Comercial': 'PT',
  'Box/Garagem': 'BX',
  'Terreno Comercial': 'TC',
  // Industrial
  'Galpão Industrial': 'GI',
  'Área Industrial': 'AI',
  'Terreno Industrial': 'TI',
  // Rural
  'Fazenda': 'FA',
  'Rancho': 'RA',
  'Área Rural': 'AR',
  // Temporada
  'Casa de Praia': 'CP',
  'Casa de Campo': 'CC',
  'Apartamento Temporada': 'AT',
  'Flat Temporada': 'FT',
  'Chalé': 'CL',
  'Pousada': 'PO',
  // Corporativa
  'Escritório': 'ES',
  'Sala Corporativa': 'SC',
  'Andar Corporativo': 'AC',
  'Prédio Corporativo': 'PR',
  'Coworking': 'CW',
};

// Características do Imóvel organizadas por categoria
const CARACTERISTICAS_IMOVEL = {
  interno: {
    label: 'Características Internas',
    icon: 'sofa',
    items: [
      'Aceita animais',
      'Aquecimento',
      'Ar-condicionado',
      'Área de serviço',
      'Armário embutido',
      'Armário embutido no quarto',
      'Armário na cozinha',
      'Armário no banheiro',
      'Box blindex',
      'Closet',
      'Conexão à internet',
      'Cozinha americana',
      'Depósito',
      'Escritório',
      'Fogão',
      'Interfone',
      'Lareira',
      'Mobiliado',
      'Quintal',
      'TV a cabo',
      'Varanda',
      'Varanda gourmet'
    ]
  },
  lazer: {
    label: 'Lazer',
    icon: 'dumbbell',
    items: [
      'Academia',
      'Churrasqueira',
      'Cinema',
      'Espaço gourmet',
      'Espaço verde / Parque',
      'Jardim',
      'Piscina',
      'Playground',
      'Quadra de tênis',
      'Quadra poliesportiva',
      'Salão de festas',
      'Salão de jogos',
      'Quadra de Areia',
      'Espaço pet',
      'Pomar',
      'Mirante'
    ]
  },
  servicos: {
    label: 'Serviços e Facilidades',
    icon: 'wrench',
    items: [
      'Acesso para deficientes',
      'Bicicletário',
      'Coworking',
      'Cozinha',
      'Elevador',
      'Garagem',
      'Gerador elétrico',
      'Lavanderia',
      'Recepção',
      'Sauna',
      'Spa'
    ]
  },
  seguranca: {
    label: 'Segurança',
    icon: 'shield',
    items: [
      'Circuito de segurança',
      'Condomínio fechado',
      'Portão eletrônico',
      'Portaria 24h',
      'Sistema de alarme',
      'Vigia'
    ]
  }
};

// Itens da categoria "interno" são comodidades da unidade (área privativa).
// As demais categorias (lazer, serviços, segurança) são da área comum/condomínio.
const ITENS_AREA_PRIVATIVA = new Set(CARACTERISTICAS_IMOVEL.interno.items);

const splitCaracteristicas = (caracteristicas: string[]) => {
  const area_privativa: string[] = [];
  const area_comum: string[] = [];
  for (const item of caracteristicas) {
    if (ITENS_AREA_PRIVATIVA.has(item)) area_privativa.push(item);
    else area_comum.push(item);
  }
  return { area_comum, area_privativa };
};

export const CriarImovelForm = ({
  isOpen,
  onClose,
  onSuccess,
  initialData,
  isEdit = false,
}: CriarImovelFormProps) => {
  const { user, tenantId: authTenantId } = useAuth();
  const tenantId = authTenantId || user?.tenantId;
  const { data: captadores = [] } = useCaptadores(tenantId);
  // Gestor (team_leader) edita tudo que o captador edita, captadores incluídos.
  const isManager = ['admin', 'owner', 'team_leader'].includes(user?.systemRole?.toLowerCase() || '');
  // O captador ATUAL do imóvel também pode alterar os captadores (comparado
  // contra initialData, não formData: a permissão vem do que está salvo).
  // O trigger tg_guard_captador aplica a mesma regra no banco.
  const isCaptadorAtual = Boolean(
    isEdit && user?.id &&
    (initialData?.captador_id === user.id || initialData?.captador_2_id === user.id)
  );
  const podeEditarCaptador = isManager || isCaptadorAtual;

  // O proprietário não vem em initialData: a linha de imoveis_locais chega ao
  // navegador sem proprietario_* (sem SELECT para authenticated). Na edição, a RPC
  // devolve os dados só para quem pode vê-los. Enquanto não for 'permitido', o
  // save omite essas colunas — mandar os campos vazios apagaria o proprietário.
  // Cadastro novo é 'permitido': quem digita é a fonte do dado.
  const [acessoProprietario, setAcessoProprietario] =
    useState<'permitido' | 'carregando' | 'negado' | 'erro'>('permitido');
  const proprietarioLiberado = acessoProprietario === 'permitido';

  const [formData, setFormData] = useState<ImovelFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [submitMessage, setSubmitMessage] = useState('');
  
  // Código gerado automaticamente
  const [codigoGerado, setCodigoGerado] = useState<string>('');
  const [isGeneratingCodigo, setIsGeneratingCodigo] = useState(false);
  const [registro, setRegistro] = useState<RegistroSalvo | null>(null);
  const persistido = registro !== null;
  const modoRascunho = registro?.status === STATUS_RASCUNHO;
  const modoPublicado = persistido && !modoRascunho;

  // Base do "tem alteração não salva?": o que foi carregado ou o último salvamento.
  const [baseline, setBaseline] = useState<ImovelFormData>(initialFormData);
  const [salvandoRascunho, setSalvandoRascunho] = useState(false);
  const [autosave, setAutosave] = useState<EstadoAutosave>({ estado: 'ocioso' });
  // A linha deixou de ser rascunho (publicada/excluída em outra tela): autosave para.
  const [rascunhoIndisponivel, setRascunhoIndisponivel] = useState(false);
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [excluindoRascunho, setExcluindoRascunho] = useState(false);
  // Um save por vez (rascunho, autosave, publicação ou exclusão).
  const salvandoRef = useRef(false);
  // Muda a cada abertura/fechamento: resposta de save que chega depois é descartada.
  const sessaoRef = useRef(0);
  // Snapshot cujo save falhou: o autosave não repete (nem re-sobe fotos) até o usuário mexer.
  const autosaveFalhouRef = useRef<ImovelFormData | null>(null);
  // A publicação já gravou imoveis_locais mas a atribuição falhou: o próximo
  // clique (a linha já é publicada) refaz a atribuição.
  const atribuicaoPendenteRef = useRef(false);

  // Condomínios do banco
  const [condominios, setCondominios] = useState<CondominioOption[]>([]);
  const [isLoadingCondominios, setIsLoadingCondominios] = useState(false);
  const [metragensDisponiveis, setMetragensDisponiveis] = useState<number[]>([]);
  
  // Estados para busca de CEP
  const [isBuscandoCep, setIsBuscandoCep] = useState(false);
  const [cepStatus, setCepStatus] = useState<'idle' | 'success' | 'error' | 'not_found'>('idle');

  // Detecção de imóvel duplicado (mesmo proprietário + características)
  const [duplicadosDetectados, setDuplicadosDetectados] = useState<ImovelDuplicadoMatch[]>([]);
  const [showDuplicadoDialog, setShowDuplicadoDialog] = useState(false);

  // Geração de descrição via agente de IA (webhook n8n)
  const [isGerandoDescricao, setIsGerandoDescricao] = useState(false);
  const [descricaoIaErro, setDescricaoIaErro] = useState<string | null>(null);

  // Buscar condomínios do banco
  useEffect(() => {
    const loadCondominios = async () => {
      if (!tenantId) return;
      setIsLoadingCondominios(true);
      try {
        const { data, error } = await supabase
          .from('condominios')
          .select('id, nome, bairro, cidade, metragens_disponiveis')
          .eq('tenant_id', tenantId)
          .order('nome', { ascending: true });
        
        if (!error && data) {
          setCondominios(data);
        }
      } catch (err) {
        console.error('Erro ao carregar condomínios:', err);
      } finally {
        setIsLoadingCondominios(false);
      }
    };
    
    if (isOpen) {
      loadCondominios();
    }
  }, [tenantId, isOpen]);

  // O initialData da edição traz `condominio_id`; o select é por nome e a lista
  // de condomínios carrega em paralelo. Assim que ela chega, resolve o nome e
  // as metragens do condomínio atual.
  useEffect(() => {
    if (!isOpen || !formData.condominio_id || condominios.length === 0) return;
    const cond = condominios.find(c => c.id === formData.condominio_id);
    if (!cond) return;
    if (formData.condominio !== cond.nome) {
      setFormData(prev => ({ ...prev, condominio: cond.nome }));
      // Nome resolvido pela carga, não pelo usuário: não conta como alteração.
      setBaseline(prev => (prev.condominio_id === cond.id ? { ...prev, condominio: cond.nome } : prev));
    }
    setMetragensDisponiveis(cond.metragens_disponiveis || []);
  }, [condominios, formData.condominio_id, formData.condominio, isOpen]);

  // Gerar código automaticamente quando o tipo mudar
  const generateCodigoImovel = async (tipo: string, skipCurrentCode = false) => {
    if (!tenantId || !tipo) {
      setCodigoGerado('');
      return;
    }

    const prefixo = TIPO_PREFIXO_MAP[tipo];
    if (!prefixo) {
      setCodigoGerado('');
      return;
    }

    setIsGeneratingCodigo(true);
    setCodigoGerado('');
    try {
      // Buscar todos os códigos existentes com esse prefixo para o tenant
      const { data: codigosAtribuidos, error: codigosAtribuidosError } = await supabase
        .from('imoveis_corretores')
        .select('codigo_imovel')
        .eq('tenant_id', tenantId)
        .ilike('codigo_imovel', `${prefixo}%`);

      if (codigosAtribuidosError) throw codigosAtribuidosError;

      const { data: codigosLocais, error: codigosLocaisError } = await supabase
        .from('imoveis_locais')
        .select('codigo_imovel')
        .eq('tenant_id', tenantId)
        .ilike('codigo_imovel', `${prefixo}%`);

      if (codigosLocaisError) {
        console.warn('Erro ao buscar códigos locais para gerar código:', codigosLocaisError);
      }

      // Encontrar o maior número existente
      let maxNumero = 0;
      const codigosExistentes = [...(codigosAtribuidos || []), ...(codigosLocais || [])];
      if (codigosExistentes.length > 0) {
        codigosExistentes.forEach((item) => {
          const match = item.codigo_imovel?.match(new RegExp(`^${prefixo}(\\d+)$`, 'i'));
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNumero) maxNumero = num;
          }
        });
      }

      if (skipCurrentCode && codigoGerado) {
        const currentMatch = codigoGerado.match(new RegExp(`^${prefixo}(\\d+)$`, 'i'));
        if (currentMatch) {
          const currentNum = parseInt(currentMatch[1], 10);
          if (currentNum > maxNumero) maxNumero = currentNum;
        }
      }

      // Próximo número
      const proximoNumero = maxNumero + 1;
      
      // Formatar com 4 dígitos (ou mais, se estourar 9999)
      const novoCodigo = `${prefixo}${proximoNumero.toString().padStart(4, '0')}`;
      
      setCodigoGerado(novoCodigo);
    } catch (err) {
      console.error('Erro ao gerar código:', err);
      setCodigoGerado('');
    } finally {
      setIsGeneratingCodigo(false);
    }
  };

  // Regenerar código quando tipo mudar. Depois do primeiro save (rascunho) o
  // código é o da linha gravada e não muda mais.
  useEffect(() => {
    if (isEdit || persistido) return;
    if (formData.tipo && isOpen) {
      generateCodigoImovel(formData.tipo);
    } else {
      setCodigoGerado('');
    }
  }, [formData.tipo, tenantId, isOpen, isEdit, persistido]);

  useEffect(() => {
    if (isOpen) {
      sessaoRef.current += 1;
      autosaveFalhouRef.current = null;
      atribuicaoPendenteRef.current = false;
      if (isEdit && initialData) {
        const dados = {
          ...initialFormData,
          ...initialData,
          fotos: initialData.fotos || [],
          caracteristicas: initialData.caracteristicas || [],
        };
        setFormData(dados);
        setBaseline(dados);
        setCodigoGerado(initialData.codigo_imovel || '');
        setRegistro({
          status: initialData.status_aprovacao || 'aguardando',
          atualizadoEm: initialData.updated_at ?? null,
        });
      } else {
        setFormData(initialFormData);
        setBaseline(initialFormData);
        setCodigoGerado('');
        setRegistro(null);
      }
      setAutosave({ estado: 'ocioso' });
      setRascunhoIndisponivel(false);
      setConfirmarSaida(false);
      setConfirmarExclusao(false);
      setSubmitStatus('idle');
      setSubmitMessage('');
    }
  }, [initialData, isEdit, isOpen]);

  // Mesmas dependências do efeito acima: toda reabertura recarrega o proprietário
  // depois de o formulário ser reidratado sem ele.
  useEffect(() => {
    const codigo = initialData?.codigo_imovel;
    if (!isOpen || !isEdit || !codigo || !tenantId) {
      setAcessoProprietario('permitido');
      return;
    }
    let ativo = true;
    setAcessoProprietario('carregando');
    buscarProprietarioDoImovel(tenantId, codigo)
      .then((proprietario) => {
        if (!ativo) return;
        if (!proprietario) {
          setAcessoProprietario('negado');
          return;
        }
        const campos = {
          proprietario_nome: proprietario.proprietario_nome || '',
          proprietario_celular: proprietario.proprietario_telefone || '',
          proprietario_tel_residencial: proprietario.proprietario_tel_residencial || '',
          proprietario_tel_comercial: proprietario.proprietario_tel_comercial || '',
          proprietario_email: proprietario.proprietario_email || '',
        };
        // Dado carregado, não digitado: entra também na base do "tem alteração?".
        setFormData((prev) => ({ ...prev, ...campos }));
        setBaseline((prev) => ({ ...prev, ...campos }));
        setAcessoProprietario('permitido');
      })
      .catch((err) => {
        console.error('[CriarImovelForm] falha ao carregar o proprietário:', err);
        if (ativo) setAcessoProprietario('erro');
      });
    return () => {
      ativo = false;
    };
  }, [initialData, isEdit, isOpen, tenantId]);
  
  // Seções colapsáveis
  const [openSections, setOpenSections] = useState({
    proprietario: false,
    estrutura: true,
    localizacao: false,
    caracteristicas: false,
    valores: false,
    publicacao: false,
    midia: false,
    placas: false,
    comissoes: false,
    confidencial: false,
    amenidades: false,
    chaves: false,
  });

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Clique num card do completômetro: abre a seção e rola até ela.
  // O scroll espera o próximo frame porque o conteúdo só existe depois de abrir.
  const focusSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: true }));
    requestAnimationFrame(() => {
      document.getElementById(`secao-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleInputChange = (field: keyof ImovelFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Limpar status ao editar
    if (submitStatus !== 'idle') {
      setSubmitStatus('idle');
      setSubmitMessage('');
    }
  };

  // Busca automática de CEP via ViaCEP
  const handleCepChange = useCallback(async (cepValue: string) => {
    // Formatar CEP enquanto digita
    const cepFormatado = formatarCepExibicao(cepValue);
    handleInputChange('cep', cepFormatado);
    
    // Resetar status quando começar a digitar
    if (cepStatus !== 'idle') {
      setCepStatus('idle');
    }

    // Buscar quando tiver 8 dígitos (CEP completo)
    if (validarCep(cepValue)) {
      setIsBuscandoCep(true);
      setCepStatus('idle');
      
      const endereco = await buscarCep(cepValue);
      
      if (endereco) {
        // Preencher campos automaticamente
        setFormData(prev => ({
          ...prev,
          cep: endereco.cep,
          logradouro: endereco.logradouro || prev.logradouro,
          bairro: endereco.bairro || prev.bairro,
          cidade: endereco.cidade || prev.cidade,
          estado: endereco.estado || prev.estado,
        }));
        setCepStatus('success');
      } else {
        setCepStatus('not_found');
      }
      
      setIsBuscandoCep(false);
    }
  }, [cepStatus]);

  const handleCaracteristicaToggle = (caracteristica: string) => {
    setFormData(prev => ({
      ...prev,
      caracteristicas: prev.caracteristicas.includes(caracteristica)
        ? prev.caracteristicas.filter(c => c !== caracteristica)
        : [...prev.caracteristicas, caracteristica]
    }));
  };

  const gerarDescricaoIA = async () => {
    if (isGerandoDescricao) return;

    setDescricaoIaErro(null);

    const dadosImovel = {
      finalidade: formData.finalidade,
      tipo: formData.tipo,
      bairro: formData.bairro,
      cidade: formData.cidade,
      estado: formData.estado,
      condominio: formData.condominio,
      area_total: formData.area_total,
      area_util: formData.area_util,
      metragem_m2: formData.metragem_m2,
      quartos: formData.quartos,
      suites: formData.suites,
      banheiros: formData.banheiros,
      vagas: formData.vagas,
      salas: formData.salas,
      valor_venda: formData.valor_venda,
      valor_locacao: formData.valor_locacao,
      valor_condominio: formData.valor_condominio,
      valor_iptu: formData.valor_iptu,
      caracteristicas: formData.caracteristicas,
      titulo: formData.titulo,
    };

    const camposPreenchidos = Object.entries(dadosImovel)
      .filter(([, v]) => Array.isArray(v) ? v.length > 0 : Boolean(v))
      .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join('\n');

    if (!camposPreenchidos) {
      setDescricaoIaErro('Preencha algum dado do imóvel antes de gerar a descrição.');
      return;
    }

    const prompt = `O usuário nao está lendo suas saudaçoes apenas gere uma descrição comercial vendedora para um anúncio imobiliário com base nos dados abaixo. Use português do Brasil, tom envolvente, destaque diferenciais e termine com um CTA discreto. 2 a 4 parágrafos. Não invente dados que não foram informados.\n\nDados do imóvel:\n${camposPreenchidos}`;

    const userName = user?.name || user?.email?.split('@')[0] || 'Corretor';

    setIsGerandoDescricao(true);
    try {
      const result = await sendMessageToAgent('GerarDescricaoImovel', prompt, userName, user?.tenantName || '');

      if (!result.success || !result.response) {
        setDescricaoIaErro(result.error || 'O agente não retornou uma descrição.');
        return;
      }

      const textoGerado = result.response.trim();
      setFormData(prev => ({
        ...prev,
        descricao: prev.descricao
          ? `${prev.descricao.trimEnd()}\n\n${textoGerado}`
          : textoGerado,
      }));
    } catch (err: any) {
      setDescricaoIaErro(err?.message || 'Erro ao gerar descrição.');
    } finally {
      setIsGerandoDescricao(false);
    }
  };

  const getCategoriaIcon = (categoria: string) => {
    switch (categoria) {
      case 'interno': return <Sofa className="h-4 w-4" />;
      case 'lazer': return <Dumbbell className="h-4 w-4" />;
      case 'servicos': return <Wrench className="h-4 w-4" />;
      case 'seguranca': return <Shield className="h-4 w-4" />;
      default: return <CheckCircle className="h-4 w-4" />;
    }
  };

  const getTiposByFinalidade = () => {
    switch (formData.finalidade) {
      case 'residencial': return TIPOS_RESIDENCIAL;
      case 'comercial': return TIPOS_COMERCIAL;
      case 'industrial': return TIPOS_INDUSTRIAL;
      case 'rural': return TIPOS_RURAL;
      case 'temporada': return TIPOS_TEMPORADA;
      case 'corporativa': return TIPOS_CORPORATIVA;
      default: return [];
    }
  };

  const handleCurrencyInput = (field: keyof ImovelFormData, value: string) => {
    const formatted = formatCurrency(value);
    handleInputChange(field, formatted);
  };

  // Aplica os dados de um proprietário existente clicado no autocomplete
  const handleProprietarioSelect = (match: ProprietarioMatch) => {
    setFormData((prev) => ({
      ...prev,
      proprietario_nome: match.nome,
      // Só sobrescreve telefone/email se o usuário ainda não tiver digitado nada
      proprietario_celular:
        prev.proprietario_celular || prev.proprietario_tel_residencial
          ? prev.proprietario_celular
          : match.telefone ?? '',
      proprietario_email: prev.proprietario_email || (match.email ?? ''),
    }));
  };

  const exibirErro = (mensagem: string) => {
    setSubmitStatus('error');
    setSubmitMessage(mensagem);
  };

  /**
   * Primeiro save de um cadastro novo (rascunho ou publicação): o código gerado
   * ainda está livre? São as checagens de sempre, mais o rascunho — ele reserva
   * o código só em imoveis_locais (sem atribuição), e sem isto o upsert gravaria
   * por cima do rascunho de outra pessoa.
   */
  const conflitoDeCodigo = async (codigo: string): Promise<string | null> => {
    const { data: existingAssignment, error: assignmentFetchError } = await supabase
      .from('imoveis_corretores')
      .select('id, corretor_id, corretor_nome')
      .eq('tenant_id', tenantId)
      .eq('codigo_imovel', codigo)
      .maybeSingle();

    if (assignmentFetchError) throw assignmentFetchError;

    const { data: existingLocal, error: localFetchError } = await supabase
      .from('imoveis_locais')
      .select('id, status_aprovacao')
      .eq('tenant_id', tenantId)
      .eq('codigo_imovel', codigo)
      .maybeSingle();

    if (localFetchError) throw localFetchError;

    if (existingLocal?.status_aprovacao === STATUS_RASCUNHO) {
      return `Código ${codigo} já está reservado por outro rascunho. Gere um novo código.`;
    }

    // O primeiro save é INSERT (sem upsert): um imóvel local com este código, de
    // quem quer que seja, não pode ser sobrescrito por um cadastro novo.
    if (existingLocal) {
      return `Código ${codigo} já existe no cadastro de imóveis. Gere um novo código.`;
    }

    if (existingAssignment && existingAssignment.corretor_id !== user?.id) {
      return `Código ${codigo} já existe (atribuído a ${existingAssignment.corretor_nome || 'outro corretor'})`;
    }

    return null;
  };

  /**
   * Salva como rascunho (botão ou autosave). Exige só tipo + código; não passa
   * pela validação de publicação, não checa duplicidade e não cria a atribuição
   * em imoveis_corretores (isso fica para a publicação). O formulário continua aberto.
   */
  const salvarRascunho = async (automatico = false) => {
    if (salvandoRef.current) return;

    if (!formData.tipo || !codigoGerado) {
      if (!automatico) {
        exibirErro('Selecione o tipo do imóvel para salvar o rascunho — o código é gerado a partir dele.');
      }
      return;
    }

    if (!tenantId || !user?.id) {
      if (!automatico) exibirErro('Erro de autenticação. Recarregue a página.');
      return;
    }

    const sessao = sessaoRef.current;
    const snapshot = formData;
    salvandoRef.current = true;
    setSalvandoRascunho(true);
    if (automatico) setAutosave({ estado: 'salvando' });

    try {
      if (!registro) {
        const conflito = await conflitoDeCodigo(codigoGerado);
        if (conflito) {
          exibirErro(conflito);
          return;
        }
      }

      const atualizadoEm = await saveImovelLocal(codigoGerado, STATUS_RASCUNHO);
      if (sessao !== sessaoRef.current) return;

      setRegistro({ status: STATUS_RASCUNHO, atualizadoEm });
      if (automatico) {
        setAutosave({ estado: 'salvo', em: atualizadoEm || new Date().toISOString() });
      } else {
        setAutosave({ estado: 'ocioso' });
        setSubmitStatus('idle');
        setSubmitMessage('');
        toast.success(`Rascunho ${codigoGerado} salvo`);
      }
    } catch (err) {
      console.error('❌ Erro ao salvar rascunho:', err);
      if (sessao !== sessaoRef.current) return;
      autosaveFalhouRef.current = snapshot;

      if (err instanceof RascunhoIndisponivelError) {
        setRascunhoIndisponivel(true);
        setAutosave({ estado: 'erro', mensagem: 'Salvamento automático interrompido.' });
        exibirErro(err.message);
      } else if (automatico) {
        setAutosave({
          estado: 'erro',
          mensagem: `Não foi possível salvar automaticamente${mensagemDeErro(err) ? `: ${mensagemDeErro(err)}` : '.'}`,
        });
      } else {
        exibirErro(mensagemDeErro(err) || 'Erro ao salvar o rascunho. Tente novamente.');
      }
    } finally {
      salvandoRef.current = false;
      setSalvandoRascunho(false);
    }
  };

  /**
   * Publica (cadastro novo ou rascunho → aguardando aprovação) ou salva a edição
   * de um imóvel já publicado, mantendo o status dele. Valida tudo antes.
   */
  const publicar = async (skipDuplicidadeCheck = false) => {
    if (salvandoRef.current) return;

    const problemas = validarPublicacaoImovel(formData, {
      codigoGerado,
      podeEditarCaptador,
      validarProprietario: proprietarioLiberado,
    });
    if (problemas.length > 0) {
      exibirErro(
        `Não foi possível ${modoPublicado ? 'salvar' : 'publicar'} o imóvel.\n` +
        `Preencha os seguintes campos:\n${problemas.map((p) => `- ${p.mensagem}`).join('\n')}`,
      );
      setOpenSections(prev => ({ ...prev, ...Object.fromEntries(problemas.map((p) => [p.secao, true])) }));
      focusSection(problemas[0].secao);
      return;
    }

    if (!tenantId || !user?.id) {
      exibirErro('Erro de autenticação. Recarregue a página.');
      return;
    }

    const sessao = sessaoRef.current;
    const codigoNormalizado = codigoGerado;
    // Cadastro novo e rascunho viram "aguardando" e ganham a atribuição; o
    // publicado mantém o status (o trigger guarda a aprovação no banco).
    const criando = !registro || registro.status === STATUS_RASCUNHO || atribuicaoPendenteRef.current;
    const status: StatusAprovacaoImovel = criando ? 'aguardando' : registro.status;

    salvandoRef.current = true;
    setIsSubmitting(true);
    setSubmitStatus('idle');
    setSubmitMessage('');

    try {
      // Verificação de imóvel duplicado para o mesmo proprietário
      if (!skipDuplicidadeCheck && formData.proprietario_nome.trim().length >= 2) {
        try {
          const duplicados = await verificarImovelDuplicado({
            tenantId,
            proprietarioNome: formData.proprietario_nome,
            proprietarioTelefone:
              formData.proprietario_celular || formData.proprietario_tel_residencial || null,
            proprietarioEmail: formData.proprietario_email || null,
            tipo: formData.tipo || null,
            logradouro: formData.logradouro || null,
            numero: formData.numero || null,
            cep: formData.cep || null,
            bairro: formData.bairro || null,
            cidade: formData.cidade || null,
            areaTotal: parseFloat(formData.area_total) || null,
            quartos: parseInt(formData.quartos) || null,
            banheiros: parseInt(formData.banheiros) || null,
            // Linha já gravada (rascunho incluso) não pode acusar a si mesma.
            ignorarCodigo: registro ? codigoNormalizado : null,
          });

          if (duplicados.length > 0) {
            setDuplicadosDetectados(duplicados);
            setShowDuplicadoDialog(true);
            return;
          }
        } catch (err) {
          console.warn('[CriarImovelForm] falha ao verificar duplicidade:', err);
          // Não bloqueia o cadastro caso a verificação falhe
        }
      }

      // Preparar dados do corretor
      const corretorNome = user.name || user.email?.split('@')[0] || 'Corretor';
      const corretorTelefone = user.telefone ? String(user.telefone).replace(/\D/g, '') : null;
      let atualizadoEm: string | null;

      if (criando) {
        if (!registro) {
          const conflito = await conflitoDeCodigo(codigoNormalizado);
          if (conflito) {
            exibirErro(conflito);
            return;
          }
        }

        // Rascunho de outra pessoa: a atribuição é do autor, não de quem publica —
        // senão o autor perde o imóvel em Meus Imóveis e os leads (que casam por
        // nome/e-mail/telefone) vão para quem publicou. Resolvido antes de gravar
        // para uma falha aqui não deixar nada pela metade.
        const autorId = (isEdit && initialData?.criado_por) || user.id;
        let atribuicao = {
          corretor_id: user.id,
          corretor_nome: corretorNome,
          corretor_email: user.email || null,
          corretor_telefone: corretorTelefone,
        };
        if (autorId !== user.id) {
          const { data: autor, error: autorError } = await supabase
            .from('tenant_brokers')
            .select('name, email, phone')
            .eq('tenant_id', tenantId)
            .eq('auth_user_id', autorId)
            .limit(1)
            .maybeSingle();
          if (autorError) throw autorError;
          atribuicao = {
            corretor_id: autorId,
            corretor_nome: autor?.name || captadores.find((c) => c.user_id === autorId)?.nome || 'Corretor',
            corretor_email: autor?.email || null,
            corretor_telefone: autor?.phone ? String(autor.phone).replace(/\D/g, '') : null,
          };
        }

        // Salvar detalhes completos antes de criar/regularizar a atribuição.
        atualizadoEm = await saveImovelLocal(codigoNormalizado, status);
        // A linha já é publicada: se a atribuição falhar, o retry não pode mais
        // passar pelo update condicional do rascunho (casaria 0 linhas).
        atribuicaoPendenteRef.current = true;
        if (sessao === sessaoRef.current) setRegistro({ status, atualizadoEm });

        // Criar ou completar registro na tabela imoveis_corretores
        const { error: upsertAssignmentError } = await supabase
          .from('imoveis_corretores')
          .upsert({
            tenant_id: tenantId,
            codigo_imovel: codigoNormalizado,
            exclusivo: EXCLUSIVO_NO_BANCO[formData.exclusivo],
            ...atribuicao,
          }, { onConflict: 'tenant_id,codigo_imovel' });

        if (upsertAssignmentError) throw upsertAssignmentError;
        atribuicaoPendenteRef.current = false;
      } else {
        const { error: updateBrokerError } = await supabase
          .from('imoveis_corretores')
          .update({ exclusivo: EXCLUSIVO_NO_BANCO[formData.exclusivo] })
          .eq('tenant_id', tenantId)
          .eq('codigo_imovel', codigoNormalizado);

        if (updateBrokerError) throw updateBrokerError;

        // Salvar detalhes completos do imóvel na tabela imoveis_locais
        atualizadoEm = await saveImovelLocal(codigoNormalizado, status);
      }

      if (sessao !== sessaoRef.current) return;
      setRegistro({ status, atualizadoEm });
      setSubmitStatus('success');
      setSubmitMessage(
        modoPublicado
          ? `Imóvel ${codigoNormalizado} atualizado com sucesso!`
          : modoRascunho
            ? `Imóvel ${codigoNormalizado} publicado com sucesso!`
            : `Imóvel ${codigoNormalizado} criado com sucesso!`,
      );

      // Fechar após delay
      setTimeout(() => {
        onSuccess();
        if (sessao === sessaoRef.current) fechar();
      }, 1500);

    } catch (err) {
      console.error('❌ Erro ao criar imóvel:', err);
      if (sessao === sessaoRef.current) {
        // Publicado/aprovado/excluído em outra tela: nada foi gravado aqui e os botões travam.
        if (err instanceof RascunhoIndisponivelError) setRascunhoIndisponivel(true);
        exibirErro(mensagemDeErro(err) || 'Erro ao criar imóvel. Tente novamente.');
      }
    } finally {
      salvandoRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Determinar tipo simplificado baseado no tipo do imóvel
  const getTipoSimplificado = (tipo: string): string => {
    const t = tipo.toLowerCase();
    if (t.includes('casa') || t.includes('sobrado') || t.includes('village')) return 'casa';
    if (t.includes('apartamento') || t.includes('cobertura') || t.includes('flat') || t.includes('kitnet') || t.includes('loft') || t.includes('studio') || t.includes('penthouse')) return 'apartamento';
    if (t.includes('terreno') || t.includes('lote')) return 'terreno';
    if (t.includes('comercial') || t.includes('sala') || t.includes('loja') || t.includes('galpão') || t.includes('ponto') || t.includes('box') || t.includes('escritório') || t.includes('coworking')) return 'comercial';
    if (t.includes('chácara') || t.includes('sítio') || t.includes('fazenda') || t.includes('rancho') || t.includes('rural')) return 'rural';
    return 'outro';
  };

  /** Grava o payload inteiro em imoveis_locais. Devolve o `updated_at` gravado. */
  const saveImovelLocal = async (codigoImovel: string, status: StatusAprovacaoImovel): Promise<string | null> => {
    const sessao = sessaoRef.current;
    const snapshot = formData;
    // Sobe pro Storage as fotos que ainda estão em data URL (base64).
    // Necessário pra feeds externos (ZAP/OLX) que só aceitam https?:// nas <Media>.
    const fotosNormalizadas = normalizeFotos(formData.fotos);
    const fotosComUrls = tenantId
      ? await uploadImoveisFotos({
          fotos: fotosNormalizadas,
          tenantId,
          codigoImovel,
        })
      : fotosNormalizadas;

    // Se o opt-out da marca mudou, as fotos que um reprocessamento anterior
    // reapontou para a CDN ficariam presas na variante antiga (URL de arquivo
    // fixo). Volta para a URL do endpoint, que resolve a variante ATUAL. Fotos
    // novas já saem assim do upload; as sem `id` não passaram pelo pipeline.
    const marcaMudou = (initialData?.sem_marca_dagua ?? false) !== formData.sem_marca_dagua;
    const fotosFinal = marcaMudou
      ? fotosComUrls.map((f) => (f.id ? { ...f, url: watermarkPhotoUrl(f.id) } : f))
      : fotosComUrls;

    // Gerar título automático se não preenchido. Rascunho grava só o que foi
    // digitado: o automático congelaria "Apartamento" antes de existir endereço
    // e, ao reabrir o rascunho, voltaria no campo como se o usuário o tivesse digitado.
    const tituloAuto = formData.titulo ||
      `${formData.tipo || 'Imóvel'} ${formData.bairro ? `- ${formData.bairro}` : ''} ${formData.cidade ? `- ${formData.cidade}` : ''}`;
    
    // Determinar finalidade para exibição
    let finalidadeExibicao = 'venda';
    if (parseCurrency(formData.valor_venda) > 0 && parseCurrency(formData.valor_locacao) > 0) {
      finalidadeExibicao = 'venda_locacao';
    } else if (parseCurrency(formData.valor_locacao) > 0) {
      finalidadeExibicao = 'locacao';
    }

    const imovelLocal = {
      tenant_id: tenantId,
      codigo_imovel: codigoImovel,
      exclusivo: EXCLUSIVO_NO_BANCO[formData.exclusivo],
      titulo: status === STATUS_RASCUNHO ? formData.titulo.trim() || null : tituloAuto.trim(),
      tipo: formData.tipo || null,
      tipo_simplificado: getTipoSimplificado(formData.tipo || ''),
      finalidade: finalidadeExibicao,
      logradouro: formData.logradouro || null,
      numero: formData.numero || null,
      complemento: formData.complemento || null,
      bairro: formData.bairro || null,
      cidade: formData.cidade || null,
      estado: formData.estado || 'SP',
      cep: formData.cep || null,
      condominio_id: formData.condominio_id || null,
      area_total: parseFloat(formData.area_total) || 0,
      area_util: parseFloat(formData.area_util) || 0,
      metragem_m2: formData.metragem_m2 ? parseFloat(formData.metragem_m2) : null,
      quartos: parseInt(formData.quartos) || 0,
      suites: parseInt(formData.suites) || 0,
      banheiros: parseInt(formData.banheiros) || 0,
      vagas: parseInt(formData.vagas) || 0,
      salas: parseInt(formData.salas) || 0,
      valor_venda: parseCurrency(formData.valor_venda) || 0,
      valor_locacao: parseCurrency(formData.valor_locacao) || 0,
      valor_condominio: parseCurrency(formData.valor_condominio) || 0,
      valor_iptu: parseCurrency(formData.valor_iptu) || 0,
      descricao: formData.descricao || null,
      publicar_site: formData.anunciar === 'sim',
      destaque: formData.destaque === 'sim',
      super_destaque: formData.super_destaque === 'sim',
      fotos: fotosFinal,
      sem_marca_dagua: formData.sem_marca_dagua,
      ...splitCaracteristicas(formData.caracteristicas || []),
      aceita_troca: formData.aceita_troca === 'sim',
      // Rascunho guarda o link como digitado (mesmo incompleto); o formato só é exigido ao publicar.
      link_video: status === STATUS_RASCUNHO
        ? formData.link_video.trim() || null
        : normalizeYouTubeUrl(formData.link_video) || null,
      tour_virtual: status === STATUS_RASCUNHO
        ? formData.tour_virtual.trim() || null
        : isHttpUrl(formData.tour_virtual) ? formData.tour_virtual.trim() : null,
      // Só entra no payload quando o formulário tem o proprietário de verdade (ver
      // acessoProprietario). Ausente, o UPDATE mantém o que está gravado.
      ...(proprietarioLiberado
        ? {
            proprietario_nome: formData.proprietario_nome || null,
            proprietario_telefone: formData.proprietario_celular || formData.proprietario_tel_residencial || null,
            proprietario_tel_residencial: formData.proprietario_tel_residencial || null,
            proprietario_tel_comercial: formData.proprietario_tel_comercial || null,
            proprietario_email: formData.proprietario_email || null,
          }
        : {}),
      // Só no primeiro save: sem captador definido, quem cadastrou é o captador para
      // o banco (imovel_autoriza), e trocar o autor é recusado a quem não é admin.
      ...(persistido ? {} : { criado_por: user?.id || null }),
      obs_interna: formData.obs_interna || null,
      // Estes 16 a tela sempre coletou e o save jogava fora — as colunas só
      // existem a partir de 20260909_imovel_campos_do_formulario.sql.
      midia_origem: formData.midia_origem || null,
      envio_atividades: formData.envio_atividades || null,
      pais: formData.pais || null,
      area_terreno: formData.area_terreno ? parseFloat(formData.area_terreno) : null,
      placa_local: formData.placa_local === 'sim',
      tipo_comissao: formData.tipo_comissao || null,
      captou_pretensao: formData.captou_pretensao || null,
      condicao_comercial: formData.condicao_comercial || null,
      codigo_iptu: formData.codigo_iptu || null,
      numero_matricula: formData.numero_matricula || null,
      codigo_eletricidade: formData.codigo_eletricidade || null,
      codigo_agua: formData.codigo_agua || null,
      titulos_direitos: formData.titulos_direitos || null,
      aprovado_ambiental: formData.aprovado_ambiental || null,
      projeto_aprovado: formData.projeto_aprovado || null,
      obs_documentacao: formData.obs_documentacao || null,
      chave_status: formData.chave_status || null,
      chave_local: formData.chave_local || null,
      // chave_retirada_em fica de fora de propósito: o trigger carimba a data
      // quando esta coluna muda.
      chave_com: formData.chave_com || null,
      // Os captadores só entram no payload para quem pode defini-los
      // (diretoria/admin/gestor ou o captador atual). Colunas ausentes do payload
      // ficam fora do SET do UPDATE e mantêm o valor já salvo. Omitir aqui é o
      // que faz um corretor comum conseguir salvar outros campos sem precisar
      // (nem poder) tocar no captador — o tg_guard_captador libera quando nada mudou.
      ...(podeEditarCaptador
        ? {
            captador_id: formData.captador_id || null,
            captador_2_id: formData.captador_2_id || null,
          }
        : {}),
      status_aprovacao: status,
    };

    // Rascunho já gravado é salvo — e publicado — com update condicional: se outra
    // tela publicou, aprovou ou excluiu a linha, nada casa. O rascunho não rebaixa
    // o imóvel publicado, não sobrescreve os dados dele nem ressuscita o excluído.
    // Primeiro save é INSERT e os demais UPDATE — nunca upsert: o ON CONFLICT exige
    // SELECT nas colunas do proprietário, que o navegador não tem.
    const salvandoSobreRascunho = registro?.status === STATUS_RASCUNHO;
    const tabela = supabase.from('imoveis_locais');
    const { data, error } = !persistido
      ? await tabela.insert(imovelLocal).select('updated_at')
      : salvandoSobreRascunho
        ? await tabela
            .update(imovelLocal)
            .eq('tenant_id', tenantId)
            .eq('codigo_imovel', codigoImovel)
            .eq('status_aprovacao', STATUS_RASCUNHO)
            .select('updated_at')
        : await tabela
            .update(imovelLocal)
            .eq('tenant_id', tenantId)
            .eq('codigo_imovel', codigoImovel)
            .select('updated_at');

    if (error) {
      console.error('❌ Erro ao salvar imóvel local:', error.message, error.code, error.details);
      if (error.code === '23505') {
        throw new Error(`Código ${codigoImovel} já existe no cadastro de imóveis. Gere um novo código.`);
      }
      if (error.code === '42501' && /definir o captador/.test(error.message)) {
        throw new Error('Somente diretoria, administrador, gestor ou o captador atual pode definir o captador do imóvel.');
      }
      // 42501 (sem permissão para editar/alterar o proprietário) e 23514
      // (proprietário/endereço faltando na publicação) já chegam com a mensagem
      // pronta dos triggers do banco.
      throw error;
    }

    if (persistido && !data?.length && !salvandoSobreRascunho) {
      throw new Error(`Imóvel ${codigoImovel} não encontrado: ele pode ter sido excluído em outra tela. Nada foi salvo.`);
    }

    if (persistido && !data?.length) {
      throw new RascunhoIndisponivelError(
        'Este cadastro não é mais um rascunho: foi publicado ou excluído em outra tela. As alterações feitas aqui não foram salvas.',
      );
    }

    if (sessao === sessaoRef.current) {
      // As fotos em base64 viraram URL no upload: devolve as URLs ao formulário
      // para o próximo save (autosave) não subir tudo de novo. A troca é por URL
      // de origem, então foto incluída, removida ou legendada durante o save
      // continua como o usuário deixou — e o formulário segue "alterado".
      const salvas = new Map(fotosNormalizadas.map((f, i) => [f.url, fotosFinal[i]]));
      const comFotosSalvas = (dados: ImovelFormData): ImovelFormData => ({
        ...dados,
        fotos: dados.fotos.map((f) => {
          const salva = salvas.get(f.url);
          return salva ? { ...f, url: salva.url, id: salva.id } : f;
        }),
      });
      setFormData(comFotosSalvas);
      setBaseline(comFotosSalvas(snapshot));
    }

    return data?.[0]?.updated_at ?? null;
  };

  const fechar = () => {
    sessaoRef.current += 1;
    setFormData(initialFormData);
    setBaseline(initialFormData);
    setConfirmarSaida(false);
    setSubmitStatus('idle');
    setSubmitMessage('');
    onClose();
  };

  // Há alteração ainda não gravada desde a carga ou o último save?
  const alterado = isOpen && formularioAlterado(formData, baseline);

  // ESC, clique fora, X e "Cancelar" passam por aqui.
  const handleClose = () => {
    // Com gravação em curso, fechar descartaria o onSuccess de algo que vai ser gravado mesmo assim.
    if (salvandoRef.current) return;
    if (alterado) {
      setConfirmarSaida(true);
      return;
    }
    fechar();
  };

  const excluirRascunhoAtual = async () => {
    if (!tenantId || salvandoRef.current) return;
    salvandoRef.current = true;
    setExcluindoRascunho(true);
    try {
      await excluirRascunho(tenantId, codigoGerado);
      toast.success(`Rascunho ${codigoGerado} excluído`);
      setConfirmarExclusao(false);
      onSuccess();
      fechar();
    } catch (err) {
      toast.error('Não foi possível excluir o rascunho', { description: mensagemDeErro(err) });
    } finally {
      salvandoRef.current = false;
      setExcluindoRascunho(false);
    }
  };

  // RF-14: autosave só do rascunho já gravado, 5 s depois da última alteração
  // (formData nas deps reinicia a contagem), nunca com outro save ou diálogo aberto.
  const podeAutosalvar =
    alterado && modoRascunho && !rascunhoIndisponivel &&
    !salvandoRascunho && !isSubmitting && !excluindoRascunho &&
    !confirmarSaida && !confirmarExclusao && !showDuplicadoDialog;
  const salvarRascunhoRef = useRef(salvarRascunho);
  salvarRascunhoRef.current = salvarRascunho;

  useEffect(() => {
    if (!podeAutosalvar || formData === autosaveFalhouRef.current) return;
    const timer = setTimeout(() => void salvarRascunhoRef.current(true), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [formData, podeAutosalvar]);

  // Recarregar ou fechar a aba com alteração pendente: o navegador pergunta antes.
  // ponytail: o Voltar do navegador (troca de rota) não é interceptado — sem data
  // router não há useBlocker. Se o app migrar para createBrowserRouter, bloquear aqui.
  useEffect(() => {
    if (!alterado) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [alterado]);

  const ocupado = isSubmitting || salvandoRascunho || excluindoRascunho;

  const getTipoIcon = (tipo: string) => {
    const t = tipo.toLowerCase();
    if (t.includes('casa') || t.includes('sobrado')) return <Home className="h-4 w-4" />;
    if (t.includes('apartamento') || t.includes('cobertura') || t.includes('flat')) return <Building2 className="h-4 w-4" />;
    if (t.includes('terreno') || t.includes('lote')) return <LandPlot className="h-4 w-4" />;
    if (t.includes('comercial') || t.includes('sala') || t.includes('loja')) return <Store className="h-4 w-4" />;
    if (t.includes('chácara') || t.includes('sítio') || t.includes('fazenda')) return <Trees className="h-4 w-4" />;
    return <Building className="h-4 w-4" />;
  };

  return (
    <>
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto z-[9999]">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Building2 className="h-6 w-6 text-primary" />
            {modoRascunho ? 'Rascunho de imóvel' : modoPublicado ? 'Editar Imóvel' : 'Novo Imóvel'}
            {modoRascunho && (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                Rascunho
              </Badge>
            )}
          </DialogTitle>
          <p className="text-sm text-text-secondary mt-1">
            {modoPublicado
              ? 'Tipo e CEP são obrigatórios.'
              : 'Salve como rascunho a qualquer momento (basta o tipo). Para publicar, proprietário, tipo e CEP são obrigatórios (o código é gerado automaticamente).'}
          </p>
          {modoRascunho && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
              {registro.atualizadoEm && (
                <span>Último salvamento: {formatarDataHora(registro.atualizadoEm)}</span>
              )}
              {autosave.estado === 'salvando' && (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Salvando…
                </span>
              )}
              {autosave.estado === 'salvo' && autosave.em && (
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle className="h-3 w-3" />
                  Salvo automaticamente às {formatarDataHora(autosave.em, 'HH:mm')}
                </span>
              )}
              {autosave.estado === 'erro' && (
                <span className="flex items-center gap-1 text-red-600">
                  <AlertCircle className="h-3 w-3" />
                  {autosave.mensagem}
                </span>
              )}
            </div>
          )}
        </DialogHeader>

        <Tabs defaultValue="dados" className="py-4">
          {/* Histórico só existe na edição: imóvel ainda não salvo não tem log. */}
          {isEdit && (
            <TabsList>
              <TabsTrigger value="dados">Dados</TabsTrigger>
              <TabsTrigger value="historico">
                <History className="h-4 w-4 mr-1.5" />
                Histórico
              </TabsTrigger>
            </TabsList>
          )}

          <TabsContent value="dados" className="space-y-4">
          {/* Código do Imóvel - GERADO AUTOMATICAMENTE */}
          <div className="bg-gradient-to-r from-primary/5 to-primary/10 rounded-lg p-4 border border-primary/20">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="default" className="bg-primary">Automático</Badge>
              <span className="font-semibold text-text-primary">Código do Imóvel</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-card border rounded-lg p-3 font-mono text-lg text-center">
                {isGeneratingCodigo ? (
                  <span className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Gerando...
                  </span>
                ) : codigoGerado ? (
                  <span className="text-primary font-bold">{codigoGerado}</span>
                ) : (
                  <span className="text-muted-foreground">Selecione o tipo do imóvel</span>
                )}
              </div>
              {/* Linha já gravada: o código é o dela, trocar criaria outro imóvel. */}
              {codigoGerado && !persistido && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generateCodigoImovel(formData.tipo, true)}
                  disabled={isGeneratingCodigo || ocupado}
                  title="Regenerar código"
                >
                  <Loader2 className={`h-4 w-4 ${isGeneratingCodigo ? 'animate-spin' : ''}`} />
                </Button>
              )}
            </div>
            <p className="text-xs text-text-secondary mt-2">
              O código é gerado automaticamente com base no tipo selecionado (ex: CA001 para Casa, AP001 para Apartamento)
            </p>
          </div>

          {/* Completude do imóvel — calculada localmente a partir do formulário */}
          <PropertyCompleteness
            property={{ ...formData, proprietarioOculto: !proprietarioLiberado }}
            onFocusSection={focusSection}
          />

          {/* Status de Submissão */}
          {submitMessage && (
            <div className={`flex items-start gap-2 p-3 rounded-lg ${
              submitStatus === 'success' 
                ? 'bg-green-500/10 text-green-600 border border-green-500/20' 
                : 'bg-red-500/10 text-red-600 border border-red-500/20'
            }`}>
              {submitStatus === 'success' ? (
                <CheckCircle className="h-5 w-5 shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 shrink-0" />
              )}
              {/* A validação da publicação lista um campo por linha. */}
              <span className="whitespace-pre-line">{submitMessage}</span>
            </div>
          )}

          {/* Seção: Proprietário */}
          <Collapsible id="secao-proprietario" open={openSections.proprietario} onOpenChange={() => toggleSection('proprietario')}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-card rounded-lg border hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-blue-500" />
                <span className="font-medium">Proprietário</span>
                {formData.proprietario_nome && (
                  <Badge variant="secondary" className="text-xs">{formData.proprietario_nome}</Badge>
                )}
              </div>
              {openSections.proprietario ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-card/50 rounded-lg border">
                {/* Sem permissão os campos nem são renderizados: o dado não chega ao
                    navegador (RPC imoveis_proprietarios) e não fica escondido no DOM. */}
                {proprietarioLiberado ? (
                  <>
                    <div className="space-y-2 md:col-span-2 lg:col-span-3">
                      <Label>Nome do Proprietário *</Label>
                      <ProprietarioAutocomplete
                        tenantId={tenantId}
                        value={formData.proprietario_nome}
                        onChange={(nome) => handleInputChange('proprietario_nome', nome)}
                        onSelect={handleProprietarioSelect}
                        placeholder="Nome completo"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Digite 2+ letras para ver proprietários já cadastrados. Passe o mouse para ver
                        os dados salvos; clique para preencher automaticamente.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Tel. Residencial</Label>
                      <Input
                        placeholder="(00) 0000-0000"
                        value={formData.proprietario_tel_residencial}
                        onChange={(e) => handleInputChange('proprietario_tel_residencial', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Tel. Comercial</Label>
                      <Input
                        placeholder="(00) 0000-0000"
                        value={formData.proprietario_tel_comercial}
                        onChange={(e) => handleInputChange('proprietario_tel_comercial', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Celular</Label>
                      <Input
                        placeholder="(00) 00000-0000"
                        value={formData.proprietario_celular}
                        onChange={(e) => handleInputChange('proprietario_celular', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2 lg:col-span-3">
                      <Label>E-mail</Label>
                      <Input
                        type="email"
                        placeholder="email@exemplo.com"
                        value={formData.proprietario_email}
                        onChange={(e) => handleInputChange('proprietario_email', e.target.value)}
                      />
                    </div>
                  </>
                ) : (
                  <p
                    role="status"
                    className="md:col-span-2 lg:col-span-3 text-sm text-muted-foreground"
                  >
                    {acessoProprietario === 'carregando'
                      ? 'Carregando os dados do proprietário...'
                      : acessoProprietario === 'erro'
                        ? 'Não foi possível carregar os dados do proprietário. Eles continuam salvos; reabra o imóvel para tentar de novo.'
                        : 'Os dados do proprietário são visíveis só para o corretor captador, a gestão de terceiros responsável e a administração.'}
                  </p>
                )}
                <div className="space-y-2">
                  <Label>Mídia de Origem</Label>
                  <Select
                    value={formData.midia_origem}
                    onValueChange={(value) => handleInputChange('midia_origem', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {MIDIAS_ORIGEM.map(midia => (
                        <SelectItem key={midia} value={midia}>{midia}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Enviar atividades por e-mail</Label>
                  <Select
                    value={formData.envio_atividades}
                    onValueChange={(value) => handleInputChange('envio_atividades', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nao_enviar">Não enviar</SelectItem>
                      <SelectItem value="semanalmente">Semanalmente</SelectItem>
                      <SelectItem value="quinzenalmente">Quinzenalmente</SelectItem>
                      <SelectItem value="mensalmente">Mensalmente</SelectItem>
                      <SelectItem value="trimestralmente">Trimestralmente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Exclusividade</Label>
                  <Select
                    value={formData.exclusivo}
                    onValueChange={(value: Exclusividade) => handleInputChange('exclusivo', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a exclusividade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nao">Não exclusivo</SelectItem>
                      <SelectItem value="sim">Exclusivo</SelectItem>
                      <SelectItem value="indiferente">Indiferente</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Por padrão o imóvel é cadastrado como não exclusivo.
                  </p>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Seção: Estrutura */}
          <Collapsible id="secao-estrutura" open={openSections.estrutura} onOpenChange={() => toggleSection('estrutura')}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-card rounded-lg border hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-purple-500" />
                <span className="font-medium">Estrutura</span>
                {formData.tipo && (
                  <Badge variant="secondary" className="text-xs flex items-center gap-1">
                    {getTipoIcon(formData.tipo)}
                    {formData.tipo}
                  </Badge>
                )}
              </div>
              {openSections.estrutura ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-card/50 rounded-lg border">
                <div className="space-y-2">
                  <Label>Finalidade</Label>
                  {/* Travados durante o save: o código sai do tipo, e trocá-lo no meio
                      deixaria o formulário com um código diferente da linha gravada. */}
                  <Select
                    value={formData.finalidade}
                    onValueChange={(value) => {
                      handleInputChange('finalidade', value);
                      handleInputChange('tipo', ''); // Reset tipo
                    }}
                    disabled={ocupado}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a finalidade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="residencial">🏠 Residencial</SelectItem>
                      <SelectItem value="comercial">🏪 Comercial</SelectItem>
                      <SelectItem value="industrial">🏭 Industrial</SelectItem>
                      <SelectItem value="rural">🌳 Rural</SelectItem>
                      <SelectItem value="temporada">🏖️ Temporada</SelectItem>
                      <SelectItem value="corporativa">🏢 Corporativa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select
                    value={formData.tipo}
                    onValueChange={(value) => handleInputChange('tipo', value)}
                    disabled={!formData.finalidade || ocupado}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={formData.finalidade ? "Selecione o tipo" : "Selecione a finalidade primeiro"} />
                    </SelectTrigger>
                    <SelectContent>
                      {getTiposByFinalidade().map(tipo => (
                        <SelectItem key={tipo} value={tipo}>
                          <div className="flex items-center gap-2">
                            {getTipoIcon(tipo)}
                            {tipo}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Seção: Localização */}
          <Collapsible id="secao-localizacao" open={openSections.localizacao} onOpenChange={() => toggleSection('localizacao')}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-card rounded-lg border hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-red-500" />
                <span className="font-medium">Localização</span>
                {formData.bairro && formData.cidade && (
                  <Badge variant="secondary" className="text-xs">{formData.bairro}, {formData.cidade}</Badge>
                )}
              </div>
              {openSections.localizacao ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-card/50 rounded-lg border">
                <div className="space-y-2">
                  <Label>País</Label>
                  <Select
                    value={formData.pais}
                    onValueChange={(value) => handleInputChange('pais', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Brasil">Brasil</SelectItem>
                      <SelectItem value="Portugal">Portugal</SelectItem>
                      <SelectItem value="Estados Unidos">Estados Unidos</SelectItem>
                      <SelectItem value="Argentina">Argentina</SelectItem>
                      <SelectItem value="Uruguai">Uruguai</SelectItem>
                      <SelectItem value="Paraguai">Paraguai</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Estado</Label>
                  <Select
                    value={formData.estado}
                    onValueChange={(value) => handleInputChange('estado', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="UF" />
                    </SelectTrigger>
                    <SelectContent>
                      {ESTADOS_BR.map(uf => (
                        <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    CEP <span className="text-red-500">*</span>
                    {isBuscandoCep && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                    {cepStatus === 'success' && <CheckCircle className="h-3 w-3 text-green-500" />}
                    {cepStatus === 'not_found' && <AlertCircle className="h-3 w-3 text-yellow-500" />}
                  </Label>
                  <div className="relative">
                    <Input
                      placeholder="00000-000"
                      value={formData.cep}
                      onChange={(e) => handleCepChange(e.target.value)}
                      maxLength={9}
                      className={cepStatus === 'success' ? 'border-green-500/50 focus:border-green-500' : cepStatus === 'not_found' ? 'border-yellow-500/50' : ''}
                    />
                    {isBuscandoCep && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      </div>
                    )}
                  </div>
                  {cepStatus === 'not_found' && (
                    <p className="text-xs text-yellow-600">CEP não encontrado</p>
                  )}
                  {cepStatus === 'success' && (
                    <p className="text-xs text-green-600">Endereço preenchido automaticamente</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Cidade</Label>
                  <Input
                    placeholder="Cidade"
                    value={formData.cidade}
                    onChange={(e) => handleInputChange('cidade', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Bairro</Label>
                  <Input
                    placeholder="Bairro"
                    value={formData.bairro}
                    onChange={(e) => handleInputChange('bairro', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Condomínio
                    {condominios.length > 0 && (
                      <Badge variant="outline" className="text-[10px] px-1 bg-green-500/10 text-green-500 border-green-500/30">
                        {condominios.length} disponíveis
                      </Badge>
                    )}
                  </Label>
                  {condominios.length > 0 ? (
                    <Select
                      value={formData.condominio || "none"}
                      onValueChange={(value) => {
                        const condominioNome = value === "none" ? "" : value;
                        const condSelecionado = condominioNome
                          ? condominios.find(c => c.nome === condominioNome)
                          : null;
                        handleInputChange('condominio', condominioNome);
                        // O id é o que vai pro banco: sem ele, reabrir a edição
                        // perdia o condomínio (o select é por nome).
                        setFormData(prev => ({
                          ...prev,
                          condominio_id: condSelecionado?.id || '',
                          metragem_m2: condominioNome ? prev.metragem_m2 : '',
                        }));
                        setMetragensDisponiveis(condSelecionado?.metragens_disponiveis || []);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um condomínio (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {condominios.map(cond => (
                          <SelectItem key={cond.id} value={cond.nome}>
                            {cond.nome}
                            {(cond.bairro || cond.cidade) && ` - ${[cond.bairro, cond.cidade].filter(Boolean).join(', ')}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      placeholder={isLoadingCondominios ? "Carregando..." : "Digite o nome do condomínio"}
                      value={formData.condominio}
                      onChange={(e) => {
                        // Digitado à mão não tem id — não pode herdar o do registro salvo.
                        handleInputChange('condominio', e.target.value);
                        setFormData(prev => ({ ...prev, condominio_id: '' }));
                      }}
                      disabled={isLoadingCondominios}
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    {condominios.length > 0 
                      ? "Selecione um condomínio cadastrado ou deixe em branco"
                      : "Cadastre condomínios na aba 'Condomínios' para selecionar aqui"
                    }
                  </p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Logradouro</Label>
                  <Input
                    placeholder="Rua, Avenida, etc."
                    value={formData.logradouro}
                    onChange={(e) => handleInputChange('logradouro', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Número</Label>
                  <Input
                    placeholder="123"
                    value={formData.numero}
                    onChange={(e) => handleInputChange('numero', e.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-3">
                  <Label>Complemento</Label>
                  <Input
                    placeholder="Apto, Bloco, etc."
                    value={formData.complemento}
                    onChange={(e) => handleInputChange('complemento', e.target.value)}
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Seção: Características */}
          <Collapsible id="secao-caracteristicas" open={openSections.caracteristicas} onOpenChange={() => toggleSection('caracteristicas')}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-card rounded-lg border hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-5 w-5 text-orange-500" />
                <span className="font-medium">Características</span>
                {(formData.quartos || formData.area_util) && (
                  <Badge variant="secondary" className="text-xs">
                    {formData.quartos && `${formData.quartos} qts`}
                    {formData.quartos && formData.area_util && ' • '}
                    {formData.area_util && `${formData.area_util}m²`}
                  </Badge>
                )}
              </div>
              {openSections.caracteristicas ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-card/50 rounded-lg border">
                <div className="space-y-2">
                  <Label>Área Total (m²)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={formData.area_total}
                    onChange={(e) => handleInputChange('area_total', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Área Útil (m²)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={formData.area_util}
                    onChange={(e) => handleInputChange('area_util', e.target.value)}
                  />
                </div>
                
                {/* Campo de Metragem do Condomínio */}
                {metragensDisponiveis.length > 0 && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      Metragem (m²)
                      <Badge variant="outline" className="text-[10px] px-1 bg-blue-500/10 text-blue-500 border-blue-500/30">
                        Do condomínio
                      </Badge>
                    </Label>
                    <Select
                      value={formData.metragem_m2 || ""}
                      onValueChange={(value) => handleInputChange('metragem_m2', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a metragem" />
                      </SelectTrigger>
                      <SelectContent>
                        {metragensDisponiveis.map((metragem) => (
                          <SelectItem key={metragem} value={metragem.toString()}>
                            {metragem} m²
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Metragens disponíveis neste condomínio
                    </p>
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label>Quartos</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={formData.quartos}
                    onChange={(e) => handleInputChange('quartos', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Suítes</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={formData.suites}
                    onChange={(e) => handleInputChange('suites', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Banheiros</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={formData.banheiros}
                    onChange={(e) => handleInputChange('banheiros', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Vagas</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={formData.vagas}
                    onChange={(e) => handleInputChange('vagas', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Salas</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={formData.salas}
                    onChange={(e) => handleInputChange('salas', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Área Terreno (m²)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={formData.area_terreno}
                    onChange={(e) => handleInputChange('area_terreno', e.target.value)}
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Seção: Valores */}
          <Collapsible id="secao-valores" open={openSections.valores} onOpenChange={() => toggleSection('valores')}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-card rounded-lg border hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-500" />
                <span className="font-medium">Valores</span>
                {(formData.valor_venda || formData.valor_locacao) && (
                  <Badge variant="secondary" className="text-xs">
                    {formData.valor_venda && `Venda: R$ ${formData.valor_venda}`}
                    {formData.valor_venda && formData.valor_locacao && ' | '}
                    {formData.valor_locacao && `Locação: R$ ${formData.valor_locacao}`}
                  </Badge>
                )}
              </div>
              {openSections.valores ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-card/50 rounded-lg border">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <span className="text-green-600">💰</span> Valor de Venda
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">R$</span>
                    <Input
                      placeholder="0,00"
                      value={formData.valor_venda}
                      onChange={(e) => handleCurrencyInput('valor_venda', e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <span className="text-blue-600">🔑</span> Valor de Locação
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">R$</span>
                    <Input
                      placeholder="0,00"
                      value={formData.valor_locacao}
                      onChange={(e) => handleCurrencyInput('valor_locacao', e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Condomínio</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">R$</span>
                    <Input
                      placeholder="0,00"
                      value={formData.valor_condominio}
                      onChange={(e) => handleCurrencyInput('valor_condominio', e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>IPTU (anual)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">R$</span>
                    <Input
                      placeholder="0,00"
                      value={formData.valor_iptu}
                      onChange={(e) => handleCurrencyInput('valor_iptu', e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Seção: Publicação na Web */}
          <Collapsible id="secao-publicacao" open={openSections.publicacao} onOpenChange={() => toggleSection('publicacao')}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-card rounded-lg border hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-cyan-500" />
                <span className="font-medium">Publicação na Web</span>
                {formData.anunciar === 'sim' && (
                  <Badge variant="default" className="text-xs bg-green-500">Anunciando</Badge>
                )}
                {formData.titulo && (
                  <Badge variant="secondary" className="text-xs truncate max-w-[150px]">{formData.titulo}</Badge>
                )}
              </div>
              {openSections.publicacao ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="space-y-4 p-4 bg-card/50 rounded-lg border">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Anunciar</Label>
                    <Select
                      value={formData.anunciar}
                      onValueChange={(value: 'sim' | 'nao') => handleInputChange('anunciar', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sim">✅ Sim</SelectItem>
                        <SelectItem value="nao">❌ Não</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Imóvel em Destaque</Label>
                    <Select
                      value={formData.destaque}
                      onValueChange={(value: 'sim' | 'nao') => handleInputChange('destaque', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sim">⭐ Sim</SelectItem>
                        <SelectItem value="nao">Não</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Super Destaque</Label>
                    <Select
                      value={formData.super_destaque}
                      onValueChange={(value: 'sim' | 'nao') => handleInputChange('super_destaque', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sim">🌟 Sim</SelectItem>
                        <SelectItem value="nao">Não</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Título do Anúncio</Label>
                  <Input
                    placeholder="Ex: Casa 3 quartos no Jardim Europa"
                    value={formData.titulo}
                    onChange={(e) => handleInputChange('titulo', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Descrição do Site (diferenciais e detalhes)</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={gerarDescricaoIA}
                      disabled={isGerandoDescricao}
                      title="Gerar descrição com IA"
                      className="gap-1.5"
                    >
                      {isGerandoDescricao ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 text-amber-500" />
                      )}
                      <span className="text-xs">
                        {isGerandoDescricao ? 'Gerando...' : 'Gerar com IA'}
                      </span>
                    </Button>
                  </div>
                  <Textarea
                    placeholder="Descreva o imóvel, seus diferenciais, acabamentos, etc."
                    value={formData.descricao}
                    onChange={(e) => handleInputChange('descricao', e.target.value)}
                    rows={5}
                  />
                  {descricaoIaErro && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {descricaoIaErro}
                    </p>
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Seção: Mídia */}
          <Collapsible id="secao-midia" open={openSections.midia} onOpenChange={() => toggleSection('midia')}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-card rounded-lg border hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-pink-500" />
                <span className="font-medium">Mídia</span>
                {(formData.link_video || formData.tour_virtual || formData.fotos.length > 0) && (
                  <Badge variant="secondary" className="text-xs">
                    {formData.fotos.length > 0 && `📷 ${formData.fotos.length}`}
                    {formData.fotos.length > 0 && (formData.link_video || formData.tour_virtual) && ' • '}
                    {formData.link_video && '🎬 Vídeo'}
                    {formData.link_video && formData.tour_virtual && ' • '}
                    {formData.tour_virtual && '🔄 Tour'}
                  </Badge>
                )}
              </div>
              {openSections.midia ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="space-y-4 p-4 bg-card/50 rounded-lg border">
                {/* Upload de Fotos */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Fotos do Imóvel
                  </Label>
                  <FotosUploader
                    fotos={formData.fotos}
                    onChange={(fotos) => setFormData((prev) => ({ ...prev, fotos }))}
                    inputId="fotos-upload"
                  />
                </div>

                <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                  <div>
                    <Label htmlFor="sem-marca-dagua" className="text-sm font-medium">
                      As fotos já têm marca d'água
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Ligue quando as imagens já vierem marcadas (fotógrafo, construtora, portal).
                      A marca da imobiliária não é aplicada — evita marca duplicada.
                    </p>
                  </div>
                  <Switch
                    id="sem-marca-dagua"
                    checked={formData.sem_marca_dagua}
                    onCheckedChange={(v) => setFormData((prev) => ({ ...prev, sem_marca_dagua: v }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Link do Vídeo (YouTube)</Label>
                  <Input
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={formData.link_video}
                    onChange={(e) => handleInputChange('link_video', e.target.value)}
                    className={formData.link_video && !normalizeYouTubeUrl(formData.link_video) ? 'border-red-500 focus-visible:ring-red-500' : ''}
                  />
                  {formData.link_video && !normalizeYouTubeUrl(formData.link_video) && (
                    <p className="text-xs text-red-500">
                      Informe um link válido do YouTube (ex.: https://www.youtube.com/watch?v=...).
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Tour Virtual</Label>
                  <Input
                    placeholder="URL do tour virtual 360°"
                    value={formData.tour_virtual}
                    onChange={(e) => handleInputChange('tour_virtual', e.target.value)}
                    className={formData.tour_virtual && !isHttpUrl(formData.tour_virtual) ? 'border-red-500 focus-visible:ring-red-500' : ''}
                  />
                  {formData.tour_virtual && !isHttpUrl(formData.tour_virtual) && (
                    <p className="text-xs text-red-500">
                      Informe uma URL válida começando com http:// ou https://.
                    </p>
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Seção: Placas e Faixas */}
          <Collapsible open={openSections.placas} onOpenChange={() => toggleSection('placas')}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-card rounded-lg border hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-yellow-500" />
                <span className="font-medium">Placas e Faixas</span>
                {formData.placa_local === 'sim' && (
                  <Badge variant="secondary" className="text-xs">🪧 Com placa</Badge>
                )}
              </div>
              {openSections.placas ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="p-4 bg-card/50 rounded-lg border">
                <div className="space-y-2 max-w-xs">
                  <Label>Placa no Local</Label>
                  <Select
                    value={formData.placa_local}
                    onValueChange={(value: 'sim' | 'nao') => handleInputChange('placa_local', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sim">🪧 Sim</SelectItem>
                      <SelectItem value="nao">Não</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Seção: Comissões e Condições */}
          <Collapsible id="secao-comissoes" open={openSections.comissoes} onOpenChange={() => toggleSection('comissoes')}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-card rounded-lg border hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-amber-500" />
                <span className="font-medium">Comissões e Condições</span>
                {formData.tipo_comissao && (
                  <Badge variant="secondary" className="text-xs">{formData.tipo_comissao}</Badge>
                )}
              </div>
              {openSections.comissoes ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-card/50 rounded-lg border">
                <div className="space-y-2">
                  <Label>Tipo de Comissão</Label>
                  <Select
                    value={formData.tipo_comissao}
                    onValueChange={(value) => handleInputChange('tipo_comissao', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_COMISSAO.map(tipo => (
                        <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Corretor Captador *</Label>
                  <Select
                    value={formData.captador_id}
                    onValueChange={(value) => handleInputChange('captador_id', value)}
                    disabled={!podeEditarCaptador}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o captador" />
                    </SelectTrigger>
                    <SelectContent>
                      {captadores.map((c) => (
                        <SelectItem key={c.user_id} value={c.user_id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!podeEditarCaptador && (
                    <p className="text-xs text-text-secondary">
                      Somente diretoria, administrador, gestor ou o captador atual pode alterar o captador.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>2º Corretor Captador (opcional)</Label>
                  <Select
                    value={formData.captador_2_id || 'sem'}
                    onValueChange={(value) => handleInputChange('captador_2_id', value === 'sem' ? '' : value)}
                    disabled={!podeEditarCaptador}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sem 2º captador" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sem">Sem 2º captador</SelectItem>
                      {captadores.map((c) => (
                        <SelectItem key={c.user_id} value={c.user_id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Captou qual Pretensão?</Label>
                  <Select
                    value={formData.captou_pretensao}
                    onValueChange={(value) => handleInputChange('captou_pretensao', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="venda_locacao">Venda/Locação</SelectItem>
                      <SelectItem value="somente_venda">Somente Venda</SelectItem>
                      <SelectItem value="somente_locacao">Somente Locação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Condição Comercial</Label>
                  <Input
                    placeholder="Condições especiais..."
                    value={formData.condicao_comercial}
                    onChange={(e) => handleInputChange('condicao_comercial', e.target.value)}
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Seção: Características e Amenidades */}
          <Collapsible open={openSections.amenidades} onOpenChange={() => toggleSection('amenidades')}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-card rounded-lg border hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-500" />
                <span className="font-medium">Características e Amenidades</span>
                {formData.caracteristicas.length > 0 && (
                  <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                    {formData.caracteristicas.length} selecionada(s)
                  </Badge>
                )}
              </div>
              {openSections.amenidades ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="space-y-4 p-4 bg-card/50 rounded-lg border">
                <p className="text-sm text-muted-foreground">
                  Selecione as características e amenidades disponíveis no imóvel
                </p>

                <div className="flex items-center justify-between gap-4 pb-2 border-b border-border/50">
                  <div className="space-y-0.5">
                    <Label>Aceita permuta</Label>
                    <p className="text-xs text-muted-foreground">
                      Publicado no feed (ZAP/OLX/VivaReal) como "Aceita Permuta".
                    </p>
                  </div>
                  <Select
                    value={formData.aceita_troca}
                    onValueChange={(value) => handleInputChange('aceita_troca', value)}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nao">Não</SelectItem>
                      <SelectItem value="sim">Sim</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {Object.entries(CARACTERISTICAS_IMOVEL).map(([categoria, { label, items }]) => (
                  <div key={categoria} className="space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-border/50">
                      {getCategoriaIcon(categoria)}
                      <span className="font-medium text-sm text-text-primary">{label}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5">
                        {items.filter(item => formData.caracteristicas.includes(item)).length}/{items.length}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {items.map((item) => {
                        const isSelected = formData.caracteristicas.includes(item);
                        return (
                          <div
                            key={item}
                            className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all select-none ${
                              isSelected
                                ? 'bg-emerald-500 border-emerald-500 text-white'
                                : 'bg-card border-border/50 hover:bg-accent/50 hover:border-emerald-300'
                            }`}
                            onClick={() => handleCaracteristicaToggle(item)}
                          >
                            <span className={`text-xs leading-tight ${isSelected ? 'text-white font-medium' : ''}`}>
                              {item}
                            </span>
                            {isSelected && (
                              <CheckCircle className="h-4 w-4 text-white flex-shrink-0 ml-1" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {formData.caracteristicas.length > 0 && (
                  <div className="pt-3 border-t border-border/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-text-primary">
                        Selecionadas ({formData.caracteristicas.length})
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground hover:text-red-500"
                        onClick={() => setFormData(prev => ({ ...prev, caracteristicas: [] }))}
                      >
                        Limpar todas
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {formData.caracteristicas.map((item) => (
                        <Badge
                          key={item}
                          variant="secondary"
                          className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30 cursor-pointer hover:bg-red-500/10 hover:text-red-600 hover:border-red-500/30 transition-colors"
                          onClick={() => handleCaracteristicaToggle(item)}
                        >
                          {item} ×
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Seção: Chaves */}
          <Collapsible open={openSections.chaves} onOpenChange={() => toggleSection('chaves')}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-card rounded-lg border hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-amber-500" />
                <span className="font-medium">Chaves</span>
              </div>
              {openSections.chaves ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-card/50 rounded-lg border">
                <div className="space-y-2">
                  <Label>Onde fica a chave</Label>
                  <Select
                    value={formData.chave_status || 'nao_informado'}
                    onValueChange={(value) =>
                      handleInputChange('chave_status', value === 'nao_informado' ? '' : value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Não informado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nao_informado">Não informado</SelectItem>
                      <SelectItem value="imobiliaria">Na imobiliária</SelectItem>
                      <SelectItem value="portaria">Na portaria</SelectItem>
                      <SelectItem value="proprietario">Com o proprietário</SelectItem>
                      <SelectItem value="nao_temos">Não temos a chave</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Etiqueta / local</Label>
                  <Input
                    placeholder="Ex.: gaveta 2, tag A-14"
                    value={formData.chave_local}
                    onChange={(e) => handleInputChange('chave_local', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Está com</Label>
                  <Select
                    value={formData.chave_com || 'ninguem'}
                    onValueChange={(value) =>
                      handleInputChange('chave_com', value === 'ninguem' ? '' : value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No lugar dela" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ninguem">No lugar dela</SelectItem>
                      {captadores.map((c) => (
                        <SelectItem key={c.user_id} value={c.user_id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* Data carimbada pelo banco; some sozinha quando a chave volta. */}
                  {formData.chave_com && formData.chave_retirada_em && (
                    <p className="text-xs text-muted-foreground">
                      Retirada em{' '}
                      {new Date(formData.chave_retirada_em).toLocaleString('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </p>
                  )}
                </div>
                <p className="md:col-span-3 text-xs text-muted-foreground">
                  Cada troca de "Está com" fica registrada no histórico do imóvel, com autor e data.
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Seção: Confidencial / Documentação */}
          <Collapsible open={openSections.confidencial} onOpenChange={() => toggleSection('confidencial')}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-card rounded-lg border hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-gray-500" />
                <span className="font-medium">Confidencial / Documentação</span>
              </div>
              {openSections.confidencial ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-card/50 rounded-lg border">
                <div className="space-y-2">
                  <Label>Código IPTU</Label>
                  <Input
                    placeholder="Código do IPTU"
                    value={formData.codigo_iptu}
                    onChange={(e) => handleInputChange('codigo_iptu', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Número da Matrícula</Label>
                  <Input
                    placeholder="Matrícula do imóvel"
                    value={formData.numero_matricula}
                    onChange={(e) => handleInputChange('numero_matricula', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Código Eletricidade</Label>
                  <Input
                    placeholder="Código da rede elétrica"
                    value={formData.codigo_eletricidade}
                    onChange={(e) => handleInputChange('codigo_eletricidade', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Código Água</Label>
                  <Input
                    placeholder="Código da rede de água"
                    value={formData.codigo_agua}
                    onChange={(e) => handleInputChange('codigo_agua', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Títulos/Direitos</Label>
                  <Select
                    value={formData.titulos_direitos}
                    onValueChange={(value) => handleInputChange('titulos_direitos', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nao_informado">Não informado</SelectItem>
                      <SelectItem value="direitos_possessorios">Direitos Possessórios</SelectItem>
                      <SelectItem value="titulo_dominial">Título Dominial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Aprovado Órgão Ambiental</Label>
                  <Select
                    value={formData.aprovado_ambiental}
                    onValueChange={(value) => handleInputChange('aprovado_ambiental', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nao_informado">Não informado</SelectItem>
                      <SelectItem value="sim">Sim</SelectItem>
                      <SelectItem value="nao">Não</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Projeto Aprovado</Label>
                  <Select
                    value={formData.projeto_aprovado}
                    onValueChange={(value) => handleInputChange('projeto_aprovado', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nao_informado">Não informado</SelectItem>
                      <SelectItem value="sim">Sim</SelectItem>
                      <SelectItem value="nao">Não</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2 lg:col-span-4">
                  <Label>Observações da Documentação</Label>
                  <Textarea
                    placeholder="Observações sobre a documentação do imóvel..."
                    value={formData.obs_documentacao}
                    onChange={(e) => handleInputChange('obs_documentacao', e.target.value)}
                    rows={3}
                  />
                </div>
                
                <div className="space-y-2 md:col-span-2 lg:col-span-4">
                  <Label className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-amber-500" />
                    Observação Interna
                    <Badge variant="outline" className="text-[10px] px-1 bg-amber-500/10 text-amber-600 border-amber-500/30">
                      Somente equipe interna
                    </Badge>
                  </Label>
                  <Textarea
                    placeholder="Observações internas sobre o imóvel (não visível para clientes)..."
                    value={formData.obs_interna}
                    onChange={(e) => handleInputChange('obs_interna', e.target.value)}
                    rows={3}
                  />
                </div>

              </div>
            </CollapsibleContent>
          </Collapsible>
          </TabsContent>

          {isEdit && (
            <TabsContent value="historico">
              <ImovelHistorico tenantId={tenantId} codigoImovel={codigoGerado} />
            </TabsContent>
          )}
        </Tabs>

        {/* Botões de Ação */}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t">
          {modoRascunho ? (
            <Button
              variant="outline"
              className="sm:mr-auto text-red-600 hover:text-red-700"
              onClick={() => setConfirmarExclusao(true)}
              disabled={ocupado}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir rascunho
            </Button>
          ) : (
            <Button variant="outline" onClick={handleClose} disabled={ocupado}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
          )}
          {!modoPublicado && (
            <Button
              variant="outline"
              onClick={() => void salvarRascunho()}
              disabled={ocupado || isGeneratingCodigo || rascunhoIndisponivel}
            >
              {salvandoRascunho ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FilePen className="h-4 w-4 mr-2" />
              )}
              Salvar rascunho
            </Button>
          )}
          {/* Rascunho que outra tela publicou/excluiu: publicar daqui sobrescreveria a linha. */}
          <Button onClick={() => void publicar()} disabled={ocupado || rascunhoIndisponivel}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {modoPublicado ? 'Salvar Imóvel' : 'Publicar imóvel'}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <ImovelDuplicadoDialog
      open={showDuplicadoDialog}
      matches={duplicadosDetectados}
      proprietarioNome={formData.proprietario_nome}
      onCancel={() => {
        setShowDuplicadoDialog(false);
        setDuplicadosDetectados([]);
      }}
      onConfirm={() => {
        setShowDuplicadoDialog(false);
        setDuplicadosDetectados([]);
        void publicar(true);
      }}
    />

    {/* z-[10000]: acima do DialogContent (z-[9999]), como o ImovelDuplicadoDialog.
        Clique e ESC ficam só no alerta (camada mais alta do Radix). */}
    <AlertDialog open={confirmarSaida} onOpenChange={setConfirmarSaida}>
      <AlertDialogContent className="z-[10000]">
        <AlertDialogHeader>
          <AlertDialogTitle>Sair sem salvar?</AlertDialogTitle>
          <AlertDialogDescription>
            Existem alterações que ainda não foram salvas. Deseja sair mesmo assim?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continuar editando</AlertDialogCancel>
          <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" onClick={fechar}>
            Sair sem salvar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog
      open={confirmarExclusao}
      onOpenChange={(aberto) => { if (!excluindoRascunho) setConfirmarExclusao(aberto); }}
    >
      <AlertDialogContent className="z-[10000]">
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir rascunho</AlertDialogTitle>
          <AlertDialogDescription>
            Deseja excluir este rascunho? As informações preenchidas serão perdidas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={excluindoRascunho}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 text-white hover:bg-red-700"
            disabled={excluindoRascunho || salvandoRascunho}
            onClick={(e) => { e.preventDefault(); void excluirRascunhoAtual(); }}
          >
            {excluindoRascunho ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Excluindo…</> : 'Excluir rascunho'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};

export default CriarImovelForm;

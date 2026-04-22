/**
 * 🏠 Formulário de Criação de Imóvel
 * Inspirado no layout do Kenlo, adaptado ao design system OctoDash
 * Apenas o código do imóvel é obrigatório
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { buscarCep, formatarCepExibicao, validarCep } from '@/services/viaCepService';
import { supabase } from '@/lib/supabaseClient';
import { FotosUploader } from './FotosUploader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Shield
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

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
  initialData?: Partial<ImovelFormData> & { codigo_imovel?: string; status_aprovacao?: string; exclusivo?: 'sim' | 'nao' };
  isEdit?: boolean;
}

interface ImovelFormData {
  // Obrigatório
  codigo_imovel: string;
  exclusivo: 'sim' | 'nao';
  
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
  condominio: string;
  
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
  
  // Placas e Faixas
  placa_local: 'sim' | 'nao';
  
  // Comissões e Condições
  tipo_comissao: string;
  corretor_captador: string;
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
  placa_local: 'nao',
  tipo_comissao: '',
  corretor_captador: '',
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
};

const TIPOS_RESIDENCIAL = [
  'Apartamento', 'Apartamento Duplex', 'Apartamento Garden', 'Apartamento Triplex',
  'Casa', 'Sobrado', 'Cobertura', 'Flat', 'Kitnet', 'Loft', 'Penthouse',
  'Studio', 'Village', 'Terreno', 'Chácara', 'Sítio'
];

const TIPOS_COMERCIAL = [
  'Sala Comercial', 'Loja', 'Galpão', 'Prédio Comercial', 'Ponto Comercial',
  'Box/Garagem', 'Terreno Comercial'
];

const TIPOS_INDUSTRIAL = [
  'Galpão Industrial', 'Área Industrial', 'Terreno Industrial'
];

const TIPOS_RURAL = [
  'Chácara', 'Sítio', 'Fazenda', 'Rancho', 'Área Rural'
];

const TIPOS_TEMPORADA = [
  'Casa de Praia', 'Casa de Campo', 'Apartamento Temporada', 'Flat Temporada',
  'Chalé', 'Pousada'
];

const TIPOS_CORPORATIVA = [
  'Escritório', 'Sala Corporativa', 'Andar Corporativo', 'Prédio Corporativo',
  'Coworking'
];

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
      'Salão de jogos'
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

export const CriarImovelForm = ({
  isOpen,
  onClose,
  onSuccess,
  initialData,
  isEdit = false,
}: CriarImovelFormProps) => {
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  
  const [formData, setFormData] = useState<ImovelFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [submitMessage, setSubmitMessage] = useState('');
  
  // Código gerado automaticamente
  const [codigoGerado, setCodigoGerado] = useState<string>('');
  const [isGeneratingCodigo, setIsGeneratingCodigo] = useState(false);
  const [editStatusAprovacao, setEditStatusAprovacao] = useState<string | null>(null);
  
  // Condomínios do banco
  const [condominios, setCondominios] = useState<CondominioOption[]>([]);
  const [isLoadingCondominios, setIsLoadingCondominios] = useState(false);
  const [metragensDisponiveis, setMetragensDisponiveis] = useState<number[]>([]);
  
  // Estados para busca de CEP
  const [isBuscandoCep, setIsBuscandoCep] = useState(false);
  const [cepStatus, setCepStatus] = useState<'idle' | 'success' | 'error' | 'not_found'>('idle');

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

  // Gerar código automaticamente quando o tipo mudar
  const generateCodigoImovel = async (tipo: string) => {
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
    try {
      // Buscar todos os códigos existentes com esse prefixo para o tenant
      const { data, error } = await supabase
        .from('imoveis_corretores')
        .select('codigo_imovel')
        .eq('tenant_id', tenantId)
        .ilike('codigo_imovel', `${prefixo}%`);

      if (error) throw error;

      // Encontrar o maior número existente
      let maxNumero = 0;
      if (data && data.length > 0) {
        data.forEach((item) => {
          const match = item.codigo_imovel.match(new RegExp(`^${prefixo}(\\d+)$`));
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNumero) maxNumero = num;
          }
        });
      }

      // Próximo número
      const proximoNumero = maxNumero + 1;
      
      // Formatar com 3 dígitos (ou 4 se > 999)
      const digitos = proximoNumero > 999 ? 4 : 3;
      const novoCodigo = `${prefixo}${proximoNumero.toString().padStart(digitos, '0')}`;
      
      setCodigoGerado(novoCodigo);
    } catch (err) {
      console.error('Erro ao gerar código:', err);
      setCodigoGerado('');
    } finally {
      setIsGeneratingCodigo(false);
    }
  };

  // Regenerar código quando tipo mudar
  useEffect(() => {
    if (isEdit) return;
    if (formData.tipo && isOpen) {
      generateCodigoImovel(formData.tipo);
    } else {
      setCodigoGerado('');
    }
  }, [formData.tipo, tenantId, isOpen, isEdit]);

  useEffect(() => {
    if (isOpen) {
      if (isEdit && initialData) {
        setFormData({
          ...initialFormData,
          ...initialData,
          fotos: initialData.fotos || [],
          caracteristicas: initialData.caracteristicas || [],
        });
        setCodigoGerado(initialData.codigo_imovel || '');
        setEditStatusAprovacao(initialData.status_aprovacao || null);
      } else {
        setFormData(initialFormData);
        setCodigoGerado('');
        setEditStatusAprovacao(null);
      }
      setSubmitStatus('idle');
      setSubmitMessage('');
    }
  }, [initialData, isEdit, isOpen]);
  
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
  });

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
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

  const formatCurrency = (value: string): string => {
    const numbers = value.replace(/\D/g, '');
    if (!numbers) return '';
    const amount = parseInt(numbers) / 100;
    return amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  };

  const handleCurrencyInput = (field: keyof ImovelFormData, value: string) => {
    const formatted = formatCurrency(value);
    handleInputChange(field, formatted);
  };

  const parseCurrency = (value: string): number => {
    if (!value) return 0;
    return parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0;
  };

  const handleSubmit = async () => {
    // Validar tipo obrigatório (necessário para gerar código)
    if (!formData.tipo) {
      setSubmitStatus('error');
      setSubmitMessage('Selecione o tipo do imóvel para gerar o código automaticamente');
      return;
    }

    if (!codigoGerado) {
      setSubmitStatus('error');
      setSubmitMessage('Aguarde a geração do código do imóvel');
      return;
    }

    if (!tenantId || !user?.id) {
      setSubmitStatus('error');
      setSubmitMessage('Erro de autenticação. Recarregue a página.');
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus('idle');
    setSubmitMessage('');

    // Usar código gerado automaticamente
    const codigoNormalizado = codigoGerado;

    try {
      if (!isEdit) {
        // Verificar se código já existe
        const { data: existing, error: fetchError } = await supabase
          .from('imoveis_corretores')
          .select('id, corretor_nome')
          .eq('tenant_id', tenantId)
          .eq('codigo_imovel', codigoNormalizado);

        if (fetchError) throw fetchError;

        if (existing && existing.length > 0) {
          setSubmitStatus('error');
          setSubmitMessage(`Código ${codigoNormalizado} já existe (atribuído a ${existing[0].corretor_nome})`);
          setIsSubmitting(false);
          return;
        }
      }

      // Preparar dados do corretor
      const corretorNome = user.name || user.email?.split('@')[0] || 'Corretor';
      const corretorTelefone = user.telefone ? String(user.telefone).replace(/\D/g, '') : null;

      if (!isEdit) {
        // Criar registro na tabela imoveis_corretores
        const { error: insertError } = await supabase
          .from('imoveis_corretores')
          .insert({
            tenant_id: tenantId,
            codigo_imovel: codigoNormalizado,
            exclusivo: formData.exclusivo === 'sim',
            corretor_id: user.id,
            corretor_nome: corretorNome,
            corretor_email: user.email || null,
            corretor_telefone: corretorTelefone,
          });

        if (insertError) throw insertError;
      } else {
        const { error: updateBrokerError } = await supabase
          .from('imoveis_corretores')
          .update({ exclusivo: formData.exclusivo === 'sim' })
          .eq('tenant_id', tenantId)
          .eq('codigo_imovel', codigoNormalizado);

        if (updateBrokerError) throw updateBrokerError;
      }

      // Salvar detalhes completos do imóvel na tabela imoveis_locais
      await saveImovelLocal(codigoNormalizado);

      setSubmitStatus('success');
      setSubmitMessage(isEdit ? `Imóvel ${codigoNormalizado} atualizado com sucesso!` : `Imóvel ${codigoNormalizado} criado com sucesso!`);

      // Fechar após delay
      setTimeout(() => {
        setFormData(initialFormData);
        setCodigoGerado('');
        setEditStatusAprovacao(null);
        onSuccess();
        onClose();
      }, 1500);

    } catch (err: any) {
      console.error('❌ Erro ao criar imóvel:', err);
      setSubmitStatus('error');
      setSubmitMessage(err.message || 'Erro ao criar imóvel. Tente novamente.');
    } finally {
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

  const saveImovelLocal = async (codigoImovel: string) => {
    // Gerar título automático se não preenchido
    const tituloAuto = formData.titulo || 
      `${formData.tipo || 'Imóvel'} ${formData.bairro ? `- ${formData.bairro}` : ''} ${formData.cidade ? `- ${formData.cidade}` : ''}`;
    
    // Determinar finalidade para exibição
    let finalidadeExibicao = 'venda';
    if (parseCurrency(formData.valor_venda) > 0 && parseCurrency(formData.valor_locacao) > 0) {
      finalidadeExibicao = 'venda_locacao';
    } else if (parseCurrency(formData.valor_locacao) > 0) {
      finalidadeExibicao = 'locacao';
    }

    // Buscar ID do condomínio se selecionado
    const condominioSelecionado = formData.condominio 
      ? condominios.find(c => c.nome === formData.condominio)
      : null;

    const imovelLocal = {
      tenant_id: tenantId,
      codigo_imovel: codigoImovel,
      exclusivo: formData.exclusivo === 'sim',
      titulo: tituloAuto.trim(),
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
      condominio_id: condominioSelecionado?.id || null,
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
      fotos: formData.fotos.length > 0 ? formData.fotos : [],
      proprietario_nome: formData.proprietario_nome || null,
      proprietario_telefone: formData.proprietario_celular || formData.proprietario_tel_residencial || null,
      proprietario_email: formData.proprietario_email || null,
      criado_por: user?.id || null,
      status_aprovacao: isEdit ? editStatusAprovacao || 'aguardando' : 'aguardando',
    };


    const { error } = await supabase
      .from('imoveis_locais')
      .upsert(imovelLocal, { onConflict: 'tenant_id,codigo_imovel' });

    if (error) {
      console.error('❌ Erro ao salvar imóvel local:', error.message);
      throw error;
    }
    
  };

  const handleClose = () => {
    setFormData(initialFormData);
    setSubmitStatus('idle');
    setSubmitMessage('');
    onClose();
  };

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
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto z-[9999]">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Building2 className="h-6 w-6 text-primary" />
            Novo Imóvel
          </DialogTitle>
          <p className="text-sm text-text-secondary mt-1">
            Cadastre um novo imóvel. Apenas o código é obrigatório.
          </p>
        </DialogHeader>

        <div className="space-y-4 py-4">
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
              {codigoGerado && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generateCodigoImovel(formData.tipo)}
                  disabled={isGeneratingCodigo}
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

          {/* Status de Submissão */}
          {submitMessage && (
            <div className={`flex items-center gap-2 p-3 rounded-lg ${
              submitStatus === 'success' 
                ? 'bg-green-500/10 text-green-600 border border-green-500/20' 
                : 'bg-red-500/10 text-red-600 border border-red-500/20'
            }`}>
              {submitStatus === 'success' ? (
                <CheckCircle className="h-5 w-5" />
              ) : (
                <AlertCircle className="h-5 w-5" />
              )}
              <span>{submitMessage}</span>
            </div>
          )}

          {/* Seção: Proprietário */}
          <Collapsible open={openSections.proprietario} onOpenChange={() => toggleSection('proprietario')}>
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
                <div className="space-y-2 md:col-span-2 lg:col-span-3">
                  <Label>Nome do Proprietário</Label>
                  <Input
                    placeholder="Nome completo"
                    value={formData.proprietario_nome}
                    onChange={(e) => handleInputChange('proprietario_nome', e.target.value)}
                  />
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
                    onValueChange={(value: 'sim' | 'nao') => handleInputChange('exclusivo', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a exclusividade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nao">Não exclusivo</SelectItem>
                      <SelectItem value="sim">Exclusivo</SelectItem>
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
          <Collapsible open={openSections.estrutura} onOpenChange={() => toggleSection('estrutura')}>
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
                  <Select
                    value={formData.finalidade}
                    onValueChange={(value) => {
                      handleInputChange('finalidade', value);
                      handleInputChange('tipo', ''); // Reset tipo
                    }}
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
                    disabled={!formData.finalidade}
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
          <Collapsible open={openSections.localizacao} onOpenChange={() => toggleSection('localizacao')}>
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
                    CEP
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
                        handleInputChange('condominio', condominioNome);
                        
                        // Carregar metragens do condomínio selecionado
                        if (condominioNome) {
                          const condSelecionado = condominios.find(c => c.nome === condominioNome);
                          if (condSelecionado && condSelecionado.metragens_disponiveis) {
                            setMetragensDisponiveis(condSelecionado.metragens_disponiveis);
                          } else {
                            setMetragensDisponiveis([]);
                          }
                        } else {
                          setMetragensDisponiveis([]);
                          handleInputChange('metragem_m2', '');
                        }
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
                      onChange={(e) => handleInputChange('condominio', e.target.value)}
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
          <Collapsible open={openSections.caracteristicas} onOpenChange={() => toggleSection('caracteristicas')}>
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
          <Collapsible open={openSections.valores} onOpenChange={() => toggleSection('valores')}>
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
          <Collapsible open={openSections.publicacao} onOpenChange={() => toggleSection('publicacao')}>
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
                  <Label>Descrição do Site (diferenciais e detalhes)</Label>
                  <Textarea
                    placeholder="Descreva o imóvel, seus diferenciais, acabamentos, etc."
                    value={formData.descricao}
                    onChange={(e) => handleInputChange('descricao', e.target.value)}
                    rows={5}
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Seção: Mídia */}
          <Collapsible open={openSections.midia} onOpenChange={() => toggleSection('midia')}>
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
                
                <div className="space-y-2">
                  <Label>Link do Vídeo (YouTube)</Label>
                  <Input
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={formData.link_video}
                    onChange={(e) => handleInputChange('link_video', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tour Virtual</Label>
                  <Input
                    placeholder="URL do tour virtual 360°"
                    value={formData.tour_virtual}
                    onChange={(e) => handleInputChange('tour_virtual', e.target.value)}
                  />
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
          <Collapsible open={openSections.comissoes} onOpenChange={() => toggleSection('comissoes')}>
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
                  <Label>Corretor Captador</Label>
                  <Input
                    placeholder="Nome do corretor"
                    value={formData.corretor_captador}
                    onChange={(e) => handleInputChange('corretor_captador', e.target.value)}
                  />
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
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Botões de Ação */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            <X className="h-4 w-4 mr-2" />
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !codigoGerado || !formData.tipo}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Salvar Imóvel
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CriarImovelForm;

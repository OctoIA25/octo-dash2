/**
 * 🏢 Formulário de Criação de Condomínio
 * Baseado nos campos do Kenlo, adaptado ao design system OctoDash
 * Campos organizados em seções colapsáveis
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
import { Checkbox } from '@/components/ui/checkbox';
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
  Building2,
  MapPin,
  Settings,
  Shield,
  Dumbbell,
  Users,
  Globe,
  ChevronDown,
  ChevronUp,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  Accessibility,
  Leaf,
  Wrench,
  Upload,
  Image as ImageIcon,
  Trash2,
  Search,
  LayoutGrid,
  Plus,
  X,
} from 'lucide-react';

interface CriarCondominioFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: Partial<CondominioFormData> & { id?: string };
  isEdit?: boolean;
}

interface CondominioFormData {
  // Identificação
  nome: string;
  
  // Localização
  pais: string;
  estado: string;
  cidade: string;
  bairro: string;
  logradouro: string;
  numero: string;
  cep: string;
  
  // Sobre o Empreendimento
  tipo: string;
  status: string;
  status_comercial: string;
  construtora: string;
  incorporadora: string;
  ano_construcao: string;
  imobiliaria_exclusiva: string;
  num_blocos_torres: string;
  data_entrega: string;
  
  // Infraestrutura - Acessibilidade
  infra_acesso_pne: boolean;
  infra_banheiro_pne: boolean;
  infra_elevador: boolean;
  infra_elevador_servico: boolean;
  
  // Infraestrutura - Ecológico
  infra_aquecedor_solar: boolean;
  infra_coleta_reciclavel: boolean;
  infra_reaprov_agua_chuva: boolean;
  infra_energia_solar: boolean;
  
  // Infraestrutura - Básico
  infra_esgoto: boolean;
  infra_guarita: boolean;
  infra_praca_recreacao: boolean;
  
  // Infraestrutura - Esporte/Lazer
  infra_academia: boolean;
  infra_bicicletario: boolean;
  infra_brinquedoteca: boolean;
  infra_campo_futebol: boolean;
  infra_churrasqueira: boolean;
  infra_deck_molhado: boolean;
  infra_espaco_gourmet: boolean;
  infra_espaco_zen: boolean;
  infra_hidromassagem: boolean;
  infra_lago: boolean;
  infra_piscina: boolean;
  infra_piscina_adulto: boolean;
  infra_piscina_aquecida: boolean;
  infra_piscina_coberta: boolean;
  infra_piscina_infantil: boolean;
  infra_playground: boolean;
  infra_quadra_beach_tenis: boolean;
  infra_quadra_squash: boolean;
  infra_quadra_tenis: boolean;
  infra_quadra_gramada: string;
  infra_quadra_poliesportiva: boolean;
  infra_sala_fitness: boolean;
  infra_sala_ginastica: string;
  infra_salao_festas: boolean;
  infra_salao_jogos: boolean;
  infra_salao_cinema: boolean;
  infra_sauna_seca: boolean;
  infra_sauna_umida: boolean;
  infra_solarium: boolean;
  infra_spa: boolean;
  
  // Infraestrutura - Segurança
  infra_cabine_primaria: boolean;
  infra_catraca_eletronica: boolean;
  infra_cerca_eletrica: boolean;
  infra_circuito_tv: boolean;
  infra_guarita_blindada: boolean;
  infra_guarita_seguranca: boolean;
  infra_portao_eletronico: boolean;
  infra_portaria_24h: boolean;
  infra_seguranca_interna: boolean;
  infra_seguranca_patrimonial: boolean;
  infra_sistema_incendio: boolean;
  infra_sistema_seguranca: boolean;
  infra_vigia_externo: boolean;
  infra_vigilancia_24h: boolean;
  
  // Infraestrutura - Serviços
  infra_central_limpeza: boolean;
  infra_escritorio_virtual: boolean;
  infra_massagista: boolean;
  infra_personal_training: boolean;
  infra_restaurante: boolean;
  infra_sala_massagem: boolean;
  infra_tv_cabo: boolean;
  infra_wifi: boolean;
  
  // Infraestrutura - Social
  infra_estacionamento_rotativo: boolean;
  infra_lavanderia_coletiva: boolean;
  infra_praca_convivencia: boolean;
  infra_vaga_visita: string;
  
  // Publicação
  publicar_site: boolean;
  destaque: boolean;
  tour_virtual: string;
  descricao_site: string;
  
  // Fotos
  fotos: import('./FotosUploader').Foto[];
  
  // Metragens disponíveis
  metragens_disponiveis: number[];
}

const initialFormData: CondominioFormData = {
  nome: '',
  pais: 'Brasil',
  estado: 'SP',
  cidade: '',
  bairro: '',
  logradouro: '',
  numero: '',
  cep: '',
  tipo: '',
  status: '',
  status_comercial: '',
  construtora: '',
  incorporadora: '',
  ano_construcao: '',
  imobiliaria_exclusiva: '',
  num_blocos_torres: '',
  data_entrega: '',
  infra_acesso_pne: false,
  infra_banheiro_pne: false,
  infra_elevador: false,
  infra_elevador_servico: false,
  infra_aquecedor_solar: false,
  infra_coleta_reciclavel: false,
  infra_reaprov_agua_chuva: false,
  infra_energia_solar: false,
  infra_esgoto: false,
  infra_guarita: false,
  infra_praca_recreacao: false,
  infra_academia: false,
  infra_bicicletario: false,
  infra_brinquedoteca: false,
  infra_campo_futebol: false,
  infra_churrasqueira: false,
  infra_deck_molhado: false,
  infra_espaco_gourmet: false,
  infra_espaco_zen: false,
  infra_hidromassagem: false,
  infra_lago: false,
  infra_piscina: false,
  infra_piscina_adulto: false,
  infra_piscina_aquecida: false,
  infra_piscina_coberta: false,
  infra_piscina_infantil: false,
  infra_playground: false,
  infra_quadra_beach_tenis: false,
  infra_quadra_squash: false,
  infra_quadra_tenis: false,
  infra_quadra_gramada: '',
  infra_quadra_poliesportiva: false,
  infra_sala_fitness: false,
  infra_sala_ginastica: '',
  infra_salao_festas: false,
  infra_salao_jogos: false,
  infra_salao_cinema: false,
  infra_sauna_seca: false,
  infra_sauna_umida: false,
  infra_solarium: false,
  infra_spa: false,
  infra_cabine_primaria: false,
  infra_catraca_eletronica: false,
  infra_cerca_eletrica: false,
  infra_circuito_tv: false,
  infra_guarita_blindada: false,
  infra_guarita_seguranca: false,
  infra_portao_eletronico: false,
  infra_portaria_24h: false,
  infra_seguranca_interna: false,
  infra_seguranca_patrimonial: false,
  infra_sistema_incendio: false,
  infra_sistema_seguranca: false,
  infra_vigia_externo: false,
  infra_vigilancia_24h: false,
  infra_central_limpeza: false,
  infra_escritorio_virtual: false,
  infra_massagista: false,
  infra_personal_training: false,
  infra_restaurante: false,
  infra_sala_massagem: false,
  infra_tv_cabo: false,
  infra_wifi: false,
  infra_estacionamento_rotativo: false,
  infra_lavanderia_coletiva: false,
  infra_praca_convivencia: false,
  infra_vaga_visita: '',
  publicar_site: false,
  destaque: false,
  tour_virtual: '',
  descricao_site: '',
  fotos: [],
  metragens_disponiveis: [],
};

const TIPOS_CONDOMINIO = [
  'Condomínio Residencial',
  'Edifício',
  'Loteamento',
  'Condomínio Comercial',
  'Conjunto Comercial',
  'Shopping',
  'Condomínio Misto',
  'Condomínio Empresarial',
  'Condomínio Industrial',
  'Condomínio Logístico',
];

const STATUS_EMPREENDIMENTO = [
  'Pré-lançamento',
  'Lançamento',
  'Em Construção',
  'Em Acabamento',
  'Pronto',
  'Pronto para Morar',
  'Últimas unidades',
  'Revenda',
  'Futuro lançamento',
];

const STATUS_COMERCIAL = [
  'Condomínios (Imóveis terceiros)',
  'Lançamentos (Imóveis novos)',
];

const ESTADOS_BR = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO'
];

export const CriarCondominioForm = ({
  isOpen,
  onClose,
  onSuccess,
  initialData,
  isEdit = false,
}: CriarCondominioFormProps) => {
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  
  const [formData, setFormData] = useState<CondominioFormData>(initialFormData);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [submitMessage, setSubmitMessage] = useState('');
  const [isBuscandoCep, setIsBuscandoCep] = useState(false);
  const [cepStatus, setCepStatus] = useState<'idle' | 'success' | 'error' | 'not_found'>('idle');
  
  // Estado para gerenciar metragens
  const [novaMetragem, setNovaMetragem] = useState('');
  
  // Seções colapsáveis
  const [openSections, setOpenSections] = useState({
    localizacao: true,
    empreendimento: true,
    metragens: true,
    acessibilidade: false,
    ecologico: false,
    basico: false,
    esporteLazer: false,
    seguranca: false,
    servicos: false,
    social: false,
    publicacao: false,
  });

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleInputChange = (field: keyof CondominioFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (submitStatus !== 'idle') {
      setSubmitStatus('idle');
      setSubmitMessage('');
    }
  };

  // Adicionar metragem à lista
  const handleAdicionarMetragem = () => {
    const metragemNum = parseFloat(novaMetragem);
    if (!novaMetragem || isNaN(metragemNum) || metragemNum <= 0) {
      return;
    }
    
    // Verificar se já existe
    if (formData.metragens_disponiveis.includes(metragemNum)) {
      setSubmitStatus('error');
      setSubmitMessage('Esta metragem já foi adicionada');
      setTimeout(() => {
        setSubmitStatus('idle');
        setSubmitMessage('');
      }, 2000);
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      metragens_disponiveis: [...prev.metragens_disponiveis, metragemNum].sort((a, b) => a - b)
    }));
    setNovaMetragem('');
  };

  // Remover metragem da lista
  const handleRemoverMetragem = (metragem: number) => {
    setFormData(prev => ({
      ...prev,
      metragens_disponiveis: prev.metragens_disponiveis.filter(m => m !== metragem)
    }));
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

  useEffect(() => {
    if (isOpen) {
      if (isEdit && initialData) {
        setFormData({
          ...initialFormData,
          ...initialData,
          metragens_disponiveis: initialData.metragens_disponiveis || [],
          fotos: initialData.fotos || [],
        });
        setEditingId(initialData.id || null);
      } else {
        setFormData(initialFormData);
        setEditingId(null);
      }
      setSubmitStatus('idle');
      setSubmitMessage('');
    }
  }, [initialData, isEdit, isOpen]);

  const handleSubmit = async () => {
    if (!formData.nome.trim()) {
      setSubmitStatus('error');
      setSubmitMessage('O nome do condomínio é obrigatório');
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

    try {
      // Preparar dados para inserção
      const condominioData = {
        tenant_id: tenantId,
        nome: formData.nome.trim(),
        pais: formData.pais || 'Brasil',
        estado: formData.estado || null,
        cidade: formData.cidade || null,
        bairro: formData.bairro || null,
        logradouro: formData.logradouro || null,
        numero: formData.numero || null,
        cep: formData.cep || null,
        tipo: formData.tipo || null,
        status: formData.status || null,
        status_comercial: formData.status_comercial || null,
        construtora: formData.construtora || null,
        incorporadora: formData.incorporadora || null,
        ano_construcao: formData.ano_construcao ? parseInt(formData.ano_construcao) : null,
        imobiliaria_exclusiva: formData.imobiliaria_exclusiva || null,
        num_blocos_torres: formData.num_blocos_torres ? parseInt(formData.num_blocos_torres) : null,
        data_entrega: formData.data_entrega || null,
        // Infraestrutura booleans
        infra_acesso_pne: formData.infra_acesso_pne,
        infra_banheiro_pne: formData.infra_banheiro_pne,
        infra_elevador: formData.infra_elevador,
        infra_elevador_servico: formData.infra_elevador_servico,
        infra_aquecedor_solar: formData.infra_aquecedor_solar,
        infra_coleta_reciclavel: formData.infra_coleta_reciclavel,
        infra_reaprov_agua_chuva: formData.infra_reaprov_agua_chuva,
        infra_energia_solar: formData.infra_energia_solar,
        infra_esgoto: formData.infra_esgoto,
        infra_guarita: formData.infra_guarita,
        infra_praca_recreacao: formData.infra_praca_recreacao,
        infra_academia: formData.infra_academia,
        infra_bicicletario: formData.infra_bicicletario,
        infra_brinquedoteca: formData.infra_brinquedoteca,
        infra_campo_futebol: formData.infra_campo_futebol,
        infra_churrasqueira: formData.infra_churrasqueira,
        infra_deck_molhado: formData.infra_deck_molhado,
        infra_espaco_gourmet: formData.infra_espaco_gourmet,
        infra_espaco_zen: formData.infra_espaco_zen,
        infra_hidromassagem: formData.infra_hidromassagem,
        infra_lago: formData.infra_lago,
        infra_piscina: formData.infra_piscina,
        infra_piscina_adulto: formData.infra_piscina_adulto,
        infra_piscina_aquecida: formData.infra_piscina_aquecida,
        infra_piscina_coberta: formData.infra_piscina_coberta,
        infra_piscina_infantil: formData.infra_piscina_infantil,
        infra_playground: formData.infra_playground,
        infra_quadra_beach_tenis: formData.infra_quadra_beach_tenis,
        infra_quadra_squash: formData.infra_quadra_squash,
        infra_quadra_tenis: formData.infra_quadra_tenis,
        infra_quadra_gramada: formData.infra_quadra_gramada ? parseInt(formData.infra_quadra_gramada) : 0,
        infra_quadra_poliesportiva: formData.infra_quadra_poliesportiva,
        infra_sala_fitness: formData.infra_sala_fitness,
        infra_sala_ginastica: formData.infra_sala_ginastica ? parseInt(formData.infra_sala_ginastica) : 0,
        infra_salao_festas: formData.infra_salao_festas,
        infra_salao_jogos: formData.infra_salao_jogos,
        infra_salao_cinema: formData.infra_salao_cinema,
        infra_sauna_seca: formData.infra_sauna_seca,
        infra_sauna_umida: formData.infra_sauna_umida,
        infra_solarium: formData.infra_solarium,
        infra_spa: formData.infra_spa,
        infra_cabine_primaria: formData.infra_cabine_primaria,
        infra_catraca_eletronica: formData.infra_catraca_eletronica,
        infra_cerca_eletrica: formData.infra_cerca_eletrica,
        infra_circuito_tv: formData.infra_circuito_tv,
        infra_guarita_blindada: formData.infra_guarita_blindada,
        infra_guarita_seguranca: formData.infra_guarita_seguranca,
        infra_portao_eletronico: formData.infra_portao_eletronico,
        infra_portaria_24h: formData.infra_portaria_24h,
        infra_seguranca_interna: formData.infra_seguranca_interna,
        infra_seguranca_patrimonial: formData.infra_seguranca_patrimonial,
        infra_sistema_incendio: formData.infra_sistema_incendio,
        infra_sistema_seguranca: formData.infra_sistema_seguranca,
        infra_vigia_externo: formData.infra_vigia_externo,
        infra_vigilancia_24h: formData.infra_vigilancia_24h,
        infra_central_limpeza: formData.infra_central_limpeza,
        infra_escritorio_virtual: formData.infra_escritorio_virtual,
        infra_massagista: formData.infra_massagista,
        infra_personal_training: formData.infra_personal_training,
        infra_restaurante: formData.infra_restaurante,
        infra_sala_massagem: formData.infra_sala_massagem,
        infra_tv_cabo: formData.infra_tv_cabo,
        infra_wifi: formData.infra_wifi,
        infra_estacionamento_rotativo: formData.infra_estacionamento_rotativo,
        infra_lavanderia_coletiva: formData.infra_lavanderia_coletiva,
        infra_praca_convivencia: formData.infra_praca_convivencia,
        infra_vaga_visita: formData.infra_vaga_visita ? parseInt(formData.infra_vaga_visita) : 0,
        publicar_site: formData.publicar_site,
        destaque: formData.destaque,
        tour_virtual: formData.tour_virtual || null,
        descricao_site: formData.descricao_site || null,
        fotos: formData.fotos.length > 0 ? formData.fotos : [],
        metragens_disponiveis: formData.metragens_disponiveis,
        criado_por: user.id,
        status_aprovacao: 'aguardando', // Novo condomínio sempre inicia aguardando aprovação
      };

      const runSave = async (payload: typeof condominioData) => {
        if (isEdit && editingId) {
          return supabase
            .from('condominios')
            .update(payload)
            .eq('id', editingId)
            .select()
            .single();
        }
        return supabase
          .from('condominios')
          .insert(payload)
          .select()
          .single();
      };

      let { data: savedRow, error } = await runSave(condominioData);

      if (error && error.message?.includes('fotos')) {
        console.warn('⚠️ Retry salvando sem coluna fotos:', error.message);
        const { fotos, ...condominioDataSemFotos } = condominioData as any;
        const retry = await runSave(condominioDataSemFotos);
        savedRow = retry.data;
        error = retry.error;
      }

      if (error) throw error;
      if (!savedRow) throw new Error('O banco aceitou a requisição mas não retornou o condomínio salvo. Verifique as permissões (RLS) do seu usuário.');

      setSubmitStatus('success');
      setSubmitMessage(
        isEdit
          ? `Condomínio "${formData.nome}" atualizado com sucesso!`
          : `Condomínio "${formData.nome}" criado com sucesso!`
      );

      // Fechar imediatamente após sucesso
      setFormData(initialFormData);
      setEditingId(null);
      onSuccess();
      onClose();
      setTimeout(() => {
        onClose();
      }, 800);

    } catch (err: any) {
      console.error('❌ Erro ao salvar condomínio:', err);
      setSubmitStatus('error');
      setSubmitMessage(err.message || 'Erro ao salvar condomínio. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setFormData(initialFormData);
    setEditingId(null);
    setSubmitStatus('idle');
    setSubmitMessage('');
    onClose();
  };

  // Componente para checkbox de infraestrutura
  const InfraCheckbox = ({ field, label }: { field: keyof CondominioFormData; label: string }) => (
    <div className="flex items-center space-x-2">
      <Checkbox
        id={field}
        checked={formData[field] as boolean}
        onCheckedChange={(checked) => handleInputChange(field, checked as boolean)}
      />
      <label htmlFor={field} className="text-sm text-text-primary cursor-pointer">
        {label}
      </label>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto z-[9999]">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Building2 className="h-6 w-6 text-primary" />
            {isEdit ? 'Editar Condomínio, Edifício ou Lançamento' : 'Novo Condomínio, Edifício ou Lançamento'}
          </DialogTitle>
          <p className="text-sm text-text-secondary mt-1">
            Cadastre um novo empreendimento. Apenas o nome é obrigatório.
          </p>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Nome - OBRIGATÓRIO */}
          <div className="bg-gradient-to-r from-primary/5 to-primary/10 rounded-lg p-4 border border-primary/20">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="default" className="bg-primary">Obrigatório</Badge>
              <span className="font-semibold text-text-primary">Nome do Condomínio</span>
            </div>
            <Input
              placeholder="Ex: Residencial das Flores, Edifício Central, etc."
              value={formData.nome}
              onChange={(e) => handleInputChange('nome', e.target.value)}
              className="text-lg"
              autoFocus
            />
          </div>

          {/* Status de Submissão */}
          {submitMessage && (
            <div className={`flex items-center gap-2 p-3 rounded-lg ${
              submitStatus === 'success' 
                ? 'bg-green-500/10 text-green-600 border border-green-500/20' 
                : 'bg-red-500/10 text-red-600 border border-red-500/20'
            }`}>
              {submitStatus === 'success' ? <CheckCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
              <span>{submitMessage}</span>
            </div>
          )}

          {/* Seção: Localização */}
          <Collapsible open={openSections.localizacao} onOpenChange={() => toggleSection('localizacao')}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-card rounded-lg border hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-red-500" />
                <span className="font-medium">Localização</span>
                {formData.cidade && <Badge variant="secondary" className="text-xs">{formData.cidade}</Badge>}
              </div>
              {openSections.localizacao ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-card/50 rounded-lg border">
                <div className="space-y-2">
                  <Label>País</Label>
                  <Select value={formData.pais} onValueChange={(v) => handleInputChange('pais', v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Brasil">Brasil</SelectItem>
                      <SelectItem value="Portugal">Portugal</SelectItem>
                      <SelectItem value="Estados Unidos">Estados Unidos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Estado</Label>
                  <Select value={formData.estado} onValueChange={(v) => handleInputChange('estado', v)}>
                    <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                    <SelectContent>
                      {ESTADOS_BR.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
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
                  <Input placeholder="Cidade" value={formData.cidade} onChange={(e) => handleInputChange('cidade', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Bairro</Label>
                  <Input placeholder="Bairro" value={formData.bairro} onChange={(e) => handleInputChange('bairro', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Número</Label>
                  <Input placeholder="123" value={formData.numero} onChange={(e) => handleInputChange('numero', e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-3">
                  <Label>Logradouro</Label>
                  <Input placeholder="Rua, Avenida, etc." value={formData.logradouro} onChange={(e) => handleInputChange('logradouro', e.target.value)} />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Seção: Sobre o Empreendimento */}
          <Collapsible open={openSections.empreendimento} onOpenChange={() => toggleSection('empreendimento')}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-card rounded-lg border hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-purple-500" />
                <span className="font-medium">Sobre o Empreendimento</span>
                {formData.tipo && <Badge variant="secondary" className="text-xs">{formData.tipo}</Badge>}
              </div>
              {openSections.empreendimento ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-card/50 rounded-lg border">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={formData.tipo} onValueChange={(v) => handleInputChange('tipo', v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_CONDOMINIO.map(tipo => <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={formData.status} onValueChange={(v) => handleInputChange('status', v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione o status" /></SelectTrigger>
                    <SelectContent>
                      {STATUS_EMPREENDIMENTO.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status Comercial</Label>
                  <Select value={formData.status_comercial} onValueChange={(v) => handleInputChange('status_comercial', v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {STATUS_COMERCIAL.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Construtora</Label>
                  <Input placeholder="Nome da construtora" value={formData.construtora} onChange={(e) => handleInputChange('construtora', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Incorporadora</Label>
                  <Input placeholder="Nome da incorporadora" value={formData.incorporadora} onChange={(e) => handleInputChange('incorporadora', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Ano de Construção</Label>
                  <Input type="number" placeholder="2024" value={formData.ano_construcao} onChange={(e) => handleInputChange('ano_construcao', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Imobiliária Exclusiva</Label>
                  <Input placeholder="Nome da imobiliária" value={formData.imobiliaria_exclusiva} onChange={(e) => handleInputChange('imobiliaria_exclusiva', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Nº de Blocos/Torres</Label>
                  <Input type="number" placeholder="1" value={formData.num_blocos_torres} onChange={(e) => handleInputChange('num_blocos_torres', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Data de Entrega</Label>
                  <Input type="date" value={formData.data_entrega} onChange={(e) => handleInputChange('data_entrega', e.target.value)} />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Seção: Metragens Disponíveis */}
          <Collapsible open={openSections.metragens} onOpenChange={() => toggleSection('metragens')}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-card rounded-lg border hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-5 w-5 text-orange-500" />
                <span className="font-medium">Metragens Disponíveis (m²)</span>
                {formData.metragens_disponiveis.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {formData.metragens_disponiveis.length} metragem{formData.metragens_disponiveis.length !== 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
              {openSections.metragens ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="p-4 bg-card/50 rounded-lg border space-y-4">
                <p className="text-sm text-text-secondary">
                  Cadastre as metragens (m²) disponíveis neste condomínio. Ao criar um imóvel, você poderá selecionar uma dessas metragens.
                </p>
                
                {/* Input para adicionar nova metragem */}
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      type="number"
                      placeholder="Ex: 45, 60, 75, 120..."
                      value={novaMetragem}
                      onChange={(e) => setNovaMetragem(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAdicionarMetragem();
                        }
                      }}
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={handleAdicionarMetragem}
                    variant="outline"
                    className="shrink-0"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar
                  </Button>
                </div>

                {/* Lista de metragens adicionadas */}
                {formData.metragens_disponiveis.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Metragens cadastradas:</Label>
                    <div className="flex flex-wrap gap-2">
                      {formData.metragens_disponiveis.map((metragem) => (
                        <Badge
                          key={metragem}
                          variant="secondary"
                          className="px-3 py-1.5 text-sm flex items-center gap-2 bg-primary/10 hover:bg-primary/20 border border-primary/30"
                        >
                          <span className="font-medium">{metragem} m²</span>
                          <button
                            type="button"
                            onClick={() => handleRemoverMetragem(metragem)}
                            className="hover:text-red-500 transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {formData.metragens_disponiveis.length === 0 && (
                  <div className="text-center py-4 text-sm text-text-secondary border border-dashed rounded-lg">
                    Nenhuma metragem cadastrada ainda
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Seção: Infraestrutura - Acessibilidade */}
          <Collapsible open={openSections.acessibilidade} onOpenChange={() => toggleSection('acessibilidade')}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-card rounded-lg border hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-2">
                <Accessibility className="h-5 w-5 text-blue-500" />
                <span className="font-medium">Acessibilidade</span>
              </div>
              {openSections.acessibilidade ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-card/50 rounded-lg border">
                <InfraCheckbox field="infra_acesso_pne" label="Acesso/Passeio PNE" />
                <InfraCheckbox field="infra_banheiro_pne" label="Banheiro PNE" />
                <InfraCheckbox field="infra_elevador" label="Elevador" />
                <InfraCheckbox field="infra_elevador_servico" label="Elevador de serviço" />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Seção: Infraestrutura - Ecológico */}
          <Collapsible open={openSections.ecologico} onOpenChange={() => toggleSection('ecologico')}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-card rounded-lg border hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-2">
                <Leaf className="h-5 w-5 text-green-500" />
                <span className="font-medium">Ecológico</span>
              </div>
              {openSections.ecologico ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-card/50 rounded-lg border">
                <InfraCheckbox field="infra_aquecedor_solar" label="Aquecedor solar" />
                <InfraCheckbox field="infra_coleta_reciclavel" label="Coleta reciclável" />
                <InfraCheckbox field="infra_reaprov_agua_chuva" label="Reaprov. água chuva" />
                <InfraCheckbox field="infra_energia_solar" label="Energia solar" />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Seção: Infraestrutura - Básico */}
          <Collapsible open={openSections.basico} onOpenChange={() => toggleSection('basico')}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-card rounded-lg border hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-2">
                <Wrench className="h-5 w-5 text-gray-500" />
                <span className="font-medium">Infraestrutura Básica</span>
              </div>
              {openSections.basico ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-card/50 rounded-lg border">
                <InfraCheckbox field="infra_esgoto" label="Esgoto" />
                <InfraCheckbox field="infra_guarita" label="Guarita" />
                <InfraCheckbox field="infra_praca_recreacao" label="Praça/Recreação Infantil" />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Seção: Esporte/Lazer */}
          <Collapsible open={openSections.esporteLazer} onOpenChange={() => toggleSection('esporteLazer')}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-card rounded-lg border hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-2">
                <Dumbbell className="h-5 w-5 text-orange-500" />
                <span className="font-medium">Esporte e Lazer</span>
              </div>
              {openSections.esporteLazer ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-card/50 rounded-lg border">
                <InfraCheckbox field="infra_academia" label="Academia" />
                <InfraCheckbox field="infra_bicicletario" label="Bicicletário" />
                <InfraCheckbox field="infra_brinquedoteca" label="Brinquedoteca" />
                <InfraCheckbox field="infra_campo_futebol" label="Campo de futebol" />
                <InfraCheckbox field="infra_churrasqueira" label="Churrasqueira" />
                <InfraCheckbox field="infra_deck_molhado" label="Deck molhado" />
                <InfraCheckbox field="infra_espaco_gourmet" label="Espaço gourmet" />
                <InfraCheckbox field="infra_espaco_zen" label="Espaço zen" />
                <InfraCheckbox field="infra_hidromassagem" label="Hidromassagem" />
                <InfraCheckbox field="infra_lago" label="Lago" />
                <InfraCheckbox field="infra_piscina" label="Piscina" />
                <InfraCheckbox field="infra_piscina_adulto" label="Piscina adulto" />
                <InfraCheckbox field="infra_piscina_aquecida" label="Piscina aquecida" />
                <InfraCheckbox field="infra_piscina_coberta" label="Piscina coberta" />
                <InfraCheckbox field="infra_piscina_infantil" label="Piscina infantil" />
                <InfraCheckbox field="infra_playground" label="Playground" />
                <InfraCheckbox field="infra_quadra_beach_tenis" label="Quadra Beach Tênis" />
                <InfraCheckbox field="infra_quadra_squash" label="Quadra de squash" />
                <InfraCheckbox field="infra_quadra_tenis" label="Quadra de tênis" />
                <InfraCheckbox field="infra_quadra_poliesportiva" label="Quadra poliesportiva" />
                <InfraCheckbox field="infra_sala_fitness" label="Sala fitness" />
                <InfraCheckbox field="infra_salao_festas" label="Salão de festas" />
                <InfraCheckbox field="infra_salao_jogos" label="Salão de jogos" />
                <InfraCheckbox field="infra_salao_cinema" label="Salão de cinema" />
                <InfraCheckbox field="infra_sauna_seca" label="Sauna seca" />
                <InfraCheckbox field="infra_sauna_umida" label="Sauna úmida" />
                <InfraCheckbox field="infra_solarium" label="Solarium" />
                <InfraCheckbox field="infra_spa" label="Spa" />
                <div className="space-y-1">
                  <Label className="text-xs">Quadra gramada</Label>
                  <Input type="number" placeholder="0" value={formData.infra_quadra_gramada} onChange={(e) => handleInputChange('infra_quadra_gramada', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Sala ginástica</Label>
                  <Input type="number" placeholder="0" value={formData.infra_sala_ginastica} onChange={(e) => handleInputChange('infra_sala_ginastica', e.target.value)} />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Seção: Segurança */}
          <Collapsible open={openSections.seguranca} onOpenChange={() => toggleSection('seguranca')}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-card rounded-lg border hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-red-500" />
                <span className="font-medium">Segurança</span>
              </div>
              {openSections.seguranca ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-card/50 rounded-lg border">
                <InfraCheckbox field="infra_cabine_primaria" label="Cabine primária" />
                <InfraCheckbox field="infra_catraca_eletronica" label="Catraca eletrônica" />
                <InfraCheckbox field="infra_cerca_eletrica" label="Cerca elétrica" />
                <InfraCheckbox field="infra_circuito_tv" label="Circuito de TV" />
                <InfraCheckbox field="infra_guarita_blindada" label="Guarita blindada" />
                <InfraCheckbox field="infra_guarita_seguranca" label="Guarita de segurança" />
                <InfraCheckbox field="infra_portao_eletronico" label="Portão eletrônico" />
                <InfraCheckbox field="infra_portaria_24h" label="Portaria 24h" />
                <InfraCheckbox field="infra_seguranca_interna" label="Segurança interna" />
                <InfraCheckbox field="infra_seguranca_patrimonial" label="Segurança patrimonial" />
                <InfraCheckbox field="infra_sistema_incendio" label="Sistema de incêndio" />
                <InfraCheckbox field="infra_sistema_seguranca" label="Sistema de segurança" />
                <InfraCheckbox field="infra_vigia_externo" label="Vigia externo" />
                <InfraCheckbox field="infra_vigilancia_24h" label="Vigilância 24h" />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Seção: Serviços */}
          <Collapsible open={openSections.servicos} onOpenChange={() => toggleSection('servicos')}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-card rounded-lg border hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-cyan-500" />
                <span className="font-medium">Serviços</span>
              </div>
              {openSections.servicos ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-card/50 rounded-lg border">
                <InfraCheckbox field="infra_central_limpeza" label="Central de limpeza" />
                <InfraCheckbox field="infra_escritorio_virtual" label="Escritório virtual" />
                <InfraCheckbox field="infra_massagista" label="Massagista" />
                <InfraCheckbox field="infra_personal_training" label="Personal Training" />
                <InfraCheckbox field="infra_restaurante" label="Restaurante" />
                <InfraCheckbox field="infra_sala_massagem" label="Sala massagem" />
                <InfraCheckbox field="infra_tv_cabo" label="TV a cabo" />
                <InfraCheckbox field="infra_wifi" label="Wi-Fi" />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Seção: Social */}
          <Collapsible open={openSections.social} onOpenChange={() => toggleSection('social')}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-card rounded-lg border hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-indigo-500" />
                <span className="font-medium">Social</span>
              </div>
              {openSections.social ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-card/50 rounded-lg border">
                <InfraCheckbox field="infra_estacionamento_rotativo" label="Estacionamento rotativo" />
                <InfraCheckbox field="infra_lavanderia_coletiva" label="Lavanderia coletiva" />
                <InfraCheckbox field="infra_praca_convivencia" label="Praça convivência" />
                <div className="space-y-1">
                  <Label className="text-xs">Vagas para visita</Label>
                  <Input type="number" placeholder="0" value={formData.infra_vaga_visita} onChange={(e) => handleInputChange('infra_vaga_visita', e.target.value)} />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Seção: Publicação */}
          <Collapsible open={openSections.publicacao} onOpenChange={() => toggleSection('publicacao')}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-card rounded-lg border hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-blue-500" />
                <span className="font-medium">Publicação no Site</span>
              </div>
              {openSections.publicacao ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-card/50 rounded-lg border">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="publicar_site"
                    checked={formData.publicar_site}
                    onCheckedChange={(checked) => handleInputChange('publicar_site', checked as boolean)}
                  />
                  <label htmlFor="publicar_site" className="text-sm cursor-pointer">Publicar no site</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="destaque"
                    checked={formData.destaque}
                    onCheckedChange={(checked) => handleInputChange('destaque', checked as boolean)}
                  />
                  <label htmlFor="destaque" className="text-sm cursor-pointer">Destaque</label>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Tour Virtual (URL)</Label>
                  <Input placeholder="https://..." value={formData.tour_virtual} onChange={(e) => handleInputChange('tour_virtual', e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Descrição do Site</Label>
                  <Textarea 
                    placeholder="Descrição detalhada do empreendimento para o site..."
                    value={formData.descricao_site}
                    onChange={(e) => handleInputChange('descricao_site', e.target.value)}
                    rows={4}
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Seção: Fotos do Empreendimento */}
          <div className="space-y-3 p-4 bg-gradient-to-r from-pink-500/5 to-purple-500/5 rounded-lg border border-pink-500/20">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-pink-500" />
              <span className="font-medium text-text-primary">Fotos do Empreendimento</span>
              {formData.fotos.length > 0 && (
                <Badge variant="secondary" className="text-xs bg-pink-500/10 text-pink-500">
                  {formData.fotos.length} foto(s)
                </Badge>
              )}
            </div>
            
            <FotosUploader
              fotos={formData.fotos}
              onChange={(fotos) => setFormData((prev) => ({ ...prev, fotos }))}
              accent="pink"
              inputId="fotos-condominio-upload"
            />
          </div>

          {/* Botões de Ação */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting || !formData.nome.trim()}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {isEdit ? 'Salvar Alterações' : 'Salvar Condomínio'}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CriarCondominioForm;

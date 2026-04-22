/**
 * 🏢 Aba de Condomínios - Listagem com Filtros
 * Baseado nos filtros do Kenlo, adaptado ao design system OctoDash
 */

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabaseClient';
import { getFotoCapaUrl } from './fotos-helpers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OctoDashLoader } from '@/components/ui/OctoDashLoader';
import { CriarCondominioForm } from './CriarCondominioForm';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Building2,
  Plus,
  Search,
  RefreshCw,
  MapPin,
  Calendar,
  Filter,
  X,
  ChevronDown,
  Eye,
  Edit,
  Trash2,
  Home,
  Shield,
  Dumbbell,
  Building,
  CheckCircle,
  AlertCircle,
  Image as ImageIcon,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Clock,
  XCircle,
  ShieldCheck,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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

export interface Condominio {
  id: string;
  tenant_id: string;
  nome: string;
  pais: string;
  estado: string | null;
  cidade: string | null;
  bairro: string | null;
  logradouro: string | null;
  numero: string | null;
  cep: string | null;
  tipo: string | null;
  status: string | null;
  status_comercial: string | null;
  construtora: string | null;
  incorporadora: string | null;
  ano_construcao: number | null;
  num_blocos_torres: number | null;
  data_entrega: string | null;
  publicar_site: boolean;
  destaque: boolean;
  tour_virtual: string | null;
  descricao_site: string | null;
  fotos: string[];
  created_at: string;
  // Infraestrutura resumida
  infra_piscina: boolean;
  infra_academia: boolean;
  infra_salao_festas: boolean;
  infra_portaria_24h: boolean;
  infra_churrasqueira: boolean;
  infra_playground: boolean;
  infra_elevador: boolean;
  infra_seguranca_interna: boolean;
  // Sistema de aprovação
  status_aprovacao?: 'aprovado' | 'nao_aprovado' | 'aguardando';
  aprovado_por?: string;
  aprovado_em?: string;
  motivo_aprovacao?: string;
}

type StatusAprovacao = 'aprovado' | 'nao_aprovado' | 'aguardando';

interface AprovacaoDialogCond {
  isOpen: boolean;
  condominioId: string | null;
  condominioNome: string | null;
  novoStatus: StatusAprovacao | null;
  motivo: string;
}

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

export const CondominiosTab = () => {
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const systemRole = user?.systemRole;
  const isAdmin = ['admin', 'owner'].includes(systemRole?.toLowerCase() || '');

  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [statusComercialFilter, setStatusComercialFilter] = useState<string>('todos');
  const [cidadeFilter, setCidadeFilter] = useState<string>('todos');
  const [bairroFilter, setBairroFilter] = useState<string>('');
  const [publicadoFilter, setPublicadoFilter] = useState<string>('todos');
  const [destaqueFilter, setDestaqueFilter] = useState<string>('todos');
  const [construtoraFilter, setConstrutorFilter] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  // Modal de criação
  const [isCriarOpen, setIsCriarOpen] = useState(false);
  const [editingCondominio, setEditingCondominio] = useState<Condominio | null>(null);

  // Modal de detalhes
  const [selectedCondominio, setSelectedCondominio] = useState<Condominio | null>(null);

  // Modal de exclusão
  const [deleteCondominio, setDeleteCondominio] = useState<Condominio | null>(null);
  
  // Estado para dialog de aprovação
  const [aprovacaoDialog, setAprovacaoDialog] = useState<AprovacaoDialogCond>({
    isOpen: false,
    condominioId: null,
    condominioNome: null,
    novoStatus: null,
    motivo: ''
  });

  // Carregar condomínios
  const loadCondominios = async () => {
    if (!tenantId) return;

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('condominios')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setCondominios(data || []);
    } catch (err: any) {
      console.error('Erro ao carregar condomínios:', err);
      setError(err.message || 'Erro ao carregar condomínios');
    } finally {
      setIsLoading(false);
    }
  };

  const buildEditDataFromCondominio = (cond: Condominio) => ({
    id: cond.id,
    nome: cond.nome || '',
    pais: cond.pais || 'Brasil',
    estado: cond.estado || 'SP',
    cidade: cond.cidade || '',
    bairro: cond.bairro || '',
    logradouro: cond.logradouro || '',
    numero: cond.numero || '',
    cep: cond.cep || '',
    tipo: cond.tipo || '',
    status: cond.status || '',
    status_comercial: cond.status_comercial || '',
    construtora: cond.construtora || '',
    incorporadora: cond.incorporadora || '',
    ano_construcao: cond.ano_construcao ? String(cond.ano_construcao) : '',
    imobiliaria_exclusiva: (cond as any).imobiliaria_exclusiva || '',
    num_blocos_torres: cond.num_blocos_torres ? String(cond.num_blocos_torres) : '',
    data_entrega: cond.data_entrega || '',
    tour_virtual: cond.tour_virtual || '',
    descricao_site: cond.descricao_site || '',
    fotos: cond.fotos || [],
    metragens_disponiveis: (cond as any).metragens_disponiveis || [],
    infra_acesso_pne: (cond as any).infra_acesso_pne || false,
    infra_banheiro_pne: (cond as any).infra_banheiro_pne || false,
    infra_elevador: cond.infra_elevador || false,
    infra_elevador_servico: (cond as any).infra_elevador_servico || false,
    infra_aquecedor_solar: (cond as any).infra_aquecedor_solar || false,
    infra_coleta_reciclavel: (cond as any).infra_coleta_reciclavel || false,
    infra_reaprov_agua_chuva: (cond as any).infra_reaprov_agua_chuva || false,
    infra_energia_solar: (cond as any).infra_energia_solar || false,
    infra_esgoto: (cond as any).infra_esgoto || false,
    infra_guarita: (cond as any).infra_guarita || false,
    infra_praca_recreacao: (cond as any).infra_praca_recreacao || false,
    infra_academia: cond.infra_academia || false,
    infra_bicicletario: (cond as any).infra_bicicletario || false,
    infra_brinquedoteca: (cond as any).infra_brinquedoteca || false,
    infra_campo_futebol: (cond as any).infra_campo_futebol || false,
    infra_churrasqueira: cond.infra_churrasqueira || false,
    infra_deck_molhado: (cond as any).infra_deck_molhado || false,
    infra_espaco_gourmet: (cond as any).infra_espaco_gourmet || false,
    infra_espaco_zen: (cond as any).infra_espaco_zen || false,
    infra_hidromassagem: (cond as any).infra_hidromassagem || false,
    infra_lago: (cond as any).infra_lago || false,
    infra_piscina: cond.infra_piscina || false,
    infra_piscina_adulto: (cond as any).infra_piscina_adulto || false,
    infra_piscina_aquecida: (cond as any).infra_piscina_aquecida || false,
    infra_piscina_coberta: (cond as any).infra_piscina_coberta || false,
    infra_piscina_infantil: (cond as any).infra_piscina_infantil || false,
    infra_playground: cond.infra_playground || false,
    infra_quadra_beach_tenis: (cond as any).infra_quadra_beach_tenis || false,
    infra_quadra_squash: (cond as any).infra_quadra_squash || false,
    infra_quadra_tenis: (cond as any).infra_quadra_tenis || false,
    infra_quadra_poliesportiva: (cond as any).infra_quadra_poliesportiva || false,
    infra_quadra_gramada: (cond as any).infra_quadra_gramada ? String((cond as any).infra_quadra_gramada) : '',
    infra_sala_fitness: (cond as any).infra_sala_fitness || false,
    infra_sala_ginastica: (cond as any).infra_sala_ginastica ? String((cond as any).infra_sala_ginastica) : '',
    infra_salao_festas: cond.infra_salao_festas || false,
    infra_salao_jogos: (cond as any).infra_salao_jogos || false,
    infra_salao_cinema: (cond as any).infra_salao_cinema || false,
    infra_sauna_seca: (cond as any).infra_sauna_seca || false,
    infra_sauna_umida: (cond as any).infra_sauna_umida || false,
    infra_solarium: (cond as any).infra_solarium || false,
    infra_spa: (cond as any).infra_spa || false,
    infra_cabine_primaria: (cond as any).infra_cabine_primaria || false,
    infra_catraca_eletronica: (cond as any).infra_catraca_eletronica || false,
    infra_cerca_eletrica: (cond as any).infra_cerca_eletrica || false,
    infra_circuito_tv: (cond as any).infra_circuito_tv || false,
    infra_guarita_blindada: (cond as any).infra_guarita_blindada || false,
    infra_guarita_seguranca: (cond as any).infra_guarita_seguranca || false,
    infra_portao_eletronico: (cond as any).infra_portao_eletronico || false,
    infra_portaria_24h: cond.infra_portaria_24h || false,
    infra_seguranca_interna: cond.infra_seguranca_interna || false,
    infra_seguranca_patrimonial: (cond as any).infra_seguranca_patrimonial || false,
    infra_sistema_incendio: (cond as any).infra_sistema_incendio || false,
    infra_sistema_seguranca: (cond as any).infra_sistema_seguranca || false,
    infra_vigia_externo: (cond as any).infra_vigia_externo || false,
    infra_vigilancia_24h: (cond as any).infra_vigilancia_24h || false,
    infra_central_limpeza: (cond as any).infra_central_limpeza || false,
    infra_escritorio_virtual: (cond as any).infra_escritorio_virtual || false,
    infra_massagista: (cond as any).infra_massagista || false,
    infra_personal_training: (cond as any).infra_personal_training || false,
    infra_restaurante: (cond as any).infra_restaurante || false,
    infra_sala_massagem: (cond as any).infra_sala_massagem || false,
    infra_tv_cabo: (cond as any).infra_tv_cabo || false,
    infra_wifi: (cond as any).infra_wifi || false,
    infra_estacionamento_rotativo: (cond as any).infra_estacionamento_rotativo || false,
    infra_lavanderia_coletiva: (cond as any).infra_lavanderia_coletiva || false,
    infra_praca_convivencia: (cond as any).infra_praca_convivencia || false,
    infra_vaga_visita: (cond as any).infra_vaga_visita ? String((cond as any).infra_vaga_visita) : '',
    publicar_site: cond.publicar_site || false,
    destaque: cond.destaque || false,
  });

  useEffect(() => {
    loadCondominios();
  }, [tenantId]);

  // Cidades únicas para o filtro
  const cidades = useMemo(() => {
    const cidadesSet = new Set(condominios.map(c => c.cidade).filter(Boolean));
    return Array.from(cidadesSet).sort() as string[];
  }, [condominios]);

  // Filtrar condomínios
  const condominiosFiltrados = useMemo(() => {
    let filtered = condominios;

    // Busca por nome, bairro
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(c =>
        c.nome.toLowerCase().includes(search) ||
        c.bairro?.toLowerCase().includes(search) ||
        c.logradouro?.toLowerCase().includes(search)
      );
    }

    // Filtro por tipo
    if (tipoFilter !== 'todos') {
      filtered = filtered.filter(c => c.tipo === tipoFilter);
    }

    // Filtro por status
    if (statusFilter !== 'todos') {
      filtered = filtered.filter(c => c.status === statusFilter);
    }

    // Filtro por status comercial
    if (statusComercialFilter !== 'todos') {
      filtered = filtered.filter(c => c.status_comercial === statusComercialFilter);
    }

    // Filtro por cidade
    if (cidadeFilter !== 'todos') {
      filtered = filtered.filter(c => c.cidade === cidadeFilter);
    }

    // Filtro por bairro
    if (bairroFilter) {
      filtered = filtered.filter(c => 
        c.bairro?.toLowerCase().includes(bairroFilter.toLowerCase())
      );
    }

    // Filtro por publicado
    if (publicadoFilter !== 'todos') {
      filtered = filtered.filter(c => 
        publicadoFilter === 'sim' ? c.publicar_site : !c.publicar_site
      );
    }

    // Filtro por destaque
    if (destaqueFilter !== 'todos') {
      filtered = filtered.filter(c =>
        destaqueFilter === 'sim' ? c.destaque : !c.destaque
      );
    }

    // Filtro por construtora
    if (construtoraFilter) {
      filtered = filtered.filter(c =>
        c.construtora?.toLowerCase().includes(construtoraFilter.toLowerCase())
      );
    }

    return filtered;
  }, [condominios, searchTerm, tipoFilter, statusFilter, statusComercialFilter, cidadeFilter, bairroFilter, publicadoFilter, destaqueFilter, construtoraFilter]);

  // Limpar filtros
  const limparFiltros = () => {
    setSearchTerm('');
    setTipoFilter('todos');
    setStatusFilter('todos');
    setStatusComercialFilter('todos');
    setCidadeFilter('todos');
    setBairroFilter('');
    setPublicadoFilter('todos');
    setDestaqueFilter('todos');
    setConstrutorFilter('');
  };

  // Verificar se há filtros ativos
  const temFiltrosAtivos = searchTerm || tipoFilter !== 'todos' || statusFilter !== 'todos' ||
    statusComercialFilter !== 'todos' || cidadeFilter !== 'todos' || bairroFilter ||
    publicadoFilter !== 'todos' || destaqueFilter !== 'todos' || construtoraFilter;

  // Excluir condomínio
  const handleDelete = async () => {
    if (!deleteCondominio) return;

    try {
      const { error } = await supabase
        .from('condominios')
        .delete()
        .eq('id', deleteCondominio.id);

      if (error) throw error;

      setCondominios(prev => prev.filter(c => c.id !== deleteCondominio.id));
      setDeleteCondominio(null);
    } catch (err: any) {
      console.error('Erro ao excluir:', err);
      setError(err.message);
    }
  };

  // Abrir dialog de aprovação
  const openAprovacaoDialog = (condominioId: string, condominioNome: string, novoStatus: StatusAprovacao) => {
    setAprovacaoDialog({
      isOpen: true,
      condominioId,
      condominioNome,
      novoStatus,
      motivo: ''
    });
  };

  // Fechar dialog de aprovação
  const closeAprovacaoDialog = () => {
    setAprovacaoDialog({
      isOpen: false,
      condominioId: null,
      condominioNome: null,
      novoStatus: null,
      motivo: ''
    });
  };

  // Confirmar aprovação com motivo
  const handleConfirmAprovacao = async () => {
    if (!tenantId || !user?.id || !isAdmin || !aprovacaoDialog.condominioId || !aprovacaoDialog.novoStatus) return;
    
    try {
      const { error } = await supabase
        .from('condominios')
        .update({
          status_aprovacao: aprovacaoDialog.novoStatus,
          aprovado_por: user.id,
          aprovado_em: new Date().toISOString(),
          motivo_aprovacao: aprovacaoDialog.motivo || null
        })
        .eq('id', aprovacaoDialog.condominioId);
      
      if (error) throw error;
      
      // Atualizar estado local
      setCondominios(prev => prev.map(c => 
        c.id === aprovacaoDialog.condominioId 
          ? { 
              ...c, 
              status_aprovacao: aprovacaoDialog.novoStatus!, 
              aprovado_por: user.id, 
              aprovado_em: new Date().toISOString(),
              motivo_aprovacao: aprovacaoDialog.motivo || undefined
            }
          : c
      ));
      
      closeAprovacaoDialog();
    } catch (err) {
      console.error('❌ Erro ao atualizar aprovação:', err);
    }
  };

  // Renderizar badge de status de aprovação
  const renderStatusAprovacaoBadge = (status: StatusAprovacao | undefined) => {
    if (!status) return null;
    
    const config = {
      aprovado: { 
        icon: <CheckCircle className="h-3 w-3" />, 
        text: 'Aprovado', 
        className: 'bg-green-500/20 text-green-400 border-green-500/30' 
      },
      nao_aprovado: { 
        icon: <XCircle className="h-3 w-3" />, 
        text: 'Não Aprovado', 
        className: 'bg-red-500/20 text-red-400 border-red-500/30' 
      },
      aguardando: { 
        icon: <Clock className="h-3 w-3" />, 
        text: 'Aguardando', 
        className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' 
      },
    };
    
    const { icon, text, className } = config[status];
    
    return (
      <Badge className={`flex items-center gap-1 text-xs ${className}`}>
        {icon}
        {text}
      </Badge>
    );
  };

  // Renderizar badge de status
  const renderStatusBadge = (status: string | null) => {
    if (!status) return null;
    
    const colorMap: Record<string, string> = {
      'Pronto': 'bg-green-500/20 text-green-400 border-green-500/30',
      'Pronto para Morar': 'bg-green-500/20 text-green-400 border-green-500/30',
      'Lançamento': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'Pré-lançamento': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      'Em Construção': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      'Em Acabamento': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      'Últimas unidades': 'bg-red-500/20 text-red-400 border-red-500/30',
    };

    return (
      <Badge className={`${colorMap[status] || 'bg-gray-500/20 text-gray-400'} text-xs`}>
        {status}
      </Badge>
    );
  };

  // Renderizar ícones de infraestrutura
  const renderInfraIcons = (cond: Condominio) => {
    const infra = [];
    if (cond.infra_piscina) infra.push('🏊');
    if (cond.infra_academia) infra.push('💪');
    if (cond.infra_salao_festas) infra.push('🎉');
    if (cond.infra_portaria_24h) infra.push('🔒');
    if (cond.infra_churrasqueira) infra.push('🍖');
    if (cond.infra_playground) infra.push('🎠');
    
    if (infra.length === 0) return null;
    return <span className="text-sm">{infra.slice(0, 4).join(' ')}{infra.length > 4 ? '...' : ''}</span>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <OctoDashLoader message="Carregando condomínios..." size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Condomínios e Lançamentos</h2>
          <p className="text-text-secondary text-sm">
            {condominios.length} condomínio{condominios.length !== 1 ? 's' : ''} cadastrado{condominios.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadCondominios}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Atualizar
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditingCondominio(null);
              setIsCriarOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Novo Condomínio
          </Button>
        </div>
      </div>

      {/* Barra de busca e filtros */}
      <div className="space-y-4">
        <div className="flex gap-4 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-text-secondary" />
            <Input
              placeholder="Buscar por nome, bairro..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={temFiltrosAtivos ? 'border-primary text-primary' : ''}
          >
            <Filter className="h-4 w-4 mr-1" />
            Filtros
            {temFiltrosAtivos && <Badge className="ml-2 bg-primary text-xs">Ativos</Badge>}
          </Button>
          {temFiltrosAtivos && (
            <Button variant="ghost" size="sm" onClick={limparFiltros}>
              <X className="h-4 w-4 mr-1" />
              Limpar
            </Button>
          )}
        </div>

        {/* Painel de Filtros Expandido */}
        <Collapsible open={showFilters}>
          <CollapsibleContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4 bg-card rounded-lg border">
              <div className="space-y-1">
                <label className="text-xs text-text-secondary">Tipo</label>
                <Select value={tipoFilter} onValueChange={setTipoFilter}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {TIPOS_CONDOMINIO.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-text-secondary">Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {STATUS_EMPREENDIMENTO.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-text-secondary">Status Comercial</label>
                <Select value={statusComercialFilter} onValueChange={setStatusComercialFilter}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {STATUS_COMERCIAL.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-text-secondary">Cidade</label>
                <Select value={cidadeFilter} onValueChange={setCidadeFilter}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas</SelectItem>
                    {cidades.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-text-secondary">Bairro</label>
                <Input
                  placeholder="Filtrar bairro"
                  value={bairroFilter}
                  onChange={(e) => setBairroFilter(e.target.value)}
                  className="h-9"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-text-secondary">Publicado</label>
                <Select value={publicadoFilter} onValueChange={setPublicadoFilter}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="sim">Sim</SelectItem>
                    <SelectItem value="nao">Não</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-text-secondary">Destaque</label>
                <Select value={destaqueFilter} onValueChange={setDestaqueFilter}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="sim">Sim</SelectItem>
                    <SelectItem value="nao">Não</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-text-secondary">Construtora</label>
                <Input
                  placeholder="Filtrar construtora"
                  value={construtoraFilter}
                  onChange={(e) => setConstrutorFilter(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Erro */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-500 border border-red-500/20">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={loadCondominios}>Tentar novamente</Button>
        </div>
      )}

      {/* Lista de Condomínios */}
      {condominiosFiltrados.length === 0 ? (
        <div className="text-center py-16">
          <Building2 className="h-16 w-16 text-text-secondary mx-auto mb-4 opacity-50" />
          {condominios.length === 0 ? (
            <>
              <p className="text-text-secondary mb-2">Nenhum condomínio cadastrado</p>
              <p className="text-text-secondary text-sm mb-4">
                Clique em "Novo Condomínio" para cadastrar o primeiro
              </p>
              <Button
                onClick={() => {
                  setEditingCondominio(null);
                  setIsCriarOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Novo Condomínio
              </Button>
            </>
          ) : (
            <>
              <p className="text-text-secondary mb-2">Nenhum condomínio encontrado com os filtros aplicados</p>
              <Button variant="outline" onClick={limparFiltros}>
                <X className="h-4 w-4 mr-1" />
                Limpar Filtros
              </Button>
            </>
          )}
        </div>
      ) : (
        <>
          <p className="text-text-secondary text-sm">
            Exibindo <strong>{condominiosFiltrados.length}</strong> de {condominios.length} condomínio(s)
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {condominiosFiltrados.map(cond => {
              const fotos = Array.isArray(cond.fotos) ? (cond.fotos as any[]) : [];
              const primeiraFoto = getFotoCapaUrl(fotos);
              
              return (
                <Card 
                  key={cond.id} 
                  className="overflow-hidden hover:shadow-xl transition-all duration-300 group cursor-pointer"
                  onClick={() => setSelectedCondominio(cond)}
                >
                  {/* Imagem do Condomínio */}
                  <div className="relative h-48 bg-gradient-to-br from-purple-100 to-blue-100 overflow-hidden">
                    {primeiraFoto ? (
                      <img 
                        src={primeiraFoto} 
                        alt={cond.nome}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500/10 to-blue-500/10">
                        <Building2 className="h-16 w-16 text-purple-400/50" />
                      </div>
                    )}
                    
                    {/* Badge de Tipo */}
                    {cond.tipo && (
                      <div className="absolute top-2 left-2">
                        <Badge className="bg-purple-500/90 text-white border-0 text-xs">
                          {cond.tipo}
                        </Badge>
                      </div>
                    )}

                    {/* Badge de Status */}
                    {cond.status && (
                      <div className="absolute top-2 right-2">
                        {renderStatusBadge(cond.status)}
                      </div>
                    )}

                    {/* Quantidade de Fotos */}
                    {fotos.length > 0 && (
                      <div className="absolute bottom-2 right-2">
                        <Badge className="bg-black/70 text-white border-0">
                          <ImageIcon className="h-3 w-3 mr-1" />
                          {fotos.length}
                        </Badge>
                      </div>
                    )}

                    {/* Badges de destaque e aprovação */}
                    <div className="absolute bottom-2 left-2 flex gap-1">
                      {cond.destaque && (
                        <Badge className="bg-yellow-500/90 text-black border-0 text-xs">
                          ⭐ Destaque
                        </Badge>
                      )}
                    </div>
                    
                    {/* Badge de Aprovação */}
                    {cond.status_aprovacao && (
                      <div className="absolute top-10 right-2">
                        {renderStatusAprovacaoBadge(cond.status_aprovacao)}
                      </div>
                    )}

                    {/* Overlay com botões */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-wrap items-center justify-center gap-2 px-3">
                      <Button 
                        size="sm" 
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCondominio(cond);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Ver Detalhes
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteCondominio(cond);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-semibold text-text-primary line-clamp-1">
                      {cond.nome}
                    </CardTitle>
                    {(cond.bairro || cond.cidade) && (
                      <div className="flex items-center gap-1 text-sm text-text-secondary">
                        <MapPin className="h-3.5 w-3.5" />
                        <span className="truncate">
                          {[cond.bairro, cond.cidade, cond.estado].filter(Boolean).join(', ')}
                        </span>
                      </div>
                    )}
                  </CardHeader>

                  <CardContent className="pt-0 space-y-3">
                    {/* Infraestrutura */}
                    {renderInfraIcons(cond) && (
                      <div className="flex items-center gap-1 text-sm">
                        {renderInfraIcons(cond)}
                      </div>
                    )}

                    {/* Construtora */}
                    {cond.construtora && (
                      <div className="flex items-center gap-2 text-sm text-text-secondary">
                        <span>🏗️</span>
                        <span className="truncate">{cond.construtora}</span>
                      </div>
                    )}

                    {/* Badges extras */}
                    <div className="flex flex-wrap gap-1 pt-2 border-t border-border/50">
                      {cond.publicar_site && (
                        <Badge variant="outline" className="text-xs bg-green-500/10 text-green-500 border-green-500/30">
                          ✓ Publicado
                        </Badge>
                      )}
                      {cond.num_blocos_torres && (
                        <Badge variant="outline" className="text-xs">
                          {cond.num_blocos_torres} torre(s)
                        </Badge>
                      )}
                      {cond.ano_construcao && (
                        <Badge variant="outline" className="text-xs">
                          {cond.ano_construcao}
                        </Badge>
                      )}
                    </div>
                    
                    {/* Controles de Aprovação (apenas Admins) */}
                    {isAdmin && (
                      <div className="mt-3 pt-3 border-t border-border/50">
                        <div className="flex items-center gap-1 mb-2">
                          <ShieldCheck className="h-3 w-3 text-primary" />
                          <span className="text-xs font-medium text-text-secondary">Aprovação Admin</span>
                        </div>
                        {cond.motivo_aprovacao && (
                          <p className="text-xs text-text-secondary mb-2 italic">
                            "{cond.motivo_aprovacao}"
                          </p>
                        )}
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openAprovacaoDialog(cond.id, cond.nome, 'aprovado');
                            }}
                            disabled={cond.status_aprovacao === 'aprovado'}
                            className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                              cond.status_aprovacao === 'aprovado'
                                ? 'bg-green-500 text-white cursor-default'
                                : 'bg-green-500/20 text-green-400 hover:bg-green-500/40'
                            }`}
                          >
                            ✓
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openAprovacaoDialog(cond.id, cond.nome, 'aguardando');
                            }}
                            disabled={cond.status_aprovacao === 'aguardando'}
                            className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                              cond.status_aprovacao === 'aguardando'
                                ? 'bg-yellow-500 text-black cursor-default'
                                : 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/40'
                            }`}
                          >
                            ⏳
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openAprovacaoDialog(cond.id, cond.nome, 'nao_aprovado');
                            }}
                            disabled={cond.status_aprovacao === 'nao_aprovado'}
                            className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                              cond.status_aprovacao === 'nao_aprovado'
                                ? 'bg-red-500 text-white cursor-default'
                                : 'bg-red-500/20 text-red-400 hover:bg-red-500/40'
                            }`}
                          >
                            ✗
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingCondominio(cond);
                              setIsCriarOpen(true);
                            }}
                            className="flex-1 px-2 py-1 text-xs rounded transition-colors bg-blue-500/20 text-blue-400 hover:bg-blue-500/40"
                          >
                            ✎
                          </button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Modal de Criação */}
      <CriarCondominioForm
        isOpen={isCriarOpen}
        onClose={() => {
          setIsCriarOpen(false);
          setEditingCondominio(null);
        }}
        onSuccess={() => {
          loadCondominios();
          setIsCriarOpen(false);
          setEditingCondominio(null);
        }}
        initialData={editingCondominio ? buildEditDataFromCondominio(editingCondominio) : undefined}
        isEdit={Boolean(editingCondominio)}
      />

      {/* Modal de Visualização de Detalhes */}
      <Dialog open={!!selectedCondominio} onOpenChange={() => setSelectedCondominio(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedCondominio && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl">
                  <Building2 className="h-6 w-6 text-primary" />
                  {selectedCondominio.nome}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {/* Galeria de Fotos */}
                {(() => {
                  const fotos = Array.isArray(selectedCondominio.fotos) ? selectedCondominio.fotos : [];
                  if (fotos.length > 0) {
                    return (
                      <div className="space-y-3">
                        <h3 className="font-semibold text-text-primary flex items-center gap-2">
                          <ImageIcon className="h-4 w-4" />
                          Fotos ({fotos.length})
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {fotos.map((foto: any, index) => {
                            const url = typeof foto === 'string' ? foto : foto?.url;
                            const legenda = typeof foto === 'string' ? '' : foto?.legenda ?? '';
                            if (!url) return null;
                            return (
                              <div key={index} className="relative aspect-video rounded-lg overflow-hidden border">
                                <img
                                  src={url}
                                  alt={legenda || `${selectedCondominio.nome} - Foto ${index + 1}`}
                                  className="w-full h-full object-cover hover:scale-105 transition-transform cursor-pointer"
                                />
                                <div className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                                  {index + 1}
                                </div>
                                {legenda && (
                                  <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded max-w-[70%] truncate">
                                    {legenda}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Informações Principais */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Localização */}
                  <div className="space-y-3">
                    <h3 className="font-semibold text-text-primary flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-red-500" />
                      Localização
                    </h3>
                    <div className="space-y-2 text-sm">
                      {selectedCondominio.logradouro && (
                        <p><span className="text-text-secondary">Endereço:</span> {selectedCondominio.logradouro}{selectedCondominio.numero ? `, ${selectedCondominio.numero}` : ''}</p>
                      )}
                      {selectedCondominio.bairro && (
                        <p><span className="text-text-secondary">Bairro:</span> {selectedCondominio.bairro}</p>
                      )}
                      {selectedCondominio.cidade && (
                        <p><span className="text-text-secondary">Cidade:</span> {selectedCondominio.cidade} - {selectedCondominio.estado}</p>
                      )}
                      {selectedCondominio.cep && (
                        <p><span className="text-text-secondary">CEP:</span> {selectedCondominio.cep}</p>
                      )}
                    </div>
                  </div>

                  {/* Sobre o Empreendimento */}
                  <div className="space-y-3">
                    <h3 className="font-semibold text-text-primary flex items-center gap-2">
                      <Building className="h-4 w-4 text-purple-500" />
                      Empreendimento
                    </h3>
                    <div className="space-y-2 text-sm">
                      {selectedCondominio.tipo && (
                        <p><span className="text-text-secondary">Tipo:</span> {selectedCondominio.tipo}</p>
                      )}
                      {selectedCondominio.status && (
                        <div className="flex items-center gap-2">
                          <span className="text-text-secondary">Status:</span> 
                          {renderStatusBadge(selectedCondominio.status)}
                        </div>
                      )}
                      {selectedCondominio.construtora && (
                        <p><span className="text-text-secondary">Construtora:</span> {selectedCondominio.construtora}</p>
                      )}
                      {selectedCondominio.incorporadora && (
                        <p><span className="text-text-secondary">Incorporadora:</span> {selectedCondominio.incorporadora}</p>
                      )}
                      {selectedCondominio.ano_construcao && (
                        <p><span className="text-text-secondary">Ano:</span> {selectedCondominio.ano_construcao}</p>
                      )}
                      {selectedCondominio.num_blocos_torres && (
                        <p><span className="text-text-secondary">Torres/Blocos:</span> {selectedCondominio.num_blocos_torres}</p>
                      )}
                      {selectedCondominio.data_entrega && (
                        <p><span className="text-text-secondary">Previsão Entrega:</span> {new Date(selectedCondominio.data_entrega).toLocaleDateString('pt-BR')}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Infraestrutura */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-text-primary flex items-center gap-2">
                    <Dumbbell className="h-4 w-4 text-orange-500" />
                    Infraestrutura
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedCondominio.infra_piscina && <Badge variant="outline">🏊 Piscina</Badge>}
                    {selectedCondominio.infra_academia && <Badge variant="outline">💪 Academia</Badge>}
                    {selectedCondominio.infra_salao_festas && <Badge variant="outline">🎉 Salão de Festas</Badge>}
                    {selectedCondominio.infra_churrasqueira && <Badge variant="outline">🍖 Churrasqueira</Badge>}
                    {selectedCondominio.infra_playground && <Badge variant="outline">🎠 Playground</Badge>}
                    {selectedCondominio.infra_portaria_24h && <Badge variant="outline">🔒 Portaria 24h</Badge>}
                    {selectedCondominio.infra_elevador && <Badge variant="outline">🛗 Elevador</Badge>}
                    {selectedCondominio.infra_seguranca_interna && <Badge variant="outline">🛡️ Segurança</Badge>}
                  </div>
                </div>

                {/* Descrição */}
                {selectedCondominio.descricao_site && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-text-primary">Descrição</h3>
                    <p className="text-sm text-text-secondary whitespace-pre-wrap">{selectedCondominio.descricao_site}</p>
                  </div>
                )}

                {/* Tour Virtual */}
                {selectedCondominio.tour_virtual && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-text-primary">Tour Virtual</h3>
                    <a 
                      href={selectedCondominio.tour_virtual} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-primary hover:underline"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Acessar Tour Virtual
                    </a>
                  </div>
                )}

                {/* Badges de Status */}
                <div className="flex flex-wrap gap-2 pt-4 border-t">
                  {selectedCondominio.publicar_site && (
                    <Badge className="bg-green-500/20 text-green-500 border-green-500/30">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Publicado no Site
                    </Badge>
                  )}
                  {selectedCondominio.destaque && (
                    <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">
                      ⭐ Em Destaque
                    </Badge>
                  )}
                </div>

                {/* Ações */}
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Button variant="outline" onClick={() => setSelectedCondominio(null)}>
                    Fechar
                  </Button>
                  <Button 
                    variant="destructive" 
                    onClick={() => {
                      setDeleteCondominio(selectedCondominio);
                      setSelectedCondominio(null);
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Excluir
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Exclusão */}
      <AlertDialog open={!!deleteCondominio} onOpenChange={() => setDeleteCondominio(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Condomínio</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o condomínio <strong>{deleteCondominio?.nome}</strong>?
              Esta ação não pode ser desfeita e o condomínio será removido permanentemente do banco de dados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">
              <Trash2 className="h-4 w-4 mr-1" />
              Excluir Permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de Aprovação com Motivo */}
      <Dialog open={aprovacaoDialog.isOpen} onOpenChange={(open) => !open && closeAprovacaoDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              {aprovacaoDialog.novoStatus === 'aprovado' && 'Aprovar Condomínio'}
              {aprovacaoDialog.novoStatus === 'nao_aprovado' && 'Reprovar Condomínio'}
              {aprovacaoDialog.novoStatus === 'aguardando' && 'Marcar como Aguardando'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <p className="text-sm text-text-secondary mb-2">
                Condomínio: <strong>{aprovacaoDialog.condominioNome}</strong>
              </p>
              <label className="text-sm font-medium text-text-primary">
                Descrição / Motivo (opcional)
              </label>
              <textarea
                value={aprovacaoDialog.motivo}
                onChange={(e) => setAprovacaoDialog(prev => ({ ...prev, motivo: e.target.value }))}
                placeholder={
                  aprovacaoDialog.novoStatus === 'aprovado' 
                    ? 'Ex: Documentação completa, fotos de qualidade...' 
                    : aprovacaoDialog.novoStatus === 'nao_aprovado'
                    ? 'Ex: Fotos insuficientes, dados incompletos...'
                    : 'Ex: Aguardando documentação adicional...'
                }
                className="mt-1 w-full min-h-[100px] p-3 rounded-lg border border-border bg-background text-text-primary resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeAprovacaoDialog}>
                Cancelar
              </Button>
              <Button 
                onClick={handleConfirmAprovacao}
                className={
                  aprovacaoDialog.novoStatus === 'aprovado' 
                    ? 'bg-green-500 hover:bg-green-600' 
                    : aprovacaoDialog.novoStatus === 'nao_aprovado'
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-yellow-500 hover:bg-yellow-600 text-black'
                }
              >
                {aprovacaoDialog.novoStatus === 'aprovado' && '✓ Confirmar Aprovação'}
                {aprovacaoDialog.novoStatus === 'nao_aprovado' && '✗ Confirmar Reprovação'}
                {aprovacaoDialog.novoStatus === 'aguardando' && '⏳ Confirmar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CondominiosTab;

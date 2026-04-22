/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Página: Imóveis - Catálogo Completo do Kenlo
 * Rota: /imoveis
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useImoveisData } from '../hooks/useImoveisData';
import { ImoveisMetrics } from '@/components/imoveis/ImoveisMetrics';
import { ImovelCard } from '@/components/imoveis/ImovelCard';
import { MeusImoveisTab } from '@/components/imoveis/MeusImoveisTab';
import { CondominiosTab } from '@/components/imoveis/CondominiosTab';
import { CriarImovelForm } from '@/components/imoveis/CriarImovelForm';
import { Imovel } from '../services/kenloService';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { OctoDashLoader } from '@/components/ui/OctoDashLoader';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { 
  Search, 
  RefreshCw, 
  Home, 
  Building2, 
  Plus,
  Tag,
  Key,
  MapPin,
  Bed,
  Bath,
  Car,
  ExternalLink,
  X,
  SlidersHorizontal,
  User
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CustomFilter {
  id: string;
  field: string;
  operator: 'contains' | 'equals' | 'starts_with' | 'not_contains' | 'greater_than' | 'less_than' | 'greater_equal' | 'less_equal';
  value: string;
}

type FilterFieldType = 'text' | 'number' | 'boolean' | 'feature';
interface FilterField { key: string; label: string; type: FilterFieldType; }

const FEATURE_VALUE_OPTIONS = [
  { value: 'sim', label: 'Sim' },
  { value: 'nao', label: 'Não' },
];

const CUSTOM_FILTER_FIELDS: FilterField[] = [
  // Identificação
  { key: 'titulo', label: 'Título', type: 'text' },
  { key: 'referencia', label: 'Referência', type: 'text' },
  { key: 'tipo', label: 'Tipo', type: 'text' },
  { key: 'finalidade', label: 'Finalidade', type: 'text' },
  { key: 'situacao', label: 'Situação', type: 'text' },
  { key: 'nome_propriedade', label: 'Nome da propriedade', type: 'text' },
  // Localização
  { key: 'bairro', label: 'Bairro', type: 'text' },
  { key: 'cidade', label: 'Cidade', type: 'text' },
  { key: 'estado', label: 'Estado', type: 'text' },
  { key: 'pais', label: 'País', type: 'text' },
  { key: 'complemento', label: 'Complemento', type: 'text' },
  { key: 'prox_rodovia', label: 'Próx. rodovia', type: 'text' },
  // Responsável
  { key: 'corretor_nome', label: 'Corretor', type: 'text' },
  { key: 'proprietario', label: 'Proprietário', type: 'text' },
  // Valores
  { key: 'valor_venda', label: 'Valor Venda (R$)', type: 'number' },
  { key: 'valor_locacao', label: 'Valor Locação (R$)', type: 'number' },
  { key: 'valor_condominio', label: 'Condomínio (R$)', type: 'number' },
  { key: 'valor_iptu', label: 'IPTU (R$)', type: 'number' },
  // Dimensões
  { key: 'area_total', label: 'Área Total (m²)', type: 'number' },
  { key: 'area_util', label: 'Área Útil (m²)', type: 'number' },
  { key: 'quartos', label: 'Quartos', type: 'number' },
  { key: 'suites', label: 'Suítes', type: 'number' },
  { key: 'garagem', label: 'Vagas', type: 'number' },
  { key: 'banheiro', label: 'Banheiros', type: 'number' },
  { key: 'salas', label: 'Salas', type: 'number' },
  { key: 'acomoda_pessoas', label: 'Acomoda quantas pessoas', type: 'number' },
  { key: 'altura_pe_direito', label: 'Altura pé direito', type: 'number' },
  { key: 'andar', label: 'Andar', type: 'number' },
  // Texto livre
  { key: 'descricao', label: 'Descrição', type: 'text' },
  { key: 'condominio_edificio', label: 'Condomínio/Edifício', type: 'text' },
  { key: 'energia', label: 'Energia', type: 'text' },
  { key: 'equipes', label: 'Equipes', type: 'text' },
  { key: 'local_chaves', label: 'Local das chaves', type: 'text' },
  { key: 'marcadores', label: 'Marcadores', type: 'text' },
  { key: 'numero', label: 'Número', type: 'text' },
  { key: 'pacote_locacao', label: 'Pacote de Locação', type: 'text' },
  { key: 'padrao', label: 'Padrão', type: 'text' },
  { key: 'pavimentacao', label: 'Pavimentação', type: 'text' },
  { key: 'ref_negociacao', label: 'Ref. da negociação', type: 'text' },
  { key: 'tipo_comissao', label: 'Tipo de comissão', type: 'text' },
  { key: 'zonas', label: 'Zonas', type: 'text' },
  { key: 'ativado_em', label: 'Ativado em', type: 'text' },
  { key: 'atualizado_em', label: 'Atualizado em', type: 'text' },
  { key: 'cadastrado_em', label: 'Cadastrado em', type: 'text' },
  // Booleano (Sim/Não)
  { key: 'autorizado_comercializacao', label: 'Autorizado p/ comercialização', type: 'boolean' },
  { key: 'condominio_fechado', label: 'Condomínio fechado', type: 'boolean' },
  { key: 'destaque', label: 'Destaque', type: 'boolean' },
  { key: 'exclusivo', label: 'Exclusivo', type: 'boolean' },
  { key: 'financiamento', label: 'Financiamento', type: 'boolean' },
  { key: 'imovel_litoral', label: 'Imóvel no litoral', type: 'boolean' },
  { key: 'mobiliado', label: 'Mobiliado', type: 'boolean' },
  { key: 'permuta', label: 'Permuta', type: 'boolean' },
  { key: 'placa', label: 'Placa', type: 'boolean' },
  { key: 'promocao', label: 'Promoção', type: 'boolean' },
  { key: 'proposta', label: 'Proposta', type: 'boolean' },
  { key: 'publicado_portais', label: 'Publicado em Portais', type: 'boolean' },
  { key: 'publicado_midia', label: 'Publicado na mídia impressa', type: 'boolean' },
  { key: 'repasse', label: 'Repasse', type: 'boolean' },
  { key: 'super_destaque', label: 'Super destaque', type: 'boolean' },
  // Características (area_comum / area_privativa)
  { key: 'Água', label: 'Água', type: 'feature' },
  { key: 'Alarme', label: 'Alarme', type: 'feature' },
  { key: 'Ar condicionado', label: 'Ar condicionado', type: 'feature' },
  { key: 'Área de serviço', label: 'Área de serviço', type: 'feature' },
  { key: 'Banheiro de empregada', label: 'Banheiro de empregada', type: 'feature' },
  { key: 'Churrasqueira', label: 'Churrasqueira', type: 'feature' },
  { key: 'Churrasqueira (condomínio)', label: 'Churrasqueira (condomínio)', type: 'feature' },
  { key: 'Copa', label: 'Copa', type: 'feature' },
  { key: 'Cozinha', label: 'Cozinha', type: 'feature' },
  { key: 'Dormitório de empregada', label: 'Dormitório de empregada', type: 'feature' },
  { key: 'Elevador', label: 'Elevador', type: 'feature' },
  { key: 'Escritório', label: 'Escritório', type: 'feature' },
  { key: 'Esgoto', label: 'Esgoto', type: 'feature' },
  { key: 'Interfone', label: 'Interfone', type: 'feature' },
  { key: 'Jardim', label: 'Jardim', type: 'feature' },
  { key: 'Lareira', label: 'Lareira', type: 'feature' },
  { key: 'Lavabo', label: 'Lavabo', type: 'feature' },
  { key: 'Lavanderia coletiva (condomínio)', label: 'Lavanderia coletiva (condomínio)', type: 'feature' },
  { key: 'Metro', label: 'Metro', type: 'feature' },
  { key: 'Piscina', label: 'Piscina', type: 'feature' },
  { key: 'Playground (condomínio)', label: 'Playground (condomínio)', type: 'feature' },
  { key: 'Portaria 24h (condomínio)', label: 'Portaria 24h (condomínio)', type: 'feature' },
  { key: 'Praia', label: 'Praia', type: 'feature' },
  { key: 'Quadra poliesportiva (condomínio)', label: 'Quadra poliesportiva (condomínio)', type: 'feature' },
  { key: 'Quintal', label: 'Quintal', type: 'feature' },
  { key: 'Sacada', label: 'Sacada', type: 'feature' },
  { key: 'Salão de festas (condomínio)', label: 'Salão de festas (condomínio)', type: 'feature' },
  { key: 'Sauna', label: 'Sauna', type: 'feature' },
  { key: 'Solarium', label: 'Solarium', type: 'feature' },
  { key: 'Terraço', label: 'Terraço', type: 'feature' },
  { key: 'Varanda gourmet', label: 'Varanda gourmet', type: 'feature' },
  { key: 'Zelador', label: 'Zelador', type: 'feature' },
];

const TEXT_OPERATORS = [
  { value: 'contains', label: 'Contém' },
  { value: 'not_contains', label: 'Não contém' },
  { value: 'equals', label: 'Igual a' },
  { value: 'starts_with', label: 'Começa com' },
];

const NUMBER_OPERATORS = [
  { value: 'equals', label: 'Igual a' },
  { value: 'greater_than', label: 'Maior que' },
  { value: 'less_than', label: 'Menor que' },
  { value: 'greater_equal', label: 'Maior ou igual' },
  { value: 'less_equal', label: 'Menor ou igual' },
];

interface ImoveisPageProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

// Interface para imóveis locais
interface ImovelLocal {
  id: string;
  tenant_id: string;
  codigo_imovel: string;
  titulo: string | null;
  tipo: string | null;
  tipo_simplificado: string | null;
  finalidade: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  area_total: number;
  area_util: number;
  quartos: number;
  suites: number;
  banheiros: number;
  vagas: number;
  valor_venda: number;
  valor_locacao: number;
  valor_condominio: number;
  valor_iptu: number;
  descricao: string | null;
  fotos: string[];
}

export const ImoveisPage = ({ onRefresh, isRefreshing }: ImoveisPageProps) => {
  const { user } = useAuth();
  const tenantId = user?.tenantId;

  // Tab ativo vem do query string (?tab=catalogo|meus-imoveis|condominios)
  // — controlado pelas tabs do NovoHeader (PageTabs)
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'catalogo';
  const setActiveTab = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', value);
      return next;
    });
  };
  
  const { 
    imoveis: imoveisXml, 
    metrics: metricsXml, 
    isLoading, 
    error, 
    refetch,
    isRefetching,
    sync,
    bairros: bairrosXml 
  } = useImoveisData();

  // Estado para imóveis locais
  const [imoveisLocais, setImoveisLocais] = useState<ImovelLocal[]>([]);

  // Estados de filtro
  const [searchTerm, setSearchTerm] = useState('');
  const [referenciaFilter, setReferenciaFilter] = useState('');
  const [tipoFilter, setTipoFilter] = useState<string>('todos');
  const [finalidadeFilter, setFinalidadeFilter] = useState<string>('todos');
  const [cidadeFilter, setCidadeFilter] = useState<string>('todos');
  const [bairroFilter, setBairroFilter] = useState<string>('todos');
  const [valorVendaMin, setValorVendaMin] = useState<string>('');
  const [valorVendaMax, setValorVendaMax] = useState<string>('');
  const [valorLocacaoMin, setValorLocacaoMin] = useState<string>('');
  const [valorLocacaoMax, setValorLocacaoMax] = useState<string>('');
  const [areaMin, setAreaMin] = useState<string>('');
  const [areaMax, setAreaMax] = useState<string>('');
  const [quartosFilter, setQuartosFilter] = useState<string>('todos');
  const [suitesFilter, setSuitesFilter] = useState<string>('todos');
  const [garagemFilter, setGaragemFilter] = useState<string>('todos');
  const [corretorFilter, setCorretorFilter] = useState<string>('todos');
  const [acomodacaoFilter, setAcomodacaoFilter] = useState<string>('todos');
  const [exclusivoFilter, setExclusivoFilter] = useState<string>('todos');
  const [iptuItrFilter, setIptuItrFilter] = useState<string>('todos');
  const [tipoComissaoFilter, setTipoComissaoFilter] = useState<string>('todos');
  const [financiamentoFilter, setFinanciamentoFilter] = useState<string>('todos');
  const [destaqueFilter, setDestaqueFilter] = useState<string>('todos');
  const [customFilters, setCustomFilters] = useState<CustomFilter[]>([]);
  const [filterSelectorKey, setFilterSelectorKey] = useState(0);

  const TIPOS_COMISSAO = [
    'Captador', 'Indicação', 'Promotor', 'Placa', 'Fotografia',
    'Exclusividade', 'Anúncio', 'Plantão', 'Vistoria'
  ];

  const matchesBooleanFilter = (value: boolean | string | number | null | undefined, filter: string) => {
    if (filter === 'todos') return true;
    const normalized = typeof value === 'string' ? value.toLowerCase() : value;
    const isTrue = normalized === true || normalized === 'sim' || normalized === 'true' || normalized === '1' || normalized === 1;
    return filter === 'sim' ? isTrue : !isTrue;
  };

  const [selectedImovel, setSelectedImovel] = useState<Imovel | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [isCriarImovelOpen, setIsCriarImovelOpen] = useState(false);

  // Carregar imóveis locais do banco
  const loadImoveisLocais = useCallback(async () => {
    if (!tenantId) return;
    
    try {
      const { data, error: fetchError } = await supabase
        .from('imoveis_locais')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      
      if (fetchError) {
        return;
      }
      
      setImoveisLocais(data || []);
    } catch (err) {
      console.error('Erro ao carregar imóveis locais:', err);
    }
  }, [tenantId]);

  // Converter imóvel local para formato Imovel
  const convertLocalToImovel = useCallback((local: ImovelLocal): Imovel => {
    return {
      referencia: local.codigo_imovel,
      titulo: local.titulo || `${local.tipo || 'Imóvel'} - ${local.bairro || 'Sem bairro'}`,
      tipo: local.tipo || 'Outro',
      tipoSimplificado: (local.tipo_simplificado as Imovel['tipoSimplificado']) || 'outro',
      bairro: local.bairro || 'Sem bairro',
      cidade: local.cidade || 'Sem cidade',
      estado: local.estado || 'SP',
      valor_venda: local.valor_venda || 0,
      valor_locacao: local.valor_locacao || 0,
      finalidade: (local.finalidade as Imovel['finalidade']) || 'venda',
      valor_iptu: local.valor_iptu || 0,
      valor_condominio: local.valor_condominio || 0,
      area_total: local.area_total || 0,
      area_util: local.area_util || 0,
      quartos: local.quartos || 0,
      suites: local.suites || 0,
      garagem: local.vagas || 0,
      banheiro: local.banheiros || 0,
      salas: 0,
      descricao: local.descricao || '',
      fotos: Array.isArray(local.fotos) ? local.fotos : [],
      videos: [],
      area_comum: [],
      area_privativa: [],
    };
  }, []);

  // Combinar imóveis XML + Locais
  const imoveis = useMemo(() => {
    const imoveisLocaisConvertidos = imoveisLocais.map(convertLocalToImovel);
    const codigosXml = new Set(imoveisXml.map(i => i.referencia?.toUpperCase()));
    
    // Adicionar apenas imóveis locais que não existem no XML
    const locaisSemDuplicata = imoveisLocaisConvertidos.filter(
      local => !codigosXml.has(local.referencia?.toUpperCase())
    );
    
    return [...imoveisXml, ...locaisSemDuplicata];
  }, [imoveisXml, imoveisLocais, convertLocalToImovel]);

  // Métricas precisam considerar também os imóveis cadastrados localmente
  const metrics = useMemo(() => {
    if (!imoveis || imoveis.length === 0) {
      return metricsXml;
    }

    return {
      total: imoveis.length,
      casas: imoveis.filter(i => i.tipoSimplificado === 'casa').length,
      apartamentos: imoveis.filter(i => i.tipoSimplificado === 'apartamento').length,
      terrenos: imoveis.filter(i => i.tipoSimplificado === 'terreno').length,
      comerciais: imoveis.filter(i => i.tipoSimplificado === 'comercial').length,
      rurais: imoveis.filter(i => i.tipoSimplificado === 'rural').length,
      venda: imoveis.filter(i => i.finalidade === 'venda' || i.finalidade === 'venda_locacao').length,
      locacao: imoveis.filter(i => i.finalidade === 'locacao' || i.finalidade === 'venda_locacao').length,
      vendaLocacao: imoveis.filter(i => i.finalidade === 'venda_locacao').length,
      valorTotalVenda: imoveis.reduce((sum, i) => sum + (i.valor_venda || 0), 0),
      valorTotalLocacao: imoveis.reduce((sum, i) => sum + (i.valor_locacao || 0), 0)
    };
  }, [imoveis, metricsXml]);

  // Combinar bairros
  const bairros = useMemo(() => {
    const bairrosLocais = imoveisLocais
      .map(i => i.bairro)
      .filter((b): b is string => !!b && b !== 'Sem bairro');
    const todosBairros = [...new Set([...bairrosXml, ...bairrosLocais])];
    return todosBairros.sort();
  }, [bairrosXml, imoveisLocais]);

  const cidades = useMemo(() => {
    const values = imoveis
      .map((i) => i.cidade)
      .filter((cidade): cidade is string => !!cidade && cidade !== 'Sem cidade');

    return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [imoveis]);

  const corretores = useMemo(() => {
    const values = imoveis
      .map((i) => i.corretor_nome)
      .filter((nome): nome is string => !!nome && nome.trim().length > 0);

    return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [imoveis]);

  // Excluir imóvel local do banco de dados
  const handleDeleteImovel = async (referencia: string) => {
    if (!tenantId) return;
    
    try {
      // Excluir da tabela imoveis_locais
      const { error: deleteLocalError } = await supabase
        .from('imoveis_locais')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('codigo_imovel', referencia);
      
      if (deleteLocalError) {
      }
      
      // Excluir da tabela imoveis_corretores
      const { error: deleteCorretorError } = await supabase
        .from('imoveis_corretores')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('codigo_imovel', referencia);
      
      if (deleteCorretorError) {
        console.error('❌ Erro ao excluir de imoveis_corretores:', deleteCorretorError.message);
      }
      
      
      // Recarregar dados
      await loadImoveisLocais();
      
    } catch (err) {
      console.error('❌ Erro ao excluir imóvel:', err);
    }
  };

  // Verificar se um imóvel pode ser excluído (apenas locais)
  const canDeleteImovel = (referencia: string): boolean => {
    return imoveisLocais.some(local => local.codigo_imovel.toUpperCase() === referencia.toUpperCase());
  };

  // Sincronizar com localStorage e carregar imóveis locais
  useEffect(() => {
    localStorage.setItem('selectedSection', 'imoveis');
    loadImoveisLocais();
  }, [loadImoveisLocais]);

  // Filtrar imóveis
  const imoveisFiltrados = useMemo(() => {
    let filtered = imoveis;

    // Filtro por busca (título, referência, bairro)
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(i => 
        i.titulo.toLowerCase().includes(search) ||
        i.bairro.toLowerCase().includes(search) ||
        i.descricao.toLowerCase().includes(search)
      );
    }

    if (referenciaFilter) {
      const referencias = referenciaFilter
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 10);

      filtered = filtered.filter((i) =>
        referencias.some((ref) => i.referencia.toLowerCase().includes(ref))
      );
    }

    // Filtro por tipo
    if (tipoFilter !== 'todos') {
      filtered = filtered.filter(i => i.tipoSimplificado === tipoFilter);
    }

    // Filtro por finalidade
    if (finalidadeFilter === 'venda') {
      filtered = filtered.filter(i => i.finalidade === 'venda' || i.finalidade === 'venda_locacao');
    } else if (finalidadeFilter === 'locacao') {
      filtered = filtered.filter(i => i.finalidade === 'locacao' || i.finalidade === 'venda_locacao');
    }

    if (cidadeFilter !== 'todos') {
      filtered = filtered.filter((i) => i.cidade === cidadeFilter);
    }

    // Filtro por bairro
    if (bairroFilter !== 'todos') {
      filtered = filtered.filter(i => i.bairro === bairroFilter);
    }

    if (valorVendaMin || valorVendaMax) {
      filtered = filtered.filter(i => {
        const valor = i.valor_venda || 0;
        const min = valorVendaMin ? parseFloat(valorVendaMin) : 0;
        const max = valorVendaMax ? parseFloat(valorVendaMax) : Infinity;
        return valor >= min && valor <= max;
      });
    }

    if (valorLocacaoMin || valorLocacaoMax) {
      filtered = filtered.filter(i => {
        const valor = i.valor_locacao || 0;
        const min = valorLocacaoMin ? parseFloat(valorLocacaoMin) : 0;
        const max = valorLocacaoMax ? parseFloat(valorLocacaoMax) : Infinity;
        return valor >= min && valor <= max;
      });
    }

    if (areaMin || areaMax) {
      filtered = filtered.filter((i) => {
        const area = i.area_util > 0 ? i.area_util : i.area_total;
        const min = areaMin ? parseFloat(areaMin) : 0;
        const max = areaMax ? parseFloat(areaMax) : Infinity;
        return area >= min && area <= max;
      });
    }

    const matchesNumericFilter = (value: number, filterValue: string) => {
      if (filterValue === 'todos') return true;
      if (filterValue === '5+') return value >= 5;
      return value === Number(filterValue);
    };

    filtered = filtered.filter((i) =>
      matchesNumericFilter(i.quartos || 0, quartosFilter) &&
      matchesNumericFilter(i.suites || 0, suitesFilter) &&
      matchesNumericFilter(i.garagem || 0, garagemFilter)
    );

    if (corretorFilter !== 'todos') {
      filtered = filtered.filter((i) => (i.corretor_nome || 'Sem corretor') === corretorFilter);
    }

    if (acomodacaoFilter !== 'todos') {
      filtered = filtered.filter((i) => {
        const acomodacao = (i as any).acomodacao ?? (i as any).acomodacoes ?? 0;
        return matchesNumericFilter(Number(acomodacao) || 0, acomodacaoFilter);
      });
    }

    if (exclusivoFilter !== 'todos') {
      filtered = filtered.filter((i) =>
        matchesBooleanFilter((i as any).exclusivo ?? (i as any).exclusividade, exclusivoFilter)
      );
    }

    if (iptuItrFilter !== 'todos') {
      filtered = filtered.filter((i) => {
        const iptu = i.valor_iptu || 0;
        const itr = (i as any).valor_itr || 0;
        const possui = (iptu > 0) || (itr > 0);
        return iptuItrFilter === 'sim' ? possui : !possui;
      });
    }

    if (tipoComissaoFilter !== 'todos') {
      filtered = filtered.filter((i) => {
        const tipo = (i as any).tipo_comissao ?? (i as any).tipoComissao ?? '';
        return tipo === tipoComissaoFilter;
      });
    }

    if (financiamentoFilter !== 'todos') {
      filtered = filtered.filter((i) =>
        matchesBooleanFilter((i as any).financiamento ?? (i as any).financiavel, financiamentoFilter)
      );
    }

    if (destaqueFilter !== 'todos') {
      filtered = filtered.filter((i) =>
        matchesBooleanFilter((i as any).destaque ?? (i as any).super_destaque, destaqueFilter)
      );
    }

    if (customFilters.length > 0) {
      filtered = filtered.filter(imovel =>
        customFilters.every(cf => {
          if (!cf.field || !cf.value) return true;
          const fieldDef = CUSTOM_FILTER_FIELDS.find(f => f.key === cf.field);
          if (!fieldDef) return true;

          if (fieldDef.type === 'feature') {
            const areaComum: string[] = (imovel as any).area_comum || [];
            const areaPrivativa: string[] = (imovel as any).area_privativa || [];
            const allFeatures = [...areaComum, ...areaPrivativa].map(f => f.toLowerCase().trim());
            const featureName = fieldDef.key.toLowerCase();
            const hasFeature = allFeatures.some(f => f.includes(featureName));
            return cf.value === 'sim' ? hasFeature : !hasFeature;
          }

          if (fieldDef.type === 'boolean') {
            const rawVal = (imovel as any)[cf.field];
            return matchesBooleanFilter(rawVal, cf.value);
          }

          const rawVal = (imovel as any)[cf.field];
          if (fieldDef.type === 'number') {
            const numVal = parseFloat(String(rawVal ?? 0)) || 0;
            const filterNum = parseFloat(cf.value) || 0;
            switch (cf.operator) {
              case 'equals': return numVal === filterNum;
              case 'greater_than': return numVal > filterNum;
              case 'less_than': return numVal < filterNum;
              case 'greater_equal': return numVal >= filterNum;
              case 'less_equal': return numVal <= filterNum;
              default: return true;
            }
          } else {
            const strVal = String(rawVal ?? '').toLowerCase();
            const filterStr = cf.value.toLowerCase();
            switch (cf.operator) {
              case 'contains': return strVal.includes(filterStr);
              case 'not_contains': return !strVal.includes(filterStr);
              case 'equals': return strVal === filterStr;
              case 'starts_with': return strVal.startsWith(filterStr);
              default: return true;
            }
          }
        })
      );
    }

    return filtered;
  }, [
    imoveis,
    searchTerm,
    referenciaFilter,
    tipoFilter,
    finalidadeFilter,
    cidadeFilter,
    bairroFilter,
    valorVendaMin,
    valorVendaMax,
    valorLocacaoMin,
    valorLocacaoMax,
    areaMin,
    areaMax,
    quartosFilter,
    suitesFilter,
    garagemFilter,
    corretorFilter,
    acomodacaoFilter,
    exclusivoFilter,
    iptuItrFilter,
    tipoComissaoFilter,
    financiamentoFilter,
    destaqueFilter,
    customFilters
  ]);

  // Limpar filtros
  const limparFiltros = () => {
    setSearchTerm('');
    setReferenciaFilter('');
    setTipoFilter('todos');
    setFinalidadeFilter('todos');
    setCidadeFilter('todos');
    setBairroFilter('todos');
    setValorVendaMin('');
    setValorVendaMax('');
    setValorLocacaoMin('');
    setValorLocacaoMax('');
    setAreaMin('');
    setAreaMax('');
    setQuartosFilter('todos');
    setSuitesFilter('todos');
    setGaragemFilter('todos');
    setCorretorFilter('todos');
    setAcomodacaoFilter('todos');
    setExclusivoFilter('todos');
    setIptuItrFilter('todos');
    setTipoComissaoFilter('todos');
    setFinanciamentoFilter('todos');
    setDestaqueFilter('todos');
    setCustomFilters([]);
    setFilterSelectorKey(prev => prev + 1);
  };

  const addCustomFilter = (fieldKey: string) => {
    if (!fieldKey) return;
    const fieldDef = CUSTOM_FILTER_FIELDS.find(f => f.key === fieldKey);
    setCustomFilters(prev => [...prev, {
      id: String(Date.now()),
      field: fieldKey,
      operator: (fieldDef?.type === 'number' ? 'equals' : 'contains') as CustomFilter['operator'],
      value: ''
    }]);
    setFilterSelectorKey(prev => prev + 1);
  };

  // Verificar se há filtros ativos
  const temFiltrosAtivos =
    !!searchTerm ||
    !!referenciaFilter ||
    tipoFilter !== 'todos' ||
    finalidadeFilter !== 'todos' ||
    cidadeFilter !== 'todos' ||
    bairroFilter !== 'todos' ||
    !!valorVendaMin ||
    !!valorVendaMax ||
    !!valorLocacaoMin ||
    !!valorLocacaoMax ||
    !!areaMin ||
    !!areaMax ||
    quartosFilter !== 'todos' ||
    suitesFilter !== 'todos' ||
    garagemFilter !== 'todos' ||
    corretorFilter !== 'todos' ||
    acomodacaoFilter !== 'todos' ||
    exclusivoFilter !== 'todos' ||
    iptuItrFilter !== 'todos' ||
    tipoComissaoFilter !== 'todos' ||
    financiamentoFilter !== 'todos' ||
    destaqueFilter !== 'todos' ||
    customFilters.some(cf => !!cf.value);

  // Handler para visualizar detalhes
  const handleViewDetails = (imovel: Imovel) => {
    setSelectedImovel(imovel);
    setShowDetails(true);
  };

  const closeDetails = () => {
    setShowDetails(false);
    setSelectedImovel(null);
  };

  const formatCurrency = (value: number) => {
    if (!value || value === 0) return '-';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const renderNumericOptions = () => (
    <>
      <SelectItem value="todos">Todos</SelectItem>
      <SelectItem value="1">1</SelectItem>
      <SelectItem value="2">2</SelectItem>
      <SelectItem value="3">3</SelectItem>
      <SelectItem value="4">4</SelectItem>
      <SelectItem value="5+">5+</SelectItem>
    </>
  );

  return (
    <div className="min-h-screen flex">
      <div
        className="flex-1 p-6 space-y-6 transition-all duration-300 ease-in-out"
        style={{ marginRight: showDetails ? '400px' : '0' }}
      >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Catálogo de Imóveis</h1>
          <p className="text-text-secondary mt-1">
            Portfólio completo • Integração Kenlo • Atualização em tempo real
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setIsCriarImovelOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Novo Imóvel
          </Button>
          <Button 
            onClick={() => sync()} 
            disabled={isRefetching || isLoading}
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      <CriarImovelForm
        isOpen={isCriarImovelOpen}
        onClose={() => setIsCriarImovelOpen(false)}
        onSuccess={() => {
          loadImoveisLocais();
        }}
      />

      {/* Tabs são renderizadas no NovoHeader via PageTabs. Aqui usamos Tabs controlado pelo query param. */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsContent value="meus-imoveis">
          <MeusImoveisTab 
            allImoveis={imoveis} 
            onViewDetails={handleViewDetails}
            onPropertyCreated={loadImoveisLocais}
          />
        </TabsContent>

        <TabsContent value="condominios">
          <CondominiosTab />
        </TabsContent>

        <TabsContent value="catalogo">
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card/60 p-4 space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-text-secondary" />
              <h2 className="text-lg font-semibold text-text-primary">Filtros do catálogo</h2>
              {temFiltrosAtivos && (
                <Badge variant="secondary">
                  {imoveisFiltrados.length} resultados
                </Badge>
              )}
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative min-w-0 w-full lg:w-[360px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-text-secondary" />
                <Input
                  placeholder="Código, título, bairro ou descrição"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              <Input
                placeholder="Referência(s): AP0022, CA0033"
                value={referenciaFilter}
                onChange={(e) => setReferenciaFilter(e.target.value)}
                className="w-full lg:w-[280px]"
              />

              {temFiltrosAtivos && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={limparFiltros}
                  className="shrink-0"
                >
                  <X className="h-4 w-4 mr-1" />
                  Limpar filtros
                </Button>
              )}
            </div>
          </div>

          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Localização e tipo</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <Select value={tipoFilter} onValueChange={setTipoFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Tipos</SelectItem>
                <SelectItem value="casa">🏠 Casas</SelectItem>
                <SelectItem value="apartamento">🏢 Apartamentos</SelectItem>
                <SelectItem value="terreno">📐 Terrenos</SelectItem>
                <SelectItem value="comercial">🏪 Comerciais</SelectItem>
                <SelectItem value="rural">🌳 Rurais</SelectItem>
              </SelectContent>
            </Select>

            <Select value={finalidadeFilter} onValueChange={setFinalidadeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Finalidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as Finalidades</SelectItem>
                <SelectItem value="venda">🏷️ Venda</SelectItem>
                <SelectItem value="locacao">🔑 Locação</SelectItem>
              </SelectContent>
            </Select>

            <Select value={cidadeFilter} onValueChange={setCidadeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Cidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as Cidades</SelectItem>
                {cidades.map((cidade) => (
                  <SelectItem key={cidade} value={cidade}>
                    {cidade}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={bairroFilter} onValueChange={setBairroFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Bairro" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Bairros</SelectItem>
                {bairros.map(bairro => (
                  <SelectItem key={bairro} value={bairro}>
                    {bairro}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={corretorFilter} onValueChange={setCorretorFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Corretor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Corretores</SelectItem>
                {corretores.map((corretor) => (
                  <SelectItem key={corretor} value={corretor}>
                    {corretor}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Faixa de valores</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <Input
              type="number"
              placeholder="Venda - R$ de"
              value={valorVendaMin}
              onChange={(e) => setValorVendaMin(e.target.value)}
            />

            <Input
              type="number"
              placeholder="Venda - R$ até"
              value={valorVendaMax}
              onChange={(e) => setValorVendaMax(e.target.value)}
            />

            <Input
              type="number"
              placeholder="Locação - R$ de"
              value={valorLocacaoMin}
              onChange={(e) => setValorLocacaoMin(e.target.value)}
            />

            <Input
              type="number"
              placeholder="Locação - R$ até"
              value={valorLocacaoMax}
              onChange={(e) => setValorLocacaoMax(e.target.value)}
            />
          </div>

          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Dimensões e cômodos</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            <Input
              type="number"
              placeholder="Área m² de"
              value={areaMin}
              onChange={(e) => setAreaMin(e.target.value)}
            />

            <Input
              type="number"
              placeholder="Área m² até"
              value={areaMax}
              onChange={(e) => setAreaMax(e.target.value)}
            />

            <Select value={quartosFilter} onValueChange={setQuartosFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Dormitórios" />
              </SelectTrigger>
              <SelectContent>
                {renderNumericOptions()}
              </SelectContent>
            </Select>

            <Select value={suitesFilter} onValueChange={setSuitesFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Suítes" />
              </SelectTrigger>
              <SelectContent>
                {renderNumericOptions()}
              </SelectContent>
            </Select>

            <Select value={garagemFilter} onValueChange={setGaragemFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Vagas" />
              </SelectTrigger>
              <SelectContent>
                {renderNumericOptions()}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Características e negociação</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <Select value={acomodacaoFilter} onValueChange={setAcomodacaoFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Acomodação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as acomodações</SelectItem>
                <SelectItem value="1">1</SelectItem>
                <SelectItem value="2">2</SelectItem>
                <SelectItem value="3">3</SelectItem>
                <SelectItem value="4">4</SelectItem>
                <SelectItem value="5+">5+</SelectItem>
              </SelectContent>
            </Select>

            <Select value={exclusivoFilter} onValueChange={setExclusivoFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Exclusivo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Exclusivo</SelectItem>
                <SelectItem value="sim">Sim</SelectItem>
                <SelectItem value="nao">Não</SelectItem>
              </SelectContent>
            </Select>

            <Select value={iptuItrFilter} onValueChange={setIptuItrFilter}>
              <SelectTrigger>
                <SelectValue placeholder="IPTU/ITR" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">IPTU/ITR</SelectItem>
                <SelectItem value="sim">Possui</SelectItem>
                <SelectItem value="nao">Não possui</SelectItem>
              </SelectContent>
            </Select>

            <Select value={tipoComissaoFilter} onValueChange={setTipoComissaoFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo de comissão" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Comissão</SelectItem>
                {TIPOS_COMISSAO.map((tipo) => (
                  <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={financiamentoFilter} onValueChange={setFinanciamentoFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Financiamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Financiamento</SelectItem>
                <SelectItem value="sim">Aceita</SelectItem>
                <SelectItem value="nao">Não aceita</SelectItem>
              </SelectContent>
            </Select>

            <Select value={destaqueFilter} onValueChange={setDestaqueFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Destaque" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Destaque</SelectItem>
                <SelectItem value="sim">Em destaque</SelectItem>
                <SelectItem value="nao">Sem destaque</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex items-center gap-3 flex-wrap mb-3">
              <SlidersHorizontal className="h-4 w-4 text-text-secondary shrink-0" />
              <span className="text-sm font-medium text-text-primary">Filtros personalizados</span>
              <Select key={filterSelectorKey} onValueChange={addCustomFilter}>
                <SelectTrigger className="w-[220px] h-9">
                  <Plus className="h-3 w-3 mr-1 text-text-secondary" />
                  <SelectValue placeholder="Adicionar filtro..." />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {CUSTOM_FILTER_FIELDS.map(fd => (
                    <SelectItem key={fd.key} value={fd.key}>{fd.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {customFilters.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => { setCustomFilters([]); setFilterSelectorKey(p => p + 1); }}>
                  <X className="h-3 w-3 mr-1" />
                  Limpar todos
                </Button>
              )}
            </div>
            {customFilters.length > 0 && (
              <div className="space-y-2">
                {customFilters.map(cf => {
                  const fieldDef = CUSTOM_FILTER_FIELDS.find(f => f.key === cf.field);
                  const operators = fieldDef?.type === 'number' ? NUMBER_OPERATORS : TEXT_OPERATORS;
                  const isSimNao = fieldDef?.type === 'feature' || fieldDef?.type === 'boolean';
                  return (
                    <div key={cf.id} className="flex items-center gap-2 flex-wrap bg-muted/40 rounded-lg px-3 py-2">
                      <span className="text-sm font-medium text-text-primary min-w-[160px] shrink-0">
                        {fieldDef?.label ?? cf.field}
                      </span>
                      {isSimNao ? (
                        <Select
                          value={cf.value}
                          onValueChange={val => setCustomFilters(prev =>
                            prev.map(f => f.id === cf.id ? { ...f, value: val } : f)
                          )}
                        >
                          <SelectTrigger className="w-[110px] h-8">
                            <SelectValue placeholder="Selecionar" />
                          </SelectTrigger>
                          <SelectContent>
                            {FEATURE_VALUE_OPTIONS.map(op => (
                              <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <>
                          <Select
                            value={cf.operator}
                            onValueChange={val => setCustomFilters(prev =>
                              prev.map(f => f.id === cf.id ? { ...f, operator: val as CustomFilter['operator'] } : f)
                            )}
                          >
                            <SelectTrigger className="w-[150px] h-8">
                              <SelectValue placeholder="Operador" />
                            </SelectTrigger>
                            <SelectContent>
                              {operators.map(op => (
                                <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            placeholder="Valor"
                            value={cf.value}
                            type={fieldDef?.type === 'number' ? 'number' : 'text'}
                            onChange={e => setCustomFilters(prev =>
                              prev.map(f => f.id === cf.id ? { ...f, value: e.target.value } : f)
                            )}
                            className="h-8 flex-1 min-w-[120px] max-w-[240px]"
                          />
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 ml-auto shrink-0"
                        onClick={() => setCustomFilters(prev => prev.filter(f => f.id !== cf.id))}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {temFiltrosAtivos && (
            <div className="flex flex-wrap gap-2">
              {searchTerm && (
                <Badge variant="secondary">
                  Busca: {searchTerm}
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setSearchTerm('')} />
                </Badge>
              )}
              {referenciaFilter && (
                <Badge variant="secondary">
                  Referência: {referenciaFilter}
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setReferenciaFilter('')} />
                </Badge>
              )}
              {tipoFilter !== 'todos' && (
                <Badge variant="secondary">
                  Tipo: {tipoFilter}
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setTipoFilter('todos')} />
                </Badge>
              )}
              {finalidadeFilter !== 'todos' && (
                <Badge variant="secondary">
                  Finalidade: {finalidadeFilter}
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setFinalidadeFilter('todos')} />
                </Badge>
              )}
              {cidadeFilter !== 'todos' && (
                <Badge variant="secondary">
                  Cidade: {cidadeFilter}
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setCidadeFilter('todos')} />
                </Badge>
              )}
              {bairroFilter !== 'todos' && (
                <Badge variant="secondary">
                  Bairro: {bairroFilter}
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setBairroFilter('todos')} />
                </Badge>
              )}
              {corretorFilter !== 'todos' && (
                <Badge variant="secondary">
                  Corretor: {corretorFilter}
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setCorretorFilter('todos')} />
                </Badge>
              )}
              {valorVendaMin && (
                <Badge variant="secondary">
                  Venda de: {valorVendaMin}
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setValorVendaMin('')} />
                </Badge>
              )}
              {valorVendaMax && (
                <Badge variant="secondary">
                  Venda até: {valorVendaMax}
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setValorVendaMax('')} />
                </Badge>
              )}
              {valorLocacaoMin && (
                <Badge variant="secondary">
                  Locação de: {valorLocacaoMin}
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setValorLocacaoMin('')} />
                </Badge>
              )}
              {valorLocacaoMax && (
                <Badge variant="secondary">
                  Locação até: {valorLocacaoMax}
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setValorLocacaoMax('')} />
                </Badge>
              )}
              {areaMin && (
                <Badge variant="secondary">
                  Área de: {areaMin} m²
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setAreaMin('')} />
                </Badge>
              )}
              {areaMax && (
                <Badge variant="secondary">
                  Área até: {areaMax} m²
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setAreaMax('')} />
                </Badge>
              )}
              {quartosFilter !== 'todos' && (
                <Badge variant="secondary">
                  Dorms: {quartosFilter}
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setQuartosFilter('todos')} />
                </Badge>
              )}
              {suitesFilter !== 'todos' && (
                <Badge variant="secondary">
                  Suítes: {suitesFilter}
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setSuitesFilter('todos')} />
                </Badge>
              )}
              {garagemFilter !== 'todos' && (
                <Badge variant="secondary">
                  Vagas: {garagemFilter}
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setGaragemFilter('todos')} />
                </Badge>
              )}
              {acomodacaoFilter !== 'todos' && (
                <Badge variant="secondary">
                  Acomodação: {acomodacaoFilter}
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setAcomodacaoFilter('todos')} />
                </Badge>
              )}
              {exclusivoFilter !== 'todos' && (
                <Badge variant="secondary">
                  Exclusivo: {exclusivoFilter}
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setExclusivoFilter('todos')} />
                </Badge>
              )}
              {iptuItrFilter !== 'todos' && (
                <Badge variant="secondary">
                  IPTU/ITR: {iptuItrFilter}
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setIptuItrFilter('todos')} />
                </Badge>
              )}
              {tipoComissaoFilter !== 'todos' && (
                <Badge variant="secondary">
                  Comissão: {tipoComissaoFilter}
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setTipoComissaoFilter('todos')} />
                </Badge>
              )}
              {financiamentoFilter !== 'todos' && (
                <Badge variant="secondary">
                  Financiamento: {financiamentoFilter}
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setFinanciamentoFilter('todos')} />
                </Badge>
              )}
              {destaqueFilter !== 'todos' && (
                <Badge variant="secondary">
                  Destaque: {destaqueFilter}
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setDestaqueFilter('todos')} />
                </Badge>
              )}
              {customFilters.filter(cf => !!cf.value).map(cf => {
                const fieldDef = CUSTOM_FILTER_FIELDS.find(f => f.key === cf.field);
                const isSimNao = fieldDef?.type === 'feature' || fieldDef?.type === 'boolean';
                const opLabel = isSimNao
                  ? ''
                  : ([...TEXT_OPERATORS, ...NUMBER_OPERATORS].find(o => o.value === cf.operator)?.label ?? cf.operator);
                const valueLabel = cf.value === 'sim' ? 'Sim' : cf.value === 'nao' ? 'Não' : `"${cf.value}"`;
                return (
                  <Badge key={cf.id} variant="secondary">
                    {fieldDef?.label ?? cf.field}{opLabel ? ` ${opLabel}` : ':'} {valueLabel}
                    <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setCustomFilters(prev => prev.filter(f => f.id !== cf.id))} />
                  </Badge>
                );
              })}
            </div>
          )}
        </div>

        {/* Métricas */}
        <ImoveisMetrics metrics={metrics} isLoading={isLoading} />

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-text-secondary">
            Exibindo <strong>{imoveisFiltrados.length}</strong> de <strong>{imoveis.length}</strong> imóveis
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setIsCriarImovelOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Cadastrar imóvel
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <OctoDashLoader message="Carregando catálogo..." size="lg" />
          </div>
        ) : imoveisFiltrados.length === 0 ? (
          <div className="text-center py-20">
            <Home className="h-16 w-16 text-text-secondary mx-auto mb-4 opacity-50" />
            <p className="text-text-secondary">Nenhum imóvel encontrado com os filtros selecionados</p>
            {temFiltrosAtivos && (
              <Button variant="outline" onClick={limparFiltros} className="mt-4">
                Limpar Filtros
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {imoveisFiltrados.map(imovel => (
              <ImovelCard 
                key={imovel.referencia} 
                imovel={imovel}
                onViewDetails={handleViewDetails}
                onDelete={handleDeleteImovel}
                canDelete={canDeleteImovel(imovel.referencia)}
              />
            ))}
          </div>
        )}
      </div>
        </TabsContent>
      </Tabs>

      </div>

      {showDetails && selectedImovel && (
        <>
          <div
            className="fixed top-[96px] right-0 w-[400px] z-40 overflow-hidden border-l border-border bg-background shadow-xl flex flex-col"
            style={{ animation: 'slideIn 0.2s ease-out', height: 'calc(100vh - 96px)' }}
          >
            <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-border bg-background">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-foreground truncate">Detalhes do Imóvel</h2>
                <p className="text-xs text-muted-foreground truncate">Ref: {selectedImovel.referencia}</p>
              </div>
              <button
                onClick={closeDetails}
                className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 pb-8" style={{ scrollBehavior: 'smooth' }}>
              {/* Imagem principal */}
              {selectedImovel.fotos && selectedImovel.fotos.length > 0 && (
                <div className="mb-4 -mx-4 -mt-4">
                  <img
                    src={selectedImovel.fotos[0]}
                    alt={selectedImovel.titulo}
                    className="w-full h-48 object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
              
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-foreground leading-tight">{selectedImovel.titulo}</h3>
                <p className="text-sm text-muted-foreground mt-1">{selectedImovel.tipo}</p>
              </div>

              <div className="space-y-2 mb-6">
                <div className="flex items-center gap-2 text-sm">
                  <Tag className="w-4 h-4 text-muted-foreground" />
                  <span className="text-foreground capitalize">{selectedImovel.finalidade.replace('_', ' + ')}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <span className="text-foreground">
                    {selectedImovel.bairro}, {selectedImovel.cidade} - {selectedImovel.estado}
                  </span>
                </div>
              </div>

              <div className="border-t border-border my-5" />

              <div className="mb-6">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Corretor responsável</h4>
                <div className="space-y-3">
                  {(selectedImovel.corretor_foto || selectedImovel.corretor_nome) && (
                    <div className="flex items-center gap-3">
                      {selectedImovel.corretor_foto ? (
                        <img
                          src={selectedImovel.corretor_foto}
                          alt={selectedImovel.corretor_nome || 'Corretor'}
                          className="w-10 h-10 rounded-lg object-cover border border-border"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-foreground font-medium text-sm">
                          {(selectedImovel.corretor_nome || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{selectedImovel.corretor_nome || '-'}</p>
                        {selectedImovel.corretor_email ? (
                          <p className="text-xs text-muted-foreground truncate">{selectedImovel.corretor_email}</p>
                        ) : null}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Nome</span>
                      <span className="text-foreground font-medium">{selectedImovel.corretor_nome || '-'}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Número</span>
                      <span className="text-foreground font-medium">{selectedImovel.corretor_numero || '-'}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">E-mail</span>
                      <span className="text-foreground font-medium">{selectedImovel.corretor_email || '-'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Valores</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Venda</span>
                    <span className="text-foreground font-medium">{formatCurrency(selectedImovel.valor_venda)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Locação</span>
                    <span className="text-foreground font-medium">{selectedImovel.valor_locacao > 0 ? `${formatCurrency(selectedImovel.valor_locacao)}/mês` : '-'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Condomínio</span>
                    <span className="text-foreground font-medium">{formatCurrency(selectedImovel.valor_condominio)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">IPTU</span>
                    <span className="text-foreground font-medium">{formatCurrency(selectedImovel.valor_iptu)}</span>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Áreas</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg border border-border">
                    <p className="text-xs text-muted-foreground">Área total</p>
                    <p className="text-sm font-semibold text-foreground">{selectedImovel.area_total > 0 ? `${selectedImovel.area_total} m²` : '-'}</p>
                  </div>
                  <div className="p-3 rounded-lg border border-border">
                    <p className="text-xs text-muted-foreground">Área útil</p>
                    <p className="text-sm font-semibold text-foreground">{selectedImovel.area_util > 0 ? `${selectedImovel.area_util} m²` : '-'}</p>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Características</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Bed className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground">{selectedImovel.quartos || 0}</span>
                    <span className="text-muted-foreground">Quartos</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Bath className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground">{selectedImovel.banheiro || 0}</span>
                    <span className="text-muted-foreground">Banheiros</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Car className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground">{selectedImovel.garagem || 0}</span>
                    <span className="text-muted-foreground">Vagas</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Home className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground">{selectedImovel.suites || 0}</span>
                    <span className="text-muted-foreground">Suítes</span>
                  </div>
                </div>
              </div>

              {selectedImovel.descricao && (
                <div className="mb-6">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Descrição</h4>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{selectedImovel.descricao}</p>
                </div>
              )}

              {selectedImovel.fotos && selectedImovel.fotos.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Fotos</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedImovel.fotos.slice(0, 8).map((url, idx) => (
                      <a
                        key={`${url}-${idx}`}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-lg overflow-hidden border border-border"
                      >
                        <img
                          src={url}
                          alt={`Foto ${idx + 1}`}
                          className="w-full h-24 object-cover"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </a>
                    ))}
                  </div>
                  {selectedImovel.fotos.length > 8 && (
                    <p className="text-xs text-muted-foreground mt-2">Mostrando 8 de {selectedImovel.fotos.length} fotos</p>
                  )}
                </div>
              )}

              {selectedImovel.videos && selectedImovel.videos.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Vídeos</h4>
                  <div className="space-y-2">
                    {selectedImovel.videos.map((url, idx) => (
                      <a
                        key={`${url}-${idx}`}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 text-sm text-foreground hover:underline"
                      >
                        <ExternalLink className="w-4 h-4 text-muted-foreground" />
                        <span className="truncate">{url}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <style>{`
            @keyframes slideIn {
              from { transform: translateX(100%); }
              to { transform: translateX(0); }
            }
          `}</style>
        </>
      )}
    </div>
  );
};


import { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, ChevronDown, Users, UserPlus, Pencil, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { CriarCorretorModal } from './CriarCorretorModal';
import { useAuth } from "@/hooks/useAuth";
import { podeCriarCorretor, listarCorretores, CorretorCadastrado } from '../services/corretoresService';

interface CorretoresSectionProps {
  leads: ProcessedLead[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

interface Corretor {
  id: string;
  nome: string;
  iniciais: string;
  cor: string;
  status: 'online' | 'offline' | 'ausente';
  equipe: string;
  tipoConta: string;
  totalLeads: number;
  leadsAtivos: number;
  taxaConversao: number;
  nivelFaturamento: 'verde' | 'amarelo' | 'vermelho';
}

const CORES_AVATAR = [
  'bg-purple-500',
  'bg-blue-500',
  'bg-green-500',
  'bg-yellow-500',
  'bg-red-500',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-orange-500',
  'bg-cyan-500',
];

export const CorretoresSection = ({ leads }: CorretoresSectionProps) => {
  const { user, isGestao, isAdmin } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [equipeFilter, setEquipeFilter] = useState<string>('todas');
  const [tipoContaFilter, setTipoContaFilter] = useState<string>('todos');
  const [sortBy, setSortBy] = useState<string>('nome');
  const [nivelFaturamentoFilter, setNivelFaturamentoFilter] = useState<string>('todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [corretorToEdit, setCorretorToEdit] = useState<CorretorCadastrado | null>(null);
  const [isLoadingEdit, setIsLoadingEdit] = useState<string | null>(null);
  const [corretoresBanco, setCorretoresBanco] = useState<CorretorCadastrado[]>([]);

  // Verificar se o usuário pode criar corretores
  const userRole = user?.role || '';
  const podeAdicionar = isGestao || isAdmin || podeCriarCorretor(userRole);

  const carregarCorretoresBanco = useCallback(async () => {
    const lista = await listarCorretores();
    setCorretoresBanco(lista);
  }, []);

  useEffect(() => {
    carregarCorretoresBanco();
  }, [carregarCorretoresBanco]);

  const handleCorretorCriado = () => {
    setCorretorToEdit(null);
    carregarCorretoresBanco();
  };

  const handleEditarCorretor = useCallback(
    async (nomeCorretor: string) => {
      setIsLoadingEdit(nomeCorretor);
      try {
        const normalizar = (s: string) =>
          s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        const target = normalizar(nomeCorretor);
        const lista = corretoresBanco.length > 0 ? corretoresBanco : await listarCorretores();
        const match = lista.find((c) => normalizar(c.nm_corretor || '') === target);
        if (!match) {
          alert(`Corretor "${nomeCorretor}" não encontrado no cadastro. Crie-o primeiro para poder editar.`);
          return;
        }
        setCorretorToEdit(match);
        setIsModalOpen(true);
      } finally {
        setIsLoadingEdit(null);
      }
    },
    [corretoresBanco]
  );

  // Extrair corretores únicos dos leads
  const corretores = useMemo(() => {
    const corretoresMap = new Map<string, Corretor>();
    
    leads.forEach((lead) => {
      const nomeCorretor = lead.corretor_responsavel || 'Não Atribuído';
      
      if (!corretoresMap.has(nomeCorretor)) {
        const iniciais = nomeCorretor
          .split(' ')
          .map(n => n[0])
          .join('')
          .toUpperCase()
          .substring(0, 2);
        
        const cor = CORES_AVATAR[corretoresMap.size % CORES_AVATAR.length];
        
        corretoresMap.set(nomeCorretor, {
          id: nomeCorretor.toLowerCase().replace(/\s+/g, '-'),
          nome: nomeCorretor,
          iniciais,
          cor,
          status: Math.random() > 0.5 ? 'online' : 'offline',
          equipe: 'Vendas',
          tipoConta: 'Corretor',
          totalLeads: 0,
          leadsAtivos: 0,
          taxaConversao: 0,
          nivelFaturamento: 'verde', // Será calculado depois
        });
      }
      
      const corretor = corretoresMap.get(nomeCorretor)!;
      corretor.totalLeads++;
      
      if (lead.Arquivamento !== 'Sim') {
        corretor.leadsAtivos++;
      }
    });

    // Calcular taxa de conversão e nível de faturamento
    corretoresMap.forEach((corretor) => {
      if (corretor.totalLeads > 0) {
        corretor.taxaConversao = (corretor.leadsAtivos / corretor.totalLeads) * 100;
      }
      
      // Calcular nível de faturamento baseado na taxa de conversão e leads ativos
      if (corretor.taxaConversao >= 70 && corretor.leadsAtivos >= 10) {
        corretor.nivelFaturamento = 'verde';
      } else if (corretor.taxaConversao >= 40 || corretor.leadsAtivos >= 5) {
        corretor.nivelFaturamento = 'amarelo';
      } else {
        corretor.nivelFaturamento = 'vermelho';
      }
    });

    return Array.from(corretoresMap.values());
  }, [leads]);

  // Filtrar e ordenar corretores
  const corretoresFiltrados = useMemo(() => {
    let filtered = corretores;

    // Filtro de pesquisa
    if (searchTerm) {
      filtered = filtered.filter(corretor =>
        corretor.nome.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filtro de status
    if (statusFilter !== 'todos') {
      filtered = filtered.filter(corretor => corretor.status === statusFilter);
    }

    // Filtro de equipe
    if (equipeFilter !== 'todas') {
      filtered = filtered.filter(corretor => corretor.equipe === equipeFilter);
    }

    // Filtro de tipo de conta
    if (tipoContaFilter !== 'todos') {
      filtered = filtered.filter(corretor => corretor.tipoConta === tipoContaFilter);
    }

    // Filtro de nível de faturamento
    if (nivelFaturamentoFilter !== 'todos') {
      filtered = filtered.filter(corretor => corretor.nivelFaturamento === nivelFaturamentoFilter);
    }

    // Ordenação
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'nome':
          return a.nome.localeCompare(b.nome);
        case 'leads':
          return b.totalLeads - a.totalLeads;
        case 'conversao':
          return b.taxaConversao - a.taxaConversao;
        default:
          return 0;
      }
    });

    return filtered;
  }, [corretores, searchTerm, statusFilter, equipeFilter, tipoContaFilter, nivelFaturamentoFilter, sortBy]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 w-full">
      <div className="w-full px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">Todas as pessoas</h1>
            
            {/* Botão Criar Corretor - Visível para admin/gestão/gerente */}
            <Button
              onClick={() => setIsModalOpen(true)}
              className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 flex items-center gap-2"
            >
              <UserPlus className="h-4 w-4" />
              Criar Corretor
            </Button>
          </div>

          {/* Barra de Pesquisa */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-slate-500" />
            <Input
              type="text"
              placeholder="Pesquisar"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 h-10"
            />
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap gap-2">
            {/* Status */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos Status</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
                <SelectItem value="ausente">Ausente</SelectItem>
              </SelectContent>
            </Select>

            {/* Equipe */}
            <Select value={equipeFilter} onValueChange={setEquipeFilter}>
              <SelectTrigger className="w-[140px] bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 h-9">
                <SelectValue placeholder="Equipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas Equipes</SelectItem>
                <SelectItem value="Vendas">Vendas</SelectItem>
                <SelectItem value="Locação">Locação</SelectItem>
                <SelectItem value="Gestão">Gestão</SelectItem>
              </SelectContent>
            </Select>

            {/* Tipo de conta */}
            <Select value={tipoContaFilter} onValueChange={setTipoContaFilter}>
              <SelectTrigger className="w-[160px] bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 h-9">
                <SelectValue placeholder="Tipo de conta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Tipos</SelectItem>
                <SelectItem value="Corretor">Corretor</SelectItem>
                <SelectItem value="Gerente">Gerente</SelectItem>
                <SelectItem value="Admin">Admin</SelectItem>
              </SelectContent>
            </Select>

            {/* Nível de Faturamento */}
            <Select value={nivelFaturamentoFilter} onValueChange={setNivelFaturamentoFilter}>
              <SelectTrigger className="w-[180px] bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 h-9">
                <SelectValue placeholder="Nível Faturamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Níveis</SelectItem>
                <SelectItem value="verde">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#22c55e' }} />
                    <span>Verde - Alto</span>
                  </div>
                </SelectItem>
                <SelectItem value="amarelo">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#eab308' }} />
                    <span>Amarelo - Médio</span>
                  </div>
                </SelectItem>
                <SelectItem value="vermelho">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#ef4444' }} />
                    <span>Vermelho - Baixo</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            {/* Gerente - Placeholder */}
            <Button 
              variant="outline" 
              className="h-9 bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800/60"
            >
              Gerente
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>

            {/* Classificar */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[140px] bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 h-9">
                <SelectValue placeholder="Classificar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nome">Nome</SelectItem>
                <SelectItem value="leads">Total de Leads</SelectItem>
                <SelectItem value="conversao">Taxa de Conversão</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Grid de Cards de Corretores */}
        {corretoresFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-16 w-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-slate-100 mb-2">
              Nenhum corretor encontrado
            </h3>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Tente ajustar os filtros ou termo de pesquisa
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {corretoresFiltrados.map((corretor) => (
              <div
                key={corretor.id}
                className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg hover:shadow-md transition-all cursor-pointer overflow-hidden group"
              >
                {/* Avatar Grande */}
                <div className={`w-full h-40 ${corretor.cor} flex items-center justify-center relative`}>
                  <span className="text-5xl font-bold text-white">
                    {corretor.iniciais}
                  </span>
                  
                  {/* Status Badge - Canto superior direito */}
                  <div className="absolute top-3 right-3">
                    <div className={`w-3 h-3 rounded-full border-2 border-white ${
                      corretor.status === 'online' ? 'bg-green-500' :
                      corretor.status === 'ausente' ? 'bg-yellow-500' :
                      'bg-gray-400'
                    }`} />
                  </div>
                </div>

                {/* Informações */}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900 dark:text-slate-100 text-base truncate">
                      {corretor.nome}
                    </h3>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      corretor.status === 'online' ? 'bg-green-500' :
                      corretor.status === 'ausente' ? 'bg-yellow-500' :
                      'bg-gray-400'
                    }`} />
                  </div>

                  {/* Métricas */}
                  <div className="space-y-1 mt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 dark:text-slate-400">Total de leads</span>
                      <span className="font-semibold text-gray-900 dark:text-slate-100">{corretor.totalLeads}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 dark:text-slate-400">Leads ativos</span>
                      <span className="font-semibold text-gray-900 dark:text-slate-100">{corretor.leadsAtivos}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 dark:text-slate-400">Taxa conversão</span>
                      <span className="font-semibold text-green-600 dark:text-green-300">
                        {corretor.taxaConversao.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 dark:text-slate-400">Nível faturamento</span>
                      <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        corretor.nivelFaturamento === 'verde' 
                          ? 'bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-300' 
                          : corretor.nivelFaturamento === 'amarelo'
                          ? 'bg-yellow-100 dark:bg-yellow-950/60 text-yellow-700 dark:text-yellow-300'
                          : 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                      }`}>
                        <div className={`w-2 h-2 rounded-full ${
                          corretor.nivelFaturamento === 'verde' 
                            ? 'bg-green-500' 
                            : corretor.nivelFaturamento === 'amarelo'
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        }`} />
                        {corretor.nivelFaturamento === 'verde' ? 'Alto' : 
                         corretor.nivelFaturamento === 'amarelo' ? 'Médio' : 'Baixo'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Hover Effect - Editar */}
                <div className="px-4 pb-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-8 flex items-center gap-1.5"
                    onClick={() => handleEditarCorretor(corretor.nome)}
                    disabled={isLoadingEdit === corretor.nome}
                  >
                    {isLoadingEdit === corretor.nome ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Pencil className="h-3.5 w-3.5" />
                    )}
                    Editar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Contador */}
        <div className="mt-6 text-sm text-gray-500 dark:text-slate-400 text-center">
          Exibindo {corretoresFiltrados.length} de {corretores.length} pessoas
        </div>
      </div>

      {/* Modal de Criar/Editar Corretor */}
      <CriarCorretorModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setCorretorToEdit(null);
        }}
        onSuccess={handleCorretorCriado}
        createdById={user?.id}
        corretorToEdit={corretorToEdit}
      />
    </div>
  );
};


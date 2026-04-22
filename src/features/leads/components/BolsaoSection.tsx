/**
 * 🎯 BOLSÃO DE LEADS - DESIGN HARMÔNICO (TEMA CLARO E ESCURO)
 * 
 * Área onde ficam leads que não foram atendidos no prazo.
 * Qualquer corretor pode assumir um lead do Bolsão.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Home, 
  Phone,
  Building2,
  TrendingUp,
  Clock,
  User,
  AlertCircle,
  CheckCircle,
  Calendar,
  Tag,
  Loader2,
  Zap,
  Star,
  ArrowRight,
  MessageCircle,
  X,
  RotateCcw,
  Users,
  Eye,
  EyeOff
} from 'lucide-react';
import { 
  fetchBolsaoLeads,
  fetchTodosLeadsBolsao,
  fetchLeadsDoCorretor,
  fetchListaCorretores,
  assumirLeadDoBolsao, 
  BolsaoLead,
  verificarTabelaBolsao,
  verificarLeadsExpirados,
  confirmarAtendimentoLead,
  calcularMetricasCorretores,
  CorretorMetrica
} from '../services/bolsaoService';
import { useToast } from '@/hooks/use-toast';
import { fetchLeadLimitConfig, checkBrokerEligibility, BrokerLeadLimitOverride } from '@/features/corretores/services/tenantLeadLimitService';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
// Novos componentes de mini cards
import { LeadMiniCard } from '@/components/LeadMiniCard';
import { LeadDetailsModal } from './LeadDetailsModal';
// Importar serviço de equipes
import { fetchSupabaseTeamsData, SupabaseTeam } from '@/services/supabaseService';
// Importar serviço de tokens do Bolsão
import { saveBolsaoToken, getActiveBolsaoToken, deactivateBolsaoToken } from '../services/bolsaoTokenService';
// Importar serviço de gestão da Roleta
import { 
  fetchRoletaParticipantes, 
  fetchCorretoresDisponiveis, 
  atualizarParticipantesRoleta,
  RoletaParticipante,
  CorretorDisponivel
 } from '../services/roletaService';
import { Checkbox } from '@/components/ui/checkbox';
import { Settings2 } from 'lucide-react';
import { DEFAULT_BOLSAO_CONFIG, TenantBolsaoConfig, fetchTenantBolsaoConfig, saveTenantBolsaoConfig } from '../services/tenantBolsaoConfigService';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface BolsaoSectionProps {}

type BolsaoTab = 'geral' | 'disponiveis';

export const BolsaoSection = (props: BolsaoSectionProps) => {
  const { user, isCorretor, isAdmin, tenantId } = useAuth();
  const { toast } = useToast();

  const bolsaoBlockedInfo = useMemo(() => {
    const perms = user?.permissions && typeof user.permissions === 'object' ? (user.permissions as any) : undefined;
    const enabled = Boolean(perms?.bolsao_blocked_enabled);
    const until = typeof perms?.bolsao_blocked_until === 'string' ? perms.bolsao_blocked_until : null;
    const expired = until ? new Date(until).getTime() < Date.now() : false;
    const isBlocked = enabled && !expired;
    return { isBlocked, until };
  }, [user?.permissions]);

  if (isCorretor && bolsaoBlockedInfo.isBlocked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-xl">
          <Card className="border border-red-200 dark:border-red-900/40 bg-white dark:bg-gray-900 dark:border-red-900 dark:bg-slate-900">
            <CardContent className="p-8">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0 dark:bg-red-950/60">
                  <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 dark:text-slate-100">
                    Você está bloqueado da área bolsão. resolva sua pendencia imediatamente!
                  </h2>
                  {bolsaoBlockedInfo.until && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 dark:text-slate-400">
                      Bloqueio ativo até: {new Date(bolsaoBlockedInfo.until).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }
  
  const [activeTab, setActiveTab] = useState<BolsaoTab>('disponiveis');
  const [leads, setLeads] = useState<BolsaoLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [assumindoLead, setAssumindoLead] = useState<number | null>(null);
  const [confirmandoLead, setConfirmandoLead] = useState<number | null>(null);
  const [tabelaExiste, setTabelaExiste] = useState(true);
  
  // 🆕 Estados para modal de detalhes
  const [leadSelecionado, setLeadSelecionado] = useState<BolsaoLead | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  
  // 🆕 Estados para métricas de corretores
  const [metricasCorretores, setMetricasCorretores] = useState<CorretorMetrica[]>([]);
  const [loadingMetricas, setLoadingMetricas] = useState(false);
  const [corretorSelecionado, setCorretorSelecionado] = useState<string | null>(null);
  const [filtroEquipe, setFiltroEquipe] = useState<string>('todos'); // 'todos' | nome da equipe
  const [filtroCorretor, setFiltroCorretor] = useState<string>('todos'); // 'todos' | nome do corretor
  const [filtroPeriodo, setFiltroPeriodo] = useState<string>('todos'); // 'todos' | '7dias' | '30dias' | '90dias' | 'hoje' | 'personalizado'
  const [dataInicio, setDataInicio] = useState<string>('');
  const [dataFim, setDataFim] = useState<string>('');
  
  // 🆕 Estados para equipes do Supabase
  const [equipesSupabase, setEquipesSupabase] = useState<SupabaseTeam[]>([]);
  const [loadingEquipes, setLoadingEquipes] = useState(false);
  
  // Estados dos filtros
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [filtroAtendido, setFiltroAtendido] = useState<string>('todos');
  const [filtroUrgencia, setFiltroUrgencia] = useState<string>('todos');
  
  // 🆕 Estados para modal de conexão Bolsão
  const [modalConexaoAberto, setModalConexaoAberto] = useState(false);
  const [bolsaoEmail, setBolsaoEmail] = useState('');
  const [bolsaoSenha, setBolsaoSenha] = useState('');
  const [conectandoBolsao, setConectandoBolsao] = useState(false);
  const [bolsaoConectado, setBolsaoConectado] = useState(false);
  const [showBolsaoPassword, setShowBolsaoPassword] = useState(false);
  const [loadingBolsaoToken, setLoadingBolsaoToken] = useState(true);
  
  // 🆕 Estados para webhook de polling e token (carregados do banco)
  const [bolsaoWebhookUrl, setBolsaoWebhookUrl] = useState<string>('');
  const [bolsaoToken, setBolsaoToken] = useState<string>('');
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 🎰 Estados para modal de gestão da Roleta
  const [modalRoletaAberto, setModalRoletaAberto] = useState(false);
  const [corretoresDisponiveis, setCorretoresDisponiveis] = useState<CorretorDisponivel[]>([]);
  const [corretoresSelecionados, setCorretoresSelecionados] = useState<Set<string>>(new Set());
  const [loadingRoleta, setLoadingRoleta] = useState(false);
  const [salvandoRoleta, setSalvandoRoleta] = useState(false);
  const [roletaStats, setRoletaStats] = useState({ participantes: 0, total: 0 });
  const [modalTempoBolsaoAberto, setModalTempoBolsaoAberto] = useState(false);

  // Configurações do Bolsão
  const [config, setConfig] = useState<TenantBolsaoConfig>(DEFAULT_BOLSAO_CONFIG);

  const getLeadExpirationMinutes = useCallback((lead?: Partial<BolsaoLead> | null) => {
    return lead?.is_exclusive ? config.tempoExpiracaoExclusivo : config.tempoExpiracaoNaoExclusivo;
  }, [config.tempoExpiracaoExclusivo, config.tempoExpiracaoNaoExclusivo]);

  const canManageBolsaoConfig = isAdmin || user?.systemRole === 'team_leader';

  // Proteção: Redirecionar não-admins que tentarem acessar "Todos os Leads"
  useEffect(() => {
    if (!isAdmin && activeTab === 'geral') {
      setActiveTab('disponiveis');
      toast({
        title: "Acesso Restrito",
        description: "Apenas administradores podem acessar 'Todos os Leads'.",
        variant: "destructive"
      });
    }
  }, [isAdmin, activeTab]);

  // Carregar leads do Bolsão
  const carregarLeads = async () => {
    try {
      setLoading(true);
      const existe = await verificarTabelaBolsao();
      setTabelaExiste(existe);
      
      if (!existe) {
        console.warn('⚠️ Tabela bolsao não existe no Supabase');
        setLeads([]);
        return;
      }
      
      // Proteção: Apenas admins podem ver todos os leads
      const data = (activeTab === 'geral' && isAdmin)
        ? await fetchTodosLeadsBolsao()
        : await fetchBolsaoLeads();
      
      setLeads(data);
      
      } catch (error) {
      console.error('Erro ao carregar leads do Bolsão:', error);
      toast({
        title: "Erro ao carregar leads",
        description: "Não foi possível carregar os leads do Bolsão.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // 🆕 Carregar equipes do Supabase
  const carregarEquipes = async () => {
    if (!isAdmin) return;
    
    try {
      setLoadingEquipes(true);
      const equipes = await fetchSupabaseTeamsData();
      setEquipesSupabase(equipes.filter(e => e.ativa !== false));
    } catch (error) {
      console.error('Erro ao carregar equipes:', error);
    } finally {
      setLoadingEquipes(false);
    }
  };

  // 🆕 Calcular data de início baseado no filtro de período
  const getDataInicioPeriodo = (periodo: string): Date | undefined => {
    if (periodo === 'todos') return undefined;
    
    if (periodo === 'personalizado') {
      if (dataInicio) {
        const data = new Date(dataInicio);
        data.setHours(0, 0, 0, 0);
        return data;
      }
      return undefined;
    }
    
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0); // Início do dia
    
    switch (periodo) {
      case 'hoje':
        return hoje;
      case '7dias':
        const seteDias = new Date(hoje);
        seteDias.setDate(hoje.getDate() - 7);
        return seteDias;
      case '30dias':
        const trintaDias = new Date(hoje);
        trintaDias.setDate(hoje.getDate() - 30);
        return trintaDias;
      case '90dias':
        const noventaDias = new Date(hoje);
        noventaDias.setDate(hoje.getDate() - 90);
        return noventaDias;
      default:
        return undefined;
    }
  };
  
  // 🆕 Calcular data final baseado no filtro personalizado
  const getDataFimPeriodo = (): Date | undefined => {
    if (filtroPeriodo === 'personalizado' && dataFim) {
      const data = new Date(dataFim);
      data.setHours(23, 59, 59, 999); // Fim do dia
      return data;
    }
    return undefined;
  };

  // 🆕 Carregar métricas de corretores (apenas para admin)
  const carregarMetricasCorretores = async () => {
    if (!isAdmin) return; // Apenas admin pode ver métricas
    
    try {
      setLoadingMetricas(true);
      const dataInicio = getDataInicioPeriodo(filtroPeriodo);
      const dataFim = getDataFimPeriodo();
      const metricas = await calcularMetricasCorretores(dataInicio, dataFim);
      setMetricasCorretores(metricas);
    } catch (error) {
      console.error('Erro ao carregar métricas de corretores:', error);
    } finally {
      setLoadingMetricas(false);
    }
  };

  // Carregar equipes ao montar o componente
  useEffect(() => {
    if (isAdmin) {
      carregarEquipes();
    }
  }, [isAdmin]);

  // Carregar token do Bolsão do banco de dados ao iniciar
  useEffect(() => {
    const carregarTokenDoBanco = async () => {
      if (!tenantId) {
        setLoadingBolsaoToken(false);
        return;
      }
      
      try {
        const tokenData = await getActiveBolsaoToken(tenantId);
        
        if (tokenData) {
          setBolsaoConectado(true);
          setBolsaoWebhookUrl(tokenData.webhook_url);
          setBolsaoToken(tokenData.token);
          setBolsaoEmail(tokenData.email);
        } else {
          setBolsaoConectado(false);
        }
      } catch (error) {
        console.error('❌ Erro ao carregar token do banco:', error);
      } finally {
        setLoadingBolsaoToken(false);
      }
    };
    
    carregarTokenDoBanco();
  }, [tenantId]);

  // Carregar corretores disponíveis para a roleta
  const carregarCorretoresRoleta = async () => {
    if (!tenantId || tenantId === 'owner') return;
    
    try {
      setLoadingRoleta(true);
      const corretores = await fetchCorretoresDisponiveis(tenantId);
      setCorretoresDisponiveis(corretores);
      
      // Marcar os que já estão na roleta como selecionados
      const selecionados = new Set<string>();
      corretores.forEach(c => {
        if (c.is_in_roleta) selecionados.add(c.id);
      });
      setCorretoresSelecionados(selecionados);
      
      // Atualizar estatísticas
      const participantes = corretores.filter(c => c.is_in_roleta).length;
      setRoletaStats({ participantes, total: corretores.length });
      
    } catch (error) {
      console.error(' Erro ao carregar corretores para roleta:', error);
    } finally {
      setLoadingRoleta(false);
    }
  };

  // Salvar configuração da roleta
  const salvarRoleta = async () => {
    if (!tenantId || tenantId === 'owner') return;
    
    try {
      setSalvandoRoleta(true);
      
      // Filtrar corretores selecionados
      const selecionados = corretoresDisponiveis.filter(c => corretoresSelecionados.has(c.id));
      
      const result = await atualizarParticipantesRoleta(tenantId, selecionados);
      
      if (result.success) {
        toast({
          title: " Roleta atualizada!",
          description: `${selecionados.length} corretor(es) participando da roleta.`,
        });
        
        // Atualizar estatísticas
        setRoletaStats({ participantes: selecionados.length, total: corretoresDisponiveis.length });
        setModalRoletaAberto(false);
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error(' Erro ao salvar roleta:', error);
      toast({
        title: "Erro ao salvar roleta",
        description: error.message || "Não foi possível atualizar a roleta.",
        variant: "destructive"
      });
    } finally {
      setSalvandoRoleta(false);
    }
  };

  // Toggle seleção de corretor na roleta
  const toggleCorretorRoleta = (corretorId: string) => {
    setCorretoresSelecionados(prev => {
      const novo = new Set(prev);
      if (novo.has(corretorId)) {
        novo.delete(corretorId);
      } else {
        novo.add(corretorId);
      }
      return novo;
    });
  };

  // Selecionar/Deselecionar todos
  const toggleTodosRoleta = () => {
    if (corretoresSelecionados.size === corretoresDisponiveis.length) {
      setCorretoresSelecionados(new Set());
    } else {
      setCorretoresSelecionados(new Set(corretoresDisponiveis.map(c => c.id)));
    }
  };

  // Carregar estatísticas da roleta ao montar
  useEffect(() => {
    if (tenantId && tenantId !== 'owner' && (isAdmin || user?.systemRole === 'team_leader')) {
      carregarCorretoresRoleta();
    }
  }, [tenantId, isAdmin]);

  useEffect(() => {
    const loadConfig = async () => {
      if (!tenantId) return;
      const loadedConfig = await fetchTenantBolsaoConfig(tenantId);
      setConfig(loadedConfig);
    };

    loadConfig();
  }, [tenantId]);

  // Verificar leads expirados (usa configuração e horário de funcionamento)
  useEffect(() => {
    const verificarExpiracao = async () => {
      // Só verificar se estiver no horário de funcionamento
      const agora = new Date();
      const estaNoExpediente = estaNoHorarioFuncionamento(agora);
      
      if (!estaNoExpediente) {
        return;
      }
      
      
      const leadsMovidos = await verificarLeadsExpirados();
      
      if (leadsMovidos > 0 && config.notificarExpiracao) {
        toast({
          title: "⏰ Leads Expirados",
          description: `${leadsMovidos} lead(s) foram movidos para o Bolsão conforme a regra de tempo configurada para imóveis exclusivos e não exclusivos.`,
          variant: "default"
        });
        
        // Recarregar dados após mover leads
        carregarLeads();
      }
    };
    
    // Executar imediatamente
    verificarExpiracao();
    
    // Verificar baseado na configuração
    const intervaloMs = config.intervaloVerificacao * 1000;
    const interval = setInterval(verificarExpiracao, intervaloMs);
    
    return () => clearInterval(interval);
  }, [config.intervaloVerificacao, config.notificarExpiracao, config.horarioFuncionamento]);

  // Carregar dados do Bolsão (usa configuração de auto-refresh)
  useEffect(() => {
    if (!config.autoRefresh) {
      // Se auto-refresh está desabilitado, carregar apenas uma vez
      carregarLeads();
      if (isAdmin) carregarMetricasCorretores(); // Carregar métricas também
      return;
    }

    // Auto-refresh habilitado
    carregarLeads();
    if (isAdmin) carregarMetricasCorretores(); // Carregar métricas também
    
    const intervaloMs = config.intervaloAutoRefresh * 1000;
    const interval = setInterval(() => {
      carregarLeads();
      if (isAdmin) carregarMetricasCorretores();
    }, intervaloMs);
    return () => clearInterval(interval);
  }, [activeTab, config.autoRefresh, config.intervaloAutoRefresh, isAdmin, filtroPeriodo, dataInicio, dataFim]);

  // 🆕 Função para buscar leads do webhook (polling)
  const fetchLeadsFromWebhook = useCallback(async (webhookUrl: string, token: string) => {
    try {
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token })
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // TODO: Salvar leads no Supabase/Bolsão
        if (data && Array.isArray(data.leads)) {
        }
        
        // Recarregar leads da interface
        await carregarLeads();
      } else {
        console.warn('⚠️ Erro ao buscar leads:', response.status);
      }
    } catch (error) {
      console.error('❌ Erro no polling de leads:', error);
    }
  }, []);

  // 🆕 Iniciar polling de leads (30 em 30 segundos)
  const startPolling = useCallback((webhookUrl: string, token: string) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    
    
    fetchLeadsFromWebhook(webhookUrl, token);
    
    pollingIntervalRef.current = setInterval(() => {
      fetchLeadsFromWebhook(webhookUrl, token);
    }, 30000);
  }, [fetchLeadsFromWebhook]);

  // 🆕 Parar polling
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // 🆕 Iniciar polling se já estiver conectado ao montar
  useEffect(() => {
    if (bolsaoConectado && bolsaoWebhookUrl) {
      startPolling(bolsaoWebhookUrl, bolsaoToken);
    }
    return () => stopPolling();
  }, [bolsaoConectado, bolsaoWebhookUrl, startPolling, stopPolling]);

  // 🆕 Função para conectar ao Bolsão via webhook
  const handleConectarBolsao = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!bolsaoEmail || !bolsaoSenha) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha o email e a senha.",
        variant: "destructive"
      });
      return;
    }
    
    setConectandoBolsao(true);
    
    try {
      
      const response = await fetch('https://puppeter.octoia.org/webhook/3adf1026-8b9f-4f70-b469-5ade0a10a354', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: bolsaoEmail,
          senha: bolsaoSenha
        })
      });
      
      if (response.ok) {
        const rawData = await response.json();
        
        // Se a resposta for um array, pegar o primeiro elemento
        const data = Array.isArray(rawData) ? rawData[0] : rawData;
        
        const webhook = data?.webhook || data?.webhookUrl || data?.url;
        const token = data?.token || ''; // Token é opcional agora
        
        
        if (!webhook) {
          throw new Error('Webhook não retornado');
        }
        
        // Salvar no banco de dados (por tenant)
        if (tenantId) {
          const saveResult = await saveBolsaoToken(tenantId, bolsaoEmail, token, webhook);
          if (!saveResult.success) {
            console.error('❌ Erro ao salvar no banco:', saveResult.error);
          } else {
          }
        }
        
        setBolsaoConectado(true);
        setBolsaoWebhookUrl(webhook);
        setBolsaoToken(token);
        setModalConexaoAberto(false);
        
        toast({
          title: "✅ Bolsão Conectado!",
          description: "Buscando leads automaticamente a cada 30 segundos.",
          className: "bg-green-500/10 border-green-500/50"
        });
        
        startPolling(webhook, token);
        
      } else {
        console.error('❌ Erro ao conectar:', response.status);
        toast({
          title: "Erro na conexão",
          description: "Não foi possível conectar ao Bolsão. Verifique as credenciais.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('❌ Erro na conexão:', error);
      toast({
        title: "Erro na conexão",
        description: error instanceof Error ? error.message : "Ocorreu um erro ao tentar conectar.",
        variant: "destructive"
      });
    } finally {
      setConectandoBolsao(false);
    }
  };

  // 🆕 Função para desconectar do Bolsão
  const handleDesconectarBolsao = async () => {
    stopPolling();
    
    // Desativar token no banco de dados
    if (tenantId) {
      const result = await deactivateBolsaoToken(tenantId);
      if (!result.success) {
        console.error('❌ Erro ao desativar token no banco:', result.error);
      } else {
      }
    }
    
    setBolsaoConectado(false);
    setBolsaoEmail('');
    setBolsaoSenha('');
    setBolsaoWebhookUrl('');
    setBolsaoToken('');
    
    toast({
      title: "Bolsão Desconectado",
      description: "O polling de leads foi parado.",
    });
  };

  // Função para assumir um lead
  const handleAssumirLead = async (lead: BolsaoLead) => {
    if (!isCorretor || !user?.name) {
      toast({
        title: "Acesso negado",
        description: "Apenas corretores podem assumir leads.",
        variant: "destructive"
      });
      return;
    }

    try {
      setAssumindoLead(lead.id);

      // Verificar limite de leads do corretor antes de permitir assumir
      if (tenantId && user?.id) {
        const limitConfig = await fetchLeadLimitConfig(tenantId);
        if (limitConfig && limitConfig.lead_limit_enabled) {
          const brokerOverride = (user as any)?.permissions?.lead_limit as BrokerLeadLimitOverride | undefined;
          const eligibility = await checkBrokerEligibility(tenantId, user.id, limitConfig, brokerOverride);
          if (!eligibility.eligible) {
            toast({
              title: "Limite de leads atingido",
              description: eligibility.block_reason || 'Você atingiu o limite máximo de leads na carteira.',
              variant: "destructive"
            });
            setAssumindoLead(null);
            return;
          }
        }
      }

      const corretorTelefone = user?.telefone?.toString() || '';
      
      const result = await assumirLeadDoBolsao(
        lead.id,
        user?.name || 'Corretor',
        corretorTelefone
      );
      
      if (result.success) {
        toast({
          title: " Lead assumido!",
          description: `Você assumiu o lead. Ele agora é exclusivo seu.`,
          className: "bg-green-500/10 border-green-500/50 text-green-400"
        });
        await carregarLeads();
      } else {
        throw new Error(result.message);
      }
      
    } catch (error) {
      console.error('Erro ao assumir lead:', error);
      toast({
        title: "Erro ao assumir lead",
        description: "Não foi possível assumir este lead. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setAssumindoLead(null);
    }
  };

  // Função para confirmar atendimento do lead
  const handleConfirmarAtendimento = async (lead: BolsaoLead) => {
    if (!isCorretor) {
      toast({
        title: "Acesso negado",
        description: "Apenas corretores podem confirmar atendimento.",
        variant: "destructive"
      });
      return;
    }

    try {
      setConfirmandoLead(lead.id);
      
      const result = await confirmarAtendimentoLead(lead.id);
      
      if (result.success) {
        toast({
          title: "✅ Atendimento Confirmado!",
          description: "Lead marcado como atendido. Ele não irá mais para o Bolsão.",
          className: "bg-green-500/10 border-green-500/50"
        });
        
        // Recarregar leads
        await carregarLeads();
      } else {
        throw new Error(result.message);
      }
      
    } catch (error) {
      console.error('Erro ao confirmar atendimento:', error);
      toast({
        title: "Erro ao confirmar atendimento",
        description: "Não foi possível confirmar o atendimento. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setConfirmandoLead(null);
    }
  };

  // Calcular tempo no bolsão
  const calcularTempoNoBolsao = (dataEntrada: string) => {
    const entrada = new Date(dataEntrada);
    const agora = new Date();
    const diffMs = agora.getTime() - entrada.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 60) {
      return { texto: `${diffMins}min`, urgencia: 'baixa' };
    } else if (diffMins < 1440) {
      const hours = Math.floor(diffMins / 60);
      return { texto: `${hours}h`, urgencia: hours < 3 ? 'media' : 'alta' };
    } else {
      const days = Math.floor(diffMins / 1440);
      return { texto: `${days}d`, urgencia: 'critica' };
    }
  };

  // Verificar se está dentro do horário de funcionamento
  const estaNoHorarioFuncionamento = (data: Date): boolean => {
    const diasSemana = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'] as const;
    const diaSemana = diasSemana[data.getDay()];
    const horarioDia = config.horarioFuncionamento[diaSemana];
    
    // Se o dia não está ativo, não está no horário
    if (!horarioDia.ativo) {
      return false;
    }
    
    // Verificar se está dentro do horário
    const horaAtual = data.getHours() * 60 + data.getMinutes(); // Minutos desde meia-noite
    const [horaInicio, minInicio] = horarioDia.inicio.split(':').map(Number);
    const [horaFim, minFim] = horarioDia.termino.split(':').map(Number);
    
    const minutosInicio = horaInicio * 60 + minInicio;
    const minutosFim = horaFim * 60 + minFim;
    
    return horaAtual >= minutosInicio && horaAtual <= minutosFim;
  };

  // Calcular tempo em horário de funcionamento
  const calcularTempoEmExpediente = (dataInicio: Date, dataFim: Date): number => {
    let minutosContados = 0;
    const dataAtual = new Date(dataInicio);
    
    // Percorrer cada minuto entre dataInicio e dataFim
    while (dataAtual < dataFim) {
      if (estaNoHorarioFuncionamento(dataAtual)) {
        minutosContados++;
      }
      dataAtual.setMinutes(dataAtual.getMinutes() + 1);
    }
    
    return minutosContados;
  };

  // Calcular tempo restante até expirar (considera horário de funcionamento)
  const calcularTempoRestante = (lead: BolsaoLead) => {
    // Se já foi atendido, não precisa calcular
    if (lead.atendido) {
      return { texto: '-', expirado: false, urgencia: 'ok' };
    }

    const entrada = new Date(lead.created_at);
    const agora = new Date();
    const tempoExpiracao = getLeadExpirationMinutes(lead);
    
    // Verificar se AGORA está no horário de funcionamento
    const agoraNoExpediente = estaNoHorarioFuncionamento(agora);
    
    // Se não está no expediente agora, mostrar "Aguardando expediente"
    if (!agoraNoExpediente) {
      return { texto: 'Aguardando expediente', expirado: false, urgencia: 'media' };
    }
    
    // Calcular quantos minutos já passaram DENTRO do horário de funcionamento
    const minutosDecorridos = calcularTempoEmExpediente(entrada, agora);
    
    // Calcular quantos minutos faltam
    const minutosFaltam = tempoExpiracao - minutosDecorridos;
    
    // Já expirou
    if (minutosFaltam <= 0) {
      return { texto: 'Expirado', expirado: true, urgencia: 'critica' };
    }
    
    // Calcular urgência baseado em porcentagem do tempo total
    const porcentagemRestante = (minutosFaltam / tempoExpiracao) * 100;
    
    // Menos de 25% do tempo
    if (porcentagemRestante < 25) {
      return { texto: `${minutosFaltam}min restantes`, expirado: false, urgencia: 'critica' };
    }
    
    // Menos de 50% do tempo
    if (porcentagemRestante < 50) {
      return { texto: `${minutosFaltam}min restantes`, expirado: false, urgencia: 'alta' };
    }
    
    // Mais de 50% do tempo
    return { texto: `${minutosFaltam}min restantes`, expirado: false, urgencia: 'media' };
  };

  // Salvar configurações no localStorage
  const salvarConfiguracoes = async (novasConfigs: TenantBolsaoConfig) => {
    try {
      setConfig(novasConfigs);
      if (tenantId) {
        await saveTenantBolsaoConfig(tenantId, novasConfigs);
      }
      toast({
        title: "✅ Configurações Salvas",
        description: "As configurações do Bolsão foram atualizadas com sucesso.",
        className: "bg-green-500/10 border-green-500/50"
      });
    } catch (error) {
      console.error('Erro ao salvar configurações do bolsão:', error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar as configurações do Bolsão.",
        variant: "destructive"
      });
    }
  };

  // Filtrar leads baseado nos filtros selecionados
  const filtrarLeads = (leadsParaFiltrar: BolsaoLead[]) => {
    let leadsFiltrados = [...leadsParaFiltrar];
    
    // Filtro por Status
    if (filtroStatus !== 'todos') {
      leadsFiltrados = leadsFiltrados.filter(lead => lead.status === filtroStatus);
    }
    
    // Filtro por Atendido
    if (filtroAtendido !== 'todos') {
      if (filtroAtendido === 'sim') {
        leadsFiltrados = leadsFiltrados.filter(lead => lead.atendido === true);
      } else if (filtroAtendido === 'nao') {
        leadsFiltrados = leadsFiltrados.filter(lead => lead.atendido === false || lead.atendido === null);
      }
    }
    
    // Filtro por Urgência (baseado no tempo restante)
    if (filtroUrgencia !== 'todos') {
      leadsFiltrados = leadsFiltrados.filter(lead => {
        const tempoRestante = calcularTempoRestante(lead);
        return tempoRestante.urgencia === filtroUrgencia;
      });
    }
    
    return leadsFiltrados;
  };

  // Formatar telefone
  const formatarTelefone = (telefone: string | null) => {
    if (!telefone) return null;
    const numeros = telefone.replace(/\D/g, '');
    
    if (telefone.includes('@')) {
      const numero = telefone.split('@')[0];
      return `(${numero.slice(2, 4)}) ${numero.slice(4, 9)}-${numero.slice(9)}`;
    }
    
    if (numeros.length >= 10) {
      const ddd = numeros.slice(-11, -9) || numeros.slice(0, 2);
      const parte1 = numeros.slice(-9, -4);
      const parte2 = numeros.slice(-4);
      return `(${ddd}) ${parte1}-${parte2}`;
    }
    
    return telefone;
  };

  // 🆕 Formatar tempo em formato legível
  const formatarTempo = (minutos: number): string => {
    if (minutos < 1) return '< 1min';
    if (minutos < 60) return `${minutos}min`;
    
    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;
    
    if (horas < 24) {
      return mins > 0 ? `${horas}h ${mins}min` : `${horas}h`;
    }
    
    const dias = Math.floor(horas / 24);
    const horasRestantes = horas % 24;
    return horasRestantes > 0 ? `${dias}d ${horasRestantes}h` : `${dias}d`;
  };

  // 🆕 Obter cor baseada no tempo de resposta
  const getCorTempo = (minutos: number): string => {
    if (minutos <= 5) return 'text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/30';
    if (minutos <= 15) return 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    if (minutos <= 30) return 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/30';
    if (minutos <= 60) return 'text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
    return 'text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/30';
  };

  // 🆕 Mapear corretor para equipe
  const getEquipeDoCorretor = useMemo(() => {
    const mapa = new Map<string, string>();
    
    equipesSupabase.forEach(equipe => {
      equipe.corretores.forEach(corretor => {
        mapa.set(corretor, equipe.nome_equipe);
      });
    });
    
    return mapa;
  }, [equipesSupabase]);

  // 🆕 Renderizar métricas harmônicas dos corretores
  const renderMetricasCorretores = () => {
    if (!isAdmin) return null; // Apenas admin vê métricas
    
    if (loadingMetricas) {
      return (
        <div className="mb-6">
          <Card className="border-border">
            <CardContent className="p-6">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                <p className="text-sm text-muted-foreground">Carregando métricas...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
    
    if (metricasCorretores.length === 0) {
      return null; // Não mostrar nada se não houver métricas
    }
    
    // Aplicar filtros
    let corretoresExibidos = metricasCorretores;
    
    // Filtro por equipe
    if (filtroEquipe !== 'todos') {
      corretoresExibidos = corretoresExibidos.filter(m => {
        const equipeCorretor = getEquipeDoCorretor.get(m.corretor);
        return equipeCorretor === filtroEquipe;
      });
    }
    
    // Filtro por corretor individual
    if (filtroCorretor !== 'todos') {
      corretoresExibidos = corretoresExibidos.filter(m => m.corretor === filtroCorretor);
    }
    
    // Calcular média geral ou individual
    const tempoMedioGeral = corretoresExibidos.length > 0
      ? Math.round(corretoresExibidos.reduce((acc, m) => acc + m.tempoMedioResposta, 0) / corretoresExibidos.length)
      : 0;
    
    const corretorExibido = filtroCorretor !== 'todos' 
      ? corretoresExibidos[0]?.corretor 
      : null;
    
    return (
      <div className="mb-6">
        <Card className="border-border">
          <CardContent className="p-8">
            {/* Header com Filtros à Direita */}
            <div className="flex items-start justify-between mb-8">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-base font-semibold text-foreground">
                  Tempo Médio de Resposta
                  {corretorExibido && <span className="text-muted-foreground ml-2">- {corretorExibido}</span>}
                </h3>
              </div>
              
              {/* Filtros no Canto Superior Direito */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Filtro por Período com Ícone */}
                <Select value={filtroPeriodo} onValueChange={setFiltroPeriodo}>
                  <SelectTrigger className={`${filtroPeriodo === 'personalizado' ? 'w-auto' : 'w-auto min-w-[120px]'} h-9 text-xs`}>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      {filtroPeriodo === 'personalizado' ? (
                        dataInicio && dataFim ? (
                          <span>{new Date(dataInicio).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} - {new Date(dataFim).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                        ) : (
                          <span>Personalizado</span>
                        )
                      ) : filtroPeriodo === 'todos' ? (
                        <span>Período</span>
                      ) : filtroPeriodo === 'hoje' ? (
                        <span>Hoje</span>
                      ) : filtroPeriodo === '7dias' ? (
                        <span>7 dias</span>
                      ) : filtroPeriodo === '30dias' ? (
                        <span>30 dias</span>
                      ) : (
                        <span>90 dias</span>
                      )}
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todo Período</SelectItem>
                    <SelectItem value="hoje">Hoje</SelectItem>
                    <SelectItem value="7dias">Últimos 7 dias</SelectItem>
                    <SelectItem value="30dias">Últimos 30 dias</SelectItem>
                    <SelectItem value="90dias">Últimos 90 dias</SelectItem>
                    <SelectItem value="personalizado">📅 Personalizado</SelectItem>
                  </SelectContent>
                </Select>
                
                {/* Seletores de Data Personalizada */}
                {filtroPeriodo === 'personalizado' && (
                  <>
                    <input
                      type="date"
                      value={dataInicio}
                      onChange={(e) => setDataInicio(e.target.value)}
                      className="h-9 px-3 text-xs rounded-md border border-border bg-background"
                      placeholder="Data inicial"
                    />
                    <span className="text-xs text-muted-foreground">até</span>
                    <input
                      type="date"
                      value={dataFim}
                      onChange={(e) => setDataFim(e.target.value)}
                      className="h-9 px-3 text-xs rounded-md border border-border bg-background"
                      placeholder="Data final"
                    />
                  </>
                )}
                
                {/* Filtro por Corretor Individual com Ícone */}
                <Select value={filtroCorretor} onValueChange={setFiltroCorretor}>
                  <SelectTrigger className="w-auto min-w-[110px] h-9 text-xs">
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      {filtroCorretor === 'todos' ? (
                        <span>Corretor</span>
                      ) : (
                        <span className="truncate max-w-[150px]">{filtroCorretor}</span>
                      )}
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {metricasCorretores.map(m => (
                      <SelectItem key={m.corretor} value={m.corretor}>
                        {m.corretor}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {/* Filtro por Equipe com Ícone */}
                <Select value={filtroEquipe} onValueChange={setFiltroEquipe}>
                  <SelectTrigger className="w-auto min-w-[100px] h-9 text-xs">
                    <div className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      {filtroEquipe === 'todos' ? (
                        <span>Equipe</span>
                      ) : (
                        <span className="truncate max-w-[120px]">{filtroEquipe}</span>
                      )}
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas</SelectItem>
                    {equipesSupabase.map(equipe => (
                      <SelectItem key={equipe.id || equipe.nome_equipe} value={equipe.nome_equipe}>
                        {equipe.nome_equipe}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {/* Botão Limpar Filtros */}
                {(filtroCorretor !== 'todos' || filtroEquipe !== 'todos' || filtroPeriodo !== 'todos') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFiltroCorretor('todos');
                      setFiltroEquipe('todos');
                      setFiltroPeriodo('todos');
                      setDataInicio('');
                      setDataFim('');
                    }}
                    className="h-9 text-xs"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Limpar
                  </Button>
                )}
              </div>
            </div>
            
            {/* Tempo Médio - Grande e Destacado */}
            <div className="flex flex-col items-center justify-center py-8">
              <div className={`text-7xl font-bold mb-4 ${getCorTempo(tempoMedioGeral).split(' ')[0]}`}>
                {formatarTempo(tempoMedioGeral)}
              </div>
              <p className="text-sm text-muted-foreground">
                {filtroCorretor !== 'todos' 
                  ? `${corretoresExibidos[0]?.totalLeadsAssumidos || 0} leads assumidos`
                  : `Média de ${corretoresExibidos.length} ${corretoresExibidos.length === 1 ? 'corretor' : 'corretores'}`
                }
              </p>
            </div>
            
            {/* Detalhes Adicionais (apenas quando filtrado por corretor individual) */}
            {filtroCorretor !== 'todos' && corretoresExibidos.length === 1 && (
              <div className="mt-6 pt-6 border-t border-border">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground mb-1">Total</div>
                    <div className="text-2xl font-bold text-foreground">
                      {corretoresExibidos[0].totalLeadsAssumidos}
                    </div>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-green-500/10">
                    <div className="text-xs text-muted-foreground mb-1">Atendidos</div>
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {corretoresExibidos[0].leadsAtendidos}
                    </div>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-blue-500/10">
                    <div className="text-xs text-muted-foreground mb-1">Finalizados</div>
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {corretoresExibidos[0].leadsFinalizados}
                    </div>
                  </div>
                  <div className={`text-center p-4 rounded-lg ${
                    corretoresExibidos[0].taxaAtendimento >= 80 
                      ? 'bg-green-500/10' 
                      : corretoresExibidos[0].taxaAtendimento >= 50 
                      ? 'bg-yellow-500/10'
                      : 'bg-red-500/10'
                  }`}>
                    <div className="text-xs text-muted-foreground mb-1">Taxa</div>
                    <div className={`text-2xl font-bold ${
                      corretoresExibidos[0].taxaAtendimento >= 80 ? 'text-green-600 dark:text-green-400' :
                      corretoresExibidos[0].taxaAtendimento >= 50 ? 'text-yellow-600 dark:text-yellow-400' :
                      'text-red-600 dark:text-red-400'
                    }`}>
                      {corretoresExibidos[0].taxaAtendimento}%
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  // 🆕 Renderizar mini cards de leads
  const renderLeadsMiniCards = (leadsToRender: BolsaoLead[]) => {
    const leadsFiltrados = filtrarLeads(leadsToRender);
    
    return (
      <>
        {/* Barra de Filtros */}
        <div className="mb-4 p-4 bg-card rounded-lg border border-border shadow-sm">
          <div className="flex items-center gap-4 flex-wrap pb-3 mb-3">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Filtros:</span>
            </div>
            
            {/* Filtro Status */}
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Status</SelectItem>
                <SelectItem value="bolsão">📦 Bolsão</SelectItem>
                <SelectItem value="assumido">🔄 Assumido</SelectItem>
                <SelectItem value="atendido">✅ Atendido</SelectItem>
                <SelectItem value="finalizado">✅ Finalizado</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Filtro Atendido */}
            <Select value={filtroAtendido} onValueChange={setFiltroAtendido}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Atendido" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="sim">✅ Atendidos</SelectItem>
                <SelectItem value="nao">❌ Não Atendidos</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Filtro Urgência */}
            <Select value={filtroUrgencia} onValueChange={setFiltroUrgencia}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Urgência" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas Urgências</SelectItem>
                <SelectItem value="critico">🔴 Crítico</SelectItem>
                <SelectItem value="alta">🟠 Alta</SelectItem>
                <SelectItem value="normal">🟡 Normal</SelectItem>
              </SelectContent>
            </Select>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFiltroStatus('todos');
                setFiltroAtendido('todos');
                setFiltroUrgencia('todos');
              }}
              className="ml-auto"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Limpar Filtros
            </Button>
          </div>
          
          <div className="pt-3 border-t border-border text-sm text-muted-foreground">
            Mostrando <strong className="text-foreground">{leadsFiltrados.length}</strong> de <strong className="text-foreground">{leadsToRender.length}</strong> leads
          </div>
        </div>
        
        {/* Grid de Mini Cards */}
        {leadsFiltrados.length === 0 ? (
          <Card>
            <CardContent className="p-16 text-center">
              <AlertCircle className="h-20 w-20 text-muted-foreground mx-auto mb-6" />
              <p className="text-lg font-semibold text-foreground">Nenhum lead encontrado</p>
              <p className="text-sm text-muted-foreground">
                Tente ajustar os filtros para ver mais resultados
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {leadsFiltrados.map((lead) => (
              <LeadMiniCard
                key={lead.id}
                lead={lead}
                onClick={() => {
                  setLeadSelecionado(lead);
                  setModalAberto(true);
                }}
                onEnviarMensagem={(telefone: string) => {
                  // Abrir WhatsApp Web com o número
                  const telefoneFormatado = telefone.replace(/\D/g, '');
                  const urlWhatsApp = `https://wa.me/55${telefoneFormatado}`;
                  window.open(urlWhatsApp, '_blank');
                }}
                onConfirmarAtendimento={async (leadId: number) => {
                  setConfirmandoLead(leadId);
                  try {
                    await confirmarAtendimentoLead(leadId);
                    toast({
                      title: '✅ Atendimento confirmado!',
                      description: 'O lead foi marcado como atendido.',
                    });
                    await carregarLeads();
                  } catch (error) {
                    toast({
                      title: '❌ Erro ao confirmar atendimento',
                      description: String(error),
                      variant: 'destructive',
                    });
                  } finally {
                    setConfirmandoLead(null);
                  }
                }}
                isConfirmandoLead={confirmandoLead === lead.id}
                mostrarBotaoMensagem={false}
                mostrarBotaoConfirmar={false}
              />
            ))}
          </div>
        )}
      </>
    );
  };

  // Renderizar tabela de leads
  const renderLeadsTable = (leadsToRender: BolsaoLead[]) => {
    // Aplicar filtros
    const leadsFiltrados = filtrarLeads(leadsToRender);
    
    return (
      <>
        {/* Barra de Filtros */}
        <div className="mb-4 p-4 bg-card rounded-lg border">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Filtros:</span>
            </div>
            
                 {/* Filtro Status */}
                 <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                   <SelectTrigger className="w-[180px] h-9">
                     <SelectValue placeholder="Status" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="todos">Todos os Status</SelectItem>
                     {/* Status "bolsão" no Bolsão */}
                     <SelectItem value="bolsão">📦 Bolsão</SelectItem>
                     <SelectItem value="assumido">🔄 Assumido</SelectItem>
                     <SelectItem value="atendido">✅ Atendido</SelectItem>
                     <SelectItem value="finalizado">✅ Finalizado</SelectItem>
                   </SelectContent>
                 </Select>
            
            {/* Filtro Atendido */}
            <Select value={filtroAtendido} onValueChange={setFiltroAtendido}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Atendido" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="sim">✅ Atendidos</SelectItem>
                <SelectItem value="nao">❌ Não Atendidos</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Filtro Urgência */}
            <Select value={filtroUrgencia} onValueChange={setFiltroUrgencia}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Urgência" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas Urgências</SelectItem>
                <SelectItem value="critica">🔴 Crítica</SelectItem>
                <SelectItem value="alta">🟠 Alta</SelectItem>
                <SelectItem value="media">🟡 Média</SelectItem>
                <SelectItem value="ok">⚪ Atendido</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Botão Limpar Filtros */}
            {(filtroStatus !== 'todos' || filtroAtendido !== 'todos' || filtroUrgencia !== 'todos') && (
              <Button
                onClick={() => {
                  setFiltroStatus('todos');
                  setFiltroAtendido('todos');
                  setFiltroUrgencia('todos');
                }}
                variant="outline"
                size="sm"
                className="h-9"
              >
                <X className="h-4 w-4 mr-1" />
                Limpar Filtros
              </Button>
            )}
            
            <div className="ml-auto text-sm text-muted-foreground">
              Mostrando <span className="font-semibold text-foreground">{leadsFiltrados.length}</span> de <span className="font-semibold text-foreground">{leadsToRender.length}</span> leads
                </div>
              </div>
            </div>
        
        {/* Tabela */}
        <div className="w-full overflow-x-auto bg-card rounded-lg border">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-muted/50 border-b-2 border-border">
              <th className="px-4 py-3 text-center text-sm font-bold text-foreground uppercase tracking-wider whitespace-nowrap">Ações</th>
              <th className="px-4 py-3 text-left text-sm font-bold text-foreground uppercase tracking-wider whitespace-nowrap">Contato Lead</th>
              <th className="px-4 py-3 text-left text-sm font-bold text-foreground uppercase tracking-wider whitespace-nowrap">Portal</th>
              <th className="px-4 py-3 text-left text-sm font-bold text-foreground uppercase tracking-wider whitespace-nowrap">Data Entrada</th>
              <th className="px-4 py-3 text-left text-sm font-bold text-foreground uppercase tracking-wider whitespace-nowrap">Status</th>
              <th className="px-4 py-3 text-left text-sm font-bold text-foreground uppercase tracking-wider whitespace-nowrap">Tempo Restante</th>
              <th className="px-4 py-3 text-left text-sm font-bold text-foreground uppercase tracking-wider whitespace-nowrap">Atendido</th>
              <th className="px-4 py-3 text-left text-sm font-bold text-foreground uppercase tracking-wider whitespace-nowrap">Código Imóvel</th>
              <th className="px-4 py-3 text-left text-sm font-bold text-foreground uppercase tracking-wider whitespace-nowrap">Corretor Original</th>
              <th className="px-4 py-3 text-left text-sm font-bold text-foreground uppercase tracking-wider whitespace-nowrap">Corretor Responsável</th>
              <th className="px-4 py-3 text-left text-sm font-bold text-foreground uppercase tracking-wider whitespace-nowrap">Data Atribuição</th>
              <th className="px-4 py-3 text-left text-sm font-bold text-foreground uppercase tracking-wider whitespace-nowrap">Data Atendimento</th>
            </tr>
          </thead>
          <tbody>
            {leadsFiltrados.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <AlertCircle className="h-12 w-12 text-muted-foreground" />
                    <p className="text-lg font-semibold text-foreground">Nenhum lead encontrado</p>
                    <p className="text-sm text-muted-foreground">
                      Tente ajustar os filtros para ver mais resultados
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              leadsFiltrados.map((lead, index) => {
              const tempo = calcularTempoNoBolsao(lead.created_at);
              const isDisponivel = lead.status === 'bolsão'; // Leads no Bolsão têm status "bolsão"
              const corretorAtual = lead.corretor_responsavel || lead.corretor || 'Não atribuído';
              
              // Debug: verificar condições dos botões
              if (index === 0) {
              }
              
              return (
                <tr 
                  key={lead.id}
                  className={`border-b border-border hover:bg-muted/30 transition-colors ${
                    index % 2 === 0 ? 'bg-background' : 'bg-muted/10'
                  }`}
                >
                  {/* Ações */}
                  <td className="px-4 py-4">
                    {(() => {
                      // Verificar se há alguma ação disponível
                      const temBotaoConfirmar = false;
                      const temBotaoAssumir = isDisponivel && (isCorretor || isAdmin);
                      const temAcoes = temBotaoConfirmar || temBotaoAssumir;
                      
                      if (!temAcoes) {
                        // Se não tem ações, mostra status do lead com visual bonito
                        return (
                          <div className="flex items-center justify-center">
                            {lead.status === 'atendido' && (
                              <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-300 dark:border-green-600 dark:bg-green-950/60 dark:text-green-300">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Atendido
                              </Badge>
                            )}
                            {lead.status === 'finalizado' && (
                              <Badge className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Finalizado
                              </Badge>
                            )}
                            {lead.status === 'assumido' && (
                              <Badge className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-600 dark:bg-blue-950/60 dark:text-blue-300">
                                <Clock className="h-3 w-3 mr-1" />
                                Em Atendimento
                              </Badge>
                            )}
                            {lead.status === 'bolsão' && (
                              <Badge className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-600 dark:bg-purple-950/60 dark:text-purple-300">
                                <Clock className="h-3 w-3 mr-1" />
                                No Bolsão
                              </Badge>
                            )}
                            {!['atendido', 'finalizado', 'assumido', 'bolsão'].includes(lead.status || '') && (
                              <Badge variant="outline" className="bg-muted/30 text-muted-foreground border-muted">
                                Sem ação disponível
                              </Badge>
                            )}
                          </div>
                        );
                      }
                      
                      return (
                        <div className="flex items-center justify-center gap-2">
                          {/* Botão Confirmar Atendimento (área Meus Leads - apenas para status "novo") */}
                          {temBotaoConfirmar && (
                            <Button
                              onClick={() => handleConfirmarAtendimento(lead)}
                              disabled={confirmandoLead === lead.id}
                              size="sm"
                              className="h-8 bg-green-600 hover:bg-green-700 text-white whitespace-nowrap"
                            >
                              {confirmandoLead === lead.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  Confirmar Atendimento
                                </>
                              )}
                            </Button>
                          )}
                          
                          {/* Botão Assumir (só para leads disponíveis do bolsão) */}
                          {temBotaoAssumir && (
                            <Button
                              onClick={() => handleAssumirLead(lead)}
                              disabled={assumindoLead === lead.id}
                              size="sm"
                              className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              {assumindoLead === lead.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Zap className="h-4 w-4 mr-1" />
                                  Assumir
                                </>
                              )}
                            </Button>
                          )}
                          
                          <button 
                            className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors"
                            title="Ver detalhes"
                          >
                            <MessageCircle className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </div>
                      );
                    })()}
                  </td>
                
                  {/* Contato Lead */}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                      <span className="font-semibold text-foreground font-mono">
                        {formatarTelefone(lead.lead) || 'Sem contato'}
                      </span>
                    </div>
                  </td>
                  
                  {/* Portal */}
                  <td className="px-4 py-4">
                    {lead.portal ? (
                      <span className="text-foreground whitespace-nowrap">
                        📍 {lead.portal}
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic">-</span>
                    )}
                  </td>
                  
                  {/* Data Entrada */}
                  <td className="px-4 py-4">
                    <div className="flex flex-col">
                      <span className="text-foreground font-medium whitespace-nowrap">
                        {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(lead.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                </div>
                  </td>
                  
                  {/* Status */}
                  <td className="px-4 py-4">
              <Badge 
                variant="outline"
                      className={`whitespace-nowrap ${
                        lead.status === 'novo' ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600' :
                        lead.status === 'bolsão' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-600' :
                        lead.status === 'assumido' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-600' :
                        lead.status === 'atendido' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-300 dark:border-green-600' :
                        lead.status === 'finalizado' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-600' :
                        'bg-muted text-foreground border-border'
                      }`}
                    >
                      {lead.status === 'novo' ? '🆕 Novo' : 
                       lead.status === 'bolsão' ? '📦 Bolsão' :
                       lead.status === 'assumido' ? '🔄 Assumido' :
                       lead.status === 'atendido' ? '✅ Atendido' :
                       lead.status === 'finalizado' ? '✅ Finalizado' :
                       lead.status || 'Indefinido'}
              </Badge>
                  </td>
                  
                  {/* Tempo Restante (até expirar) */}
                  <td className="px-4 py-4">
                    {(() => {
                      const tempoRestante = calcularTempoRestante(lead);
                      return (
            <Badge 
                          className={`whitespace-nowrap ${
                            tempoRestante.urgencia === 'ok' ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600' :
                            tempoRestante.urgencia === 'critica' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-300 dark:border-red-600' :
                            tempoRestante.urgencia === 'alta' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-600' :
                            tempoRestante.texto === 'Aguardando expediente' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-600' :
                            'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-600'
                          }`}
              variant="outline"
            >
                          {tempoRestante.expirado && <AlertCircle className="h-3 w-3 mr-1" />}
                          {tempoRestante.texto === 'Aguardando expediente' && <Clock className="h-3 w-3 mr-1" />}
                          {!tempoRestante.expirado && tempoRestante.texto !== '-' && tempoRestante.texto !== 'Aguardando expediente' && <Clock className="h-3 w-3 mr-1" />}
                          {tempoRestante.texto}
            </Badge>
                      );
                    })()}
                  </td>
            
                  {/* Atendido */}
                  <td className="px-4 py-4">
            <Badge 
              variant="outline"
                      className={`whitespace-nowrap ${
                        lead.atendido 
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-300 dark:border-green-600'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-300 dark:border-red-600'
                      }`}
                    >
                      {lead.atendido ? '✅ Sim' : '❌ Não'}
            </Badge>
                  </td>
                  
                  {/* Código Imóvel */}
                  <td className="px-4 py-4">
                    {lead.codigo ? (
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                        <span className="text-foreground font-medium">
                          {lead.codigo}
                        </span>
            </div>
                    ) : (
                      <span className="text-muted-foreground italic">-</span>
                    )}
                  </td>
                  
                  {/* Corretor Original */}
                  <td className="px-4 py-4">
                    {lead.corretor ? (
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                        <span className="text-foreground">
                          {lead.corretor}
                        </span>
            </div>
                    ) : (
                      <span className="text-muted-foreground italic">-</span>
                    )}
                  </td>
                  
                  {/* Corretor Responsável */}
                  <td className="px-4 py-4">
                    {lead.corretor_responsavel ? (
                      <div className="flex items-center gap-2">
                        <Star className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                        <span className="text-foreground font-medium">
                          {lead.corretor_responsavel}
                        </span>
            </div>
                    ) : (
                      <span className="text-muted-foreground italic">Não assumido</span>
                    )}
                  </td>
                  
                  {/* Data Atribuição */}
                  <td className="px-4 py-4">
                    {lead.data_atribuicao ? (
                      <div className="flex flex-col">
                        <span className="text-foreground text-sm whitespace-nowrap">
                          {new Date(lead.data_atribuicao).toLocaleDateString('pt-BR')}
                        </span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(lead.data_atribuicao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
          </div>
                    ) : (
                      <span className="text-muted-foreground italic">-</span>
                    )}
                  </td>
                  
                  {/* Data Atendimento */}
                  <td className="px-4 py-4">
                    {lead.data_atendimento ? (
                      <div className="flex flex-col">
                        <span className="text-foreground text-sm whitespace-nowrap">
                          {new Date(lead.data_atendimento).toLocaleDateString('pt-BR')}
                        </span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(lead.data_atendimento).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
        </div>
                    ) : (
                      <span className="text-muted-foreground italic">-</span>
                    )}
                  </td>
                </tr>
              );
            })
            )}
          </tbody>
        </table>
        </div>
      </>
    );
  };

  // Renderizar card de lead
  const renderLeadCard = (lead: BolsaoLead) => {
    const tempo = calcularTempoNoBolsao(lead.created_at);
    const isDisponivel = lead.status === 'novo' && lead.atendido === false;

  return (
    <Card 
        key={lead.id}
        className="group relative overflow-hidden bg-card hover:shadow-xl transition-all duration-500 hover:-translate-y-1 border-2"
      >
        {/* Linha superior colorida */}
        <div className={`absolute top-0 left-0 right-0 h-1 ${
          isDisponivel 
            ? tempo.urgencia === 'critica' ? 'bg-red-500' :
              tempo.urgencia === 'alta' ? 'bg-orange-500' :
              tempo.urgencia === 'media' ? 'bg-yellow-500' :
              'bg-emerald-500'
            : 'bg-purple-500'
        }`} />
        
        <CardContent className="relative p-6 space-y-5">
          {/* Header com avatar e info */}
          <div className="flex items-start gap-4">
            {/* Avatar circular */}
            <div className="relative flex-shrink-0">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center shadow-lg">
                <Phone className="h-6 w-6 text-white" />
              </div>
            </div>

            {/* Informações principais */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="text-lg font-bold text-text-primary break-words">
                  {formatarTelefone(lead.lead) || 'Lead sem identificação'}
                </h3>
                
                {isDisponivel && (
                  <Badge className={`flex-shrink-0 ${
                    tempo.urgencia === 'critica' ? 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/40' :
                    tempo.urgencia === 'alta' ? 'bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/40' :
                    tempo.urgencia === 'media' ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/40' :
                    'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/40'
                  } font-semibold`}>
                    <Clock className="h-3 w-3 mr-1" />
                    {tempo.texto}
            </Badge>
                )}
              </div>

              {/* Badges */}
              <div className="flex items-center gap-2 flex-wrap">
                {isDisponivel ? (
                  <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 font-semibold">
                    <Zap className="h-3 w-3 mr-1" />
                    Disponível Agora
                  </Badge>
                ) : (
                  <Badge className={`font-semibold ${
                    lead.status === 'assumido' ? 'bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/40' :
                    lead.status === 'finalizado' ? 'bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/40' :
                    'bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-500/40'
                  }`}>
                    {lead.status === 'assumido' && '🔄 Assumido'}
                    {lead.status === 'finalizado' && '✅ Finalizado'}
                    {!['assumido', 'finalizado'].includes(lead.status || '') && '⚪ ' + (lead.status || 'Processando')}
                  </Badge>
                )}
                
                {lead.codigo && (
                  <Badge className="bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/40 font-semibold">
                    <Building2 className="h-3 w-3 mr-1" />
                    {lead.codigo}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Divisor */}
          <div className="h-px bg-border" />

          {/* Grid de informações */}
          <div className="space-y-3">
            {/* Telefone do Lead */}
            {lead.lead && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border hover:border-emerald-500/40 transition-colors">
                <div className="flex-shrink-0 w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                  <Phone className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-muted-foreground mb-0.5">Contato do Lead</div>
                  <div className="text-base font-semibold text-foreground font-mono">{formatarTelefone(lead.lead)}</div>
                    </div>
                    </div>
            )}
            
            {/* Grid 2 colunas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Corretor */}
              {lead.corretor && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border hover:border-purple-500/40 transition-colors">
                  <div className="flex-shrink-0 w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                    <User className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                      </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-muted-foreground mb-0.5">Corretor</div>
                    <div className="text-base font-semibold text-foreground break-words">{lead.corretor}</div>
                    </div>
                    </div>
              )}
              
              {/* Tel. Corretor */}
              {lead.numerocorretor && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border hover:border-blue-500/40 transition-colors">
                  <div className="flex-shrink-0 w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <Phone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-muted-foreground mb-0.5">Tel. Corretor</div>
                    <div className="text-base font-semibold text-foreground font-mono break-words">{formatarTelefone(lead.numerocorretor)}</div>
                  </div>
                </div>
              )}
          </div>

            {/* Data entrada */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border hover:border-orange-500/40 transition-colors">
              <div className="flex-shrink-0 w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
                <Calendar className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-muted-foreground mb-0.5">Entrou no Bolsão</div>
                <div className="text-base font-semibold text-foreground">{new Date(lead.created_at).toLocaleString('pt-BR')}</div>
        </div>
      </div>

            {/* Expiração */}
            {lead.data_expiracao && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <div className="flex-shrink-0 w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                  <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-red-600 dark:text-red-400 mb-0.5 font-semibold">⚠️ Expira em</div>
                  <div className="text-base font-bold text-red-600 dark:text-red-400">{new Date(lead.data_expiracao).toLocaleString('pt-BR')}</div>
              </div>
              </div>
            )}
            </div>
            
          {/* Divisor */}
          <div className="h-px bg-border" />

          {/* Botão ou status */}
          {isDisponivel ? (
            <div className="space-y-2">
              <Button
                onClick={() => handleAssumirLead(lead)}
                disabled={assumindoLead === lead.id || !isCorretor}
                className="w-full h-12 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold rounded-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
              >
                {assumindoLead === lead.id ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Assumindo...
                  </>
                ) : (
                  <>
                    <Star className="h-5 w-5 mr-2" />
                    Assumir Este Lead
                    <ArrowRight className="h-5 w-5 ml-2" />
                  </>
                )}
              </Button>
              
              {!isCorretor && (
                <p className="text-xs text-center text-muted-foreground">
                  🔒 Apenas corretores podem assumir leads
                </p>
              )}
              </div>
            ) : (
            <div className="text-center py-2">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted border">
                <span className="text-sm text-muted-foreground">
                  {lead.status === 'assumido' && '🔄'}
                  {lead.status === 'finalizado' && '✅'}
                  {!['assumido', 'finalizado'].includes(lead.status || '') && '⚪'}
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {lead.status === 'assumido' && 'Lead Assumido'}
                  {lead.status === 'finalizado' && 'Finalizado'}
                  {!['assumido', 'finalizado'].includes(lead.status || '') && 'Em Processamento'}
                </span>
              </div>
              {lead.corretor_responsavel && (
                <p className="text-xs text-muted-foreground mt-2">
                  Atendido por: <span className="text-foreground font-semibold">{lead.corretor_responsavel}</span>
                </p>
              )}
                  </div>
          )}
                </CardContent>
              </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header Fixo - Fica no topo sempre visível */}
      <div className="sticky top-0 left-0 right-0 z-50 bg-card border-b shadow-sm">
        <div className="w-full px-4 py-4">
          {/* Linha 1: Título e Botões */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Home className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h1 className="text-xl font-bold text-foreground">Bolsão de Leads</h1>
            </div>
            
            <div className="flex items-center gap-2">
              {canManageBolsaoConfig && (
                <Button
                  onClick={() => setModalTempoBolsaoAberto(true)}
                  variant="outline"
                  size="sm"
                  className="h-9 px-4 font-semibold border-purple-500/50 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                >
                  <Settings2 className="h-4 w-4 mr-2" />
                  Tempo do Bolsão
                </Button>
              )}

              {/* 🎰 Botão Gerenciar Roleta (Admin, Team Leader e usuários com permissão can_manage_roleta) */}
              {(isAdmin || user?.systemRole === 'team_leader' || (user?.permissions as any)?.can_manage_roleta) && (
                <Button
                  onClick={() => {
                    carregarCorretoresRoleta();
                    setModalRoletaAberto(true);
                  }}
                  variant="outline"
                  size="sm"
                  className="h-9 px-4 font-semibold border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                >
                  <Settings2 className="h-4 w-4 mr-2" />
                  Roleta
                  {roletaStats.total > 0 && (
                    <Badge variant="secondary" className="ml-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 dark:bg-amber-950/60">
                      {roletaStats.participantes}/{roletaStats.total}
                    </Badge>
                  )}
                </Button>
              )}

              {/* Botão Conectar/Desconectar Bolsão */}
              {bolsaoConectado ? (
                <Button
                  onClick={handleDesconectarBolsao}
                  variant="outline"
                  size="sm"
                  className="h-9 px-4 font-semibold"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Clock className="h-4 w-4 mr-2" />
                  )}
                  Atualizar
                </Button>
              ) : (
                <>
                  <Button
                    onClick={() => setModalConexaoAberto(true)}
                    variant="default"
                    size="sm"
                    className="h-9 px-4 font-semibold bg-blue-600 hover:bg-blue-700 bolsao-connect-button"
                  >
                    <span className="flex items-center">
                      <Zap className="h-4 w-4 mr-2" />
                      Conectar Bolsão
                    </span>
                  </Button>

                  <Button
                    onClick={() => window.location.reload()}
                    variant="outline"
                    size="sm"
                    className="h-9 px-4 font-semibold"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Atualizar
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Linha 2: Abas de Navegação */}
          <div className="flex items-center gap-2 border-t pt-3">
            <button
              onClick={() => setActiveTab('disponiveis')}
/* ... */
              className={`relative px-4 py-2 font-bold text-sm transition-all rounded-md ${
                activeTab === 'disponiveis'
                  ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <span className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Disponíveis
              </span>
            </button>
            
            {/* Aba Todos os Leads - APENAS PARA ADMIN */}
            {isAdmin && (
              <button
                onClick={() => setActiveTab('geral')}
                className={`relative px-4 py-2 font-bold text-sm transition-all rounded-md ${
                  activeTab === 'geral'
                    ? 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Todos os Leads
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
            
      {/* Container de Conteúdo */}
      <div className="w-full px-4 py-2">
        {/* 🆕 Cards de Métricas de Corretores (apenas Admin) */}
        {isAdmin && renderMetricasCorretores()}
        
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-16 w-16 text-purple-500 animate-spin mb-4" />
            <p className="text-muted-foreground text-lg font-semibold">Carregando leads...</p>
          </div>
        ) : !tabelaExiste ? (
          <Card className="border-orange-500/30">
            <CardContent className="p-16 text-center">
              <AlertCircle className="h-20 w-20 text-orange-500 mx-auto mb-6" />
              <h3 className="text-3xl font-bold text-foreground mb-3">Tabela não encontrada</h3>
              <p className="text-muted-foreground text-lg">
                A tabela <code className="bg-muted px-3 py-1 rounded">bolsão</code> não existe.
              </p>
            </CardContent>
          </Card>
        ) : leads.length === 0 ? (
          <Card>
            <CardContent className="p-16 text-center">
              <CheckCircle className="h-20 w-20 text-emerald-500 mx-auto mb-6" />
              <h3 className="text-3xl font-bold text-foreground mb-3">
                {activeTab === 'disponiveis' ? '🎉 Nenhum lead disponível!' : '📭 Bolsão vazio'}
              </h3>
              <p className="text-muted-foreground text-lg">
                {activeTab === 'disponiveis' 
                  ? 'Todos os leads estão sendo atendidos!'
                  : 'Não há leads no bolsão.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          renderLeadsMiniCards(leads)
        )}
      </div>
      
      {/* 🆕 Modal de Detalhes do Lead */}
      <LeadDetailsModal
        lead={leadSelecionado}
        isOpen={modalAberto}
        onClose={() => {
          setModalAberto(false);
          setLeadSelecionado(null);
        }}
        onAssumirLead={async (leadId: number) => {
          setAssumindoLead(leadId);
          try {
            // Verificar limite de leads antes de assumir
            if (tenantId && user?.id) {
              const limitConfig = await fetchLeadLimitConfig(tenantId);
              if (limitConfig && limitConfig.lead_limit_enabled) {
                const brokerOverride = (user as any)?.permissions?.lead_limit as BrokerLeadLimitOverride | undefined;
                const eligibility = await checkBrokerEligibility(tenantId, user.id, limitConfig, brokerOverride);
                if (!eligibility.eligible) {
                  toast({
                    title: 'Limite de leads atingido',
                    description: eligibility.block_reason || 'Você atingiu o limite máximo de leads na carteira.',
                    variant: 'destructive',
                  });
                  setAssumindoLead(null);
                  return;
                }
              }
            }

            await assumirLeadDoBolsao(leadId, user?.name || 'Corretor', user?.telefone?.toString() || '');
            toast({
              title: '✅ Lead assumido!',
              description: 'O lead foi atribuído a você.',
            });
            await carregarLeads();
            setModalAberto(false);
          } catch (error) {
            toast({
              title: '❌ Erro ao assumir lead',
              description: String(error),
              variant: 'destructive',
            });
          } finally {
            setAssumindoLead(null);
          }
        }}
        onConfirmarAtendimento={async (leadId: number) => {
          setConfirmandoLead(leadId);
          try {
            await confirmarAtendimentoLead(leadId);
            toast({
              title: '✅ Atendimento confirmado!',
              description: 'O lead foi marcado como atendido.',
            });
            await carregarLeads();
            setModalAberto(false);
          } catch (error) {
            toast({
              title: '❌ Erro ao confirmar atendimento',
              description: String(error),
              variant: 'destructive',
            });
          } finally {
            setConfirmandoLead(null);
          }
        }}
        isAssumindoLead={assumindoLead !== null}
        isConfirmandoLead={confirmandoLead !== null}
        isAdmin={isAdmin}
        isCorretor={isCorretor}
        currentCorretor={user?.name || ''}
      />

      <Dialog open={modalTempoBolsaoAberto} onOpenChange={setModalTempoBolsaoAberto}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Configurar tempo do Bolsão</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tempo-expiracao-exclusivo">Tempo para imóvel exclusivo</Label>
                <Input
                  id="tempo-expiracao-exclusivo"
                  type="number"
                  min="1"
                  value={config.tempoExpiracaoExclusivo}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    tempoExpiracaoExclusivo: Math.max(1, Number(e.target.value) || 1)
                  }))}
                />
                <p className="text-xs text-muted-foreground">
                  Após esse tempo, o lead interessado em imóvel exclusivo vai para o bolsão.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tempo-expiracao-nao-exclusivo">Tempo para imóvel não exclusivo</Label>
                <Input
                  id="tempo-expiracao-nao-exclusivo"
                  type="number"
                  min="1"
                  value={config.tempoExpiracaoNaoExclusivo}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    tempoExpiracaoNaoExclusivo: Math.max(1, Number(e.target.value) || 1)
                  }))}
                />
                <p className="text-xs text-muted-foreground">
                  Após esse tempo, o lead interessado em imóvel não exclusivo vai para o bolsão.
                </p>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
              <p className="font-medium text-foreground">Resumo atual</p>
              <p className="text-muted-foreground">
                Exclusivo: <span className="font-semibold text-foreground">{config.tempoExpiracaoExclusivo} min</span>
              </p>
              <p className="text-muted-foreground">
                Não exclusivo: <span className="font-semibold text-foreground">{config.tempoExpiracaoNaoExclusivo} min</span>
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setModalTempoBolsaoAberto(false)}>
                Cancelar
              </Button>
              <Button
                onClick={async () => {
                  await salvarConfiguracoes(config);
                  setModalTempoBolsaoAberto(false);
                }}
              >
                Salvar tempos
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* 🆕 Modal de Conexão do Bolsão */}
      {modalConexaoAberto && (
        <div className="octo-modal-overlay fixed inset-0 z-[100] flex items-center justify-center">
          {/* Overlay */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setModalConexaoAberto(false)}
          />
          
          {/* Modal */}
          <div className="relative bg-card border rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                  <Zap className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">Conectar Bolsão</h2>
                  <p className="text-sm text-muted-foreground">Kenlo Imob</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setModalConexaoAberto(false)}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Formulário */}
            <form onSubmit={handleConectarBolsao} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={bolsaoEmail}
                  onChange={(e) => setBolsaoEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full px-4 py-3 rounded-lg border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Senha
                </label>
                <div className="relative">
                  <input
                    type={showBolsaoPassword ? 'text' : 'password'}
                    value={bolsaoSenha}
                    onChange={(e) => setBolsaoSenha(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 rounded-lg border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 pr-12"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowBolsaoPassword(!showBolsaoPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showBolsaoPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
              
              <Button
                type="submit"
                disabled={conectandoBolsao}
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 font-semibold bolsao-connect-button"
              >
                {conectandoBolsao ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Conectando...
                  </>
                ) : (
                  <>
                    <Zap className="h-5 w-5 mr-2" />
                    Conectar
                  </>
                )}
              </Button>
            </form>
          </div>
        </div>
      )}
      
      {/* 🎰 Modal de Gestão da Roleta */}
      {modalRoletaAberto && (
        <div className="octo-modal-overlay fixed inset-0 z-[100] flex items-center justify-center">
          {/* Overlay */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setModalRoletaAberto(false)}
          />
          
          {/* Modal */}
          <div className="relative bg-card border rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                  <Settings2 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">Gerenciar Roleta</h2>
                  <p className="text-sm text-muted-foreground">
                    Selecione os corretores que participam da roleta
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setModalRoletaAberto(false)}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Conteúdo */}
            <div className="flex-1 overflow-y-auto p-6">
              {loadingRoleta ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-10 w-10 text-amber-500 animate-spin mb-4" />
                  <p className="text-muted-foreground">Carregando corretores...</p>
                </div>
              ) : corretoresDisponiveis.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground font-medium">Nenhum corretor encontrado</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Cadastre corretores na aba "Acessos e Permissões"
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Info Card - Melhorado */}
                  <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-2 border-amber-200 dark:border-amber-800 shadow-sm dark:border-amber-900">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-amber-500 dark:bg-amber-600 flex items-center justify-center">
                        <Settings2 className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-bold text-amber-900 dark:text-amber-100 mb-1">
                          🎰 Sistema de Roleta Inteligente
                        </h3>
                        <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                          Quando um lead chega <strong>sem corretor responsável</strong>, ele é distribuído 
                          automaticamente entre os corretores selecionados abaixo em sistema de <strong>rodízio justo</strong>.
                        </p>
                        <div className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-700 dark:border-amber-900">
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            💡 <strong>Padrão:</strong> Todos os corretores participam da roleta automaticamente
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Estatísticas */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-center dark:bg-blue-950/40 dark:border-blue-900">
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {corretoresDisponiveis.length}
                      </div>
                      <div className="text-xs text-blue-600 dark:text-blue-400 font-medium mt-1">
                        Total
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-center dark:bg-emerald-950/40 dark:border-emerald-900">
                      <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                        {corretoresSelecionados.size}
                      </div>
                      <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                        Ativos
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 text-center dark:bg-purple-950/40 dark:border-purple-900">
                      <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                        {corretoresDisponiveis.length - corretoresSelecionados.size}
                      </div>
                      <div className="text-xs text-purple-600 dark:text-purple-400 font-medium mt-1">
                        Inativos
                      </div>
                    </div>
                  </div>

                  {/* Selecionar todos - Melhorado */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 border-2 border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="select-all"
                        checked={corretoresSelecionados.size === corretoresDisponiveis.length && corretoresDisponiveis.length > 0}
                        onCheckedChange={toggleTodosRoleta}
                        className="h-5 w-5"
                      />
                      <label htmlFor="select-all" className="text-sm font-bold cursor-pointer text-foreground">
                        {corretoresSelecionados.size === corretoresDisponiveis.length 
                          ? '✓ Todos selecionados' 
                          : 'Selecionar todos'
                        } ({corretoresDisponiveis.length})
                      </label>
                    </div>
                    <Badge 
                      variant={corretoresSelecionados.size === corretoresDisponiveis.length ? "default" : "outline"} 
                      className={`font-mono font-bold ${
                        corretoresSelecionados.size === corretoresDisponiveis.length 
                          ? 'bg-emerald-500 text-white' 
                          : ''
                      }`}
                    >
                      {corretoresSelecionados.size}/{corretoresDisponiveis.length}
                    </Badge>
                  </div>

                  {/* Lista de corretores */}
                  <div className="space-y-2">
                    {corretoresDisponiveis.map((corretor) => (
                      <div 
                        key={corretor.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                          corretoresSelecionados.has(corretor.id)
                            ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700'
                            : 'bg-muted/30 hover:bg-muted/50'
                        }`}
                        onClick={() => toggleCorretorRoleta(corretor.id)}
                      >
                        <Checkbox
                          checked={corretoresSelecionados.has(corretor.id)}
                          onCheckedChange={() => toggleCorretorRoleta(corretor.id)}
                        />
                        
                        {/* Avatar */}
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold text-sm">
                          {corretor.name?.charAt(0).toUpperCase() || '?'}
                        </div>
                        
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground truncate">{corretor.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {corretor.email || corretor.phone || 'Sem contato'}
                          </p>
                        </div>
                        
                        {/* Status */}
                        {corretor.is_in_roleta && (
                          <Badge className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs dark:bg-emerald-950/60">
                            Na roleta
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="flex items-center justify-between gap-3 p-6 border-t bg-muted/30">
              <Button
                variant="outline"
                onClick={() => setModalRoletaAberto(false)}
                disabled={salvandoRoleta}
              >
                Cancelar
              </Button>
              
              <Button
                onClick={salvarRoleta}
                disabled={salvandoRoleta || loadingRoleta}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {salvandoRoleta ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Salvar Configuração
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
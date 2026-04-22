import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { parseConversation } from '@/utils/conversationParser';
import { OctoDashLoader } from '@/components/ui/OctoDashLoader';
import { AppSidebar } from '@/components/AppSidebar';
import { fetchLeadHistory, HistoryLog } from '../services/historyService';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  Calendar, 
  Building2, 
  MessageCircle,
  FileText,
  TrendingUp,
  Clock,
  DollarSign,
  Home,
  Tag,
  Briefcase,
  Thermometer,
  ChevronRight,
  ExternalLink,
  ArrowRight
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useLeadsData } from '../hooks/useLeadsData';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from "@/hooks/useAuth";
import { updateLead } from '../services/updateLeadService';
import { formatCurrency } from '@/utils/dateUtils';
import { useToast } from '@/hooks/use-toast';

type TabType = 'geral' | 'conversa' | 'imovel' | 'historico';

export const LeadViewPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as TabType | null;
  const [activeTab, setActiveTab] = useState<TabType>(tabParam || 'geral');
  const { leads, isLoading } = useLeadsData();
  const { currentCorretor } = useAuth();
  const { toast } = useToast();
  
  // Estado para logs de histórico
  const [historyLogs, setHistoryLogs] = useState<HistoryLog[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  // Inicializar tema
  useTheme();

  // Buscar histórico quando a tab for 'historico'
  useEffect(() => {
    // Só buscar se tiver um lead selecionado e a tab for histórico
    const leadIdStr = id;
    const currentLead = leads.find(l => l.id_lead.toString() === leadIdStr);

    if (activeTab === 'historico' && currentLead) {
      const loadHistory = async () => {
        setIsLoadingHistory(true);
        try {
          const logs = await fetchLeadHistory(currentLead.id_lead);
          setHistoryLogs(logs);
        } catch (error) {
          console.error('Erro ao carregar histórico:', error);
        } finally {
          setIsLoadingHistory(false);
        }
      };
      loadHistory();
    }
  }, [activeTab, id, leads]);

  // Estado para controlar as seções da sidebar
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentSection, setCurrentSection] = useState<'cliente-interessado' | 'cliente-proprietario' | 'corretores' | 'imoveis' | 'configuracoes'>('cliente-interessado');
  const [activeClienteInteressadoSubSection, setActiveClienteInteressadoSubSection] = useState<'geral' | 'pre-atendimento' | 'bolsao' | 'atendimento'>('geral');
  const [activeClienteProprietarioSubSection, setActiveClienteProprietarioSubSection] = useState<'cliente-proprietario' | 'estudo-mercado'>('cliente-proprietario');
  const [activeCorretoresSubSection, setActiveCorretoresSubSection] = useState<'meus-leads' | 'bolsao-imoveis' | 'estudo-mercado'>('meus-leads');

  // Função para lidar com mudança de seção na sidebar - OTIMIZADA para navegação rápida
  const handleSidebarSectionChange = (section: 'cliente-interessado' | 'cliente-proprietario' | 'corretores' | 'imoveis' | 'configuracoes') => {
    // Salvar a seção selecionada no localStorage para restaurar quando voltar
    localStorage.setItem('selectedSection', section);
    localStorage.setItem('selectedClienteInteressadoSubSection', activeClienteInteressadoSubSection);
    localStorage.setItem('selectedClienteProprietarioSubSection', activeClienteProprietarioSubSection);
    localStorage.setItem('selectedCorretoresSubSection', activeCorretoresSubSection);
    
    // Navegar instantaneamente (replace = true para navegação rápida sem delay)
    navigate('/', { replace: true });
  };

  const handleClienteInteressadoSubSectionChange = (subSection: 'geral' | 'pre-atendimento' | 'bolsao' | 'atendimento') => {
    localStorage.setItem('selectedSection', 'cliente-interessado');
    localStorage.setItem('selectedClienteInteressadoSubSection', subSection);
    navigate('/', { replace: true });
  };

  const handleClienteProprietarioSubSectionChange = (subSection: 'cliente-proprietario' | 'estudo-mercado') => {
    localStorage.setItem('selectedSection', 'cliente-proprietario');
    localStorage.setItem('selectedClienteProprietarioSubSection', subSection);
    navigate('/', { replace: true });
  };

  const handleCorretoresSubSectionChange = (subSection: 'meus-leads' | 'bolsao-imoveis' | 'estudo-mercado') => {
    localStorage.setItem('selectedSection', 'gestao-equipe');
    localStorage.setItem('selectedGestaoEquipeSubSection', 'corretores');
    navigate('/gestao-equipe?tab=corretores', { replace: true });
  };
  
  // Encontrar o lead pelo ID
  const lead = leads.find(l => l.id_lead.toString() === id);

  // Atualizar tab quando mudar o parâmetro da URL
  useEffect(() => {
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  useEffect(() => {
    // Se não encontrar o lead E não estiver carregando E há leads carregados, voltar
    if (!isLoading && leads.length > 0 && !lead) {
      navigate('/', { replace: true });
    }
  }, [lead, isLoading, leads.length, navigate]);

  // Mostrar loading apenas se estiver carregando E ainda não tiver leads
  if (isLoading && leads.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[color:var(--bg-primary)]">
        <OctoDashLoader message="Carregando lead..." size="lg" />
      </div>
    );
  }

  // Se não encontrar o lead, não renderizar nada (useEffect vai redirecionar)
  if (!lead) {
    return null;
  }

  const chatMessages = parseConversation(lead);

  const getTemperatureColor = (temp: string) => {
    const tempLower = temp.toLowerCase();
    if (tempLower.includes('quente')) return 'text-red-400';
    if (tempLower.includes('morno')) return 'text-yellow-400';
    if (tempLower.includes('frio')) return 'text-blue-400';
    return 'text-gray-400';
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric' 
    });
  };

  const parsePreferences = (preferences?: string) => {
    if (!preferences) return [];
    return preferences.split(',').map(p => p.trim()).filter(p => p && p !== 'null');
  };

  // Função para gerar o link do imóvel
  const getImovelLink = (codigoImovel?: string) => {
    if (!codigoImovel || codigoImovel.trim() === '') {
      return null;
    }
    // Remover espaços e caracteres especiais, manter apenas alfanuméricos
    const cleanCode = codigoImovel.trim().replace(/\s+/g, '-');
    return `https://imobiliariajapi.com.br/imovel/${cleanCode}`;
  };

  // Renderizar conteúdo dentro do MainLayout
  const renderContent = () => (
    <div className="min-h-screen bg-[color:var(--bg-primary)]">
      {/* Header minimalista - Ajustado para não sobrepor a sidebar */}
      <div className="sticky top-0 z-40 bg-[color:var(--bg-primary)]/95 backdrop-blur-md border-b border-[color:var(--border)] ml-0">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  // Sempre voltar para a página principal
                  navigate('/');
                }}
                className="flex items-center gap-2 text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors duration-200 group"
              >
                <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform duration-200" />
                <span className="text-sm font-medium">Voltar</span>
              </button>
              
              <div className="h-4 w-px bg-[color:var(--border)]" />
              
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/30 to-blue-500/30 flex items-center justify-center border border-[color:var(--border)]">
                  <span className="text-sm font-semibold text-[color:var(--text-primary)]">
                    {lead.nome_lead.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                  </span>
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-[color:var(--text-primary)]">{lead.nome_lead}</h1>
                  <p className="text-sm text-[color:var(--text-secondary)]">ID: {lead.id_lead}</p>
                </div>
              </div>
            </div>

            {/* Ações */}
            <div className="flex items-center gap-3">
              <span className="px-3 py-1.5 rounded-md text-xs font-medium bg-[color:var(--bg-card)] text-[color:var(--text-secondary)] border border-[color:var(--border)]">
                {lead.etapa_atual || 'Status não informado'}
              </span>
              {lead.status_temperatura && (
                <span className={`px-3 py-1.5 rounded-md text-xs font-medium bg-[color:var(--bg-card)] border border-[color:var(--border)] ${getTemperatureColor(lead.status_temperatura)}`}>
                  <Thermometer className="h-3 w-3 inline mr-1" />
                  {lead.status_temperatura}
                </span>
              )}
              
              {/* Botão Atender via WhatsApp */}
              {lead.telefone && (
                <Button
                  onClick={async () => {
                    try {
                      
                      // Atualizar lead: assumir e marcar como contatado
                      await updateLead(lead.id_lead, {
                        etapa_atual: 'Interação',
                        corretor_responsavel: currentCorretor || 'Administrador'
                      });
                      
                      // Formatar número de telefone
                      const phoneNumber = lead.telefone?.replace(/\D/g, '') || '';
                      
                      // Mensagem padrão
                      const message = `Olá ${lead.nome_lead}! Aqui é ${currentCorretor || 'da Imobiliária'}. Vi seu interesse e gostaria de conversar com você sobre imóveis. Podemos conversar?`;
                      
                      // Abrir WhatsApp
                      const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
                      window.open(whatsappUrl, '_blank');
                      
                      toast({
                        title: "WhatsApp aberto!",
                        description: `Lead #${lead.id_lead} atribuído a você.`,
                      });
                      
                      // Recarregar após 2 segundos
                      setTimeout(() => window.location.reload(), 2000);
                      
                    } catch (error) {
                      console.error('❌ Erro ao contatar lead:', error);
                      toast({
                        title: "Erro ao contatar lead",
                        description: "Não foi possível abrir o WhatsApp. Verifique o número do lead.",
                        variant: "destructive"
                      });
                    }
                  }}
                  className="px-4 py-1.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-md flex items-center gap-2 text-xs font-medium transition-all duration-200"
                >
                  <MessageCircle className="h-3 w-3" />
                  Atender via WhatsApp
                </Button>
              )}
              
              {/* Botão Assumir Lead */}
              <Button
                onClick={async () => {
                  try {
                    
                    // Atualizar lead no Supabase
                    await updateLead(lead.id_lead, {
                      etapa_atual: 'Interação',
                      corretor_responsavel: currentCorretor || 'Administrador'
                    });
                    
                    toast({
                      title: "Lead assumido!",
                      description: `Lead #${lead.id_lead} foi atribuído a você com sucesso.`,
                    });
                    
                    // Recarregar após 1.5 segundos
                    setTimeout(() => window.location.reload(), 1500);
                    
                  } catch (error) {
                    console.error('❌ Erro ao assumir lead:', error);
                    toast({
                      title: "Erro ao assumir lead",
                      description: "Não foi possível assumir o lead. Tente novamente.",
                      variant: "destructive"
                    });
                  }
                }}
                variant="outline"
                className="px-4 py-1.5 border-purple-500/50 text-purple-400 hover:bg-purple-500/10 rounded-md flex items-center gap-2 text-xs font-medium transition-all duration-200"
              >
                <ArrowRight className="h-3 w-3" />
                Assumir Lead
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Navegação por tabs - Movida para cima */}
      <div className="sticky top-[73px] z-30 bg-[color:var(--bg-primary)]/95 backdrop-blur-md border-b border-[color:var(--border)] ml-0">
        <div className="px-6 py-3">
          <div className="flex gap-1">
            {[
              { id: 'geral', label: 'Informações Gerais', icon: User },
              { id: 'conversa', label: 'Conversa', icon: MessageCircle },
              { id: 'imovel', label: 'Imóvel', icon: Building2 },
              { id: 'historico', label: 'Histórico', icon: Clock }
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200
                    ${isActive 
                      ? 'bg-[color:var(--bg-hover)] text-[color:var(--text-primary)]' 
                      : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-card)]'
                    }
                  `}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Conteúdo principal - Alinhado à esquerda */}
      <div className="px-6 py-6">
        
        {/* Tab: Informações Gerais */}
        {activeTab === 'geral' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            
            {/* Seção: Informações Básicas */}
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-[color:var(--text-primary)] flex items-center gap-2">
                <User className="h-5 w-5 text-[color:var(--text-secondary)]" />
                Informações Básicas
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Contato */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-[color:var(--text-secondary)]" />
                    <div>
                      <p className="text-sm text-[color:var(--text-secondary)]">Telefone</p>
                      <p className="text-sm font-medium text-[color:var(--text-primary)]">{lead.telefone || 'Não informado'}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-[color:var(--text-secondary)]" />
                    <div>
                      <p className="text-sm text-[color:var(--text-secondary)]">Origem</p>
                      <p className="text-sm font-medium text-[color:var(--text-primary)]">{lead.origem_lead || 'Não informado'}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-[color:var(--text-secondary)]" />
                    <div>
                      <p className="text-sm text-[color:var(--text-secondary)]">Data de Entrada</p>
                      <p className="text-sm font-medium text-[color:var(--text-primary)]">{formatDate(lead.data_entrada)}</p>
                    </div>
                  </div>
                </div>

                {/* Corretor */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-[color:var(--text-secondary)]" />
                    <div>
                      <p className="text-sm text-[color:var(--text-secondary)]">Corretor Responsável</p>
                      <p className="text-sm font-medium text-[color:var(--text-primary)]">{lead.corretor_responsavel || 'Não atribuído'}</p>
                    </div>
                  </div>
                  
                  {lead.tipo_lead && (
                    <div className="flex items-center gap-3">
                      <Tag className="h-4 w-4 text-[color:var(--text-secondary)]" />
                      <div>
                        <p className="text-sm text-[color:var(--text-secondary)]">Tipo de Lead</p>
                        <p className="text-sm font-medium text-[color:var(--text-primary)]">{lead.tipo_lead}</p>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-3">
                    <TrendingUp className="h-4 w-4 text-[color:var(--text-secondary)]" />
                    <div>
                      <p className="text-sm text-[color:var(--text-secondary)]">Etapa Atual</p>
                      <p className="text-sm font-medium text-[color:var(--text-primary)]">{lead.etapa_atual || 'Não informado'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Seção: Imóvel */}
            {(lead.codigo_imovel || lead.valor_imovel || lead.tipo_negocio) && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-[color:var(--text-primary)] flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-[color:var(--text-secondary)]" />
                  Informações do Imóvel
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {lead.codigo_imovel && (
                    <div className="flex items-center gap-3">
                      <Tag className="h-4 w-4 text-[color:var(--text-secondary)]" />
                      <div>
                        <p className="text-sm text-[color:var(--text-secondary)]">Código do Imóvel</p>
                        <p className="text-sm font-medium text-[color:var(--text-primary)]">{lead.codigo_imovel}</p>
                      </div>
                    </div>
                  )}
                  
                  {lead.valor_imovel && lead.valor_imovel > 0 && (
                    <div className="flex items-center gap-3">
                      <DollarSign className="h-4 w-4 text-green-500" />
                      <div>
                        <p className="text-sm text-[color:var(--text-secondary)]">Valor do Imóvel</p>
                        <p className="text-sm font-semibold text-green-500">{formatCurrency(lead.valor_imovel)}</p>
                      </div>
                    </div>
                  )}
                  
                  {lead.tipo_negocio && (
                    <div className="flex items-center gap-3">
                      <Briefcase className="h-4 w-4 text-[color:var(--text-secondary)]" />
                      <div>
                        <p className="text-sm text-[color:var(--text-secondary)]">Tipo de Negócio</p>
                        <p className="text-sm font-medium text-[color:var(--text-primary)]">{lead.tipo_negocio}</p>
                      </div>
                    </div>
                  )}
                  
                  {lead.link_imovel && (
                    <div className="flex items-center gap-3">
                      <a
                        href={lead.link_imovel}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-blue-500 hover:text-blue-600 transition-colors duration-200"
                      >
                        <Home className="h-4 w-4" />
                        <span className="text-sm font-medium">Ver Imóvel Online</span>
                        <ChevronRight className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Seção: Preferências */}
            {lead.Preferencias_lead && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-[color:var(--text-primary)] flex items-center gap-2">
                  <FileText className="h-5 w-5 text-[color:var(--text-secondary)]" />
                  Preferências do Lead
                </h2>
                
                <div className="flex flex-wrap gap-2">
                  {parsePreferences(lead.Preferencias_lead).map((pref, index) => (
                    <span
                      key={index}
                      className="px-3 py-1.5 rounded-md text-xs font-medium bg-[color:var(--bg-card)] text-[color:var(--text-secondary)] border border-[color:var(--border)]"
                    >
                      {pref}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Seção: Observações */}
            {lead.observacoes && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-[color:var(--text-primary)] flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-[color:var(--text-secondary)]" />
                  Observações
                </h2>
                
                <div className="bg-[color:var(--bg-card)] rounded-lg p-4 border border-[color:var(--border)]">
                  <p className="text-sm text-[color:var(--text-primary)] leading-relaxed whitespace-pre-wrap">{lead.observacoes}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Conversa */}
        {activeTab === 'conversa' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <h2 className="text-lg font-semibold text-[color:var(--text-primary)] flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-[color:var(--text-secondary)]" />
              Conversa com LIA
            </h2>
            
            <div className="bg-[color:var(--bg-chat)] rounded-lg border border-[color:var(--border)] overflow-hidden">
              <div className="p-6 min-h-[500px] max-h-[600px] overflow-y-auto">
                {chatMessages.length > 0 ? (
                  <div className="space-y-4">
                    {chatMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.sender === 'LIA' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[75%] px-4 py-3 rounded-2xl ${
                            msg.sender === 'LIA'
                              ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-br-sm'
                              : 'bg-[color:var(--bg-hover)] text-[color:var(--text-primary)] rounded-bl-sm border border-[color:var(--border)]'
                          }`}
                        >
                          <p className="text-sm leading-relaxed mb-1">{msg.message}</p>
                          <div className={`flex ${msg.sender === 'LIA' ? 'justify-end' : 'justify-start'}`}>
                            <span className={`text-xs opacity-75 ${
                              msg.sender === 'LIA' ? 'text-blue-100' : 'text-[color:var(--text-secondary)]'
                            }`}>
                              {msg.timestamp?.toLocaleTimeString('pt-BR', { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-[color:var(--text-secondary)]">
                    <div className="text-center">
                      <MessageCircle className="h-16 w-16 mx-auto mb-4 opacity-30" />
                      <p className="text-lg font-medium">Nenhuma conversa registrada</p>
                      <p className="text-sm mt-2 opacity-75">As conversas aparecerão aqui quando disponíveis</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab: Imóvel */}
        {activeTab === 'imovel' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Card Principal do Imóvel - Destaque para o Link */}
            <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-xl p-6 border border-[color:var(--border)]">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center border border-blue-500/30">
                    <Building2 className="h-6 w-6 text-blue-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-[color:var(--text-primary)]">Informações do Imóvel</h2>
                    <p className="text-sm text-[color:var(--text-secondary)] mt-1">
                      {lead.codigo_imovel ? `Código: ${lead.codigo_imovel}` : 'Detalhes completos do imóvel'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Link do Imóvel - SEMPRE VISÍVEL */}
              {(() => {
                const imovelLink = getImovelLink(lead.codigo_imovel);
                return (
                  <a
                    href={imovelLink || 'https://imobiliariajapi.com.br'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-4 bg-[color:var(--bg-card)] hover:bg-[color:var(--bg-hover)] rounded-lg border border-[color:var(--border)] hover:border-blue-500/50 transition-all duration-200 group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center border border-blue-500/30 group-hover:bg-blue-500/30 transition-all duration-200">
                        <ExternalLink className="h-5 w-5 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[color:var(--text-primary)] group-hover:text-blue-500 transition-colors">
                          {lead.codigo_imovel ? 'Ver Imóvel no Site' : 'Visitar Imobiliária JAPI'}
                        </p>
                        <p className="text-xs text-[color:var(--text-secondary)] group-hover:text-[color:var(--text-primary)] transition-colors mt-0.5">
                          {imovelLink || 'https://imobiliariajapi.com.br'}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-blue-500 group-hover:translate-x-1 transition-transform duration-200" />
                  </a>
                );
              })()}
            </div>

            {/* Grid de Informações */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Informações Básicas */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider mb-4">Informações Básicas</h3>
                
                <div className="bg-[color:var(--bg-card)] rounded-lg border border-[color:var(--border)] divide-y divide-[color:var(--border)]">
                  {lead.codigo_imovel && (
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-[color:var(--text-secondary)]" />
                        <span className="text-sm text-[color:var(--text-secondary)]">Código</span>
                      </div>
                      <span className="text-sm font-medium text-[color:var(--text-primary)]">{lead.codigo_imovel}</span>
                    </div>
                  )}
                  
                  {lead.tipo_negocio && (
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4 text-[color:var(--text-secondary)]" />
                        <span className="text-sm text-[color:var(--text-secondary)]">Tipo de Negócio</span>
                      </div>
                      <span className="text-sm font-medium text-[color:var(--text-primary)]">{lead.tipo_negocio}</span>
                    </div>
                  )}
                  
                  {lead.valor_imovel && lead.valor_imovel > 0 && (
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-green-500" />
                        <span className="text-sm text-[color:var(--text-secondary)]">Valor</span>
                      </div>
                      <span className="text-sm font-semibold text-green-500">{formatCurrency(lead.valor_imovel)}</span>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-2">
                      <Home className="h-4 w-4 text-[color:var(--text-secondary)]" />
                      <span className="text-sm text-[color:var(--text-secondary)]">Imóvel Visitado</span>
                    </div>
                    <span className={`px-3 py-1 rounded-md text-xs font-medium ${
                      lead.Imovel_visitado === 'Sim' 
                        ? 'bg-green-500/20 text-green-500 border border-green-500/30'
                        : 'bg-gray-500/20 text-gray-500 border border-gray-500/30'
                    }`}>
                      {lead.Imovel_visitado || 'Não'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Agendamentos e Status */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider mb-4">Agendamentos & Status</h3>
                
                {/* Visita Agendada */}
                {lead.Data_visita ? (
                  <div className="bg-blue-500/10 rounded-lg p-5 border border-blue-500/20">
                    <div className="flex items-center gap-2 mb-3">
                      <Calendar className="h-5 w-5 text-blue-500" />
                      <h4 className="text-sm font-semibold text-blue-500">Visita Agendada</h4>
                    </div>
                    <p className="text-lg font-semibold text-[color:var(--text-primary)]">
                      {new Date(lead.Data_visita).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </p>
                    <p className="text-sm text-[color:var(--text-secondary)] mt-1">
                      às {new Date(lead.Data_visita).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                ) : (
                  <div className="bg-[color:var(--bg-card)] rounded-lg p-5 border border-[color:var(--border)]">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="h-5 w-5 text-[color:var(--text-secondary)] opacity-50" />
                      <h4 className="text-sm font-medium text-[color:var(--text-secondary)]">Nenhuma Visita Agendada</h4>
                    </div>
                    <p className="text-xs text-[color:var(--text-secondary)]">Agende uma visita para este imóvel</p>
                  </div>
                )}

                {/* Venda Concluída */}
                {lead.valor_final_venda && lead.valor_final_venda > 0 ? (
                  <div className="bg-green-500/10 rounded-lg p-5 border border-green-500/20">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="h-5 w-5 text-green-500" />
                      <h4 className="text-sm font-semibold text-green-500">Venda Concluída</h4>
                    </div>
                    <p className="text-2xl font-bold text-green-500">
                      {formatCurrency(lead.valor_final_venda)}
                    </p>
                    {lead.data_finalizacao && (
                      <p className="text-sm text-[color:var(--text-secondary)] mt-2">
                        Finalizado em {formatDate(lead.data_finalizacao)}
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Preferências do Lead (se houver) */}
            {lead.Preferencias_lead && parsePreferences(lead.Preferencias_lead).length > 0 && (
              <div className="bg-[color:var(--bg-card)] rounded-lg p-5 border border-[color:var(--border)]">
                <h3 className="text-sm font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider mb-4">Preferências do Cliente</h3>
                <div className="flex flex-wrap gap-2">
                  {parsePreferences(lead.Preferencias_lead).map((pref, index) => (
                    <span
                      key={index}
                      className="px-3 py-1.5 rounded-md text-xs font-medium bg-purple-500/10 text-purple-500 border border-purple-500/20"
                    >
                      {pref}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Histórico */}
        {activeTab === 'historico' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <h2 className="text-lg font-semibold text-[color:var(--text-primary)] flex items-center gap-2">
              <Clock className="h-5 w-5 text-[color:var(--text-secondary)]" />
              Linha do Tempo
            </h2>
            
            <div className="space-y-6">
              <div className="relative pl-8 space-y-6">
                <div className="absolute left-3 top-0 bottom-0 w-px bg-gradient-to-b from-blue-500 via-purple-500 to-pink-500" />
                
                {(() => {
                  // Função helper para determinar ícone e cor baseado no tipo de ação
                  const getEventStyle = (type: string) => {
                    switch (type) {
                      case 'mudanca_etapa':
                        return { icon: TrendingUp, color: 'text-purple-500', bg: 'bg-purple-500', border: 'border-purple-500/20' };
                      case 'mudanca_corretor':
                        return { icon: User, color: 'text-blue-500', bg: 'bg-blue-500', border: 'border-blue-500/20' };
                      case 'agendamento_visita':
                        return { icon: Home, color: 'text-green-500', bg: 'bg-green-500', border: 'border-green-500/20' };
                      case 'finalizacao':
                        return { icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-600', border: 'border-emerald-600/20' };
                      case 'arquivamento':
                        return { icon: FileText, color: 'text-red-500', bg: 'bg-red-500', border: 'border-red-500/20' };
                      case 'lead_criado':
                        return { icon: Calendar, color: 'text-blue-500', bg: 'bg-blue-500', border: 'border-blue-500/20' };
                      default:
                        return { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-500', border: 'border-gray-500/20' };
                    }
                  };

                  // 1. Evento Inicial: Criação do Lead
                  const events = [
                    {
                      id: 'creation',
                      date: new Date(lead.data_entrada),
                      type: 'lead_criado',
                      title: 'Lead Criado',
                      description: `Entrada via ${lead.origem_lead || 'Sistema'}`,
                      user: 'Sistema'
                    }
                  ];

                  // 2. Adicionar logs do histórico dinâmico
                  historyLogs.forEach(log => {
                    events.push({
                      id: log.id,
                      date: new Date(log.created_at),
                      type: log.action_type,
                      title: log.action_type === 'mudanca_etapa' ? 'Mudança de Etapa' :
                             log.action_type === 'mudanca_corretor' ? 'Troca de Corretor' :
                             log.action_type === 'agendamento_visita' ? 'Visita Agendada' :
                             log.action_type === 'finalizacao' ? 'Venda Concluída' :
                             log.action_type === 'arquivamento' ? 'Lead Arquivado' : 'Atualização',
                      description: log.description,
                      user: log.created_by
                    });
                  });

                  // 3. Adicionar eventos estáticos SE não houver logs correspondentes recentes (para compatibilidade retroativa)
                  // Visita (se não tiver log de visita)
                  const hasVisitLog = historyLogs.some(l => l.action_type === 'agendamento_visita');
                  if (lead.Data_visita && !hasVisitLog) {
                    events.push({
                      id: 'static_visit',
                      date: new Date(lead.Data_visita),
                      type: 'agendamento_visita',
                      title: 'Visita Agendada',
                      description: 'Visita agendada (registro anterior)',
                      user: 'Sistema'
                    });
                  }

                  // Finalização (se não tiver log)
                  const hasFinalizationLog = historyLogs.some(l => l.action_type === 'finalizacao');
                  if (lead.data_finalizacao && !hasFinalizationLog) {
                    events.push({
                      id: 'static_final',
                      date: new Date(lead.data_finalizacao),
                      type: 'finalizacao',
                      title: 'Lead Finalizado',
                      description: lead.valor_final_venda ? `Venda: ${formatCurrency(lead.valor_final_venda)}` : 'Processo finalizado',
                      user: 'Sistema'
                    });
                  }

                  // Arquivamento (se não tiver log)
                  const hasArchiveLog = historyLogs.some(l => l.action_type === 'arquivamento');
                  if (lead.Arquivamento === 'Sim' && !hasArchiveLog) {
                    events.push({
                      id: 'static_archive',
                      date: new Date(), // Sem data específica no modelo antigo, usa atual ou deixa no fim
                      type: 'arquivamento',
                      title: 'Lead Arquivado',
                      description: lead.motivo_arquivamento ? `Motivo: ${lead.motivo_arquivamento}` : 'Lead arquivado',
                      user: 'Sistema'
                    });
                  }

                  // Ordenar por data (Mais antigo primeiro -> Mais recente por último)
                  events.sort((a, b) => a.date.getTime() - b.date.getTime());

                  return events.map((event, index) => {
                    const style = getEventStyle(event.type);
                    const Icon = style.icon;

                    return (
                      <div key={event.id} className="relative animate-in slide-in-from-left-2 duration-300" style={{ animationDelay: `${index * 100}ms` }}>
                        <div className={`absolute left-[-2rem] w-6 h-6 ${style.bg} rounded-full border-4 border-[color:var(--bg-primary)] flex items-center justify-center z-10`}>
                          <Icon className="h-3 w-3 text-white" />
                        </div>
                        <div className={`bg-[color:var(--bg-card)] rounded-lg p-4 border border-[color:var(--border)] hover:border-opacity-50 transition-all duration-200`}>
                          <div className="flex justify-between items-start mb-1">
                            <p className={`${style.color} font-medium text-sm`}>{event.title}</p>
                            <span className="text-[10px] text-[color:var(--text-secondary)] bg-[color:var(--bg-primary)] px-2 py-0.5 rounded-full border border-[color:var(--border)]">
                              {event.date.toLocaleDateString('pt-BR')} {event.date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-[color:var(--text-primary)] text-sm">{event.description}</p>
                          {event.user && event.user !== 'Sistema' && (
                            <p className="text-[color:var(--text-secondary)] text-xs mt-2 flex items-center gap-1">
                              <User className="h-3 w-3" />
                              Atualizado por: {event.user}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
              
              {isLoadingHistory && (
                <div className="flex justify-center py-4">
                  <OctoDashLoader message="Carregando histórico..." size="sm" />
                </div>
              )}
              
              {!isLoadingHistory && historyLogs.length === 0 && (
                <div className="text-center py-8 text-[color:var(--text-secondary)] bg-[color:var(--bg-card)] rounded-lg border border-[color:var(--border)] border-dashed">
                  <p>O histórico detalhado começará a aparecer aqui conforme as atualizações ocorrerem.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );

  // Renderizar com sidebar customizada que navega corretamente
  return (
    <div className="min-h-screen flex overflow-hidden max-w-full" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Sidebar */}
      <AppSidebar
        activeSection={currentSection}
        onSectionChange={handleSidebarSectionChange}
        onCollapseChange={setSidebarCollapsed}
        activeClienteInteressadoSubSection={activeClienteInteressadoSubSection}
        onClienteInteressadoSubSectionChange={handleClienteInteressadoSubSectionChange}
        activeClienteProprietarioSubSection={activeClienteProprietarioSubSection}
        onClienteProprietarioSubSectionChange={handleClienteProprietarioSubSectionChange}
        activeCorretoresSubSection={activeCorretoresSubSection}
        onCorretoresSubSectionChange={handleCorretoresSubSectionChange}
      />
      
      {/* Conteúdo principal */}
      <main 
        className={`
          flex-1 overflow-hidden
          transition-all duration-300 ease-out
          ${sidebarCollapsed ? 'md:ml-0' : 'md:ml-[260px]'}
        `}
        style={{ willChange: 'margin-left' }}
      >
        <div className="w-full h-full overflow-y-auto overflow-x-hidden">
          <div className="w-full max-w-[1920px] mx-auto">
            {renderContent()}
          </div>
        </div>
      </main>
    </div>
  );
};


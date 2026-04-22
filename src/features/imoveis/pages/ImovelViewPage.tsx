import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { parseConversation } from '@/utils/conversationParser';
import { OctoDashLoader } from '@/components/ui/OctoDashLoader';
import { AppSidebar } from '@/components/AppSidebar';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, 
  Building2, 
  DollarSign, 
  MapPin,
  Calendar, 
  Tag,
  User,
  Home,
  MessageCircle,
  Phone,
  TrendingUp,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useLeadsData } from '@/features/leads/hooks/useLeadsData';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from '@/utils/dateUtils';

type TabType = 'geral' | 'lead' | 'detalhes';

export const ImovelViewPage = () => {
  const navigate = useNavigate();
  const { codigo } = useParams<{ codigo: string }>();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as TabType | null;
  const [activeTab, setActiveTab] = useState<TabType>(tabParam || 'geral');
  const { leads, isLoading } = useLeadsData();
  const { currentCorretor } = useAuth();
  
  // Inicializar tema
  useTheme();

  // Estado para controlar as seções da sidebar
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentSection, setCurrentSection] = useState<'cliente-interessado' | 'cliente-proprietario' | 'corretores' | 'imoveis' | 'configuracoes'>('imoveis');
  const [activeClienteInteressadoSubSection, setActiveClienteInteressadoSubSection] = useState<'geral' | 'pre-atendimento' | 'bolsao' | 'atendimento'>('geral');
  const [activeClienteProprietarioSubSection, setActiveClienteProprietarioSubSection] = useState<'cliente-proprietario' | 'estudo-mercado'>('cliente-proprietario');
  const [activeCorretoresSubSection, setActiveCorretoresSubSection] = useState<'meus-leads' | 'bolsao-imoveis' | 'estudo-mercado'>('meus-leads');

  // Função para lidar com mudança de seção na sidebar
  const handleSidebarSectionChange = (section: 'cliente-interessado' | 'cliente-proprietario' | 'corretores' | 'imoveis' | 'configuracoes') => {
    localStorage.setItem('selectedSection', section);
    localStorage.setItem('selectedClienteInteressadoSubSection', activeClienteInteressadoSubSection);
    localStorage.setItem('selectedClienteProprietarioSubSection', activeClienteProprietarioSubSection);
    localStorage.setItem('selectedCorretoresSubSection', activeCorretoresSubSection);
    
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
  
  // Encontrar o imóvel (lead) pelo código
  const imovel = leads.find(l => l.codigo_imovel === codigo);

  // Atualizar tab quando mudar o parâmetro da URL
  useEffect(() => {
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  useEffect(() => {
    if (!isLoading && leads.length > 0 && !imovel) {
      navigate('/', { replace: true });
    }
  }, [imovel, isLoading, leads.length, navigate]);

  if (isLoading && leads.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <OctoDashLoader message="Carregando imóvel..." size="lg" />
      </div>
    );
  }

  if (!imovel) {
    return null;
  }

  const chatMessages = parseConversation(imovel);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric' 
    });
  };

  // Função para gerar o link do imóvel
  const getImovelLink = (codigoImovel?: string) => {
    if (!codigoImovel || codigoImovel.trim() === '') {
      return null;
    }
    const cleanCode = codigoImovel.trim().replace(/\s+/g, '-');
    return `https://imobiliariajapi.com.br/imovel/${cleanCode}`;
  };

  // Renderizar conteúdo
  const renderContent = () => (
    <div className="min-h-screen bg-bg-primary">
      {/* Header destacado com NOME DO LEAD + CÓDIGO DO IMÓVEL */}
      <div className="sticky top-0 z-40 bg-bg-primary/95 backdrop-blur-md border-b border-white/[0.05] ml-0">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 text-white/60 hover:text-white/80 transition-colors duration-200 group"
              >
                <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform duration-200" />
                <span className="text-sm font-medium">Voltar</span>
              </button>
              
              <div className="h-4 w-px bg-white/10" />
              
              {/* DESTAQUE: Nome do Lead + Código do Imóvel */}
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 flex items-center justify-center border border-white/10">
                  <Building2 className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white/90 flex items-center gap-3">
                    {imovel.nome_lead}
                    <span className="text-blue-400">•</span>
                    <span className="text-blue-400 font-mono">{imovel.codigo_imovel}</span>
                  </h1>
                  <p className="text-sm text-white/40 mt-1">
                    Lead #{imovel.id_lead} • Imóvel {imovel.tipo_negocio || 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            {/* Link para ver imóvel */}
            <div className="flex items-center gap-3">
              {imovel.codigo_imovel && (
                <a
                  href={getImovelLink(imovel.codigo_imovel) || 'https://imobiliariajapi.com.br'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-md flex items-center gap-2 text-sm font-medium transition-all duration-200"
                >
                  <ExternalLink className="h-4 w-4" />
                  Ver Imóvel Online
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Navegação por tabs */}
      <div className="sticky top-[73px] z-30 bg-bg-primary/95 backdrop-blur-md border-b border-white/[0.05] ml-0">
        <div className="px-6 py-3">
          <div className="flex gap-1">
            {[
              { id: 'geral', label: 'Informações Gerais', icon: Building2 },
              { id: 'lead', label: 'Dados do Lead', icon: User },
              { id: 'detalhes', label: 'Detalhes do Imóvel', icon: Home }
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
                      ? 'bg-white/10 text-white' 
                      : 'text-white/40 hover:text-white/60 hover:bg-white/5'
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

      {/* Conteúdo principal */}
      <div className="px-6 py-6">
        
        {/* Tab: Informações Gerais */}
        {activeTab === 'geral' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            
            {/* Card Principal do Imóvel */}
            <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-xl p-6 border border-white/10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Informações Principais */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">Dados do Imóvel</h3>
                  
                  {imovel.codigo_imovel && (
                    <div className="flex items-center gap-3">
                      <Tag className="h-5 w-5 text-blue-400" />
                      <div>
                        <p className="text-sm text-white/40">Código</p>
                        <p className="text-lg font-bold text-white/90 font-mono">{imovel.codigo_imovel}</p>
                      </div>
                    </div>
                  )}
                  
                  {imovel.valor_imovel && imovel.valor_imovel > 0 && (
                    <div className="flex items-center gap-3">
                      <DollarSign className="h-5 w-5 text-green-400" />
                      <div>
                        <p className="text-sm text-white/40">Valor</p>
                        <p className="text-2xl font-bold text-green-400">{formatCurrency(imovel.valor_imovel)}</p>
                      </div>
                    </div>
                  )}
                  
                  {imovel.tipo_negocio && (
                    <div className="flex items-center gap-3">
                      <TrendingUp className="h-5 w-5 text-purple-400" />
                      <div>
                        <p className="text-sm text-white/40">Tipo de Negócio</p>
                        <p className="text-lg font-medium text-white/90">{imovel.tipo_negocio}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Lead Interessado */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">Lead Interessado</h3>
                  
                  <div className="flex items-center gap-3">
                    <User className="h-5 w-5 text-white/40" />
                    <div>
                      <p className="text-sm text-white/40">Nome</p>
                      <p className="text-lg font-semibold text-white/90">{imovel.nome_lead}</p>
                    </div>
                  </div>
                  
                  {imovel.telefone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-5 w-5 text-green-400" />
                      <div>
                        <p className="text-sm text-white/40">Telefone</p>
                        <p className="text-lg font-medium text-white/90">{imovel.telefone}</p>
                      </div>
                    </div>
                  )}
                  
                  {imovel.corretor_responsavel && (
                    <div className="flex items-center gap-3">
                      <User className="h-5 w-5 text-blue-400" />
                      <div>
                        <p className="text-sm text-white/40">Corretor</p>
                        <p className="text-lg font-medium text-white/90">{imovel.corretor_responsavel}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Descrição do Imóvel */}
            {imovel.Descrição_do_imovel && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white/90 flex items-center gap-2">
                  <Home className="h-5 w-5 text-white/40" />
                  Descrição do Imóvel
                </h2>
                
                <div className="bg-white/[0.02] rounded-lg p-4 border border-white/[0.05]">
                  <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{imovel.Descrição_do_imovel}</p>
                </div>
              </div>
            )}

            {/* Observações */}
            {imovel.observacoes && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white/90 flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-white/40" />
                  Observações
                </h2>
                
                <div className="bg-white/[0.02] rounded-lg p-4 border border-white/[0.05]">
                  <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{imovel.observacoes}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Dados do Lead */}
        {activeTab === 'lead' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <h2 className="text-lg font-semibold text-white/90 flex items-center gap-2">
              <User className="h-5 w-5 text-white/40" />
              Dados do Lead
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white/[0.02] rounded-lg p-5 border border-white/[0.05] space-y-4">
                <div>
                  <p className="text-sm text-white/40">Nome Completo</p>
                  <p className="text-lg font-semibold text-white/90 mt-1">{imovel.nome_lead}</p>
                </div>
                
                {imovel.telefone && (
                  <div>
                    <p className="text-sm text-white/40">Telefone</p>
                    <p className="text-lg font-medium text-white/90 mt-1">{imovel.telefone}</p>
                  </div>
                )}
                
                {imovel.origem_lead && (
                  <div>
                    <p className="text-sm text-white/40">Origem</p>
                    <p className="text-lg font-medium text-white/90 mt-1">{imovel.origem_lead}</p>
                  </div>
                )}
              </div>

              <div className="bg-white/[0.02] rounded-lg p-5 border border-white/[0.05] space-y-4">
                {imovel.data_entrada && (
                  <div>
                    <p className="text-sm text-white/40">Data de Entrada</p>
                    <p className="text-lg font-medium text-white/90 mt-1">{formatDate(imovel.data_entrada)}</p>
                  </div>
                )}
                
                {imovel.etapa_atual && (
                  <div>
                    <p className="text-sm text-white/40">Etapa Atual</p>
                    <p className="text-lg font-medium text-white/90 mt-1">{imovel.etapa_atual}</p>
                  </div>
                )}
                
                {imovel.status_temperatura && (
                  <div>
                    <p className="text-sm text-white/40">Temperatura</p>
                    <p className="text-lg font-medium text-white/90 mt-1">{imovel.status_temperatura}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab: Detalhes do Imóvel */}
        {activeTab === 'detalhes' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <h2 className="text-lg font-semibold text-white/90 flex items-center gap-2">
              <Home className="h-5 w-5 text-white/40" />
              Detalhes Completos do Imóvel
            </h2>

            {/* Link do Imóvel - SEMPRE VISÍVEL */}
            {(() => {
              const imovelLink = getImovelLink(imovel.codigo_imovel);
              return (
                <a
                  href={imovelLink || 'https://imobiliariajapi.com.br'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 hover:border-blue-400/50 transition-all duration-200 group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center border border-blue-500/30 group-hover:bg-blue-500/30 transition-all duration-200">
                      <ExternalLink className="h-5 w-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white/90 group-hover:text-white transition-colors">
                        {imovel.codigo_imovel ? 'Ver Imóvel no Site' : 'Visitar Imobiliária JAPI'}
                      </p>
                      <p className="text-xs text-white/50 group-hover:text-white/70 transition-colors mt-0.5">
                        {imovelLink || 'https://imobiliariajapi.com.br'}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-blue-400 group-hover:translate-x-1 transition-transform duration-200" />
                </a>
              );
            })()}

            {/* Grid de Informações Detalhadas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white/[0.02] rounded-lg border border-white/[0.05] divide-y divide-white/[0.05]">
                {imovel.codigo_imovel && (
                  <div className="flex items-center justify-between p-4">
                    <span className="text-sm text-white/60">Código</span>
                    <span className="text-sm font-medium text-white/90 font-mono">{imovel.codigo_imovel}</span>
                  </div>
                )}
                
                {imovel.tipo_negocio && (
                  <div className="flex items-center justify-between p-4">
                    <span className="text-sm text-white/60">Tipo de Negócio</span>
                    <span className="text-sm font-medium text-white/90">{imovel.tipo_negocio}</span>
                  </div>
                )}
                
                {imovel.valor_imovel && imovel.valor_imovel > 0 && (
                  <div className="flex items-center justify-between p-4">
                    <span className="text-sm text-white/60">Valor</span>
                    <span className="text-sm font-semibold text-green-400">{formatCurrency(imovel.valor_imovel)}</span>
                  </div>
                )}
                
                <div className="flex items-center justify-between p-4">
                  <span className="text-sm text-white/60">Imóvel Visitado</span>
                  <span className={`px-3 py-1 rounded-md text-xs font-medium ${
                    imovel.Imovel_visitado === 'Sim' 
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                  }`}>
                    {imovel.Imovel_visitado || 'Não'}
                  </span>
                </div>
              </div>

              <div className="bg-white/[0.02] rounded-lg border border-white/[0.05] divide-y divide-white/[0.05]">
                {imovel.Data_visita && (
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="h-4 w-4 text-blue-400" />
                      <span className="text-sm text-white/60">Data da Visita</span>
                    </div>
                    <p className="text-sm font-medium text-white/90">
                      {new Date(imovel.Data_visita).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                )}

                {imovel.valor_final_venda && imovel.valor_final_venda > 0 && (
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-green-400" />
                      <span className="text-sm text-white/60">Valor Final da Venda</span>
                    </div>
                    <p className="text-lg font-bold text-green-400">
                      {formatCurrency(imovel.valor_final_venda)}
                    </p>
                  </div>
                )}

                {imovel.data_finalizacao && (
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="h-4 w-4 text-purple-400" />
                      <span className="text-sm text-white/60">Data de Finalização</span>
                    </div>
                    <p className="text-sm font-medium text-white/90">{formatDate(imovel.data_finalizacao)}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Preferências do Lead */}
            {imovel.Preferencias_lead && (
              <div className="bg-white/[0.02] rounded-lg p-5 border border-white/[0.05]">
                <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">Preferências do Cliente</h3>
                <div className="flex flex-wrap gap-2">
                  {imovel.Preferencias_lead.split(',').map((pref, index) => (
                    <span
                      key={index}
                      className="px-3 py-1.5 rounded-md text-xs font-medium bg-purple-500/10 text-purple-300 border border-purple-500/20"
                    >
                      {pref.trim()}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );

  // Renderizar com sidebar
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


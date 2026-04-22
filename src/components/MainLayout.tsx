/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * ⚠️ IMPORTANTE: Após QUALQUER alteração neste arquivo, executar:
 * 1. git add .
 * 2. git commit -m "tipo: descrição"
 * 3. git push
 * 
 * Repositório: https://github.com/OctoIA25/Octo-CRM
 */

import React, { useState, useEffect, useMemo, memo } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { useAuth } from "@/hooks/useAuth";
import { ChevronDown, Calendar } from 'lucide-react';
import { FixedSidebar, ClienteInteressadoSubSection, ClienteProprietarioSubSection, CorretoresSubSection, AgentesIaSubSection } from './FixedSidebar';

// Definir o tipo correto para o MainLayout
type SidebarSection = 'leads' | 'meus-leads' | 'cliente-interessado' | 'cliente-proprietario' | 'corretores' | 'corretores-graficos' | 'imoveis' | 'agentes-ia' | 'configuracoes';
import { GestaoSection } from './sections/GestaoSection';
import { LeadSection } from './sections/LeadSection';
import { MeusLeadsSection } from './sections/MeusLeadsSection';
import { BolsaoSection } from './sections/BolsaoSection';
import { ConfiguracoesSection } from './sections/ConfiguracoesSection';
import { EquipeSection } from '@/features/corretores/components/EquipeSection';
import { CaioKotlerChat } from '@/features/agentes-ia/components/CaioKotlerChat';
import { ImoveisPage } from '@/features/imoveis/pages/ImoveisPage';
import { ElaineAgentSection } from '@/features/agentes-ia/components/ElaineAgentSection';

interface MainLayoutProps {
  leads: ProcessedLead[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
  children?: React.ReactNode;
}

export const MainLayout = ({ leads, onRefresh, isRefreshing, children }: MainLayoutProps) => {
  const { isGestao, isCorretor, user } = useAuth();
  const [secondarySidebarOpen, setSecondarySidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    // Recuperar largura salva ou usar padrão
    const saved = localStorage.getItem('sidebarWidth');
    const width = saved ? parseInt(saved) : 80;
    // Garantir que a largura está dentro dos limites
    return Math.max(80, Math.min(280, width));
  });
  
  // SEMPRE iniciar com 'geral' - Padrão do Dashboard
  const [activeClienteInteressadoSubSection, setActiveClienteInteressadoSubSection] = useState<ClienteInteressadoSubSection>('geral');
  const [activeClienteProprietarioSubSection, setActiveClienteProprietarioSubSection] = useState<ClienteProprietarioSubSection>(() => {
    const saved = localStorage.getItem('selectedClienteProprietarioSubSection');
    return (saved as ClienteProprietarioSubSection) || 'cliente-proprietario';
  });
  const [activeCorretoresSubSection, setActiveCorretoresSubSection] = useState<CorretoresSubSection>(() => {
    const saved = localStorage.getItem('selectedCorretoresSubSection');
    return (saved as CorretoresSubSection) || 'meus-leads';
  });
  const [activeAgentesIaSubSection, setActiveAgentesIaSubSection] = useState<AgentesIaSubSection>(() => {
    const saved = localStorage.getItem('selectedAgentesIaSubSection');
    return (saved as AgentesIaSubSection) || 'agente-marketing';
  });
  // Estado compartilhado para sub-abas de Venda (Comprador/Vendedor)
  const [activeVendaSubTab, setActiveVendaSubTab] = useState<'comprador' | 'vendedor'>('comprador');
  // Estado para sub-abas de Proprietários (Vendedor/Locatário)
  const [activeProprietariosSubTab, setActiveProprietariosSubTab] = useState<'vendedor' | 'locatario'>(() => {
    const saved = localStorage.getItem('selectedProprietariosSubTab');
    return (saved as 'vendedor' | 'locatario') || 'vendedor';
  });
  
  // Estado da seção atual - Ler do localStorage ou usar padrão
  const [currentSection, setCurrentSection] = useState<SidebarSection>(() => {
    const saved = localStorage.getItem('selectedSection');
    
    // Validar se é uma seção válida
    const validSections: SidebarSection[] = [
      'leads', 'meus-leads', 'cliente-interessado', 'cliente-proprietario', 'corretores',
      'corretores-graficos', 'imoveis', 'agentes-ia', 'configuracoes'
    ];
    
    if (saved && validSections.includes(saved as SidebarSection)) {
      return saved as SidebarSection;
    }
    
    return 'cliente-interessado';
  });

  // Sincronizar mudanças de seção com localStorage
  useEffect(() => {
    localStorage.setItem('selectedSection', currentSection);
    
    // Debug: mostrar qual componente será renderizado
    if (currentSection === 'corretores') {
    }
  }, [currentSection]);

  const handleLeadMove = (leadId: number, newEtapa: string, newCorretor: string) => {
    // TODO: Implementar a lógica de movimentação do lead
    // Aqui você integraria com a API do Supabase para atualizar o lead
    
    // Por enquanto, apenas log. Na implementação real:
    // 1. Chamar API do Supabase para atualizar o lead
    // 2. Atualizar o estado local dos leads
    // 3. Mostrar feedback visual para o usuário
  };

  // Função para obter o título da seção ativa
  const getSectionTitle = () => {
    // Cliente Interessado: título dinâmico baseado na sub-seção ativa
    if (currentSection === 'cliente-interessado') {
      // Títulos específicos para cada sub-aba
      if (activeClienteInteressadoSubSection === 'geral') {
        return 'Gestão';
      }
      if (activeClienteInteressadoSubSection === 'pre-atendimento') {
        return 'Pré-Atendimento';
      }
      if (activeClienteInteressadoSubSection === 'bolsao') {
        return 'Bolsão de Imóveis';
      }
      if (activeClienteInteressadoSubSection === 'atendimento') {
        return 'Atendimento';
      }
      return 'Clientes Interessados';
    }
    
    // Cliente Proprietário: título baseado na sub-seção
    if (currentSection === 'cliente-proprietario') {
      if (activeClienteProprietarioSubSection === 'estudo-mercado') {
        return 'Estudo de Mercado';
      }
      // Quando está em 'cliente-proprietario', mostrar Visão Geral
      return 'Visão Geral';
    }
    
    const sectionTitles: Record<SidebarSection, string> = {
      'leads': 'Início',
      'meus-leads': 'Meus Leads',
      'cliente-interessado': 'Clientes Interessados',
      'cliente-proprietario': 'Cliente Proprietário',
      'corretores': 'Corretores',
      'corretores-graficos': 'Corretores Gráficos',
      'imoveis': 'Imóveis',
      'agentes-ia': 'Agentes de IA',
      'configuracoes': 'Configurações'
    };
    return sectionTitles[currentSection] || 'Dashboard';
  };

  // Função para obter o subtítulo baseado na sub-aba ativa
  const getSectionSubtitle = () => {
    if (currentSection === 'cliente-interessado') {
      const subTitles: Record<ClienteInteressadoSubSection, string> = {
        'geral': 'Análise completa de leads interessados • Performance de corretores • Funil de conversão • Métricas em tempo real',
        'pre-atendimento': 'Leads aguardando primeiro contato • Priorização por temperatura • Distribuição para corretores',
        'bolsao': 'Leads sem imóvel definido • Oportunidades de captação • Preferências e perfil do cliente',
        'atendimento': 'Leads em atendimento ativo • Histórico de interações • Visitas agendadas • Negociações em andamento'
      };
      return subTitles[activeClienteInteressadoSubSection] || 'Dashboard completo de métricas e análises';
    }
    
    if (currentSection === 'cliente-proprietario') {
      const subTitles: Record<ClienteProprietarioSubSection, string> = {
        'cliente-proprietario': 'Gestão de proprietários • Imóveis captados • Exclusividade • Valor de portfólio',
        'estudo-mercado': 'Análise de mercado • Precificação inteligente • Comparativo de região • Tendências'
      };
      return subTitles[activeClienteProprietarioSubSection] || 'Dashboard completo de métricas e análises';
    }


    if (currentSection === 'corretores') {
      return 'Performance individual • Leads atribuídos • Taxa de conversão • Visitas e negociações • Vendas finalizadas';
    }

    if (currentSection === 'imoveis') {
      return 'Portfólio completo • Tipos de imóveis • Análise por região • Faixas de valor • Tendências de mercado';
    }

    if (currentSection === 'agentes-ia') {
      return 'Agentes inteligentes • Automações • Respostas automáticas • Análise de sentimento • Chatbots';
    }

    if (currentSection === 'configuracoes') {
      return 'Configurações do sistema • Gerenciamento de usuários • Preferências • Integrações';
    }
    
    return 'Dashboard completo de métricas e análises';
  };

  // RENDERIZAR APENAS A SEÇÃO ATIVA - Otimização de Performance
  // Ao invés de pré-renderizar tudo, renderiza apenas o necessário
  // useMemo para evitar re-renders desnecessários
  const renderActiveSection = useMemo(() => {
    
    // Leads (Início / Home)
    if (currentSection === 'leads') {
      return <LeadSection />;
    }

    // Meus Leads (Leads Atribuídos a mim)
    if (currentSection === 'meus-leads') {
      return <MeusLeadsSection leads={leads} />;
    }
    
    // Cliente Interessado
    if (currentSection === 'cliente-interessado') {
      return (
        <GestaoSection 
            leads={leads} 
            onRefresh={onRefresh}
            isRefreshing={isRefreshing}
            activeDashboardSection="leads"
            activeLeadsSubSection="venda"
            activeVendaSubTab={activeVendaSubTab}
            onVendaSubTabChange={setActiveVendaSubTab}
            activeProprietariosSubSection={activeClienteProprietarioSubSection}
            onProprietariosSubSectionChange={setActiveClienteProprietarioSubSection}
            activeClienteInteressadoSubSection={activeClienteInteressadoSubSection}
            currentSectionTitle={getSectionTitle()}
            currentSectionSubtitle={getSectionSubtitle()}
          />
      );
    }
    
    // Cliente Proprietário
    if (currentSection === 'cliente-proprietario') {
      return (
        <GestaoSection 
            leads={leads} 
            onRefresh={onRefresh}
            isRefreshing={isRefreshing}
            activeDashboardSection="proprietarios"
            activeLeadsSubSection="venda"
            activeVendaSubTab={activeVendaSubTab}
            onVendaSubTabChange={setActiveVendaSubTab}
            activeProprietariosSubSection={activeClienteProprietarioSubSection === 'estudo-mercado' ? 'estudo-mercado' : activeProprietariosSubTab}
            onProprietariosSubSectionChange={(section) => {
              if (section === 'estudo-mercado') {
                setActiveClienteProprietarioSubSection('estudo-mercado');
              } else {
                setActiveClienteProprietarioSubSection('cliente-proprietario');
                setActiveProprietariosSubTab(section as 'vendedor' | 'locatario');
                localStorage.setItem('selectedProprietariosSubTab', section);
              }
            }}
            activeClienteInteressadoSubSection={activeClienteInteressadoSubSection}
            currentSectionTitle={getSectionTitle()}
            currentSectionSubtitle={getSectionSubtitle()}
          />
      );
    }

    // Corretores - Cards de Membros da Equipe
    if (currentSection === 'corretores') {
      return (
        <EquipeSection 
          leads={leads} 
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
        />
      );
    }
    
    // Corretores Gráficos - Análise com Gráficos
    if (currentSection === 'corretores') {
      return (
        <GestaoSection 
            leads={leads} 
            onRefresh={onRefresh}
            isRefreshing={isRefreshing}
            activeDashboardSection="corretores"
            activeLeadsSubSection="venda"
            activeVendaSubTab={activeVendaSubTab}
            onVendaSubTabChange={setActiveVendaSubTab}
            activeProprietariosSubSection={activeClienteProprietarioSubSection}
            onProprietariosSubSectionChange={setActiveClienteProprietarioSubSection}
            activeClienteInteressadoSubSection={activeClienteInteressadoSubSection}
            currentSectionTitle={getSectionTitle()}
            currentSectionSubtitle={getSectionSubtitle()}
          />
      );
    }
    
    // Imóveis - Catálogo Completo do Kenlo
    if (currentSection === 'imoveis') {
      return (
        <ImoveisPage 
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
        />
      );
    }
    
    // Agentes de IA - Marketing
    if (currentSection === 'agentes-ia') {
      return activeAgentesIaSubSection === 'agente-marketing' ? (
            <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
              {/* Header do Agente - Layout com Logo Central */}
              <div className="border-b border-neutral-800/40 bg-gradient-to-br from-blue-600/10 via-purple-600/10 to-blue-600/5 backdrop-blur-sm flex-shrink-0">
                <div className="w-full px-4 py-3">
                  <div className="flex items-center justify-between">
                    
                    {/* ESQUERDA: Avatar do Marketing + Info */}
                    <div className="flex items-center gap-4 flex-shrink-0">
                      {/* Avatar do Marketing - Foto Real */}
                      <div className="relative">
                        <div className="w-16 h-16 rounded-2xl overflow-hidden ring-2 ring-blue-500/30 shadow-xl shadow-blue-500/30">
                          <img 
                            src="https://i.postimg.cc/Z5DPrt7k/Imagem-do-Whats-App-de-2025-09-18-s-17-02-08-1c96e26d.jpg" 
                            alt="Marketing"
                            className="w-full h-full object-cover object-center"
                            style={{ objectPosition: '50% 30%' }}
                          />
                        </div>
                        {/* Badge de Status Online */}
                        <div className="absolute -bottom-0.5 -right-0.5 px-1.5 py-0.5 bg-green-500 rounded-full shadow-lg border border-neutral-900 flex items-center gap-0.5">
                          <div className="w-1 h-1 bg-white rounded-full animate-pulse"></div>
                          <span className="text-white text-[9px] font-bold">Online</span>
                        </div>
                      </div>
                      
                      {/* Informações do Agente */}
                      <div>
                        <h1 className="text-xl font-black mb-0.5 bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 bg-clip-text text-transparent">
                          Marketing
                        </h1>
                        <p className="text-gray-300 text-[10px] font-medium mb-1.5">
                          Agente de IA Especialista em Marketing Imobiliário
                        </p>
                        <div className="flex flex-wrap gap-1">
                          <span className="px-1.5 py-0.5 bg-blue-600/20 border border-blue-500/30 rounded-full text-blue-300 text-[9px] font-semibold">
                            ✍️ Copywriter
                          </span>
                          <span className="px-1.5 py-0.5 bg-purple-600/20 border border-purple-500/30 rounded-full text-purple-300 text-[9px] font-semibold">
                            📱 Social Media
                          </span>
                          <span className="px-1.5 py-0.5 bg-pink-600/20 border border-pink-500/30 rounded-full text-pink-300 text-[9px] font-semibold">
                            🎬 Roteiros Virais
                          </span>
                          <span className="px-1.5 py-0.5 bg-cyan-600/20 border border-cyan-500/30 rounded-full text-cyan-300 text-[9px] font-semibold">
                            🎯 Estrategista
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* DIREITA: Cards de Métricas */}
                    <div className="flex gap-2 flex-shrink-0">
                      <div className="bg-gradient-to-br from-blue-600/10 to-blue-600/5 border border-blue-500/20 rounded-lg px-2.5 py-1.5">
                        <div className="text-blue-300 text-[9px] font-semibold">Especialidade</div>
                        <div className="text-white text-[11px] font-bold">Copywriting</div>
                      </div>
                      <div className="bg-gradient-to-br from-purple-600/10 to-purple-600/5 border border-purple-500/20 rounded-lg px-2.5 py-1.5">
                        <div className="text-purple-300 text-[9px] font-semibold">Resposta</div>
                        <div className="text-white text-[11px] font-bold">Instantânea ⚡</div>
                      </div>
                      <div className="bg-gradient-to-br from-green-600/10 to-green-600/5 border border-green-500/20 rounded-lg px-2.5 py-1.5">
                        <div className="text-green-300 text-[9px] font-semibold">Status</div>
                        <div className="text-white text-[11px] font-bold">24/7 🟢</div>
                      </div>
                    </div>

                  </div>
                </div>
              </div>

          {/* Grid Layout: Info + Chat - Altura dinâmica sem scroll na página */}
          <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-4 gap-0" style={{ minHeight: 0 }}>
                
                {/* Sidebar de Informações - Compacta com Scroll Interno */}
                <div className="lg:col-span-1 border-r border-neutral-800/40 overflow-y-auto p-4 bg-gradient-to-b from-neutral-900/30 to-transparent">
                  <div className="space-y-4">
                    
                    {/* Sobre o Agente - Compacto */}
                    <div className="bg-gradient-to-br from-neutral-800/50 to-neutral-900/50 border border-neutral-700/50 rounded-xl p-3">
                      <h3 className="text-white font-bold text-sm mb-2 flex items-center gap-2">
                        <span className="text-lg">🤖</span>
                        <span className="text-blue-400">
                          Quem sou eu?
                        </span>
                      </h3>
                      <p className="text-white text-xs leading-relaxed">
                        Agente de IA oficial da Imobiliária Japi, braço direito dos corretores. Combino copywriting, social media, roteiros virais e análise criativa.
                      </p>
                    </div>

                    {/* O que faço - Compacto COM CLIQUE */}
                    <div className="bg-gradient-to-br from-neutral-800/50 to-neutral-900/50 border border-neutral-700/50 rounded-xl p-3">
                      <h3 className="text-white font-bold text-sm mb-2 flex items-center gap-2">
                        <span className="text-lg">🎯</span>
                        <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                          Especialidades
                        </span>
                      </h3>
                      <p className="text-gray-400 text-[10px] mb-2 italic">
                        💡 Clique em uma especialidade para começar!
                      </p>
                      <div className="space-y-1.5">
                        {[
                          { id: 'legendas', icon: '📱', text: 'Legendas para redes sociais' },
                          { id: 'descricoes', icon: '🏠', text: 'Descrições de imóveis' },
                          { id: 'roteiros', icon: '🎬', text: 'Roteiros para Reels' },
                          { id: 'campanhas', icon: '💡', text: 'Ideias de campanhas' },
                          { id: 'copys', icon: '🎯', text: 'Copys para anúncios' },
                          { id: 'blog', icon: '📝', text: 'Textos para blog (SEO)' },
                          { id: 'briefings', icon: '🎨', text: 'Briefings criativos' }
                        ].map((item) => (
                          <button
                            key={item.id}
                            onClick={() => {
                              // Enviar mensagem automaticamente para o chat
                              if ((window as any).sendCaioKotlerMessage) {
                                const prompts: Record<string, string> = {
                                  'legendas': `Caio Kotler, crie 3 versões de legendas de alta conversão para redes sociais sobre [TEMA/IMÓVEL/CAMPANHA], adaptando o tom ao público que irei selecionar [ALTO PADRÃO / MÉDIO PADRÃO / INVESTIDOR / LOCAÇÃO / ECONÔMICO].\n\nVersão A – Gatilho Imediato (Feed/Carrossel): use AIDA + urgência/escassez; curta e direta; CTA no final.\nVersão B – Storytelling (Facebook/LinkedIn): use BAB (Before–After–Bridge) + aspiração (estilo de vida).\nVersão C – Gancho p/ Vídeo (Reels/TikTok): curta, com curiosidade e a pergunta que o vídeo responde.\n\nUse emojis com moderação, CTA em todas.\nSugira até 5 hashtags estratégicas por versão.\n\nAo final ranqueie do melhor para o pior, dando uma nota de 0 a 10 e orientando qual o corretor deve usar e por que.`,
                                  'descricoes': `Caio Kotler, gere uma descrição completa e atrativa para [TIPO + LOCALIZAÇÃO + DIFERENCIAIS], com linguagem adaptada ao público que o corretor selecionar [INVESTIDOR / POPULAR / MINHA CASA MINHA VIDA / FAMÍLIA / CASAL JOVEM / LOCATÁRIO] em 3 seções:\n\nAbertura Emocional (O Sonho): transforme o principal diferencial em benefício de estilo de vida.\n\nDetalhes Estratégicos e Técnicos: dados (dormitórios, metragem, condomínio, preço, aceita permuta) entrelaçados a vantagens práticas; se locação, aplique PAS. Indique público ideal.\n\nFechamento Comercial: exclusividade + urgência e CTA claro (agendar visita/contato).`,
                                  'roteiros': `Caio Kotler, crie um roteiro até 45s para [IMÓVEL/TEMA/CAMPANHA] com objetivo [VENDER / GERAR LEADS / ENGAJAR].\nEu quero que você divida em takes separados, pois o corretor irá aparecer em várias partes do imóvel em diferentes momentos do vídeo. Eu vou te mandar a descrição principal do imóvel e alguns diferenciais que só esse imóvel possui. Esses diferenciais eu vou destacar eles e quero que você inclua no início do vídeo como forma de gatilhos mentais.\n\nEstrutura:\n[0:00–0:03] Hook impactante: 1 dos 5 ganchos (Curiosidade / Estilo de Vida / Problema×Solução / Identificação / Contraste) + cenário inicial.\n[0:04–0:15] Diferencial visual + Ação: descreva movimento do corretor (abrir porta, caminhar, virar câmera) e o áudio.\n[0:16–0:40] História/Explicação + Benefício: conecte com o estilo de vida desejado.\n[0:41–0:45] CTA urgente: ex. "Chama no DM e agenda".\nInclua tom sugerido [emocional/aspiracional/humorado/informativo], sugestão de trilha, e legenda do post (a legenda — não o áudio — deve conter o slogan da Japi).`,
                                  'campanhas': `Caio Kotler, gere 3 ideias de campanhas/pautas para [MÊS/TEMA] com objetivo [VENDAS / CAPTAÇÃO / LOCAÇÃO / BRANDING], cada uma com estilo diferente (Emocional / Humor/Identificação / Institucional-Dados). Para cada campanha, traga:\nNome e Tema Criativo\nObjetivo Comercial e Público\nCanais e Formato (Reels, Carrossel, Live, E-book, Tour 360º)\nIdeia Central + Gatilho + CTA\nFinalize com 1 pauta bônus focada em Provas Sociais (depoimentos, números e cases).`,
                                  'copys': `Caio Kotler, escreva 3 variações de copy curtas e persuasivas para anúncios de [IMÓVEL/CAMPANHA], otimizadas para Meta Ads/Google Ads:\n\nHeadline (≤30 caracteres): aplicar 4U's (Útil, Urgente, Único, Ultraespecífico).\nDescrição (≤90 caracteres): benefício principal + dor resolvida + gatilho (urgência/escassez/aspiração).\nCTA: direto (ex. Saiba Mais / Agende Agora / Fale Conosco).\nNão use o slogan no corpo do anúncio; foco total em clique e lead. Indique qual variação performa melhor em Meta e em Google.\n\nAo final ranqueie do melhor para o pior, dando uma nota de 0 a 10 e orientando qual o corretor deve usar e por que.`,
                                  'blog': `Caio Kotler, escreva um artigo de aproximadamente [Nº DE PALAVRAS] sobre [TEMA].\nInclua:\nTítulo SEO com palavra-chave principal e Meta Description (≤160 caracteres).\nPalavras-chave: principal + 2 secundárias (com intenção de busca).\nEstrutura: 4–6 H2/H3 com SEO natural; introdução curta (até 3 linhas) com a keyword; parágrafos escaneáveis que misturam dados e emoção (tom Especialista Acolhedor).\nConclusão + CTA (agendar visita/contato/baixar material).`,
                                  'briefings': `Caio Kotler, monte um briefing criativo detalhado para [TIPO DE PEÇA: POST, VÍDEO, CAMPANHA, ETC] sobre [TEMA].\nInclua:\nObjetivo e Público-alvo (clique, salvar, leads etc.)\nTom de Voz e Emoção (aspiracional, institucional, divertido, emocional)\nOrientação Visual: De acordo com o manual de marca fornecida a você.\nTexto Principal + CTA gráfico (ex.: "Agende sua visita")`
                                };
                                // Criar mensagem resumida para exibir no chat
                                const displayText = `Olá Caio, gostaria de gerar ${item.text}`;
                                // Enviar prompt completo para o webhook + mensagem resumida para o chat
                                (window as any).sendCaioKotlerMessage(prompts[item.id], displayText);
                              }
                            }}
                            className="w-full flex items-center gap-2 p-2 rounded-lg bg-neutral-800/30 border border-neutral-700/30 hover:border-purple-500/50 hover:bg-neutral-700/40 transition-all duration-200 cursor-pointer group"
                          >
                            <span className="text-sm flex-shrink-0 group-hover:scale-110 transition-transform">{item.icon}</span>
                            <span className="text-gray-300 text-xs leading-tight group-hover:text-white transition-colors">{item.text}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Dica Profissional - Compacta com Gradiente Azul/Roxo */}
                    <div className="bg-gradient-to-br from-blue-600/20 via-purple-600/20 to-blue-600/20 border border-blue-500/30 rounded-xl p-3 shadow-lg shadow-blue-500/10">
                      <div className="flex items-start gap-2">
                        <span className="text-xl flex-shrink-0">💡</span>
                        <div>
                          <p className="text-blue-300 font-bold text-xs mb-1">Dica Profissional</p>
                          <p className="text-blue-100/90 text-[11px] leading-relaxed">
                            Seja específico! Quanto mais detalhes você der sobre o imóvel, público-alvo e objetivo, 
                            melhor será o resultado.
                          </p>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Área de Chat - 3/4 */}
                <div className="lg:col-span-3 flex flex-col h-full overflow-hidden">
                  <CaioKotlerChat />
                </div>

              </div>
            </div>
      ) : activeAgentesIaSubSection === 'agente-comportamental' ? (
        <ElaineAgentSection />
      ) : null;
    }
    
    // Configurações
    if (currentSection === 'configuracoes') {
      return <ConfiguracoesSection leads={leads} />;
    }
    
    // Fallback - não deveria chegar aqui
    return null;
  }, [currentSection, leads, onRefresh, isRefreshing, activeVendaSubTab, activeClienteProprietarioSubSection, activeProprietariosSubTab, activeClienteInteressadoSubSection, activeAgentesIaSubSection]);

  return (
    <div className="min-h-screen flex flex-col overflow-hidden max-w-full bg-gray-50">
      {/* Header Superior - Workspace */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-200 z-50 flex items-center px-4">
        <div className="flex items-center gap-2">
          {/* Avatar/Logo do Workspace */}
          <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
            J
          </div>
          
          {/* Nome do Workspace */}
          <span className="text-sm font-medium text-gray-900">
            JAPI
          </span>
          
          {/* Dropdown Arrow */}
          <ChevronDown className="h-4 w-4 text-gray-500" />
        </div>
        
        {/* Ícone de Calendário à direita */}
        <div className="ml-auto">
          <Calendar className="h-5 w-5 text-gray-500" />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden pt-14">
        {/* Sidebar Fixa - Redimensionável */}
        <FixedSidebar
          activeSection={currentSection}
          onSectionChange={setCurrentSection}
          onSecondarySidebarChange={(isOpen, width) => {
            setSecondarySidebarOpen(isOpen);
            if (width !== undefined) {
              setSidebarWidth(width);
            }
          }}
          activeClienteInteressadoSubSection={activeClienteInteressadoSubSection}
          onClienteInteressadoSubSectionChange={setActiveClienteInteressadoSubSection}
          activeClienteProprietarioSubSection={activeClienteProprietarioSubSection}
          onClienteProprietarioSubSectionChange={setActiveClienteProprietarioSubSection}
          activeCorretoresSubSection={activeCorretoresSubSection}
          onCorretoresSubSectionChange={setActiveCorretoresSubSection}
          activeAgentesIaSubSection={activeAgentesIaSubSection}
          onAgentesIaSubSectionChange={setActiveAgentesIaSubSection}
        />
        
        {/* Conteúdo principal - Margem dinâmica baseada na largura da sidebar */}
        <main 
          className="flex-1 overflow-hidden transition-all duration-300 ease-out"
          style={{ 
            marginLeft: `${sidebarWidth + 8}px`,
            paddingRight: '8px'
          }}
        >
          <div className="w-full h-full overflow-y-auto overflow-x-hidden">
            {children || renderActiveSection}
          </div>
        </main>
      </div>
    </div>
  );
};

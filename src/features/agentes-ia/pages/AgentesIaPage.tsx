/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Página: Agentes de IA
 * Rota: /agentes-ia/:agent?
 */

import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { CaioKotlerChat } from '../components/CaioKotlerChat';
import { ElaineChat } from '../components/ElaineChat';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from "@/hooks/useAuth";
import { TestesComportamentaisOnboarding } from '@/features/corretores/components/TestesComportamentaisOnboarding';
import { TesteDISC } from '@/features/corretores/components/TesteDISC';
import { TesteEneagrama } from '@/features/corretores/components/TesteEneagrama';
import { verificarTestesCompletos } from '@/features/corretores/services/testesComportamentaisService';
import { buscarIdCorretorPorNome } from '@/features/corretores/services/buscarCorretorIdService';
import { buscarCorretorPorEmail, CorretorIdentidade } from '@/features/corretores/services/buscarCorretorPorEmailService';
import { DISCStatistics } from '@/features/corretores/components/DISCStatistics';
import { EneagramaStatistics } from '@/features/corretores/components/EneagramaStatistics';
import { MBTIStatistics } from '@/features/corretores/components/MBTIStatistics';
import { DISCCorretorProfile } from '@/features/corretores/services/discResultsService';
import { DISC_PROFILES } from '@/data/discQuestions';
import { EneagramaCorretorProfile } from '@/features/corretores/services/eneagramaResultsService';
import { ENEAGRAMA_TIPOS } from '@/data/eneagramaQuestions';
import { MBTICorretorProfile } from '@/features/corretores/services/mbtiResultsService';
import { MeusResultadosCorretor } from '@/features/corretores/components/MeusResultadosCorretor';
import { MeuResumoCompleto } from '@/components/MeuResumoCompleto';
import { AdminResultadosGerais } from '@/features/corretores/components/AdminResultadosGerais';
import { EneagramaCorretorIndividualModal } from '@/features/corretores/components/EneagramaCorretorIndividualModal';
import { MBTICorretorIndividualModal } from '@/features/corretores/components/MBTICorretorIndividualModal';
import { GestaoLideradosCorretorSelector } from '@/features/corretores/components/GestaoLideradosCorretorSelector';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { buscarResultadoDISCCorretor, DISCResultData } from '@/features/corretores/services/discResultsService';
import { buscarResultadoEneagramaCorretor } from '@/features/corretores/services/eneagramaResultsService';
import { buscarResultadoMBTICorretor } from '@/features/corretores/services/mbtiResultsService';
import { 
  buscarResultadosAdmin, 
  verificarTestesAdminCompletos, 
  excluirResultadosAdmin,
  formatarResultadosParaWebhook,
  AdminTestResults 
} from '@/features/corretores/services/adminTestsService';
import { useToast } from '@/hooks/use-toast';

// Prompts pré-definidos baseados no perfil do Marketing
const ESPECIALIDADE_PROMPTS: Record<string, string> = {
  'legendas': `Marketing, crie 3 versões de legendas de alta conversão para redes sociais sobre [TEMA/IMÓVEL/CAMPANHA], adaptando o tom ao público que irei selecionar [ALTO PADRÃO / MÉDIO PADRÃO / INVESTIDOR / LOCAÇÃO / ECONÔMICO].

Versão A – Gatilho Imediato (Feed/Carrossel): use AIDA + urgência/escassez; curta e direta; CTA no final.
Versão B – Storytelling (Facebook/LinkedIn): use BAB (Before–After–Bridge) + aspiração (estilo de vida).
Versão C – Gancho p/ Vídeo (Reels/TikTok): curta, com curiosidade e a pergunta que o vídeo responde.

Use emojis com moderação, CTA em todas.
Sugira até 5 hashtags estratégicas por versão.

Ao final ranqueie do melhor para o pior, dando uma nota de 0 a 10 e orientando qual o corretor deve usar e por que.`,

  'descricoes': `Marketing, gere uma descrição completa e atrativa para [TIPO + LOCALIZAÇÃO + DIFERENCIAIS], com linguagem adaptada ao público que o corretor selecionar [INVESTIDOR / POPULAR / MINHA CASA MINHA VIDA / FAMÍLIA / CASAL JOVEM / LOCATÁRIO] em 3 seções:

Abertura Emocional (O Sonho): transforme o principal diferencial em benefício de estilo de vida.

Detalhes Estratégicos e Técnicos: dados (dormitórios, metragem, condomínio, preço, aceita permuta) entrelaçados a vantagens práticas; se locação, aplique PAS. Indique público ideal.

Fechamento Comercial: exclusividade + urgência e CTA claro (agendar visita/contato).`,

  'roteiros': `Marketing, crie um roteiro até 45s para [IMÓVEL/TEMA/CAMPANHA] com objetivo [VENDER / GERAR LEADS / ENGAJAR].
Eu quero que você divida em takes separados, pois o corretor irá aparecer em várias partes do imóvel em diferentes momentos do vídeo. Eu vou te mandar a descrição principal do imóvel e alguns diferenciais que só esse imóvel possui. Esses diferenciais eu vou destacar eles e quero que você inclua no início do vídeo como forma de gatilhos mentais.

Estrutura:
[0:00–0:03] Hook impactante: 1 dos 5 ganchos (Curiosidade / Estilo de Vida / Problema×Solução / Identificação / Contraste) + cenário inicial.
[0:04–0:15] Diferencial visual + Ação: descreva movimento do corretor (abrir porta, caminhar, virar câmera) e o áudio.
[0:16–0:40] História/Explicação + Benefício: conecte com o estilo de vida desejado.
[0:41–0:45] CTA urgente: ex. "Chama no DM e agenda".
Inclua tom sugerido [emocional/aspiracional/humorado/informativo], sugestão de trilha, e legenda do post (a legenda — não o áudio — deve conter o slogan da Japi).`,

  'campanhas': `Marketing, gere 3 ideias de campanhas/pautas para [MÊS/TEMA] com objetivo [VENDAS / CAPTAÇÃO / LOCAÇÃO / BRANDING], cada uma com estilo diferente (Emocional / Humor/Identificação / Institucional-Dados). Para cada campanha, traga:
Nome e Tema Criativo
Objetivo Comercial e Público
Canais e Formato (Reels, Carrossel, Live, E-book, Tour 360º)
Ideia Central + Gatilho + CTA
Finalize com 1 pauta bônus focada em Provas Sociais (depoimentos, números e cases).`,

  'copys': `Marketing, escreva 3 variações de copy curtas e persuasivas para anúncios de [IMÓVEL/CAMPANHA], otimizadas para Meta Ads/Google Ads:

Headline (≤30 caracteres): aplicar 4U's (Útil, Urgente, Único, Ultraespecífico).
Descrição (≤90 caracteres): benefício principal + dor resolvida + gatilho (urgência/escassez/aspiração).
CTA: direto (ex. Saiba Mais / Agende Agora / Fale Conosco).
Não use o slogan no corpo do anúncio; foco total em clique e lead. Indique qual variação performa melhor em Meta e em Google.

Ao final ranqueie do melhor para o pior, dando uma nota de 0 a 10 e orientando qual o corretor deve usar e por que.`,

  'blog': `Marketing, escreva um artigo de aproximadamente [Nº DE PALAVRAS] sobre [TEMA].
Inclua:
Título SEO com palavra-chave principal e Meta Description (≤160 caracteres).
Palavras-chave: principal + 2 secundárias (com intenção de busca).
Estrutura: 4–6 H2/H3 com SEO natural; introdução curta (até 3 linhas) com a keyword; parágrafos escaneáveis que misturam dados e emoção (tom Especialista Acolhedor).
Conclusão + CTA (agendar visita/contato/baixar material).`,

  'briefings': `Marketing, monte um briefing criativo detalhado para [TIPO DE PEÇA: POST, VÍDEO, CAMPANHA, ETC] sobre [TEMA].
Inclua:
Objetivo e Público-alvo (clique, salvar, leads etc.)
Tom de Voz e Emoção (aspiracional, institucional, divertido, emocional)
Orientação Visual: De acordo com o manual de marca fornecida a você.
Texto Principal + CTA gráfico (ex.: "Agende sua visita")`
};

// Prompts pré-definidos baseados no perfil do Comportamental (RH e Gestão)
const ELAINE_PROMPTS: Record<string, string> = {
  'disc': `Comportamental, realize uma Análise Completa do Perfil DISC para o colaborador(a) [NOME DO CORRETOR].

**Dados DISC:**
- D (Dominância): [Pontuação de 1-4]
- I (Influência): [Pontuação de 1-4]
- S (Estabilidade): [Pontuação de 1-4]
- C (Conformidade): [Pontuação de 1-4]

**Estruture a análise em:**

1. **Perfil Predominante:** Qual(is) traço(s) se destaca(m) e o que isso significa.

2. **Comportamento Observável:** Como essa pessoa age no dia a dia profissional.

3. **Motivadores e Drivers:** O que impulsiona suas ações e decisões.

4. **Ambiente Ideal de Trabalho:** Contexto onde essa pessoa prospera.

5. **Pontos de Atenção:** Situações que podem gerar estresse ou conflito.

6. **Dicas para o Gestor:** Como gerenciar e motivar esse perfil especificamente.`,

  'eneagrama': `Comportamental, realize uma Análise Completa do Eneagrama para o colaborador(a) [NOME DO CORRETOR].

**Tipo Eneagrama:**
- Tipo Principal: [Ex: Tipo 3 - O Realizador]
- Asa: [Ex: 3w2 ou 3w4]
- Nível de Desenvolvimento: [Saudável/Médio/Estressado]

**Estruture a análise em:**

1. **Motivação Central:** O que essa pessoa busca profundamente.

2. **Medo Básico:** O que ela tenta evitar a todo custo.

3. **Padrões de Comportamento:** Como esse tipo se manifesta no trabalho.

4. **Direção de Crescimento:** Para onde esse tipo evolui quando saudável.

5. **Direção de Estresse:** Como esse tipo regride sob pressão.

6. **Estratégias de Desenvolvimento:** Como essa pessoa pode evoluir e usar seu potencial máximo.

7. **Relações Interpessoais:** Como interage com outros tipos e o que precisa para trabalhar bem em equipe.`,

  'mbti': `Comportamental, realize uma Análise Completa do MBTI para o colaborador(a) [NOME DO CORRETOR].

**Tipo MBTI:**
- Tipo: [Ex: ENFJ - O Protagonista]
- Funções Cognitivas: [Ex: Fe-Ni-Se-Ti]

**Estruture a análise em:**

1. **Descrição do Tipo:** Características principais dessa personalidade.

2. **Estilo de Comunicação:** Como essa pessoa processa e compartilha informações.

3. **Tomada de Decisão:** Como analisa situações e escolhe caminhos.

4. **Processamento de Energia:** Como recarrega (introversão/extroversão) e se relaciona.

5. **Pontos Fortes Cognitivos:** Habilidades mentais naturais desse tipo.

6. **Desafios Cognitivos:** Onde esse tipo pode ter dificuldades.

7. **Carreira e Contribuição:** Como esse tipo pode contribuir melhor no ambiente de trabalho.

8. **Compatibilidade em Equipe:** Com quais tipos trabalha melhor e quais podem gerar atrito.`,

  'relatorio-geral': `Comportamental, crie um Relatório Comportamental Completo e Integrado para o colaborador(a) [NOME DO CORRETOR].

**Dados Comportamentais Completos:**
- **DISC:** [Ex: Alto I, Médio D, Baixo S, Baixo C]
- **Eneagrama:** [Ex: Tipo 3w2 - O Realizador]
- **MBTI:** [Ex: ENFJ - O Protagonista]

**Estruture o relatório completo em:**

1. **Síntese da Personalidade 360°:** Integração dos três modelos em uma visão única e coerente.

2. **Perfil Comportamental (DISC):** Como age observável no dia a dia.

3. **Motivações Profundas (Eneagrama):** Por que age dessa forma.

4. **Processamento Mental (MBTI):** Como pensa, decide e se comunica.

5. **Pontos Fortes Integrados:** Onde essa combinação de perfil brilha.

6. **Desafios e Pontos de Desenvolvimento:** Áreas que precisam de atenção e crescimento.

7. **Manual de Gestão:** Como o gestor deve liderar, motivar e dar feedback para esse perfil.

8. **Estratégias de Comunicação:** Melhor forma de se comunicar com essa pessoa.

9. **Ambiente Ideal:** Contexto de trabalho onde essa pessoa prospera.

10. **Plano de Desenvolvimento:** Próximos passos para evolução profissional.

11. **Compatibilidade em Equipe:** Como interage com outros perfis e sugestões de alocação.

12. **Mensagem Personalizada:** Reflexão inspiradora sobre como usar suas forças com sabedoria e propósito.`,

  'gestao-liderados': `Comportamental, crie um Plano de Gestão de Equipe para o gestor liderar sua equipe de corretores de forma estratégica.

**Equipe:**
[Listar os corretores e seus perfis comportamentais]

**Corretor 1:** [NOME]
- DISC: [Perfil]
- Eneagrama: [Tipo]
- MBTI: [Tipo]

**Corretor 2:** [NOME]
- DISC: [Perfil]
- Eneagrama: [Tipo]
- MBTI: [Tipo]

**Corretor 3:** [NOME]
- DISC: [Perfil]
- Eneagrama: [Tipo]
- MBTI: [Tipo]

**Análise solicitada:**

1. **Visão Geral da Equipe:** Mapa de personalidades e como se complementam.

2. **Forças da Equipe:** Onde o grupo tem excelência coletiva.

3. **Gaps e Áreas de Atenção:** Lacunas de perfil que podem gerar desafios.

4. **Estratégia de Liderança por Perfil:** Como liderar cada corretor de forma personalizada.

5. **Dinâmica de Relacionamento:** Quem trabalha melhor com quem, possíveis atritos.

6. **Distribuição de Papéis:** Quem deve liderar projetos, quem deve executar, quem deve apoiar.

7. **Plano de Desenvolvimento Coletivo:** Ações para fortalecer a equipe como um todo.

8. **Gestão de Conflitos:** Como mediar possíveis conflitos baseados nos perfis.

9. **Motivação Individual:** O que motiva cada corretor especificamente.

10. **Comunicação Efetiva:** Melhor forma de se comunicar com cada um.

11. **Metas e Performance:** Como definir metas adequadas para cada perfil.

12. **Recomendações Estratégicas:** Sugestões práticas para maximizar a performance da equipe.`
};

export const AgentesIaPage = () => {
  const { agent } = useParams<{ agent?: string }>();
  const navigate = useNavigate();
  const [selectedEspecialidade, setSelectedEspecialidade] = useState<string | null>(null);
  
  // Detectar tema atual
  const { currentTheme } = useTheme();
  const isDarkMode = currentTheme === 'preto' || currentTheme === 'cinza';

  // Autenticação e verificação de testes
  const { user, isCorretor, isGestao, isOwner, isLoading: authLoading, corretores } = useAuth();
  const [testesCompletos, setTestesCompletos] = useState<boolean | null>(null);
  const [loadingTestes, setLoadingTestes] = useState(true);
  const [testeAtual, setTesteAtual] = useState<'disc' | 'eneagrama' | 'mbti' | null>(null);
  const [corretorIdNumerico, setCorretorIdNumerico] = useState<number | null>(null);
  const [corretorNomeResolvido, setCorretorNomeResolvido] = useState<string | null>(null);
  
  // Estados para seleção de corretor DISC (admin only)
  const [showDISCSelector, setShowDISCSelector] = useState(false);
  const [selectedCorretor, setSelectedCorretor] = useState<{
    nome: string;
    tipoDISC: 'D' | 'I' | 'S' | 'C';
    percentuais: { D: number; I: number; S: number; C: number };
  } | null>(null);
  
  // Estados para seleção de corretor ENEAGRAMA (admin only)
  const [showEneagramaSelector, setShowEneagramaSelector] = useState(false);
  const [selectedCorretorEneagrama, setSelectedCorretorEneagrama] = useState<{
    nome: string;
    tipoEneagrama: number;
    scores: { [key: number]: number };
  } | null>(null);
  
  // Estados para seleção de corretor MBTI (admin only)
  const [showMBTISelector, setShowMBTISelector] = useState(false);
  const [selectedCorretorMBTI, setSelectedCorretorMBTI] = useState<{
    nome: string;
    tipoMBTI: string;
    percentuais: { [key: string]: number };
  } | null>(null);

  // Estado para seleção de corretor na Gestão de Liderados
  const [selectedCorretorGestaoLiderados, setSelectedCorretorGestaoLiderados] = useState<string | null>(null);
  const [showGestaoLideradosSelector, setShowGestaoLideradosSelector] = useState(false);
  
  // Estado para controlar visualização de "Meus Resultados"
  const [mostrarMeusResultados, setMostrarMeusResultados] = useState(false);
  
  // Estado para controlar visualização do "Meu Resumo"
  const [mostrarMeuResumo, setMostrarMeuResumo] = useState(false);
  
  // Status individual de cada teste (para badges visuais na sidebar)
  const [statusTestes, setStatusTestes] = useState<{
    disc: boolean; eneagrama: boolean; mbti: boolean;
  }>({ disc: false, eneagrama: false, mbti: false });

  // Estados para modais de resultados individuais do corretor
  const [mostrarResultadoDISC, setMostrarResultadoDISC] = useState(false);
  const [mostrarResultadoEneagrama, setMostrarResultadoEneagrama] = useState(false);
  
  // Estados para testes do ADMIN/OWNER
  const [showAdminTestSelector, setShowAdminTestSelector] = useState(false);
  const [adminTesteAtual, setAdminTesteAtual] = useState<'disc' | 'eneagrama' | 'mbti' | null>(null);
  const [adminTestesStatus, setAdminTestesStatus] = useState<{
    disc: boolean; eneagrama: boolean; mbti: boolean;
  }>({ disc: false, eneagrama: false, mbti: false });
  const [adminResultados, setAdminResultados] = useState<AdminTestResults | null>(null);
  const [showAdminResultados, setShowAdminResultados] = useState(false);
  const [adminResultadosSelecionados, setAdminResultadosSelecionados] = useState<string[]>([]);
  const [loadingAdminTestes, setLoadingAdminTestes] = useState(false);
  
  // Toast para notificações
  const { toast } = useToast();
  const [mostrarResultadoMBTI, setMostrarResultadoMBTI] = useState(false);
  const [resultadoCorretor, setResultadoCorretor] = useState<any>(null);
  const [loadingResultado, setLoadingResultado] = useState(false);

  // Buscar ID numérico e nome do corretor a partir do email do usuário logado
  useEffect(() => {
    const obterIdentidadeCorretor = async () => {
      if (!user || !isCorretor) return;
      
      try {
        
        // Estratégia 1: buscar por email na tabela Corretores
        const identidade = await buscarCorretorPorEmail(user.email, user.name);
        
        if (identidade) {
          setCorretorIdNumerico(identidade.id);
          setCorretorNomeResolvido(identidade.nome);
          return;
        }
        
        // Estratégia 2 (fallback): se user.corretor existir (hardcoded list), usar busca por nome
        if ((user as any).corretor) {
          const idNumerico = await buscarIdCorretorPorNome((user as any).corretor);
          if (idNumerico) {
            setCorretorIdNumerico(idNumerico);
            setCorretorNomeResolvido((user as any).corretor);
            return;
          }
        }
        
        console.error('❌ Não foi possível resolver identidade do corretor para:', user.email);
      } catch (error) {
        console.error('❌ Erro ao buscar identidade do corretor:', error);
      }
    };
    
    obterIdentidadeCorretor();
  }, [user, isCorretor]);

  // Verificar testes comportamentais para corretores
  useEffect(() => {
    const verificarTestes = async () => {
      if (isCorretor && user) {
        // Aguardar resolução da identidade do corretor
        if (!corretorIdNumerico) {
          return; // Não setar loadingTestes=false, o useEffect re-executará quando corretorIdNumerico mudar
        }
        
        setLoadingTestes(true);
        
        // 🔄 SEMPRE REVALIDAR DO SUPABASE usando ID numérico (fonte única de verdade)
        const completos = await verificarTestesCompletos(corretorIdNumerico.toString());
        
        setTestesCompletos(completos);
        setLoadingTestes(false);
      } else {
        // Admin - sem verificação
        setTestesCompletos(true);
        setLoadingTestes(false);
      }
    };

    verificarTestes();
  }, [agent, isCorretor, user, testeAtual, corretorIdNumerico, corretorNomeResolvido]);

  // Buscar status individual de cada teste para badges visuais
  useEffect(() => {
    const fetchStatusTestes = async () => {
      if (!isCorretor || !corretorIdNumerico) return;
      try {
        const { getSupabaseConfig, getAuthenticatedHeaders } = await import('@/utils/encryption');
        const config = getSupabaseConfig();
        const headers = getAuthenticatedHeaders();
        const res = await fetch(
          `${config.url}/rest/v1/Corretores?id=eq.${corretorIdNumerico}&select=disc_tipo_principal,eneagrama_tipo_principal,mbti_tipo&limit=1`,
          { method: 'GET', headers }
        );
        const data = res.ok ? await res.json() : [];
        if (data && data.length > 0) {
          const c = data[0];
          setStatusTestes({
            disc: !!c.disc_tipo_principal,
            eneagrama: !!c.eneagrama_tipo_principal,
            mbti: !!c.mbti_tipo
          });
        }
      } catch (err) {
        console.warn('⚠️ Erro ao buscar status dos testes:', err);
      }
    };
    fetchStatusTestes();
  }, [isCorretor, corretorIdNumerico, testeAtual]);

  // Debug: verificar qual agente está ativo
  useEffect(() => {
  }, [agent, currentTheme, isDarkMode, user, isCorretor]);

  // Buscar status dos testes do ADMIN/OWNER
  useEffect(() => {
    const fetchAdminTestesStatus = async () => {
      if (!user || isCorretor) return; // Só para admins/owners
      
      try {
        const status = await verificarTestesAdminCompletos(user.id);
        setAdminTestesStatus(status);
        
        // Buscar resultados completos se houver algum teste
        if (status.disc || status.eneagrama || status.mbti) {
          const resultados = await buscarResultadosAdmin(user.id);
          setAdminResultados(resultados);
        }
      } catch (err) {
        console.warn('⚠️ Erro ao buscar status dos testes do admin:', err);
      }
    };
    
    fetchAdminTestesStatus();
  }, [user, isCorretor, adminTesteAtual]);

  // Função para excluir resultados do admin
  const handleExcluirResultadosAdmin = async () => {
    if (!user) return;
    
    const confirmacao = window.confirm(
      '⚠️ ATENÇÃO: Isso irá excluir TODOS os seus resultados de testes (DISC, Eneagrama e MBTI).\n\nVocê poderá refazer os testes após a exclusão.\n\nDeseja continuar?'
    );
    
    if (!confirmacao) return;
    
    setLoadingAdminTestes(true);
    try {
      const sucesso = await excluirResultadosAdmin(user.id);
      
      if (sucesso) {
        setAdminTestesStatus({ disc: false, eneagrama: false, mbti: false });
        setAdminResultados(null);
        toast({
          title: "Resultados Excluídos! 🗑️",
          description: "Seus resultados foram excluídos. Você pode refazer os testes agora.",
        });
      } else {
        toast({
          title: "Erro ao Excluir",
          description: "Não foi possível excluir os resultados. Tente novamente.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('❌ Erro ao excluir resultados:', error);
      toast({
        title: "Erro",
        description: "Ocorreu um erro ao excluir os resultados.",
        variant: "destructive",
      });
    } finally {
      setLoadingAdminTestes(false);
    }
  };

  // Função para anexar resultados do admin no chat
  const handleAnexarResultadosAdmin = () => {
    if (!adminResultados) {
      toast({
        title: "Sem Resultados",
        description: "Você ainda não realizou nenhum teste. Realize os testes primeiro.",
        variant: "destructive",
      });
      return;
    }
    
    setShowAdminResultados(true);
  };

  // Sincronizar com localStorage
  useEffect(() => {
    localStorage.setItem('selectedSection', 'agentes-ia');
    localStorage.setItem('selectedAgentesIaSubSection', agent || 'agente-marketing');
  }, [agent]);

  // Redirecionar para agente padrão se não especificado
  useEffect(() => {
    if (!agent) {
      navigate('/agentes-ia/agente-marketing', { replace: true });
    }
  }, [agent, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Carregando...</p>
        </div>
      </div>
    );
  }

  if (isCorretor) {
    if (testeAtual === 'disc' || testeAtual === 'eneagrama') {
      if (!corretorIdNumerico) {
        return (
          <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p style={{ color: 'var(--text-secondary)' }}>Carregando...</p>
            </div>
          </div>
        );
      }

      return testeAtual === 'disc' ? (
        <TesteDISC
          corretorId={corretorIdNumerico.toString()}
          corretorNome={corretorNomeResolvido || user?.name || ''}
          corretorEmail={user?.email}
          onConcluir={async () => {
            await new Promise(resolve => setTimeout(resolve, 1000));

            if (corretorIdNumerico) {
              const completos = await verificarTestesCompletos(corretorIdNumerico.toString());
              setTestesCompletos(completos);
            }

            setTesteAtual(null);
          }}
          onVoltar={() => {
            setTesteAtual(null);
          }}
        />
      ) : (
        <TesteEneagrama
          corretorId={corretorIdNumerico.toString()}
          corretorNome={corretorNomeResolvido || user?.name || ''}
          corretorEmail={user?.email}
          onConcluir={async () => {
            await new Promise(resolve => setTimeout(resolve, 1000));

            if (corretorIdNumerico) {
              const completos = await verificarTestesCompletos(corretorIdNumerico.toString());
              setTestesCompletos(completos);
            }

            setTesteAtual(null);
          }}
          onVoltar={() => {
            setTesteAtual(null);
          }}
        />
      );
    }

    if (loadingTestes || testesCompletos === null) {
      return (
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Carregando...</p>
          </div>
        </div>
      );
    }

    if (testesCompletos === false) {
      return (
        <TestesComportamentaisOnboarding
          corretorId={corretorIdNumerico ? corretorIdNumerico.toString() : ''}
          corretorNome={corretorNomeResolvido || user?.name || ''}
          corretorEmail={user?.email}
          onIniciarTeste={(teste) => {
            setTesteAtual(teste);
          }}
          onTestesCompletos={async () => {
            await new Promise(resolve => setTimeout(resolve, 1000));

            if (corretorIdNumerico) {
              const completos = await verificarTestesCompletos(corretorIdNumerico.toString());
              setTestesCompletos(completos);
            } else {
              setTestesCompletos(true);
            }

            setTesteAtual(null);
            navigate('/agentes-ia/agente-marketing', { replace: true });
          }}
        />
      );
    }
  }

  const especialidades = [
    { id: 'legendas', icon: '📱', text: 'Legendas para redes sociais' },
    { id: 'descricoes', icon: '🏠', text: 'Descrições de imóveis' },
    { id: 'roteiros', icon: '🎬', text: 'Roteiros para Reels' },
    { id: 'campanhas', icon: '💡', text: 'Ideias de campanhas' },
    { id: 'copys', icon: '🎯', text: 'Copys para anúncios' },
    { id: 'blog', icon: '📝', text: 'Textos para blog (SEO)' },
    { id: 'briefings', icon: '🎨', text: 'Briefings criativos' }
  ];

  const especialidadesElaine = [
    { id: 'disc', icon: '🎯', text: 'DISC' },
    { id: 'eneagrama', icon: '⭐', text: 'ENEAGRAMA' },
    { id: 'mbti', icon: '🧠', text: 'MBTI 16+' },
    { id: 'relatorio-geral', icon: '📊', text: 'Relatório Geral', adminOnly: true },
    { id: 'gestao-liderados', icon: '👥', text: 'Gestão de Liderados', adminOnly: true }
  ];

  // Função para obter cores harmônicas para cada especialidade
  const getEspecialidadeColors = (id: string, isSelected: boolean, isDark: boolean) => {
    const colors = {
      'disc': {
        bg: isSelected 
          ? (isDark ? 'bg-blue-600/40 border-blue-400/70' : 'bg-blue-100 border-blue-400')
          : (isDark ? 'bg-neutral-800/30 border-neutral-700/30 hover:border-blue-500/50 hover:bg-blue-900/20' : 'bg-gray-50/60 border-gray-200/50 hover:border-blue-400/60 hover:bg-blue-50/60'),
        text: isSelected
          ? (isDark ? 'text-blue-300' : 'text-blue-900')
          : (isDark ? 'text-gray-300 group-hover:text-blue-300' : 'text-gray-700 group-hover:text-blue-700'),
        check: isDark ? 'text-blue-400' : 'text-blue-600'
      },
      'eneagrama': {
        bg: isSelected 
          ? (isDark ? 'bg-purple-600/40 border-purple-400/70' : 'bg-purple-100 border-purple-400')
          : (isDark ? 'bg-neutral-800/30 border-neutral-700/30 hover:border-purple-500/50 hover:bg-purple-900/20' : 'bg-gray-50/60 border-gray-200/50 hover:border-purple-400/60 hover:bg-purple-50/60'),
        text: isSelected
          ? (isDark ? 'text-purple-300' : 'text-purple-900')
          : (isDark ? 'text-gray-300 group-hover:text-purple-300' : 'text-gray-700 group-hover:text-purple-700'),
        check: isDark ? 'text-purple-400' : 'text-purple-600'
      },
      'mbti': {
        bg: isSelected 
          ? (isDark ? 'bg-emerald-600/40 border-emerald-400/70' : 'bg-emerald-100 border-emerald-400')
          : (isDark ? 'bg-neutral-800/30 border-neutral-700/30 hover:border-emerald-500/50 hover:bg-emerald-900/20' : 'bg-gray-50/60 border-gray-200/50 hover:border-emerald-400/60 hover:bg-emerald-50/60'),
        text: isSelected
          ? (isDark ? 'text-emerald-300' : 'text-emerald-900')
          : (isDark ? 'text-gray-300 group-hover:text-emerald-300' : 'text-gray-700 group-hover:text-emerald-700'),
        check: isDark ? 'text-emerald-400' : 'text-emerald-600'
      },
      'relatorio-geral': {
        bg: isSelected 
          ? (isDark ? 'bg-pink-600/40 border-pink-400/70' : 'bg-pink-100 border-pink-400')
          : (isDark ? 'bg-neutral-800/30 border-neutral-700/30 hover:border-pink-500/50 hover:bg-pink-900/20' : 'bg-gray-50/60 border-gray-200/50 hover:border-pink-400/60 hover:bg-pink-50/60'),
        text: isSelected
          ? (isDark ? 'text-pink-300' : 'text-pink-900')
          : (isDark ? 'text-gray-300 group-hover:text-pink-300' : 'text-gray-700 group-hover:text-pink-700'),
        check: isDark ? 'text-pink-400' : 'text-pink-600'
      },
      'gestao-liderados': {
        bg: isSelected 
          ? (isDark ? 'bg-orange-600/40 border-orange-400/70' : 'bg-orange-100 border-orange-400')
          : (isDark ? 'bg-neutral-800/30 border-neutral-700/30 hover:border-orange-500/50 hover:bg-orange-900/20' : 'bg-gray-50/60 border-gray-200/50 hover:border-orange-400/60 hover:bg-orange-50/60'),
        text: isSelected
          ? (isDark ? 'text-orange-300' : 'text-orange-900')
          : (isDark ? 'text-gray-300 group-hover:text-orange-300' : 'text-gray-700 group-hover:text-orange-700'),
        check: isDark ? 'text-orange-400' : 'text-orange-600'
      }
    };
    return colors[id as keyof typeof colors] || colors['disc'];
  };

  // Função para lidar com clique nas especialidades do Caio - ENVIA MENSAGEM AUTOMATICAMENTE
  const handleEspecialidadeClick = (tipo: string) => {
    const prompt = ESPECIALIDADE_PROMPTS[tipo];
    const especialidadeNome = especialidades.find(e => e.id === tipo)?.text || tipo;
    const displayText = `Olá Caio, gostaria de gerar ${especialidadeNome}`;
    
    if (prompt && (window as any).sendCaioKotlerMessage) {
      // Enviar prompt completo para o webhook + mensagem resumida para o chat
      (window as any).sendCaioKotlerMessage(prompt, displayText);
      setSelectedEspecialidade(tipo);
      
      // Resetar seleção após 2 segundos
      setTimeout(() => {
        setSelectedEspecialidade(null);
      }, 2000);
    }
  };

  // Função para lidar com clique nas especialidades da Elaine - ENVIA MENSAGEM AUTOMATICAMENTE
  const handleElaineEspecialidadeClick = async (tipo: string) => {
    // 🎯 CORRETOR: DISC, ENEAGRAMA, MBTI - Abrir tela de resultado do teste
    if (isCorretor && (tipo === 'disc' || tipo === 'eneagrama' || tipo === 'mbti')) {
      
      if (!corretorIdNumerico) {
        console.error('❌ ID do corretor não encontrado');
        return;
      }
      
      // Abrir modal diretamente - o componente de teste detecta resultado automaticamente
      if (tipo === 'disc') {
        setMostrarResultadoDISC(true);
      } else if (tipo === 'eneagrama') {
        setMostrarResultadoEneagrama(true);
      } else if (tipo === 'mbti') {
        setMostrarResultadoMBTI(true);
      }
      
      return;
    }
    
    // 🎯 ADMIN ONLY: DISC abre modal de estatísticas
    if (tipo === 'disc' && !isCorretor) {
      setShowDISCSelector(true);
      return;
    }
    
    // 🎯 ADMIN ONLY: ENEAGRAMA abre modal de estatísticas
    if (tipo === 'eneagrama' && !isCorretor) {
      setShowEneagramaSelector(true);
      return;
    }
    
    // 🎯 ADMIN ONLY: MBTI abre modal de estatísticas
    if (tipo === 'mbti' && !isCorretor) {
      setShowMBTISelector(true);
      return;
    }
    
    // 📊 ADMIN ONLY: Relatório Geral - Redirecionar para dashboard de resultados gerais
    if (tipo === 'relatorio-geral' && isGestao) {
      navigate('/admin-testes-gerais');
      return;
    }
    
    // 👥 ADMIN ONLY: Gestão de Liderados - abrir modal de seleção de corretor
    if (tipo === 'gestao-liderados' && isGestao) {
      setSelectedEspecialidade(tipo);
      setShowGestaoLideradosSelector(true);
      return;
    }
    
    // Outros tipos: apenas marcar especialidade selecionada
    // NÃO enviar automaticamente - envio acontecerá quando usuário digitar e enviar mensagem
    setSelectedEspecialidade(tipo);
  };
  
  
  // Função para limpar corretor selecionado (DISC)
  const handleClearCorretor = () => {
    setSelectedCorretor(null);
  };
  
  
  // Função para limpar corretor selecionado (ENEAGRAMA)
  const handleClearCorretorEneagrama = () => {
    setSelectedCorretorEneagrama(null);
  };
  
  
  // Função para limpar corretor selecionado (MBTI)
  const handleClearCorretorMBTI = () => {
    setSelectedCorretorMBTI(null);
  };

  // Função para renderizar a página da Agente Elaine
  const renderElaineAgent = () => (
    <div className={`h-screen flex flex-col overflow-hidden ${isDarkMode ? '' : 'bg-gray-50'}`} style={{ backgroundColor: isDarkMode ? 'var(--bg-primary)' : undefined }}>
      {/* Header da Elaine - Layout adaptável ao tema */}
      <div className={`border-b ${isDarkMode ? 'border-neutral-800/40' : 'border-pink-200'} bg-gradient-to-br ${isDarkMode ? 'from-pink-600/10 via-purple-600/10 to-pink-600/5' : 'from-pink-50/30 via-purple-50/30 to-pink-50/30'} backdrop-blur-sm flex-shrink-0`}>
        <div className="w-full px-4 py-3">
          <div className="flex items-center justify-between">
            
            {/* ESQUERDA: Avatar da Elaine + Info */}
            <div className="flex items-center gap-4 flex-shrink-0">
              {/* Avatar da Elaine - Ícone Profissional */}
              <div className="relative">
                <div className={`w-16 h-16 rounded-2xl overflow-hidden ring-2 ${isDarkMode ? 'ring-pink-500/30' : 'ring-pink-500/40'} shadow-xl ${isDarkMode ? 'shadow-pink-500/30' : 'shadow-pink-500/20'} bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center`}>
                  <span className="text-4xl">👩‍💼</span>
                </div>
                {/* Badge de Status Online */}
                <div className={`absolute -bottom-0.5 -right-0.5 px-1.5 py-0.5 bg-green-500 rounded-full shadow-lg border ${isDarkMode ? 'border-neutral-900' : 'border-2 border-white'} flex items-center gap-0.5`}>
                  <div className="w-1 h-1 bg-white rounded-full animate-pulse"></div>
                  <span className="text-white text-[9px] font-bold">Online</span>
                </div>
              </div>
              
              {/* Informações da Agente */}
              <div>
                <h1 className={`text-xl font-black mb-0.5 bg-gradient-to-r ${isDarkMode ? 'from-pink-400 via-purple-400 to-pink-400' : 'from-pink-600 via-purple-600 to-pink-600'} bg-clip-text text-transparent`}>
                  Agente Elaine
                </h1>
                <p className={`${isDarkMode ? 'text-gray-300' : 'text-gray-600'} text-[10px] font-medium mb-1.5`}>
                  Agente de Inteligência Comportamental e Gestão de Pessoas
                </p>
                <div className="flex flex-wrap gap-1">
                  <span className={`px-1.5 py-0.5 ${isDarkMode ? 'bg-pink-600/20 border-pink-500/30 text-pink-300' : 'bg-pink-100 border-pink-300 text-pink-700'} border rounded-full text-[9px] font-semibold`}>
                    🧩 Profiler
                  </span>
                  <span className={`px-1.5 py-0.5 ${isDarkMode ? 'bg-purple-600/20 border-purple-500/30 text-purple-300' : 'bg-purple-100 border-purple-300 text-purple-700'} border rounded-full text-[9px] font-semibold`}>
                    👥 RH & Gestão
                  </span>
                  <span className={`px-1.5 py-0.5 ${isDarkMode ? 'bg-blue-600/20 border-blue-500/30 text-blue-300' : 'bg-blue-100 border-blue-300 text-blue-700'} border rounded-full text-[9px] font-semibold`}>
                    📊 Análise Comportamental
                  </span>
                  <span className={`px-1.5 py-0.5 ${isDarkMode ? 'bg-cyan-600/20 border-cyan-500/30 text-cyan-300' : 'bg-cyan-100 border-cyan-300 text-cyan-700'} border rounded-full text-[9px] font-semibold`}>
                    🎯 Desenvolvimento
                  </span>
                </div>
              </div>
            </div>

            {/* DIREITA: Cards de Métricas */}
            <div className="flex gap-2 flex-shrink-0">
              <div className={`bg-gradient-to-br ${isDarkMode ? 'from-pink-600/10 to-pink-600/5' : 'from-pink-100 to-pink-50'} border ${isDarkMode ? 'border-pink-500/20' : 'border-pink-300'} rounded-lg px-2.5 py-1.5`}>
                <div className={`${isDarkMode ? 'text-pink-300' : 'text-pink-600'} text-[9px] font-semibold`}>Especialidade</div>
                <div className={`${isDarkMode ? 'text-white' : 'text-gray-900'} text-[11px] font-bold`}>RH & Gestão</div>
              </div>
              <div className={`bg-gradient-to-br ${isDarkMode ? 'from-purple-600/10 to-purple-600/5' : 'from-purple-100 to-purple-50'} border ${isDarkMode ? 'border-purple-500/20' : 'border-purple-300'} rounded-lg px-2.5 py-1.5`}>
                <div className={`${isDarkMode ? 'text-purple-300' : 'text-purple-600'} text-[9px] font-semibold`}>Metodologia</div>
                <div className={`${isDarkMode ? 'text-white' : 'text-gray-900'} text-[11px] font-bold`}>DISC+MBTI+Eneagrama</div>
              </div>
              <div className={`bg-gradient-to-br ${isDarkMode ? 'from-green-600/10 to-green-600/5' : 'from-green-100 to-green-50'} border ${isDarkMode ? 'border-green-500/20' : 'border-green-300'} rounded-lg px-2.5 py-1.5`}>
                <div className={`${isDarkMode ? 'text-green-300' : 'text-green-600'} text-[9px] font-semibold`}>Status</div>
                <div className={`${isDarkMode ? 'text-white' : 'text-gray-900'} text-[11px] font-bold`}>24/7 🟢</div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Grid Layout: Info + Chat - ESTÁTICO - SEM SCROLL NA PÁGINA */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-4 gap-0" style={{ minHeight: 0, maxHeight: 'calc(100vh - 120px)' }}>
        
        {/* Sidebar de Informações - Compacta com Scroll Interno */}
        <div className={`lg:col-span-1 border-r ${isDarkMode ? 'border-neutral-800/40' : 'border-pink-200'} overflow-y-auto p-4 bg-gradient-to-b ${isDarkMode ? 'from-neutral-900/30 to-transparent' : 'from-pink-50/20 to-transparent'}`}>
          <div className="space-y-4">
            
            {/* Sobre o Agente - Compacto */}
            <div className={`bg-gradient-to-br ${isDarkMode ? 'from-neutral-800/50 to-neutral-900/50 border border-neutral-700/50 p-3' : 'from-gray-100/80 to-gray-50/80 border-2 border-gray-200/60 p-3.5'} rounded-xl shadow-md`}>
              <h3 className={`${isDarkMode ? 'text-white' : 'text-gray-800'} font-bold text-sm mb-2 flex items-center gap-2`}>
                <span className="text-lg">👩‍💼</span>
                <span className={`${isDarkMode ? 'bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent' : 'text-pink-600'}`}>
                  Quem sou eu?
                </span>
              </h3>
              <p className={`${isDarkMode ? 'text-white' : 'text-gray-600'} text-xs leading-relaxed`}>
                <span className={`${isDarkMode ? 'text-pink-400 font-semibold' : 'text-pink-600 font-bold'}`}>Agente de Inteligência Comportamental</span>, 
                especialista em decodificar perfis humanos (DISC, Eneagrama, MBTI) e criar estratégias personalizadas de liderança, comunicação e desenvolvimento.
              </p>
            </div>

            {/* CORRETOR: Meus Resultados | ADMIN: Especialidades */}
            <div className={`bg-gradient-to-br ${isDarkMode ? 'from-neutral-800/50 to-neutral-900/50 border border-neutral-700/50 p-3' : 'from-gray-100/80 to-gray-50/80 border-2 border-gray-200/60 p-3.5'} rounded-xl shadow-md`}>
              <h3 className={`${isDarkMode ? 'text-white' : 'text-gray-800'} font-bold text-sm mb-2 flex items-center gap-2`}>
                <span className="text-lg">{isCorretor ? '📊' : '🎯'}</span>
                <span className={`${isDarkMode ? 'bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent' : 'text-purple-600'}`}>
                  {isCorretor ? 'Meus Resultados' : 'Especialidades'}
                </span>
              </h3>
              <p className={`${isDarkMode ? 'text-gray-400' : 'text-gray-600'} text-[10px] ${isDarkMode ? 'mb-2' : 'mb-2.5'} italic ${isDarkMode ? '' : 'font-medium'}`}>
                {isCorretor ? '📈 Visualize seus testes' : '💡 Clique em uma especialidade para começar!'}
              </p>
              <div className="space-y-1.5">
                {isCorretor ? (
                  // CORRETOR: Botões para visualizar seus próprios testes
                  <>
                    <button
                      onClick={() => handleElaineEspecialidadeClick('disc')}
                      className={`w-full flex items-center gap-2 ${isDarkMode ? 'p-2' : 'p-2.5'} rounded-lg ${isDarkMode ? 'border' : 'border-2'} transition-all duration-200 cursor-pointer group ${getEspecialidadeColors('disc', selectedEspecialidade === 'disc', isDarkMode).bg} hover:shadow-sm`}
                    >
                      <span className="text-sm flex-shrink-0 transition-transform group-hover:scale-110">🎯</span>
                      <span className={`text-xs leading-tight font-semibold transition-colors ${getEspecialidadeColors('disc', selectedEspecialidade === 'disc', isDarkMode).text}`}>
                        DISC
                      </span>
                      <span className={`ml-auto text-[10px] font-bold ${statusTestes.disc ? (isDarkMode ? 'text-green-400' : 'text-green-600') : (isDarkMode ? 'text-gray-600' : 'text-gray-400')}`}>
                        {statusTestes.disc ? '✓' : '○'}
                      </span>
                    </button>
                    
                    <button
                      onClick={() => handleElaineEspecialidadeClick('eneagrama')}
                      className={`w-full flex items-center gap-2 ${isDarkMode ? 'p-2' : 'p-2.5'} rounded-lg ${isDarkMode ? 'border' : 'border-2'} transition-all duration-200 cursor-pointer group ${getEspecialidadeColors('eneagrama', selectedEspecialidade === 'eneagrama', isDarkMode).bg} hover:shadow-sm`}
                    >
                      <span className="text-sm flex-shrink-0 transition-transform group-hover:scale-110">⭐</span>
                      <span className={`text-xs leading-tight font-semibold transition-colors ${getEspecialidadeColors('eneagrama', selectedEspecialidade === 'eneagrama', isDarkMode).text}`}>
                        ENEAGRAMA
                      </span>
                      <span className={`ml-auto text-[10px] font-bold ${statusTestes.eneagrama ? (isDarkMode ? 'text-green-400' : 'text-green-600') : (isDarkMode ? 'text-gray-600' : 'text-gray-400')}`}>
                        {statusTestes.eneagrama ? '✓' : '○'}
                      </span>
                    </button>
                    
                    <button
                      onClick={() => handleElaineEspecialidadeClick('mbti')}
                      className={`w-full flex items-center gap-2 ${isDarkMode ? 'p-2' : 'p-2.5'} rounded-lg ${isDarkMode ? 'border' : 'border-2'} transition-all duration-200 cursor-pointer group ${getEspecialidadeColors('mbti', selectedEspecialidade === 'mbti', isDarkMode).bg} hover:shadow-sm`}
                    >
                      <span className="text-sm flex-shrink-0 transition-transform group-hover:scale-110">🧠</span>
                      <span className={`text-xs leading-tight font-semibold transition-colors ${getEspecialidadeColors('mbti', selectedEspecialidade === 'mbti', isDarkMode).text}`}>
                        MBTI
                      </span>
                      <span className={`ml-auto text-[10px] font-bold ${statusTestes.mbti ? (isDarkMode ? 'text-green-400' : 'text-green-600') : (isDarkMode ? 'text-gray-600' : 'text-gray-400')}`}>
                        {statusTestes.mbti ? '✓' : '○'}
                      </span>
                    </button>
                    
                    {/* Botão Meu Resumo */}
                    <button
                      onClick={() => {
                        setMostrarMeuResumo(true);
                      }}
                      className={`w-full flex items-center gap-2 ${isDarkMode ? 'p-2.5' : 'p-3'} rounded-lg ${isDarkMode ? 'border-2' : 'border-2'} transition-all duration-200 cursor-pointer group ${isDarkMode ? 'bg-gradient-to-r from-pink-600/30 via-purple-600/30 to-blue-600/30 border-pink-500/50 hover:from-pink-600/40 hover:via-purple-600/40 hover:to-blue-600/40' : 'bg-gradient-to-r from-pink-100 via-purple-100 to-blue-100 border-pink-400 hover:from-pink-200 hover:via-purple-200 hover:to-blue-200'} shadow-lg hover:shadow-xl`}
                    >
                      <span className="text-base flex-shrink-0 transition-transform group-hover:scale-110">✨</span>
                      <span className={`text-xs leading-tight font-bold transition-colors ${isDarkMode ? 'text-white' : 'text-black'}`}>
                        Meu Resumo
                      </span>
                    </button>
                  </>
                ) : (
                  // ADMIN: Especialidades + Botões de Testes Próprios
                  <>
                    {/* Botões de Testes do Admin (ANTES das especialidades) */}
                    <div className={`mb-3 pb-3 border-b ${isDarkMode ? 'border-neutral-700/50' : 'border-gray-200'}`}>
                      <p className={`text-[10px] font-semibold mb-2 ${isDarkMode ? 'text-pink-400' : 'text-pink-600'}`}>
                        📝 Meus Testes (Gestor)
                      </p>
                      
                      {/* Botão Realizar Testes */}
                      <button
                        onClick={() => setShowAdminTestSelector(true)}
                        className={`w-full flex items-center gap-2 p-2.5 rounded-lg border-2 transition-all duration-200 cursor-pointer group mb-2 ${
                          isDarkMode 
                            ? 'bg-gradient-to-r from-cyan-600/20 to-blue-600/20 border-cyan-500/50 hover:from-cyan-600/30 hover:to-blue-600/30' 
                            : 'bg-gradient-to-r from-cyan-50 to-blue-50 border-cyan-400 hover:from-cyan-100 hover:to-blue-100'
                        } shadow-sm hover:shadow-md`}
                      >
                        <span className="text-base flex-shrink-0 transition-transform group-hover:scale-110">📋</span>
                        <span className={`text-xs leading-tight font-bold transition-colors ${isDarkMode ? 'text-cyan-300' : 'text-cyan-700'}`}>
                          Realizar Testes
                        </span>
                        <span className={`ml-auto text-[9px] font-bold ${
                          adminTestesStatus.disc && adminTestesStatus.eneagrama && adminTestesStatus.mbti
                            ? (isDarkMode ? 'text-green-400' : 'text-green-600')
                            : (isDarkMode ? 'text-yellow-400' : 'text-yellow-600')
                        }`}>
                          {[adminTestesStatus.disc, adminTestesStatus.eneagrama, adminTestesStatus.mbti].filter(Boolean).length}/3
                        </span>
                      </button>
                      
                      {/* Botão Meus Resultados */}
                      <button
                        onClick={handleAnexarResultadosAdmin}
                        disabled={!adminResultados}
                        className={`w-full flex items-center gap-2 p-2.5 rounded-lg border-2 transition-all duration-200 cursor-pointer group mb-2 ${
                          adminResultados
                            ? isDarkMode 
                              ? 'bg-gradient-to-r from-purple-600/20 to-pink-600/20 border-purple-500/50 hover:from-purple-600/30 hover:to-pink-600/30' 
                              : 'bg-gradient-to-r from-purple-50 to-pink-50 border-purple-400 hover:from-purple-100 hover:to-pink-100'
                            : isDarkMode
                              ? 'bg-neutral-800/30 border-neutral-700/30 opacity-50 cursor-not-allowed'
                              : 'bg-gray-100 border-gray-300 opacity-50 cursor-not-allowed'
                        } shadow-sm hover:shadow-md`}
                      >
                        <span className="text-base flex-shrink-0 transition-transform group-hover:scale-110">📊</span>
                        <span className={`text-xs leading-tight font-bold transition-colors ${
                          adminResultados
                            ? (isDarkMode ? 'text-purple-300' : 'text-purple-700')
                            : (isDarkMode ? 'text-gray-500' : 'text-gray-400')
                        }`}>
                          Meus Resultados
                        </span>
                      </button>
                      
                      {/* Botão Excluir Meus Resultados */}
                      {adminResultados && (
                        <button
                          onClick={handleExcluirResultadosAdmin}
                          disabled={loadingAdminTestes}
                          className={`w-full flex items-center gap-2 p-2 rounded-lg border transition-all duration-200 cursor-pointer group ${
                            isDarkMode 
                              ? 'bg-red-900/20 border-red-500/30 hover:bg-red-900/30 hover:border-red-500/50' 
                              : 'bg-red-50 border-red-300 hover:bg-red-100 hover:border-red-400'
                          }`}
                        >
                          <span className="text-sm flex-shrink-0 transition-transform group-hover:scale-110">🗑️</span>
                          <span className={`text-[10px] leading-tight font-semibold transition-colors ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                            {loadingAdminTestes ? 'Excluindo...' : 'Excluir Meus Resultados'}
                          </span>
                        </button>
                      )}
                    </div>
                    
                    {/* Especialidades normais do Admin */}
                    {especialidadesElaine
                      .filter(item => !item.adminOnly || isGestao)
                      .map((item) => {
                        const colors = getEspecialidadeColors(item.id, selectedEspecialidade === item.id, isDarkMode);
                        return (
                          <button
                            key={item.id}
                            onClick={() => handleElaineEspecialidadeClick(item.id)}
                            className={`w-full flex items-center gap-2 ${isDarkMode ? 'p-2' : 'p-2.5'} rounded-lg ${isDarkMode ? 'border' : 'border-2'} transition-all duration-200 cursor-pointer group ${colors.bg} ${
                              selectedEspecialidade === item.id ? 'scale-[0.98] shadow-md' : 'hover:shadow-sm'
                            }`}
                          >
                            <span className={`text-sm flex-shrink-0 transition-transform ${
                              selectedEspecialidade === item.id ? 'scale-125' : 'group-hover:scale-110'
                            }`}>{item.icon}</span>
                            <span className={`text-xs leading-tight font-semibold transition-colors ${colors.text}`}>
                              {item.text}
                            </span>
                            {selectedEspecialidade === item.id && (
                              <span className={`ml-auto ${colors.check} text-xs animate-pulse font-bold`}>✓</span>
                            )}
                          </button>
                        );
                      })}
                  </>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Área de Chat - 3/4 - ESTÁTICO */}
        <div className="lg:col-span-3 flex flex-col overflow-hidden p-4" style={{ maxHeight: 'calc(100vh - 120px)' }}>
          <ElaineChat 
            onPromptSelect={(prompt) => console.log('Prompt selected:', prompt)} 
            selectedCorretor={selectedCorretor}
            onClearCorretor={handleClearCorretor}
            selectedEspecialidade={selectedEspecialidade}
            especialidadePrompt={selectedEspecialidade ? ELAINE_PROMPTS[selectedEspecialidade] : undefined}
            selectedCorretorEneagrama={selectedCorretorEneagrama}
            onClearCorretorEneagrama={handleClearCorretorEneagrama}
            selectedCorretorMBTI={selectedCorretorMBTI}
            onClearCorretorMBTI={handleClearCorretorMBTI}
            selectedCorretorGestaoLiderados={selectedCorretorGestaoLiderados}
          />
        </div>

      </div>
      
      {/* Modal Estatísticas DISC (Admin Only) */}
      <DISCStatistics
        isOpen={showDISCSelector}
        onClose={() => setShowDISCSelector(false)}
        onSelectCorretor={(id, nome) => {
          // Quando admin clicar em um corretor específico, o modal individual será aberto
          // NÃO fechar o modal de estatísticas aqui - deixar o modal individual abrir por cima
          // O modal individual será renderizado dentro do DISCStatistics
        }}
        isDarkMode={isDarkMode}
      />
      
      {/* Modal Estatísticas ENEAGRAMA (Admin Only) */}
      <EneagramaStatistics
        isOpen={showEneagramaSelector}
        onClose={() => setShowEneagramaSelector(false)}
        onSelectCorretor={(id, nome) => {
          // Quando admin clicar em um corretor específico, o modal individual será aberto
          // NÃO fechar o modal de estatísticas aqui - deixar o modal individual abrir por cima
          // O modal individual será renderizado dentro do EneagramaStatistics
        }}
        isDarkMode={isDarkMode}
      />
      
      {/* Modal Estatísticas MBTI (Admin Only) */}
      <MBTIStatistics
        isOpen={showMBTISelector}
        onClose={() => setShowMBTISelector(false)}
        onSelectCorretor={(id, nome) => {
          // Quando admin clicar em um corretor específico, o modal individual será aberto
          // NÃO fechar o modal de estatísticas aqui - deixar o modal individual abrir por cima
          // O modal individual será renderizado dentro do MBTIStatistics
        }}
        isDarkMode={isDarkMode}
      />
      
      {/* Modal Seletor de Corretor para Gestão de Liderados */}
      <GestaoLideradosCorretorSelector
        isOpen={showGestaoLideradosSelector}
        onClose={() => setShowGestaoLideradosSelector(false)}
        onSelectCorretor={(corretorNome) => {
          setSelectedCorretorGestaoLiderados(corretorNome);
        }}
        isDarkMode={isDarkMode}
      />
      
      {/* Modal "Meu Resumo" - Popup simples do corretor */}
      {(() => {
        return null;
      })()}
      {mostrarMeuResumo && isCorretor ? (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          style={{ zIndex: 99999 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setMostrarMeuResumo(false);
            }
          }}
        >
          <div 
            className={`${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'} rounded-2xl shadow-2xl max-w-5xl w-full max-h-[85vh] overflow-hidden border-2`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header do Modal */}
            <div className={`${isDarkMode ? 'bg-gradient-to-r from-pink-600 via-purple-600 to-blue-600' : 'bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500'} px-6 py-4 flex items-center justify-between`}>
              <h2 className="text-2xl font-bold text-white">✨ Meu Resumo</h2>
              <button
                onClick={() => setMostrarMeuResumo(false)}
                className="text-white/80 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Conteúdo Scrollável */}
            <div className="overflow-y-auto max-h-[calc(85vh-80px)]">
              <MeuResumoCompleto />
            </div>
          </div>
        </div>
      ) : null}
      
      {/* Modal Resultado DISC do Corretor - Usa tela de resultado do teste */}
      {mostrarResultadoDISC && isCorretor && corretorIdNumerico && corretorNomeResolvido && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          style={{ zIndex: 99999 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setMostrarResultadoDISC(false);
            }
          }}
        >
          <div 
            className="relative w-full max-w-7xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Botão Fechar - Mesmo estilo do MBTI */}
            <button
              onClick={() => setMostrarResultadoDISC(false)}
              className="absolute top-4 right-4 z-[100] p-2 rounded-full bg-gray-200 hover:bg-gray-300 transition-colors"
              title="Fechar"
            >
              <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            {/* Componente de Teste DISC - Scrollável */}
            <div className="w-full h-full overflow-y-auto overflow-x-hidden">
              <TesteDISC
                corretorId={corretorIdNumerico.toString()}
                corretorNome={corretorNomeResolvido}
                corretorEmail={user?.email || ''}
                onConcluir={() => setMostrarResultadoDISC(false)}
                onVoltar={() => setMostrarResultadoDISC(false)}
              />
            </div>
          </div>
        </div>
      )}
      
      {/* Modal Resultado ENEAGRAMA do Corretor */}
      {mostrarResultadoEneagrama && isCorretor && corretorIdNumerico && corretorNomeResolvido && (
        <EneagramaCorretorIndividualModal
          isOpen={mostrarResultadoEneagrama}
          onClose={() => setMostrarResultadoEneagrama(false)}
          corretorId={corretorIdNumerico}
          corretorNome={corretorNomeResolvido}
        />
      )}
      
      {/* Modal Resultado MBTI do Corretor */}
      {mostrarResultadoMBTI && isCorretor && corretorIdNumerico && corretorNomeResolvido && (
        <MBTICorretorIndividualModal
          isOpen={mostrarResultadoMBTI}
          onClose={() => setMostrarResultadoMBTI(false)}
          corretorId={corretorIdNumerico}
          corretorNome={corretorNomeResolvido}
        />
      )}
      
      {/* Modal "Meus Resultados" - Mostra tela de onboarding com testes completos */}
      {mostrarMeusResultados && isCorretor && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          style={{ zIndex: 99999 }}
          onClick={(e) => {
            // Fechar apenas se clicar no backdrop (não no conteúdo)
            if (e.target === e.currentTarget) {
              setMostrarMeusResultados(false);
            }
          }}
        >
          <div 
            className="relative w-full h-full max-w-7xl max-h-[90vh] bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Botão Fechar */}
            <button
              onClick={() => setMostrarMeusResultados(false)}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-gray-200 dark:bg-neutral-800 hover:bg-gray-300 dark:hover:bg-neutral-700 transition-colors"
            >
              <svg className="w-6 h-6 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            {/* Conteúdo: Tela de Onboarding ou Loading */}
            <div className="w-full h-full overflow-auto">
              {!corretorIdNumerico ? (
                // Loading state enquanto busca o ID do corretor
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Carregando seus dados...</p>
                  </div>
                </div>
              ) : (
                <TestesComportamentaisOnboarding
                  corretorId={corretorIdNumerico.toString()}
                  corretorNome={user?.name || ''}
                  corretorEmail={user?.email}
                  modoVisualizacao={true}
                  onIniciarTeste={(teste) => {
                    // Fechar modal e iniciar teste
                    setMostrarMeusResultados(false);
                    setTesteAtual(teste);
                  }}
                  onTestesCompletos={() => {
                    // Apenas fechar o modal, já estamos na Elaine
                    setMostrarMeusResultados(false);
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* ========== MODAIS PARA ADMIN/OWNER ========== */}
      
      {/* Modal Seletor de Testes do Admin */}
      {showAdminTestSelector && !isCorretor && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          style={{ zIndex: 99999 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAdminTestSelector(false);
            }
          }}
        >
          <div 
            className={`relative w-full max-w-md ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'} rounded-2xl shadow-2xl overflow-hidden border-2`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`${isDarkMode ? 'bg-gradient-to-r from-cyan-600 via-blue-600 to-purple-600' : 'bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500'} px-6 py-4 flex items-center justify-between`}>
              <h2 className="text-xl font-bold text-white">📋 Realizar Testes</h2>
              <button
                onClick={() => setShowAdminTestSelector(false)}
                className="text-white/80 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Conteúdo */}
            <div className="p-6 space-y-4">
              <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                Selecione qual teste você deseja realizar:
              </p>
              
              {/* Botão DISC */}
              <button
                onClick={() => {
                  setShowAdminTestSelector(false);
                  setAdminTesteAtual('disc');
                }}
                disabled={adminTestesStatus.disc}
                className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                  adminTestesStatus.disc
                    ? isDarkMode ? 'bg-green-900/20 border-green-500/30 cursor-not-allowed' : 'bg-green-50 border-green-300 cursor-not-allowed'
                    : isDarkMode ? 'bg-pink-900/20 border-pink-500/50 hover:bg-pink-900/30' : 'bg-pink-50 border-pink-400 hover:bg-pink-100'
                }`}
              >
                <span className="text-2xl">🎯</span>
                <div className="text-left flex-1">
                  <p className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Teste DISC</p>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {adminTestesStatus.disc ? '✅ Concluído' : 'Dominância, Influência, Estabilidade, Conformidade'}
                  </p>
                </div>
                {adminTestesStatus.disc && <span className="text-green-500 text-xl">✓</span>}
              </button>
              
              {/* Botão Eneagrama */}
              <button
                onClick={() => {
                  setShowAdminTestSelector(false);
                  setAdminTesteAtual('eneagrama');
                }}
                disabled={adminTestesStatus.eneagrama}
                className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                  adminTestesStatus.eneagrama
                    ? isDarkMode ? 'bg-green-900/20 border-green-500/30 cursor-not-allowed' : 'bg-green-50 border-green-300 cursor-not-allowed'
                    : isDarkMode ? 'bg-purple-900/20 border-purple-500/50 hover:bg-purple-900/30' : 'bg-purple-50 border-purple-400 hover:bg-purple-100'
                }`}
              >
                <span className="text-2xl">⭐</span>
                <div className="text-left flex-1">
                  <p className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Teste Eneagrama</p>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {adminTestesStatus.eneagrama ? '✅ Concluído' : '9 tipos de personalidade'}
                  </p>
                </div>
                {adminTestesStatus.eneagrama && <span className="text-green-500 text-xl">✓</span>}
              </button>
              
              {/* Botão MBTI */}
              <button
                onClick={() => {
                  setShowAdminTestSelector(false);
                  navigate('/importar-16personalities');
                }}
                disabled={adminTestesStatus.mbti}
                className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                  adminTestesStatus.mbti
                    ? isDarkMode ? 'bg-green-900/20 border-green-500/30 cursor-not-allowed' : 'bg-green-50 border-green-300 cursor-not-allowed'
                    : isDarkMode ? 'bg-blue-900/20 border-blue-500/50 hover:bg-blue-900/30' : 'bg-blue-50 border-blue-400 hover:bg-blue-100'
                }`}
              >
                <span className="text-2xl">🧠</span>
                <div className="text-left flex-1">
                  <p className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Teste MBTI</p>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {adminTestesStatus.mbti ? '✅ Concluído' : '16 tipos de personalidade'}
                  </p>
                </div>
                {adminTestesStatus.mbti && <span className="text-green-500 text-xl">✓</span>}
              </button>
              
              {/* Status geral */}
              <div className={`mt-4 p-3 rounded-lg ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-100'}`}>
                <p className={`text-xs text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Testes concluídos: {[adminTestesStatus.disc, adminTestesStatus.eneagrama, adminTestesStatus.mbti].filter(Boolean).length}/3
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal Resultados do Admin para Anexar no Chat */}
      {showAdminResultados && adminResultados && !isCorretor && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          style={{ zIndex: 99999 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAdminResultados(false);
            }
          }}
        >
          <div 
            className={`relative w-full max-w-2xl max-h-[80vh] ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'} rounded-2xl shadow-2xl overflow-hidden border-2`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`${isDarkMode ? 'bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600' : 'bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500'} px-6 py-4 flex items-center justify-between`}>
              <h2 className="text-xl font-bold text-white">📊 Meus Resultados</h2>
              <button
                onClick={() => setShowAdminResultados(false)}
                className="text-white/80 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Conteúdo */}
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)]">
              <p className={`text-sm mb-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                Selecione quais resultados deseja anexar ao chat:
              </p>
              
              <div className="space-y-3">
                {/* DISC */}
                {adminResultados.disc && (
                  <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    adminResultadosSelecionados.includes('disc')
                      ? isDarkMode ? 'bg-pink-900/30 border-pink-500' : 'bg-pink-100 border-pink-500'
                      : isDarkMode ? 'bg-neutral-800 border-neutral-700 hover:border-pink-500/50' : 'bg-gray-50 border-gray-200 hover:border-pink-400'
                  }`}>
                    <input
                      type="checkbox"
                      checked={adminResultadosSelecionados.includes('disc')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setAdminResultadosSelecionados([...adminResultadosSelecionados, 'disc']);
                        } else {
                          setAdminResultadosSelecionados(adminResultadosSelecionados.filter(r => r !== 'disc'));
                        }
                      }}
                      className="mt-1 w-5 h-5 rounded border-2 text-pink-500 focus:ring-pink-500"
                    />
                    <div className="flex-1">
                      <p className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>🎯 DISC</p>
                      <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Perfil: <span className="font-semibold">{adminResultados.disc.tipoPrincipal}</span>
                      </p>
                      <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                        D: {(adminResultados.disc.percentuais.D * 100).toFixed(0)}% | 
                        I: {(adminResultados.disc.percentuais.I * 100).toFixed(0)}% | 
                        S: {(adminResultados.disc.percentuais.S * 100).toFixed(0)}% | 
                        C: {(adminResultados.disc.percentuais.C * 100).toFixed(0)}%
                      </p>
                    </div>
                  </label>
                )}
                
                {/* Eneagrama */}
                {adminResultados.eneagrama && (
                  <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    adminResultadosSelecionados.includes('eneagrama')
                      ? isDarkMode ? 'bg-purple-900/30 border-purple-500' : 'bg-purple-100 border-purple-500'
                      : isDarkMode ? 'bg-neutral-800 border-neutral-700 hover:border-purple-500/50' : 'bg-gray-50 border-gray-200 hover:border-purple-400'
                  }`}>
                    <input
                      type="checkbox"
                      checked={adminResultadosSelecionados.includes('eneagrama')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setAdminResultadosSelecionados([...adminResultadosSelecionados, 'eneagrama']);
                        } else {
                          setAdminResultadosSelecionados(adminResultadosSelecionados.filter(r => r !== 'eneagrama'));
                        }
                      }}
                      className="mt-1 w-5 h-5 rounded border-2 text-purple-500 focus:ring-purple-500"
                    />
                    <div className="flex-1">
                      <p className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>⭐ Eneagrama</p>
                      <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Tipo: <span className="font-semibold">{adminResultados.eneagrama.tipoPrincipal}</span>
                      </p>
                    </div>
                  </label>
                )}
                
                {/* MBTI */}
                {adminResultados.mbti && (
                  <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    adminResultadosSelecionados.includes('mbti')
                      ? isDarkMode ? 'bg-blue-900/30 border-blue-500' : 'bg-blue-100 border-blue-500'
                      : isDarkMode ? 'bg-neutral-800 border-neutral-700 hover:border-blue-500/50' : 'bg-gray-50 border-gray-200 hover:border-blue-400'
                  }`}>
                    <input
                      type="checkbox"
                      checked={adminResultadosSelecionados.includes('mbti')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setAdminResultadosSelecionados([...adminResultadosSelecionados, 'mbti']);
                        } else {
                          setAdminResultadosSelecionados(adminResultadosSelecionados.filter(r => r !== 'mbti'));
                        }
                      }}
                      className="mt-1 w-5 h-5 rounded border-2 text-blue-500 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <p className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>🧠 MBTI</p>
                      <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Tipo: <span className="font-semibold">{adminResultados.mbti.tipo}</span>
                      </p>
                    </div>
                  </label>
                )}
              </div>
            </div>
            
            {/* Footer com botão de anexar */}
            <div className={`px-6 py-4 border-t ${isDarkMode ? 'border-neutral-700 bg-neutral-800/50' : 'border-gray-200 bg-gray-50'}`}>
              <button
                onClick={() => {
                  if (adminResultadosSelecionados.length === 0) {
                    toast({
                      title: "Selecione ao menos um resultado",
                      description: "Marque os testes que deseja anexar ao chat.",
                      variant: "destructive",
                    });
                    return;
                  }
                  
                  // Formatar resultados selecionados
                  const formatted = formatarResultadosParaWebhook(adminResultados);
                  
                  // Criar texto para anexar
                  let textoAnexo = '📋 **MEUS RESULTADOS DE TESTES:**\n\n';
                  if (adminResultadosSelecionados.includes('disc') && formatted.disc) {
                    textoAnexo += formatted.disc + '\n\n';
                  }
                  if (adminResultadosSelecionados.includes('eneagrama') && formatted.eneagrama) {
                    textoAnexo += formatted.eneagrama + '\n\n';
                  }
                  if (adminResultadosSelecionados.includes('mbti') && formatted.mbti) {
                    textoAnexo += formatted.mbti + '\n\n';
                  }
                  
                  // Salvar no localStorage para o ElaineChat pegar
                  localStorage.setItem('adminResultadosAnexados', JSON.stringify({
                    texto: textoAnexo,
                    resultados: adminResultados,
                    selecionados: adminResultadosSelecionados
                  }));
                  
                  // Disparar evento customizado para o ElaineChat
                  window.dispatchEvent(new CustomEvent('adminResultadosAnexados', {
                    detail: {
                      texto: textoAnexo,
                      resultados: adminResultados,
                      selecionados: adminResultadosSelecionados
                    }
                  }));
                  
                  toast({
                    title: "Resultados Anexados! 📎",
                    description: "Seus resultados foram anexados em contexto. Envie sua mensagem para a Elaine e eles seguirão no parâmetro Resultado_Usuario.",
                  });
                  
                  setShowAdminResultados(false);
                  setAdminResultadosSelecionados([]);
                }}
                disabled={adminResultadosSelecionados.length === 0}
                className={`w-full py-3 rounded-xl font-bold transition-all ${
                  adminResultadosSelecionados.length > 0
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700'
                    : isDarkMode ? 'bg-neutral-700 text-gray-500 cursor-not-allowed' : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                📎 Anexar {adminResultadosSelecionados.length > 0 ? `(${adminResultadosSelecionados.length})` : ''} ao Chat
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal de Teste DISC para Admin */}
      {adminTesteAtual === 'disc' && !isCorretor && user && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          style={{ zIndex: 99999 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setAdminTesteAtual(null);
            }
          }}
        >
          <div 
            className="relative w-full max-w-7xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setAdminTesteAtual(null)}
              className="absolute top-4 right-4 z-[100] p-2 rounded-full bg-gray-200 hover:bg-gray-300 transition-colors"
              title="Fechar"
            >
              <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            <div className="w-full h-full overflow-y-auto overflow-x-hidden">
              <TesteDISC
                corretorId={user.id}
                corretorNome={user.name || 'Gestor'}
                corretorEmail={user.email}
                isAdmin={true}
                onConcluir={() => {
                  setAdminTesteAtual(null);
                  // Recarregar status
                  verificarTestesAdminCompletos(user.id).then(setAdminTestesStatus);
                  buscarResultadosAdmin(user.id).then(setAdminResultados);
                }}
                onVoltar={() => setAdminTesteAtual(null)}
              />
            </div>
          </div>
        </div>
      )}
      
      {/* Modal de Teste Eneagrama para Admin */}
      {adminTesteAtual === 'eneagrama' && !isCorretor && user && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          style={{ zIndex: 99999 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setAdminTesteAtual(null);
            }
          }}
        >
          <div 
            className="relative w-full max-w-7xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setAdminTesteAtual(null)}
              className="absolute top-4 right-4 z-[100] p-2 rounded-full bg-gray-200 hover:bg-gray-300 transition-colors"
              title="Fechar"
            >
              <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            <div className="w-full h-full overflow-y-auto overflow-x-hidden">
              <TesteEneagrama
                corretorId={user.id}
                corretorNome={user.name || 'Gestor'}
                corretorEmail={user.email}
                isAdmin={true}
                onConcluir={() => {
                  setAdminTesteAtual(null);
                  verificarTestesAdminCompletos(user.id).then(setAdminTestesStatus);
                  buscarResultadosAdmin(user.id).then(setAdminResultados);
                }}
                onVoltar={() => setAdminTesteAtual(null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Debug adicional

  // Renderização condicional baseada no agente
  if (agent === 'agente-comportamental') {

    // ✅ PRIORIDADE 4: Admin ou corretor com testes completos - mostrar Elaine normalmente
    return renderElaineAgent();
  }

  // Renderização padrão: Marketing
  return (
    <div className={`h-screen flex flex-col overflow-hidden ${isDarkMode ? '' : 'bg-gray-50'}`} style={{ backgroundColor: isDarkMode ? 'var(--bg-primary)' : undefined }}>
      {/* Header do Agente - Layout com Logo Central */}
      <div className={`border-b ${isDarkMode ? 'border-neutral-800/40' : 'border-gray-200'} bg-gradient-to-br ${isDarkMode ? 'from-blue-600/10 via-purple-600/10 to-blue-600/5' : 'from-blue-50/30 via-purple-50/30 to-blue-50/30'} backdrop-blur-sm flex-shrink-0`}>
        <div className="w-full px-4 py-3">
          <div className="flex items-center justify-between">
            
            {/* ESQUERDA: Avatar do Marketing + Info */}
            <div className="flex items-center gap-4 flex-shrink-0">
              {/* Avatar do Marketing - Foto Real */}
              <div className="relative">
                <div className={`w-16 h-16 rounded-2xl overflow-hidden ring-2 ${isDarkMode ? 'ring-blue-500/30' : 'ring-blue-500/40'} shadow-xl ${isDarkMode ? 'shadow-blue-500/30' : 'shadow-blue-500/20'}`}>
                  <img 
                    src="https://i.postimg.cc/Z5DPrt7k/Imagem-do-Whats-App-de-2025-09-18-s-17-02-08-1c96e26d.jpg" 
                    alt="Marketing"
                    className="w-full h-full object-cover object-center"
                    style={{ objectPosition: '50% 30%' }}
                  />
                </div>
                {/* Badge de Status Online */}
                <div className={`absolute -bottom-0.5 -right-0.5 px-1.5 py-0.5 bg-green-500 rounded-full shadow-lg border ${isDarkMode ? 'border-neutral-900' : 'border-2 border-white'} flex items-center gap-0.5`}>
                  <div className="w-1 h-1 bg-white rounded-full animate-pulse"></div>
                  <span className="text-white text-[9px] font-bold">Online</span>
                </div>
              </div>
              
              {/* Informações do Agente */}
              <div>
                <h1 className={`text-xl font-black mb-0.5 bg-gradient-to-r ${isDarkMode ? 'from-blue-400 via-purple-400 to-blue-400' : 'from-blue-600 via-purple-600 to-blue-600'} bg-clip-text text-transparent`}>
                  Marketing
                </h1>
                <p className={`${isDarkMode ? 'text-gray-300' : 'text-gray-600'} text-[10px] font-medium mb-1.5`}>
                  Agente de IA Especialista em Marketing Imobiliário
                </p>
                <div className="flex flex-wrap gap-1">
                  <span className={`px-1.5 py-0.5 ${isDarkMode ? 'bg-blue-600/20 border-blue-500/30 text-blue-300' : 'bg-blue-100 border-blue-300 text-blue-700'} border rounded-full text-[9px] font-semibold`}>
                    ✍️ Copywriter
                  </span>
                  <span className={`px-1.5 py-0.5 ${isDarkMode ? 'bg-purple-600/20 border-purple-500/30 text-purple-300' : 'bg-purple-100 border-purple-300 text-purple-700'} border rounded-full text-[9px] font-semibold`}>
                    📱 Social Media
                  </span>
                  <span className={`px-1.5 py-0.5 ${isDarkMode ? 'bg-pink-600/20 border-pink-500/30 text-pink-300' : 'bg-pink-100 border-pink-300 text-pink-700'} border rounded-full text-[9px] font-semibold`}>
                    🎬 Roteiros Virais
                  </span>
                  <span className={`px-1.5 py-0.5 ${isDarkMode ? 'bg-cyan-600/20 border-cyan-500/30 text-cyan-300' : 'bg-cyan-100 border-cyan-300 text-cyan-700'} border rounded-full text-[9px] font-semibold`}>
                    🎯 Estrategista
                  </span>
                </div>
              </div>
            </div>

            {/* DIREITA: Cards de Métricas */}
            <div className="flex gap-2 flex-shrink-0">
              <div className={`bg-gradient-to-br ${isDarkMode ? 'from-blue-600/10 to-blue-600/5' : 'from-blue-100 to-blue-50'} border ${isDarkMode ? 'border-blue-500/20' : 'border-blue-300'} rounded-lg px-2.5 py-1.5`}>
                <div className={`${isDarkMode ? 'text-blue-300' : 'text-blue-600'} text-[9px] font-semibold`}>Especialidade</div>
                <div className={`${isDarkMode ? 'text-white' : 'text-gray-900'} text-[11px] font-bold`}>Copywriting</div>
              </div>
              <div className={`bg-gradient-to-br ${isDarkMode ? 'from-purple-600/10 to-purple-600/5' : 'from-purple-100 to-purple-50'} border ${isDarkMode ? 'border-purple-500/20' : 'border-purple-300'} rounded-lg px-2.5 py-1.5`}>
                <div className={`${isDarkMode ? 'text-purple-300' : 'text-purple-600'} text-[9px] font-semibold`}>Resposta</div>
                <div className={`${isDarkMode ? 'text-white' : 'text-gray-900'} text-[11px] font-bold`}>Instantânea ⚡</div>
              </div>
              <div className={`bg-gradient-to-br ${isDarkMode ? 'from-green-600/10 to-green-600/5' : 'from-green-100 to-green-50'} border ${isDarkMode ? 'border-green-500/20' : 'border-green-300'} rounded-lg px-2.5 py-1.5`}>
                <div className={`${isDarkMode ? 'text-green-300' : 'text-green-600'} text-[9px] font-semibold`}>Status</div>
                <div className={`${isDarkMode ? 'text-white' : 'text-gray-900'} text-[11px] font-bold`}>24/7 🟢</div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Grid Layout: Info + Chat - ESTÁTICO - SEM SCROLL NA PÁGINA */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-4 gap-0" style={{ minHeight: 0, maxHeight: 'calc(100vh - 120px)' }}>
        
        {/* Sidebar de Informações - Compacta com Scroll Interno */}
        <div className={`lg:col-span-1 border-r ${isDarkMode ? 'border-neutral-800/40' : 'border-gray-200'} overflow-y-auto p-4 bg-gradient-to-b ${isDarkMode ? 'from-neutral-900/30 to-transparent' : 'from-gray-50/30 to-transparent'}`}>
          <div className="space-y-4">
            
            {/* Sobre o Agente - Compacto */}
            <div className={`bg-gradient-to-br ${isDarkMode ? 'from-neutral-800/50 to-neutral-900/50 border border-neutral-700/50' : 'from-gray-100/80 to-gray-50/80 border-2 border-gray-200/60'} rounded-xl ${isDarkMode ? 'p-3' : 'p-3.5'} shadow-md`}>
              <h3 className={`${isDarkMode ? 'text-white' : 'text-gray-800'} font-bold text-sm mb-2 flex items-center gap-2`}>
                <span className="text-lg">🤖</span>
                <span className={`${isDarkMode ? 'bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent' : 'text-blue-600'}`}>
                  Quem sou eu?
                </span>
              </h3>
              <p className={`${isDarkMode ? 'text-white' : 'text-gray-600'} text-xs leading-relaxed`}>
                <span className={`${isDarkMode ? 'text-blue-400 font-semibold' : 'text-blue-600 font-bold'}`}>Agente de IA oficial da Imobiliária Japi</span>, 
                braço direito dos corretores. Combino copywriting, social media, roteiros virais e análise criativa.
              </p>
            </div>

            {/* O que faço - Compacto COM CLIQUE */}
            <div className={`bg-gradient-to-br ${isDarkMode ? 'from-neutral-800/50 to-neutral-900/50 border border-neutral-700/50 p-3' : 'from-gray-100/80 to-gray-50/80 border-2 border-gray-200/60 p-3.5'} rounded-xl shadow-md`}>
              <h3 className={`${isDarkMode ? 'text-white' : 'text-gray-800'} font-bold text-sm mb-2 flex items-center gap-2`}>
                <span className="text-lg">🎯</span>
                <span className={`${isDarkMode ? 'bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent' : 'text-purple-600'}`}>
                  Especialidades
                </span>
              </h3>
              <p className={`${isDarkMode ? 'text-gray-400' : 'text-gray-600'} text-[10px] ${isDarkMode ? 'mb-2' : 'mb-2.5'} italic ${isDarkMode ? '' : 'font-medium'}`}>
                💡 Clique em uma especialidade para começar!
              </p>
              <div className="space-y-1.5">
                {especialidades.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleEspecialidadeClick(item.id)}
                    className={`w-full flex items-center gap-2 ${isDarkMode ? 'p-2' : 'p-2.5'} rounded-lg ${isDarkMode ? 'border' : 'border-2'} transition-all duration-200 cursor-pointer group ${
                      selectedEspecialidade === item.id
                        ? isDarkMode 
                          ? 'bg-purple-600/30 border-purple-400/70 scale-[0.98]'
                          : 'bg-purple-100/80 border-purple-300/70 scale-[0.98] shadow-md'
                        : isDarkMode
                          ? 'bg-neutral-800/30 border-neutral-700/30 hover:border-purple-500/50 hover:bg-neutral-700/40'
                          : 'bg-gray-50/60 border-gray-200/50 hover:border-purple-400/60 hover:bg-purple-50/60 hover:shadow-sm'
                    }`}
                  >
                    <span className={`text-sm flex-shrink-0 transition-transform ${
                      selectedEspecialidade === item.id ? 'scale-125' : 'group-hover:scale-110'
                    }`}>{item.icon}</span>
                    <span className={`text-xs leading-tight transition-colors ${
                      selectedEspecialidade === item.id 
                        ? isDarkMode ? 'text-white font-semibold' : 'text-purple-800 font-semibold'
                        : isDarkMode ? 'text-gray-300 group-hover:text-white' : 'text-gray-700 font-semibold group-hover:text-purple-600'
                    }`}>{item.text}</span>
                    {selectedEspecialidade === item.id && (
                      <span className={`ml-auto ${isDarkMode ? 'text-green-400' : 'text-purple-600'} text-xs animate-pulse ${isDarkMode ? '' : 'font-bold'}`}>✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Dica Profissional */}
            <div className={`bg-gradient-to-br ${isDarkMode ? 'from-blue-600/20 via-purple-600/20 to-blue-600/20 border-blue-500/30 shadow-lg shadow-blue-500/10' : 'from-yellow-100 via-orange-100 to-yellow-100 border-yellow-400 shadow-md'} border-2 rounded-xl p-3`}>
              <div className="flex items-start gap-2">
                <span className="text-xl flex-shrink-0">💡</span>
                <div>
                  <p className={`${isDarkMode ? 'text-blue-300' : 'text-yellow-900'} font-bold text-xs mb-1`}>Dica Profissional</p>
                  <p className={`${isDarkMode ? 'text-blue-100/90' : 'text-yellow-800'} text-[11px] leading-relaxed ${isDarkMode ? '' : 'font-medium'}`}>
                    Seja específico! Quanto mais detalhes você der sobre o imóvel, público-alvo e objetivo, 
                    melhor será o resultado.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Área de Chat - 3/4 - ESTÁTICO */}
        <div className="lg:col-span-3 flex flex-col overflow-hidden p-4" style={{ maxHeight: 'calc(100vh - 120px)' }}>
          <CaioKotlerChat onPromptSelect={(prompt) => console.log('Prompt selected:', prompt)} />
        </div>

      </div>
    </div>
  );
};

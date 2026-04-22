/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Componente: Seção da Agente Elaine para o MainLayout
 */

import { useState } from 'react';
import { ElaineChat } from './ElaineChat';

// Prompts da Elaine
const ELAINE_PROMPTS: Record<string, string> = {
  'disc': `Elaine, realize uma Análise Completa do Perfil DISC para o colaborador(a) [NOME DO CORRETOR].

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

  'eneagrama': `Elaine, realize uma Análise Completa do Eneagrama para o colaborador(a) [NOME DO CORRETOR].

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

  'mbti': `Elaine, realize uma Análise Completa do MBTI para o colaborador(a) [NOME DO CORRETOR].

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

  'relatorio-geral': `Elaine, crie um Relatório Comportamental Completo e Integrado para o colaborador(a) [NOME DO CORRETOR].

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

  'gestao-liderados': `Elaine, crie um Plano de Gestão de Equipe para o gestor liderar sua equipe de corretores de forma estratégica.

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

export const ElaineAgentSection = () => {
  const [selectedEspecialidade, setSelectedEspecialidade] = useState<string | null>(null);

  const especialidadesElaine = [
    { id: 'disc', icon: 'D', text: 'DISC' },
    { id: 'eneagrama', icon: 'E', text: 'ENEAGRAMA' },
    { id: 'mbti', icon: 'M', text: 'MBTI 16+' },
    { id: 'relatorio-geral', icon: 'R', text: 'Relatório Geral' },
    { id: 'gestao-liderados', icon: 'G', text: 'Gestão de Liderados' }
  ];

  // Função para obter cores harmônicas para cada especialidade
  const getEspecialidadeColors = (id: string, isSelected: boolean) => {
    const colors = {
      'disc': {
        bg: isSelected 
          ? 'bg-blue-600 dark:bg-blue-600/40 border-blue-700 dark:border-blue-400/70'
          : 'bg-gray-50 dark:bg-neutral-800/30 border-blue-300 dark:border-neutral-700/30 hover:border-blue-500 dark:hover:border-blue-500/50 hover:bg-blue-50 dark:hover:bg-blue-900/20',
        text: isSelected
          ? 'text-white dark:text-blue-300'
          : 'text-gray-800 dark:text-gray-300 group-hover:text-blue-700 dark:group-hover:text-blue-300',
        check: 'text-white dark:text-blue-400'
      },
      'eneagrama': {
        bg: isSelected 
          ? 'bg-purple-600 dark:bg-purple-600/40 border-purple-700 dark:border-purple-400/70'
          : 'bg-gray-50 dark:bg-neutral-800/30 border-purple-300 dark:border-neutral-700/30 hover:border-purple-500 dark:hover:border-purple-500/50 hover:bg-purple-50 dark:hover:bg-purple-900/20',
        text: isSelected
          ? 'text-white dark:text-purple-300'
          : 'text-gray-800 dark:text-gray-300 group-hover:text-purple-700 dark:group-hover:text-purple-300',
        check: 'text-white dark:text-purple-400'
      },
      'mbti': {
        bg: isSelected 
          ? 'bg-emerald-600 dark:bg-emerald-600/40 border-emerald-700 dark:border-emerald-400/70'
          : 'bg-gray-50 dark:bg-neutral-800/30 border-emerald-300 dark:border-neutral-700/30 hover:border-emerald-500 dark:hover:border-emerald-500/50 hover:bg-emerald-50 dark:hover:bg-emerald-900/20',
        text: isSelected
          ? 'text-white dark:text-emerald-300'
          : 'text-gray-800 dark:text-gray-300 group-hover:text-emerald-700 dark:group-hover:text-emerald-300',
        check: 'text-white dark:text-emerald-400'
      },
      'relatorio-geral': {
        bg: isSelected 
          ? 'bg-pink-600 dark:bg-pink-600/40 border-pink-700 dark:border-pink-400/70'
          : 'bg-gray-50 dark:bg-neutral-800/30 border-pink-300 dark:border-neutral-700/30 hover:border-pink-500 dark:hover:border-pink-500/50 hover:bg-pink-50 dark:hover:bg-pink-900/20',
        text: isSelected
          ? 'text-white dark:text-pink-300'
          : 'text-gray-800 dark:text-gray-300 group-hover:text-pink-700 dark:group-hover:text-pink-300',
        check: 'text-white dark:text-pink-400'
      },
      'gestao-liderados': {
        bg: isSelected 
          ? 'bg-orange-600 dark:bg-orange-600/40 border-orange-700 dark:border-orange-400/70'
          : 'bg-gray-50 dark:bg-neutral-800/30 border-orange-300 dark:border-neutral-700/30 hover:border-orange-500 dark:hover:border-orange-500/50 hover:bg-orange-50 dark:hover:bg-orange-900/20',
        text: isSelected
          ? 'text-white dark:text-orange-300'
          : 'text-gray-800 dark:text-gray-300 group-hover:text-orange-700 dark:group-hover:text-orange-300',
        check: 'text-white dark:text-orange-400'
      }
    };
    return colors[id as keyof typeof colors] || colors['disc'];
  };

  const handleElaineEspecialidadeClick = (tipo: string) => {
    const prompt = ELAINE_PROMPTS[tipo];
    const especialidadeNome = especialidadesElaine.find(e => e.id === tipo)?.text || tipo;
    const displayText = `Olá Elaine, gostaria de gerar ${especialidadeNome}`;
    
    if (prompt && (window as any).sendElaineMessage) {
      (window as any).sendElaineMessage(prompt, displayText);
      setSelectedEspecialidade(tipo);
      setTimeout(() => setSelectedEspecialidade(null), 2000);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header da Elaine */}
      <div className="border-b border-pink-200 dark:border-neutral-800/40 bg-gradient-to-br from-pink-50 via-purple-50 to-pink-50 dark:from-pink-600/10 dark:via-purple-600/10 dark:to-pink-600/5 backdrop-blur-sm flex-shrink-0">
        <div className="w-full px-4 py-3">
          <div className="flex items-center justify-between">
            
            {/* Avatar da Elaine + Info */}
            <div className="flex items-center gap-4 flex-shrink-0">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl overflow-hidden ring-2 ring-pink-500/40 dark:ring-pink-500/30 shadow-xl shadow-pink-500/20 dark:shadow-pink-500/30 bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center">
                  <span className="text-4xl">👩‍💼</span>
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 px-1.5 py-0.5 bg-green-500 rounded-full shadow-lg border-2 border-white dark:border-neutral-900 flex items-center gap-0.5">
                  <div className="w-1 h-1 bg-white rounded-full animate-pulse"></div>
                  <span className="text-white text-[9px] font-bold">Online</span>
                </div>
              </div>
              
              <div>
                <h1 className="text-xl font-black mb-0.5 bg-gradient-to-r from-pink-600 via-purple-600 to-pink-600 dark:from-pink-400 dark:via-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
                  Agente Elaine
                </h1>
                <p className="text-gray-600 dark:text-gray-300 text-[10px] font-medium mb-1.5">
                  Agente de Inteligência Comportamental e Gestão de Pessoas
                </p>
                <div className="flex flex-wrap gap-1">
                  <span className="px-1.5 py-0.5 bg-pink-100 dark:bg-pink-600/20 border border-pink-300 dark:border-pink-500/30 rounded-full text-pink-700 dark:text-pink-300 text-[9px] font-semibold">
                    🧩 Profiler
                  </span>
                  <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-600/20 border border-purple-300 dark:border-purple-500/30 rounded-full text-purple-700 dark:text-purple-300 text-[9px] font-semibold">
                    👥 RH & Gestão
                  </span>
                </div>
              </div>
            </div>

            {/* Cards de Métricas */}
            <div className="flex gap-2 flex-shrink-0">
              <div className="bg-gradient-to-br from-pink-100 to-pink-50 dark:from-pink-600/10 dark:to-pink-600/5 border border-pink-300 dark:border-pink-500/20 rounded-lg px-2.5 py-1.5">
                <div className="text-pink-600 dark:text-pink-300 text-[9px] font-semibold">Especialidade</div>
                <div className="text-gray-900 dark:text-white text-[11px] font-bold">RH & Gestão</div>
              </div>
              <div className="bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-600/10 dark:to-purple-600/5 border border-purple-300 dark:border-purple-500/20 rounded-lg px-2.5 py-1.5">
                <div className="text-purple-600 dark:text-purple-300 text-[9px] font-semibold">Metodologia</div>
                <div className="text-gray-900 dark:text-white text-[11px] font-bold">DISC+MBTI+Eneagrama</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid Layout */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-4 gap-0">
        {/* Sidebar */}
        <div className="lg:col-span-1 border-r border-pink-200 dark:border-neutral-800/40 overflow-y-auto p-4 bg-gradient-to-b from-pink-100/50 to-transparent dark:from-neutral-900/30 dark:to-transparent">
          <div className="space-y-4">
            
            {/* Sobre */}
            <div className="bg-white dark:bg-gradient-to-br dark:from-neutral-800/50 dark:to-neutral-900/50 border-2 border-pink-300 dark:border-neutral-700/50 rounded-xl p-3.5 shadow-md">
              <h3 className="text-black dark:text-white font-bold text-sm mb-2 flex items-center gap-2">
                <span className="text-lg">👩‍💼</span>
                <span className="text-black dark:text-pink-400">Quem sou eu?</span>
              </h3>
              <p className="text-black dark:text-gray-300 text-xs leading-relaxed">
                <span className="text-black dark:text-pink-400 font-bold">Agente de Inteligência Comportamental</span>, 
                especialista em decodificar perfis humanos (DISC, Eneagrama, MBTI).
              </p>
            </div>

            {/* Especialidades */}
            <div className="bg-white dark:bg-gradient-to-br dark:from-neutral-800/50 dark:to-neutral-900/50 border-2 border-pink-300 dark:border-neutral-700/50 rounded-xl p-3.5 shadow-md">
              <h3 className="text-black dark:text-white font-bold text-sm mb-2 flex items-center gap-2">
                <span className="text-black dark:text-purple-400">Especialidades</span>
              </h3>
              <p className="text-black dark:text-gray-400 text-[10px] mb-2.5 italic font-medium">
                Clique em uma especialidade para começar!
              </p>
              <div className="space-y-1.5">
                {especialidadesElaine.map((item) => {
                  const colors = getEspecialidadeColors(item.id, selectedEspecialidade === item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleElaineEspecialidadeClick(item.id)}
                      className={`w-full flex items-center gap-2 p-2.5 rounded-lg border-2 transition-all duration-200 cursor-pointer group ${colors.bg} ${
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
              </div>
            </div>

            {/* Dica Profissional sobre Metodologia */}
            <div className="bg-gradient-to-br from-purple-100 via-pink-100 to-purple-100 dark:from-pink-600/20 dark:via-purple-600/20 dark:to-pink-600/20 border-2 border-purple-400 dark:border-pink-500/30 rounded-xl p-3 shadow-md dark:shadow-lg dark:shadow-pink-500/10">
              <div className="flex items-start gap-2">
                <div>
                  <p className="text-purple-900 dark:text-pink-300 font-bold text-xs mb-1">Metodologia 360°</p>
                  <p className="text-purple-800 dark:text-pink-100/90 text-[11px] leading-relaxed font-medium">
                    Integro <strong>DISC</strong> (como age), <strong>Eneagrama</strong> (por que age) e <strong>MBTI</strong> (como pensa) para criar análises completas e personalizadas.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Chat */}
        <div className="lg:col-span-3 flex flex-col overflow-hidden p-4">
          <ElaineChat onPromptSelect={(prompt) => console.log('Prompt selected:', prompt)} />
        </div>
      </div>
    </div>
  );
};


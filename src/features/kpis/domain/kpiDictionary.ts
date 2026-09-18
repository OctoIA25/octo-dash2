/**
 * Dicionário das métricas nativas — o texto do (i) em cada contador.
 *
 * MORA EM CÓDIGO, não no banco, por um motivo: a definição de uma métrica
 * nativa é decidida pelo código que a calcula. Se o texto morasse em
 * `dashboard_kpis`, cada imobiliária teria a sua cópia e nada impediria a
 * descrição de dizer uma coisa enquanto o servidor calcula outra — que é
 * exatamente o defeito que este bloco do plano veio consertar. Aqui, mudar a
 * conta sem mudar o texto fica visível no mesmo diff.
 *
 * O gestor continua podendo escrever a própria descrição em Configurações; ela
 * ganha do dicionário quando preenchida (`descricaoDaMetrica`). Para KPI que o
 * gestor cria (manual ou planilha) só existe o texto dele — não há conta nativa
 * para descrever.
 *
 * O que cada entrada precisa responder: **de qual evento até qual evento**,
 * **sobre quais registros**, e **o que aparece quando não há amostra**. As
 * pegadinhas são o principal: quais métricas ignoram o filtro de período, e o
 * que entra num "sem exclusividade".
 */
import type { NativeMetricKey } from './kpiTypes';

export const KPI_DICIONARIO: Record<NativeMetricKey, string> = {
  totalLeads:
    'Leads criados dentro do período, já sem os arquivados. Conta o lead pela data de criação, não pela data em que ele se mexeu.',

  vendas:
    'Propostas que chegaram à etapa "proposta assinada" no período, contadas pela data de assinatura no fuso de São Paulo. Uma proposta assinada dia 31 às 22h pertence ao mês em que foi assinada aqui, não ao dia seguinte em UTC.',

  valorVendas:
    'Soma do valor das propostas assinadas no período. É o mesmo número do card "VGV Gerado no Mês" — os dois existem porque a tela antiga já tinha este nome, e o gestor pode esconder o que não usar.',

  imoveisAtivos:
    'Imóveis cadastrados na imobiliária que não estão em rascunho. ATENÇÃO: este contador ignora o filtro de período — ele mostra quantos existem hoje, não quantos existiam no mês escolhido.',

  tempoMedioResposta:
    'Mediana do tempo entre o lead entrar na base e a LIA enviar a primeira mensagem no WhatsApp. Entram só os leads do período que receberam mensagem; sem nenhum, o card mostra "Sem dados" em vez de zero. É mediana, não média: um punhado de leads recontatados semanas depois desloca a média em horas.',

  tempoAteCorretor:
    'Mediana do tempo entre o lead entrar na base e o corretor falar com ele — primeira mensagem enviada pelo painel ou primeiro toque de cadência registrado. A cadência começou a gravar em 17/09/2026, então este número cobre só o que foi registrado de lá para cá. Período sem toque mostra "Sem dados".',

  taxaAtendimento:
    'Percentual dos leads do período que a LIA chegou a contatar pelo WhatsApp. Período sem lead nenhum mostra "Sem dados", não 0% — zero ali afirmaria que ninguém foi atendido, quando não havia ninguém para atender.',

  vgv:
    'Valor Geral de Vendas: soma do valor das propostas assinadas no período, pela data de assinatura no fuso de São Paulo.',

  vgc:
    'Valor Geral de Comissão das propostas assinadas no período. Usa a comissão gravada na proposta quando existe; quando não existe, deriva do valor — 3,5% para lançamento e 6% para imóvel de terceiros. Metade das vendas da base não tem comissão gravada, e sem essa derivação elas entrariam como zero.',

  ticketMedio:
    'Valor médio por venda no período: o VGV dividido pelo número de propostas assinadas. Sem venda no período, mostra "Sem dados" em vez de zero.',

  conversaoVisita:
    'Percentual dos leads do período que chegaram à visita OU passaram dela. Um lead que já está em Proposta ou Fechamento conta aqui, porque passou pela visita — o número responde "quantos avançaram além do atendimento", não "quantos pararam na visita".',

  captacaoExclusiva:
    'Imóveis cadastrados dentro do período com exclusividade marcada. Rascunho não conta. Depois de publicado, o imóvel conta pela data em que o rascunho foi criado.',

  captacaoSemExclusividade:
    'Imóveis cadastrados dentro do período sem exclusividade marcada. ATENÇÃO: "Indiferente" (exclusividade em branco) cai aqui, não fica de fora — então este contador mais a captação exclusiva sempre soma o total captado no período.',

  tamanhoEquipe:
    'Pessoas com acesso à imobiliária nos papéis de corretor, líder de equipe ou administrador. ATENÇÃO: este contador ignora o filtro de período — é quantos existem hoje. Por isso ele não mostra variação em relação ao mês anterior.',

  vendasPorCorretor:
    'Propostas assinadas no período divididas pelo tamanho da equipe. Como o tamanho da equipe é o de hoje e não o do mês escolhido, o número de meses passados fica distorcido se a equipe mudou de tamanho desde então. Por isso ele não mostra variação.',
};

/**
 * Contadores da Dash que NÃO estão no catálogo de KPIs.
 *
 * A aba KPIs tem um catálogo fechado (`NATIVE_METRIC_KEYS`); o resto da Dash
 * tem contadores próprios, com contas próprias. O plano pede legenda "em toda
 * a Dash, com texto vindo do dicionário de métricas" — um dicionário só —,
 * então eles moram aqui, com a mesma exigência: de qual evento até qual
 * evento, sobre quais registros, e o que aparece sem amostra.
 *
 * A chave é prefixada pela tela para não colidir com o catálogo nativo.
 */
export const DICIONARIO_DASH: Record<string, string> = {
  'inicio.leadsNoFunil':
    'Total de leads da imobiliária no funil, em qualquer etapa, sem os arquivados. ATENÇÃO: não é do mês — é a base inteira. A variação ao lado, essa sim, compara os últimos 7 dias com os 7 anteriores.',

  'inicio.conversaoBase':
    'Percentual dos leads que chegaram a fechamento — status contendo "assinada", "fechamento" ou "contrato". ATENÇÃO: é sobre a base inteira, não sobre o mês. Até 18/09 este card se chamava "Conversão do Mês" e mostrava exatamente este mesmo número, que nunca foi mensal.',

  'inicio.metaMensal':
    'A meta que está destacada na aba Metas, com o quanto já foi realizado. Sem nenhuma meta destacada, o card mostra um traço e convida a destacar uma — não mostra zero, que pareceria meta não cumprida.',

  'inicio.aguardandoResposta':
    'Leads marcados como quentes que entraram nas últimas 24 horas. É uma fila de urgência, não um indicador de desempenho.',

  'inicio.podemEsfriar':
    'Leads com temperatura marcada como morna, em qualquer data de entrada — a contagem não olha o período. A temperatura hoje é marcada à mão pelo corretor; quando o score de 0 a 100 entrar (P1.7 do plano), ela passa a ser derivada dele.',

  'relatorios.leadsRecebidos':
    'Leads criados dentro do período escolhido no filtro de datas, contados pela data de criação. A contagem é feita no banco — a tela não baixa as linhas para contar, senão pararia em 1.000 e o número empacaria.',

  'relatorios.leadsInteragidos':
    'Leads do período que a LIA chegou a contatar pelo WhatsApp. Até 18/09 contava lead cujo card tinha saído da primeira coluna do kanban, que é outra coisa e cobria 2,4% da base. Quando a leitura falha, o card mostra "Sem dados" em vez de zero.',

  'relatorios.leadsPorDia':
    'Leads recebidos no período divididos pelos dias do período. É contagem por dia, não percentual.',

  'relatorios.tempoPrimeiraInteracao':
    'Mediana do tempo entre o lead entrar na base e a LIA enviar a primeira mensagem no WhatsApp, dentro do período. Mediana e não média: um punhado de leads recontatados semanas depois desloca a média em horas. Período sem lead contatado mostra "Sem dados".',

  // --- aba Métricas (Comercial › Funil Cliente Interessado / Proprietário).
  // A chave sai do RÓTULO do card, normalizado — ver `chaveDoRotulo`. Os
  // cards de lá são montados como dados (`metric1..metric6`), então derivar a
  // chave do rótulo evita repetir uma chave em vinte objetos.
  'metricas.pre-atendimento':
    'Leads que entraram e ainda não passaram da conversa: etapas "Novos Leads", "Em Atendimento" e "Interação". Até 18/09 este card procurava por "Pré-Atendimento" e "Novo Lead", que a base nunca gravou, e deixava de fora os 4.147 leads da etapa de entrada.',

  'metricas.visitas':
    'Leads cuja etapa é de visita AGENDADA — quem já realizou a visita não entra aqui, aparece em "Visitas Realizadas". ATENÇÃO: o card não olha data; ele conta quem está nessa etapa agora, não as visitas do período.',

  'metricas.visitas-realizadas':
    'Leads cuja etapa diz que a visita foi realizada. Conta a etapa, não a coluna de data da visita — essa está vazia em 100% dos leads da base e fazia o número ser zero para todo corretor.',

  'metricas.encaminhados-aos-corretores':
    'Leads que têm corretor de verdade atribuído. Era literalmente o total de leads: na Imobiliária Japi o card anunciava 2.553 encaminhados com ZERO leads tendo corretor. A armadilha é que o campo de corretor nunca vem vazio — sem corretor, o sistema grava o texto "Não atribuído".',

  'metricas.interacoes':
    'Leads parados na etapa de interação ou atendimento. É contagem de LEADS numa coluna, não de mensagens: um lead com quarenta mensagens conta uma vez, e um lead que já avançou de etapa não conta.',

  'metricas.negocios-fechados':
    'Leads cuja etapa indica fechamento. Até 18/09 procurava por "Negócio Fechado" e "Finalizado" — duas etapas que não existem na base — mais uma coluna de valor vazia: as três condições eram impossíveis e o card era zero estrutural.',

  'metricas.clientes-interessados':
    'Todos os leads carregados para esta tela, sem os arquivados. ATENÇÃO: é a base inteira da imobiliária, não o período; e os filtros de equipe e de corretor desta aba afetam os gráficos, não este número.',

  'metricas.valor-total':
    'Soma do valor dos imóveis dos leads. ATENÇÃO: a coluna de valor do imóvel está preenchida em ZERO das 5.235 linhas da base, então este card mostra "Sem dados" em vez de R$ 0 — zero ali se leria como "a carteira não vale nada".',

  'metricas.valor-medio':
    'Valor médio dos imóveis dos leads. Mesma coluna vazia de "Valor Total": sem nenhum valor preenchido, o card diz "Sem dados".',

  'relatorios.leadsConvertidos':
    'Leads DISTINTOS do período com proposta assinada. Um lead com duas propostas assinadas conta uma vez — por isso este número pode ser menor que o de vendas. Não sai de `final_sale_value`, coluna vazia em produção.',
};

/**
 * Chave de dicionário a partir do RÓTULO de um card.
 *
 * A aba Métricas monta os cards como dados (`metric1..metric6`), com o rótulo
 * mudando conforme a sub-aba. Derivar a chave do rótulo evita pendurar uma
 * chave em cada um dos vinte objetos — e um rótulo sem entrada simplesmente
 * não ganha (i), que é o comportamento certo.
 */
export function chaveDoRotulo(tela: string, rotulo: string): string {
  const slug = (rotulo || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/\(.*?\)/g, '')          // "Valor Total (R$ M)" -> "valor total"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${tela}.${slug}`;
}

/**
 * O texto do (i) de um card.
 *
 * A descrição escrita pelo gestor ganha quando existe — é a tela dele. Sem ela,
 * vale o dicionário. KPI manual ou de planilha não tem entrada no dicionário:
 * só existe o que o gestor escreveu, e sem texto o (i) não aparece.
 */
export function descricaoDaMetrica(
  metricKey: string | null | undefined,
  descricaoDoGestor?: string | null,
): string | null {
  const doGestor = (descricaoDoGestor || '').trim();
  if (doGestor) return doGestor;
  if (!metricKey) return null;
  return KPI_DICIONARIO[metricKey as NativeMetricKey] ?? DICIONARIO_DASH[metricKey] ?? null;
}

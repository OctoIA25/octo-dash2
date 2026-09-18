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
  return KPI_DICIONARIO[metricKey as NativeMetricKey] ?? null;
}

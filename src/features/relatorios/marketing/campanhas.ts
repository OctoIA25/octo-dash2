/**
 * Campanhas e ROI (P3.5) — as contas, fora do componente.
 *
 * O score NÃO é recalculado aqui: ele vem de `calcularScore`, a mesma função
 * que a lista de leads usa. Refazer a fórmula seria uma segunda fonte para o
 * mesmo número, e as duas divergiriam na primeira correção de peso.
 */

export interface Campanha {
  campaign_id: string;
  campaign_nome: string;
  objetivo: string;
  resultado_indicador: string;
  /** Falso em clique-para-WhatsApp: o lead chega sem nada que o ligue ao anúncio. */
  atribuivel: boolean;
  anuncios: number;
  gasto: number;
  impressoes: number;
  cliques: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  leads_meta: number;
  resultados: number;
  custo_por_lead_meta: number | null;
  leads_dash: number;
  chegou_visita: number;
  custo_por_lead_dash: number | null;
  lead_ids: string[];
  lead_ids_visita: string[];
}

export interface ResultadoDeCampanhas {
  de: string;
  ate: string;
  atualizado_em: string | null;
  campanhas: Campanha[];
  totais: {
    gasto: number;
    impressoes: number;
    cliques: number;
    leads_meta: number;
    campanhas: number;
    gasto_sem_atribuicao: number;
  };
  roi_disponivel: boolean;
  roi_falta: string;
}

/**
 * Quantos leads da campanha contam como qualificados.
 *
 * "Score ≥ limiar OU chegou em Visita agendada" — decidido com o chefe em
 * 21/09. O "ou" é o ponto: pega quem a LIA esquentou e quem avançou no funil
 * sem passar pelo score, e ninguém é contado duas vezes.
 *
 * Lead sem sinal nenhum NÃO conta. Ele não tem score, e dar-lhe o ponto de
 * partida (50) e comparar com o limiar trataria "não sei" como "morno".
 */
export function contarQualificados(
  leadIds: string[],
  leadIdsVisita: string[],
  scorePorLead: Record<string, number | undefined>,
  limiteQuente: number
): number {
  const visita = new Set(leadIdsVisita ?? []);
  let n = visita.size;
  for (const id of leadIds ?? []) {
    if (visita.has(id)) continue;
    const s = scorePorLead[id];
    if (typeof s === 'number' && s >= limiteQuente) n += 1;
  }
  return n;
}

/** Divisão que admite não ter denominador, em vez de devolver Infinity. */
export function porUnidade(total: number, quantos: number): number | null {
  if (!Number.isFinite(total) || !Number.isFinite(quantos) || quantos <= 0) return null;
  return Math.round((total / quantos) * 100) / 100;
}

/**
 * O que a tela diz sobre uma campanha que não dá para atribuir.
 *
 * Medido na Lotus em 21/09: duas das quatro campanhas são clique-para-
 * WhatsApp. Sem esta frase, o gestor olha "0 leads na Dash" ao lado de
 * "60 leads na Meta" e conclui que o sistema perdeu leads pagos.
 */
export function avisoDeAtribuicao(c: Campanha): string | null {
  if (c.atribuivel) return null;
  if (c.resultado_indicador.includes('messaging_conversation_started')) {
    return 'Campanha de clique para WhatsApp: o lead chega pela conversa, sem formulário, e não há o que o ligue ao anúncio.';
  }
  return 'A Meta não conta lead de formulário nesta campanha, então não há atribuição lead a lead.';
}

/**
 * A distância entre o que a Meta contou e o que a Dash amarrou.
 *
 * É o número que explica a tela. Só faz sentido nas campanhas atribuíveis: nas
 * outras a diferença não é perda, é ausência de vínculo por natureza.
 */
export function buracoDeAtribuicao(campanhas: Campanha[]): {
  meta: number;
  dash: number;
  falta: number;
  pct: number | null;
} {
  const atribuiveis = (campanhas ?? []).filter((c) => c.atribuivel);
  const meta = atribuiveis.reduce((s, c) => s + (c.leads_meta || 0), 0);
  const dash = atribuiveis.reduce((s, c) => s + (c.leads_dash || 0), 0);
  const falta = Math.max(0, meta - dash);
  return { meta, dash, falta, pct: meta > 0 ? Math.round((falta / meta) * 100) : null };
}

/** Quanto do gasto do período está em campanha sem atribuição, em porcentagem. */
export function pctSemAtribuicao(totais: ResultadoDeCampanhas['totais']): number | null {
  if (!totais || !(totais.gasto > 0)) return null;
  return Math.round((totais.gasto_sem_atribuicao / totais.gasto) * 100);
}

/** "há 12 minutos", para a tela dizer de quando é o número. */
export function desdeQuando(iso: string | null, agora: Date = new Date()): string {
  if (!iso) return 'nunca sincronizado';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 'nunca sincronizado';
  const min = Math.floor((agora.getTime() - t) / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
}

/**
 * Dinheiro COM CENTAVOS.
 *
 * O `reais` do painel comercial encurta para "R$ 14,5 M" e arredonda para o
 * real inteiro — certo para VGV, errado aqui. Visto no navegador em 21/09: CPC
 * de R$ 0,88 aparecia como "R$ 1" e custo por lead de R$ 15,80 como "R$ 16".
 * Pior, o gasto do mês saía "R$ 3.334" contra os R$ 3.333,64 do Gerenciador —
 * e "bater com o Gerenciador" é o critério de pronto deste item.
 *
 * Em anúncio, centavo é a unidade de trabalho: a diferença entre R$ 0,88 e
 * R$ 1,16 por clique decide qual campanha continua no ar.
 */
export function reaisExatos(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  // O espaço que o Intl põe entre "R$" e o número é não separável (U+00A0).
  // Trocado pelo comum para casar com o `reais` do painel comercial — dois
  // formatos de dinheiro com espaços diferentes na mesma Dash se notam.
  return v
    .toLocaleString('pt-BR', {
      style: 'currency', currency: 'BRL',
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    })
    .replace(/\u00A0/g, ' ');
}

/**
 * O empreendimento da campanha, lido do nome.
 *
 * A Lotus nomeia as campanhas com o empreendimento entre colchetes:
 * "[RESERVA CASTANHEIRA] Reserva Castanheira". Não há campo na Meta que diga
 * isso — a convenção é da casa, e é a única coisa que liga a campanha ao
 * lançamento hoje.
 *
 * Por isso a tela diz que o filtro é LIDO DO NOME: no dia em que alguém criar
 * uma campanha sem colchete, ela cai em "sem empreendimento" e fica visível,
 * em vez de sumir do filtro sem ninguém entender.
 */
export function empreendimentoDaCampanha(nome: string): string | null {
  const m = /^\s*\[([^\]]+)\]/.exec(nome || '');
  const dentro = m?.[1]?.trim().toUpperCase();
  if (!dentro) return null;
  // "[RECRUTAMENTO]" e "[LEAD]" são tipo de campanha, não empreendimento.
  if (['LEAD', 'LEADS', 'RECRUTAMENTO', 'BRANDING', 'REMARKETING'].includes(dentro)) return null;
  return dentro;
}

/** Os empreendimentos presentes, para montar o filtro. */
export function empreendimentosDas(campanhas: Campanha[]): string[] {
  const s = new Set<string>();
  for (const c of campanhas ?? []) {
    const e = empreendimentoDaCampanha(c.campaign_nome);
    if (e) s.add(e);
  }
  return [...s].sort();
}

/** Aplica o filtro. Vazio mostra tudo, inclusive as sem empreendimento. */
export function filtrarPorEmpreendimento(campanhas: Campanha[], alvo: string): Campanha[] {
  if (!alvo) return campanhas ?? [];
  if (alvo === '(sem)') {
    return (campanhas ?? []).filter((c) => empreendimentoDaCampanha(c.campaign_nome) === null);
  }
  return (campanhas ?? []).filter((c) => empreendimentoDaCampanha(c.campaign_nome) === alvo);
}

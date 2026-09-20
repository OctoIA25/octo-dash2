/**
 * O score do lead, de 0 a 100 (P1.7).
 *
 * Decidido pelo chefe em 20/09/2026: a tabela de pontos é a do plano, fica
 * editável em Configurações, e o score NÃO dispara handoff — ele informa e
 * ordena; quem decide de quem é o lead continua sendo a regra do P1.1.
 *
 * A TEMPERATURA É DERIVADA DO SCORE, e não um segundo campo. No Aether os
 * dois são separados e se contradizem — 94 aparece como Morno e 62 como
 * Quente. Aqui um sai do outro, então nunca discordam.
 *
 * O "POR QUÊ" É A RAZÃO DE SER DESTE ARQUIVO. O plano diz do Aether: "os
 * critérios não aparecem em lugar nenhum… não há tela explicando por que um
 * lead tem 32 e outro 94". Toda parcela que entra na conta sai daqui com o
 * texto que a explica, e a soma dos motivos é exatamente o score.
 */

/** Os pesos da imobiliária. Espelha `tenant_score_config`. */
export interface PesosDoScore {
  ponto_de_partida: number;
  peso_respondeu: number;
  peso_resposta_ate_10min: number;
  peso_resposta_ate_1h: number;
  peso_disse_o_que_procura: number;
  peso_renda_compativel: number;
  peso_renda_incompativel: number;
  peso_pediu_visita: number;
  peso_pediu_simulacao: number;
  peso_origem_maximo: number;
  peso_conversou_3_dias: number;
  peso_sem_resposta_7_dias: number;
  peso_so_pesquisando: number;
  limite_morno: number;
  limite_quente: number;
}

/** A tabela do plano, validada pelo chefe em 20/09/2026. */
export const PESOS_PADRAO: PesosDoScore = {
  ponto_de_partida: 50,
  peso_respondeu: 5,
  peso_resposta_ate_10min: 10,
  peso_resposta_ate_1h: 5,
  peso_disse_o_que_procura: 10,
  peso_renda_compativel: 15,
  peso_renda_incompativel: -10,
  peso_pediu_visita: 25,
  peso_pediu_simulacao: 10,
  peso_origem_maximo: 10,
  peso_conversou_3_dias: 5,
  peso_sem_resposta_7_dias: -15,
  peso_so_pesquisando: -10,
  limite_morno: 40,
  limite_quente: 70,
};

/** Os fatos observados. Espelha `leads_sinais_de_score`. */
export interface SinaisDoLead {
  respondeu?: boolean;
  minutos_para_responder?: number | null;
  disse_o_que_procura?: boolean;
  pediu_visita?: boolean;
  conversou_recente?: boolean;
  sem_resposta_ha_dias?: number | null;
  renda_compativel?: boolean;
  renda_incompativel?: boolean;
  pediu_simulacao?: boolean;
  so_pesquisando?: boolean;
  /** Bônus já resolvido da origem do lead, 0..peso_origem_maximo. */
  peso_da_origem?: number;
}

export type Temperatura = 'Frio' | 'Morno' | 'Quente';

export interface Motivo {
  id: string;
  pontos: number;
  texto: string;
}

export interface ResultadoDoScore {
  score: number;
  temperatura: Temperatura;
  /** Cada parcela da conta, na ordem em que entrou. Soma = score (antes do corte). */
  motivos: Motivo[];
  /** O score saiu dos limites e foi cortado? A tela precisa poder dizer isso. */
  cortado: boolean;
  /** Quantos sinais além do ponto de partida foram observados. */
  sinaisObservados: number;
}

const inteiro = (v: unknown, padrao = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : padrao;
};

/**
 * Calcula o score e explica cada parcela.
 *
 * O resultado é sempre 0..100: um lead não pode ter −5 nem 130, e o corte é
 * sinalizado em vez de escondido.
 */
export function calcularScore(
  sinais: SinaisDoLead = {},
  pesos: PesosDoScore = PESOS_PADRAO
): ResultadoDoScore {
  const p = { ...PESOS_PADRAO, ...pesos };
  const motivos: Motivo[] = [];

  const partida = inteiro(p.ponto_de_partida, PESOS_PADRAO.ponto_de_partida);
  motivos.push({ id: 'partida', pontos: partida, texto: 'ponto de partida' });

  const some = (id: string, pontos: number, texto: string) => {
    const n = inteiro(pontos);
    if (n !== 0) motivos.push({ id, pontos: n, texto });
  };

  if (sinais.respondeu) some('respondeu', p.peso_respondeu, 'respondeu à Lia');

  // A faixa mais rápida ganha, e SÓ ELA: somar as duas pagaria duas vezes
  // pelo mesmo fato.
  const min = sinais.minutos_para_responder;
  if (typeof min === 'number' && Number.isFinite(min) && min >= 0) {
    if (min <= 10) some('resposta_rapida', p.peso_resposta_ate_10min, 'respondeu em até 10 minutos');
    else if (min <= 60) some('resposta_1h', p.peso_resposta_ate_1h, 'respondeu em até 1 hora');
  }

  if (sinais.disse_o_que_procura) some('procura', p.peso_disse_o_que_procura, 'disse o que procura');
  if (sinais.renda_compativel) some('renda_ok', p.peso_renda_compativel, 'renda ou faixa de valor compatível');
  if (sinais.renda_incompativel) some('renda_nao', p.peso_renda_incompativel, 'renda ou faixa de valor incompatível');
  if (sinais.pediu_visita) some('visita', p.peso_pediu_visita, 'pediu visita ou aceitou agendar');
  if (sinais.pediu_simulacao) some('simulacao', p.peso_pediu_simulacao, 'pediu simulação ou condição de pagamento');

  // O bônus da origem é limitado pelo teto AQUI, e não na tela: um peso
  // gravado acima do teto não pode furar a conta por outro caminho.
  const origem = Math.max(0, Math.min(inteiro(p.peso_origem_maximo), inteiro(sinais.peso_da_origem)));
  some('origem', origem, 'origem com boa conversão');

  if (sinais.conversou_recente) some('recente', p.peso_conversou_3_dias, 'conversou nos últimos 3 dias');

  const dias = sinais.sem_resposta_ha_dias;
  if (typeof dias === 'number' && dias >= 7) {
    some('sem_resposta', p.peso_sem_resposta_7_dias, `sem conversa há ${dias} dias`);
  }

  if (sinais.so_pesquisando) some('pesquisando', p.peso_so_pesquisando, 'disse que só está pesquisando');

  const bruto = motivos.reduce((s, m) => s + m.pontos, 0);
  const score = Math.max(0, Math.min(100, bruto));

  const morno = inteiro(p.limite_morno, PESOS_PADRAO.limite_morno);
  const quente = inteiro(p.limite_quente, PESOS_PADRAO.limite_quente);
  const temperatura: Temperatura = score >= quente ? 'Quente' : score >= morno ? 'Morno' : 'Frio';

  return {
    score,
    temperatura,
    motivos,
    cortado: bruto !== score,
    sinaisObservados: motivos.length - 1,
  };
}

/** O "por quê" numa linha: "+25 pediu visita · −15 sem conversa há 8 dias". */
export function explicacaoCurta(r: ResultadoDoScore, maximo = 3): string {
  return r.motivos
    .filter((m) => m.id !== 'partida')
    .sort((a, b) => Math.abs(b.pontos) - Math.abs(a.pontos))
    .slice(0, maximo)
    .map((m) => `${m.pontos > 0 ? '+' : '−'}${Math.abs(m.pontos)} ${m.texto}`)
    .join(' · ');
}

const COR: Record<Temperatura, string> = {
  Quente: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  Morno: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  Frio: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
};

export const corDaTemperatura = (t: Temperatura) => COR[t];

/**
 * Gráfico de evolução (P3.3) — as contas, fora do componente.
 *
 * Tudo aqui é função pura sobre o que `painel_evolucao` devolve. O gráfico só
 * desenha; quem decide quando uma linha PODE existir é este arquivo, e é por
 * isso que dá para testar sem abrir a tela.
 */

import { reais, percentual } from './painelComercial';
import type { Filtros } from './filtrosDoPainel';

export interface Balde {
  em: string;
  vendas: number;
  vgv: number;
  vgc: number;
  vendas_com_vgv: number;
  ticket: number | null;
  pct_comissao: number | null;
}

export type ChaveMetrica = 'vendas' | 'vgv' | 'ticket' | 'pct_comissao';

export interface Metrica {
  chave: ChaveMetrica;
  rotulo: string;
  formatar: (v: number | null) => string;
  /** Acumulável no período. Ticket e % são médias: somá-los não quer dizer nada. */
  somavel: boolean;
}

export const METRICAS: Metrica[] = [
  { chave: 'vendas', rotulo: 'Vendas', formatar: (v) => (v == null ? '—' : String(Math.round(v * 100) / 100)), somavel: true },
  { chave: 'vgv', rotulo: 'VGV', formatar: reais, somavel: true },
  { chave: 'ticket', rotulo: 'Ticket médio', formatar: reais, somavel: false },
  { chave: 'pct_comissao', rotulo: '% comissão', formatar: (v) => percentual(v, 2), somavel: false },
];

export function valorDe(b: Balde, m: ChaveMetrica): number | null {
  const v = b[m];
  return typeof v === 'number' ? v : null;
}

/**
 * O rótulo do eixo.
 *
 * A data vem do banco como 'YYYY-MM-DD' e é cortada como texto de propósito:
 * `new Date('2026-09-02')` é meia-noite UTC, que em São Paulo ainda é dia 1º —
 * o gráfico inteiro andaria um dia para trás.
 */
export function rotuloDoBalde(em: string, gran: 'dia' | 'mes'): string {
  const [ano, mes, dia] = em.split('-');
  if (gran === 'dia') return `${dia}/${mes}`;
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${nomes[Number(mes) - 1]}/${ano.slice(2)}`;
}

export interface Ponto {
  em: string;
  rotulo: string;
  atual: number | null;
  anterior: number | null;
  /** A data equivalente no período anterior, para o tooltip dizer de quando é. */
  emAnterior: string | null;
  m7: number | null;
  m30: number | null;
}

/**
 * Junta a série atual e a anterior num array só, alinhadas POR POSIÇÃO.
 *
 * Por posição, e não por data: o ponto 1 de setembro se compara ao ponto 1 de
 * agosto. Alinhar por data deixaria a tracejada vazia sempre, já que as datas
 * dos dois períodos nunca coincidem.
 */
export function montarPontos(
  serie: Balde[],
  anterior: Balde[],
  metrica: ChaveMetrica,
  gran: 'dia' | 'mes'
): Ponto[] {
  const atuais = serie.map((b) => valorDe(b, metrica));
  const m7 = mediaMovel(atuais, 7);
  const m30 = mediaMovel(atuais, 30);

  return serie.map((b, i) => ({
    em: b.em,
    rotulo: rotuloDoBalde(b.em, gran),
    atual: atuais[i],
    anterior: anterior[i] ? valorDe(anterior[i], metrica) : null,
    emAnterior: anterior[i]?.em ?? null,
    m7: m7[i],
    m30: m30[i],
  }));
}

/**
 * Média móvel — só devolve ponto quando a janela está CHEIA.
 *
 * Decidido com o chefe em 21/09. Uma janela pela metade é outra estatística
 * usando o mesmo nome: a "média de 30 dias" do terceiro dia seria a média de
 * três dias, e subiria e desceria por falta de dado, não por mudança de venda.
 *
 * Um balde nulo também não fecha a janela. Dia sem venda tem vendas = 0, que é
 * um número; mas não tem TICKET — ticket de dia sem venda não é zero, é
 * ausente, e entrar como zero derrubaria a média inventando uma queda.
 */
export function mediaMovel(valores: (number | null)[], janela: number): (number | null)[] {
  return valores.map((_, i) => {
    if (i + 1 < janela) return null;
    const fatia = valores.slice(i + 1 - janela, i + 1);
    if (fatia.some((v) => v == null)) return null;
    return (fatia as number[]).reduce((a, b) => a + b, 0) / janela;
  });
}

/**
 * Quantos pontos a média móvel vai desenhar, e o que falta se nenhum.
 *
 * É o que a legenda diz em vez de mostrar um interruptor que não acende nada.
 */
export function resumoDaMedia(
  valores: (number | null)[],
  janela: number
): { pontos: number; faltam: number; texto: string | null } {
  const pontos = mediaMovel(valores, janela).filter((v) => v != null).length;
  if (pontos > 0) return { pontos, faltam: 0, texto: null };

  const faltam = Math.max(0, janela - valores.length);
  if (faltam > 0) {
    return { pontos: 0, faltam, texto: `faltam ${faltam} ${faltam === 1 ? 'período' : 'períodos'} de base` };
  }
  // A base é longa o bastante, mas tem buraco — acontece com ticket e %
  // comissão, que não existem em balde sem venda.
  return { pontos: 0, faltam: 0, texto: 'há períodos sem valor dentro da janela' };
}

/**
 * A linha da meta, só quando ela significa alguma coisa.
 *
 * As metas da tela Metas são do período cadastrado nelas. Espalhar uma meta
 * mensal por seis meses de gráfico dividiria o alvo do mês pelo semestre e
 * desenharia uma linha seis vezes mais baixa — um número errado com cara de
 * exato. Então: só no recorte de um mês, dia a dia.
 */
export function linhaDaMeta(
  meta: number | null | undefined,
  baldes: number,
  gran: 'dia' | 'mes',
  umMesSo: boolean
): { porBalde: number | null; texto: string } {
  if (meta == null || meta <= 0) return { porBalde: null, texto: 'meta não cadastrada' };
  if (gran !== 'dia' || !umMesSo) {
    return { porBalde: null, texto: 'a meta é do mês — escolha um mês para ver a linha' };
  }
  if (baldes <= 0) return { porBalde: null, texto: 'período vazio' };
  return { porBalde: meta / baldes, texto: `meta de ${meta} no período` };
}

/**
 * O ritmo necessário: quanto falta, dividido pelo que resta do período.
 *
 * Diferente da linha da meta, que é o ritmo IDEAL desde o começo. Quem está
 * atrasado precisa de um ritmo maior que o ideal, e é esse número que decide
 * o que fazer na semana.
 */
export function ritmoNecessario(
  meta: number | null | undefined,
  feito: number,
  baldesRestantes: number
): { porBalde: number | null; texto: string } {
  if (meta == null || meta <= 0) return { porBalde: null, texto: 'meta não cadastrada' };
  if (feito >= meta) return { porBalde: 0, texto: 'meta batida' };
  if (baldesRestantes <= 0) return { porBalde: null, texto: 'o período acabou' };
  const porBalde = (meta - feito) / baldesRestantes;
  return {
    porBalde,
    texto: `faltam ${Math.round((meta - feito) * 100) / 100} em ${baldesRestantes} ${baldesRestantes === 1 ? 'período' : 'períodos'}`,
  };
}

/** Quantos baldes ainda não terminaram, contando o de hoje. */
export function baldesRestantes(serie: Balde[], hoje: string): number {
  const i = serie.findIndex((b) => b.em >= hoje);
  return i < 0 ? 0 : serie.length - i;
}

export interface EventoComercial {
  id: string;
  em: string;
  dia: string;
  titulo: string;
  empreendimento: string | null;
}

/**
 * Quais bandeirinhas pertencem ao recorte que está na tela.
 *
 * Evento sem empreendimento é da casa e aparece sempre. Evento de um
 * empreendimento aparece quando o gráfico o inclui — ou seja, quando não há
 * filtro de empreendimento (o gráfico mostra todos) ou quando ele está entre
 * os escolhidos. Sem essa regra, "Início campanha Serrah" ficaria pendurada
 * num gráfico filtrado só em Gioviale, explicando um pico que não é dela.
 */
export function eventosNoRecorte(eventos: EventoComercial[], filtros: Filtros): EventoComercial[] {
  const escolhidos = filtros.empreendimento ?? [];
  if (escolhidos.length === 0) return eventos;
  return eventos.filter((e) => !e.empreendimento || escolhidos.includes(e.empreendimento));
}

/** O período é um mês do calendário, inteiro? Decide a linha da meta. */
export function ehUmMesSo(de: string, ate: string): boolean {
  const [ad, md] = de.split('-');
  const [aa, ma] = ate.split('-');
  if (ad !== aa || md !== ma) return false;
  if (!de.endsWith('-01')) return false;
  // O último dia do mês, sem Date: mês 0 do mês seguinte em UTC é seguro
  // porque só se compara o número do dia.
  const ultimo = new Date(Date.UTC(Number(aa), Number(ma), 0)).getUTCDate();
  return Number(ate.slice(-2)) === ultimo;
}

/**
 * O intervalo do gráfico: termina no fim do mês escolhido e volta N-1 meses.
 *
 * Sem `new Date` nas datas: `Date.UTC` com dia 0 dá o último dia do mês, e o
 * resto é texto — o mesmo cuidado de `rotuloDoBalde`, pelo mesmo motivo.
 */
export function janela(mes: string, meses: number): { de: string; ate: string } {
  const ano = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7));
  const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  const inicio = new Date(Date.UTC(ano, m - 1 - (meses - 1), 1));
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    de: `${inicio.getUTCFullYear()}-${pad(inicio.getUTCMonth() + 1)}-01`,
    ate: `${mes}-${pad(ultimo)}`,
  };
}

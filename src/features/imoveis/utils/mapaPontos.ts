/**
 * Mapa interligado (P2.6) — o que cada pino é, e o que o contador diz.
 *
 * Funções puras. O mapa passa a mostrar TRÊS tipos: lançamentos, condomínios e
 * os imóveis do catálogo ("terceiros"). Antes só os imóveis apareciam.
 */

export type TipoDePonto = 'lancamento' | 'condominio' | 'imovel';

export interface PontoDoMapa {
  tipo: TipoDePonto;
  id: string;
  /** Código do imóvel no catálogo; é por ele que o mapa casa com a lista já carregada. */
  ref: string | null;
  nome: string | null;
  codigo: string | null;
  latitude: number | null;
  longitude: number | null;
  geo_origem: 'automatica' | 'manual' | null;
  geo_precisao: 'exata' | 'aproximada' | null;
  geo_erro: string | null;
  bairro: string | null;
  cidade: string | null;
  foto: string | null;
  preco: string | null;
  link: string | null;
  /** null = não dá nem para tentar geocodificar. Nunca vai aparecer no mapa. */
  endereco: string | null;
}

export interface ContagemDeTipo {
  total: number;
  no_mapa: number;
  sem_endereco: number;
}

export interface TotaisDoMapa {
  lancamentos: ContagemDeTipo;
  condominios: ContagemDeTipo;
  imoveis: ContagemDeTipo;
  aproximados: number;
  com_erro: number;
}

export const ROTULO_DO_TIPO: Record<TipoDePonto, string> = {
  lancamento: 'Lançamentos',
  condominio: 'Condomínios',
  imovel: 'Terceiros',
};

/**
 * Uma cor por tipo, e nenhuma delas é a cor de "aproximado" — o aviso de pino
 * aproximado é escrito, não pintado. Cor para dizer duas coisas ao mesmo tempo
 * vira mapa que ninguém lê.
 */
export const COR_DO_TIPO: Record<TipoDePonto, string> = {
  lancamento: '#e11d48', // rosa escuro
  condominio: '#7c3aed', // roxo
  imovel: '#2563eb', // azul
};

const CHAVE_DO_TOTAL: Record<TipoDePonto, keyof Pick<TotaisDoMapa, 'lancamentos' | 'condominios' | 'imoveis'>> = {
  lancamento: 'lancamentos',
  condominio: 'condominios',
  imovel: 'imoveis',
};

/** Só o que tem coordenada é desenhável; o resto existe para o contador. */
export function temCoordenada(p: PontoDoMapa): boolean {
  return (
    typeof p.latitude === 'number' &&
    typeof p.longitude === 'number' &&
    Number.isFinite(p.latitude) &&
    Number.isFinite(p.longitude) &&
    !(p.latitude === 0 && p.longitude === 0)
  );
}

export function filtrarPontos(
  pontos: PontoDoMapa[],
  { tipos, busca }: { tipos: Set<TipoDePonto>; busca?: string }
): PontoDoMapa[] {
  const q = (busca ?? '').trim().toLowerCase();
  return pontos.filter((p) => {
    if (!tipos.has(p.tipo)) return false;
    if (!temCoordenada(p)) return false;
    if (!q) return true;
    return `${p.nome ?? ''} ${p.codigo ?? ''} ${p.bairro ?? ''} ${p.cidade ?? ''}`.toLowerCase().includes(q);
  });
}

export interface Contagem {
  noMapa: number;
  total: number;
  semEndereco: number;
  aproximados: number;
}

/** Soma só os tipos ligados: o contador tem que falar do que está na tela. */
export function contar(
  totais: TotaisDoMapa | null,
  tipos: Set<TipoDePonto>,
  pontosVisiveis: PontoDoMapa[]
): Contagem {
  const zero: Contagem = { noMapa: 0, total: 0, semEndereco: 0, aproximados: 0 };
  if (!totais) return zero;
  let total = 0;
  let semEndereco = 0;
  for (const tipo of tipos) {
    const c = totais[CHAVE_DO_TOTAL[tipo]];
    if (!c) continue;
    total += c.total ?? 0;
    semEndereco += c.sem_endereco ?? 0;
  }
  return {
    noMapa: pontosVisiveis.length,
    total,
    semEndereco,
    aproximados: pontosVisiveis.filter((p) => p.geo_precisao === 'aproximada').length,
  };
}

/**
 * A frase do contador, com a legenda que o plano pede.
 *
 * Separa quem NUNCA vai aparecer (sem endereço) de quem ainda não foi
 * geocodificado. Um "37 de 59" sozinho faz o gestor esperar os 22 que faltam —
 * e 18 deles não têm endereço nenhum para achar.
 */
export function textoDoContador(c: Contagem): string {
  if (c.total === 0) return 'Nada cadastrado para mostrar no mapa.';
  const partes = [`${c.noMapa} de ${c.total} no mapa`];
  if (c.semEndereco > 0) {
    partes.push(`${c.semEndereco} sem endereço cadastrado — esses não aparecem`);
  }
  const faltam = c.total - c.noMapa - c.semEndereco;
  if (faltam > 0) partes.push(`${faltam} ainda sem coordenada`);
  if (c.aproximados > 0) partes.push(`${c.aproximados} com pino aproximado (bairro)`);
  return partes.join(' · ');
}

/** O que o card do pino mostra, na ordem em que o plano pede. */
export function linhasDoCard(p: PontoDoMapa): string[] {
  const linhas: string[] = [];
  if (p.codigo) linhas.push(p.codigo);
  if (p.preco) linhas.push(p.preco);
  const lugar = [p.bairro, p.cidade].filter(Boolean).join(' · ');
  if (lugar) linhas.push(lugar);
  if (p.geo_precisao === 'aproximada') {
    linhas.push('Pino aproximado: sai do bairro, não do endereço');
  }
  return linhas;
}

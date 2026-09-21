/**
 * Relatório de recrutamento (P3.8) — as contas, fora do componente.
 *
 * A regra que atravessa o arquivo: ZERO TEM DOIS SIGNIFICADOS, e a tela precisa
 * dizer qual. "Nenhum candidato chegou nesta etapa" e "ninguém anota esta
 * etapa" viram o mesmo 0 — e o segundo, lido como o primeiro, faz o gestor
 * concluir que o processo trava onde ele só não é registrado.
 */

export interface EtapaDoFunil {
  ordem: number;
  etapa: string;
  rotulo: string;
  /** Quantos alcançaram a etapa NO PERÍODO. */
  alcancaram: number;
  /** Quantos têm esse carimbo em qualquer época. Zero aqui = ninguém anota. */
  registrado_sempre: number;
}

export interface LinhaDeOrigem {
  origem: string;
  candidatos: number;
  /** 'outro' é o padrão da coluna, e não uma escolha de quem cadastrou. */
  e_o_padrao: boolean;
}

export interface RelatorioDeRecrutamento {
  de: string;
  ate: string;
  total: number;
  etapas: EtapaDoFunil[];
  por_origem: LinhaDeOrigem[];
  por_area: Array<{ area: string; candidatos: number }>;
  origem_no_padrao: number;
  registro_desde: string;
}

export const ROTULO_DA_AREA: Record<string, string> = {
  vendas_lancamentos: 'Vendas · Lançamentos',
  vendas_prontos: 'Vendas · Prontos',
  administrativo: 'Administrativo',
  '(sem área)': 'Sem área definida',
};

export const ROTULO_DA_ORIGEM: Record<string, string> = {
  indicacao: 'Indicação',
  anuncio_meta: 'Anúncio na Meta',
  portal_vagas: 'Portal de vagas',
  panfletagem: 'Panfletagem',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  site: 'Site',
  email_marketing: 'E-mail marketing',
  outro: 'Outro',
  '(sem origem)': 'Sem origem',
};

/**
 * A conversão entre duas etapas seguidas.
 *
 * Devolve `pct: null` quando não dá para dividir OU quando a etapa de destino
 * nunca foi registrada. O segundo caso é o que separa "ninguém converteu" de
 * "ninguém anota" — e mostrar 0% ali acusaria o processo por uma falha de
 * cadastro.
 */
export function conversao(
  de: EtapaDoFunil,
  para: EtapaDoFunil
): { pct: number | null; texto: string; motivo: 'ok' | 'sem_base' | 'sem_registro' } {
  if (para.registrado_sempre === 0) {
    return { pct: null, texto: 'etapa não é registrada', motivo: 'sem_registro' };
  }
  if (de.alcancaram <= 0) {
    return { pct: null, texto: 'ninguém chegou na etapa anterior', motivo: 'sem_base' };
  }
  const pct = Math.round((para.alcancaram / de.alcancaram) * 1000) / 10;
  return {
    pct,
    texto: `${String(pct).replace('.', ',')}% (${para.alcancaram} de ${de.alcancaram})`,
    motivo: 'ok',
  };
}

/** Os degraus do funil, dois a dois. */
export function conversoes(etapas: EtapaDoFunil[]): Array<{
  de: string;
  para: string;
  resultado: ReturnType<typeof conversao>;
}> {
  const ordenadas = [...(etapas ?? [])].sort((a, b) => a.ordem - b.ordem);
  const saida: Array<{ de: string; para: string; resultado: ReturnType<typeof conversao> }> = [];
  for (let i = 0; i < ordenadas.length - 1; i++) {
    saida.push({
      de: ordenadas[i].rotulo,
      para: ordenadas[i + 1].rotulo,
      resultado: conversao(ordenadas[i], ordenadas[i + 1]),
    });
  }
  return saida;
}

/** As etapas que ninguém anota. É o achado mais útil desta tela. */
export function etapasSemRegistro(etapas: EtapaDoFunil[]): string[] {
  return (etapas ?? []).filter((e) => e.registrado_sempre === 0).map((e) => e.rotulo);
}

/**
 * O aviso sobre a leitura por origem.
 *
 * Medido em produção em 21/09: os 5 candidatos estão em "outro", que é o
 * PADRÃO da coluna. Sem este aviso, o gestor lê "todos vieram de outro lugar"
 * quando a verdade é "ninguém preencheu".
 */
export function avisoDaOrigem(r: Pick<RelatorioDeRecrutamento, 'origem_no_padrao' | 'total'>): string | null {
  if (!r || r.total <= 0 || r.origem_no_padrao <= 0) return null;
  const pct = Math.round((r.origem_no_padrao / r.total) * 100);
  if (pct < 50) {
    return `${r.origem_no_padrao} de ${r.total} candidatos estão em "Outro", que é o valor padrão do cadastro.`;
  }
  return `${r.origem_no_padrao} de ${r.total} candidatos (${pct}%) estão em "Outro" — que é o valor PADRÃO do cadastro, e não uma escolha. Na prática isto significa que a origem não vem sendo preenchida.`;
}

/**
 * A soma por origem fecha com o total?
 *
 * É o critério de pronto do plano. A tela confere e avisa se não fechar, em
 * vez de mostrar um gráfico que não soma — quem notasse perderia a confiança
 * no resto da página.
 */
export function somaFecha(
  linhas: Array<{ candidatos: number }>,
  total: number
): { fecha: boolean; soma: number } {
  const soma = (linhas ?? []).reduce((s, l) => s + (l.candidatos || 0), 0);
  return { fecha: soma === total, soma };
}

/** O período tem dado anterior ao registro automático? Se sim, a tela avisa. */
export function periodoAntesDoRegistro(de: string, registroDesde: string): boolean {
  return !!de && !!registroDesde && de < registroDesde;
}

/**
 * Lista em português: "A", "A e B", "A, B e C".
 *
 * Um `join(' e ')` dá "A e B e C", que é como ninguém escreve — e a frase
 * inteira perde a credibilidade por causa disso.
 */
export function listaEmPortugues(itens: string[]): string {
  const l = (itens ?? []).filter(Boolean);
  if (l.length === 0) return '';
  if (l.length === 1) return l[0];
  return `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`;
}

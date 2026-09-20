/**
 * Tipologias do empreendimento (P2.1).
 *
 * O que o card do site e a LIA mostram de "dormitórios" e "a partir de".
 *
 * DECIDIDO PELO CHEFE EM 20/09/2026: enquanto o lançamento não tiver
 * tipologia cadastrada, continua valendo o texto de hoje. Trocar tudo de uma
 * vez deixaria os 59 lançamentos da Lotus sem dormitório e sem preço num site
 * público, no dia em que a tabela subisse.
 *
 * A REGRA MORA AQUI, e só aqui: o card do site, a ficha do lançamento e o que
 * vai para a LIA precisam dizer a mesma coisa. Três cópias divergiriam na
 * primeira mudança, e a divergência apareceria para o cliente.
 */

export interface Tipologia {
  id?: string;
  nome: string;
  dormitorios?: number | null;
  suites?: number | null;
  banheiros?: number | null;
  vagas?: number | null;
  area_privativa_m2?: number | null;
  preco_a_partir?: number | null;
  preco_atualizado_em?: string | null;
  disponivel?: boolean;
  unidades_disponiveis?: number | null;
  planta_url?: string | null;
  observacao?: string | null;
  ordem?: number;
}

/** O que o lançamento tem hoje, em texto, para servir de reserva. */
export interface TextoDoLancamento {
  dormitorios?: string | null;
  preco_num?: number | null;
  preco_texto?: string | null;
}

const disponiveis = (ts: Tipologia[]) => ts.filter((t) => t.disponivel !== false);

/**
 * O menor preço entre as tipologias disponíveis.
 *
 * Só conta tipologia disponível: anunciar o preço de uma que acabou é
 * prometer o que não se pode entregar, e o cliente descobre no plantão.
 */
export function precoAPartirDe(tipologias: Tipologia[] = []): number | null {
  const precos = disponiveis(tipologias)
    .map((t) => Number(t.preco_a_partir))
    .filter((n) => Number.isFinite(n) && n > 0);
  return precos.length > 0 ? Math.min(...precos) : null;
}

/**
 * "2 e 3 dorms" a partir dos números das tipologias.
 *
 * Devolve nulo quando nenhuma tipologia declara dormitórios — um lote não
 * tem, e são 10 dos 59 lançamentos da Lotus.
 */
export function resumoDeDormitorios(tipologias: Tipologia[] = []): string | null {
  const nums = [...new Set(
    disponiveis(tipologias)
      .map((t) => Number(t.dormitorios))
      .filter((n) => Number.isInteger(n) && n > 0)
  )].sort((a, b) => a - b);

  if (nums.length === 0) return null;
  if (nums.length === 1) return `${nums[0]} ${nums[0] === 1 ? 'dorm' : 'dorms'}`;
  return `${nums.slice(0, -1).join(', ')} e ${nums[nums.length - 1]} dorms`;
}

/** A faixa de área: "64 a 92 m²", ou "64 m²" quando só há uma. */
export function resumoDeArea(tipologias: Tipologia[] = []): string | null {
  const areas = disponiveis(tipologias)
    .map((t) => Number(t.area_privativa_m2))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (areas.length === 0) return null;
  const min = Math.min(...areas);
  const max = Math.max(...areas);
  const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
  return min === max ? `${fmt(min)} m²` : `${fmt(min)} a ${fmt(max)} m²`;
}

const reais = (n: number) =>
  n >= 1_000_000
    ? `R$ ${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1).replace('.', ',')} mi`
    : `R$ ${Math.round(n / 1000)} mil`;

export interface ParaOCard {
  dormitorios: string | null;
  preco: string | null;
  area: string | null;
  /** De onde veio cada coisa: a tela pode dizer que ainda é o texto antigo. */
  origem: 'tipologias' | 'texto' | 'nada';
}

/**
 * O que o card mostra, com a reserva do texto de hoje.
 *
 * A decisão de ter reserva é do chefe, e a regra é por lançamento, não global:
 * quem já cadastrou tipologia vê o dado novo, quem não cadastrou continua
 * vendo o que via. A migração acontece empreendimento a empreendimento, sem
 * um dia em que o site inteiro fica vazio.
 */
export function paraOCard(tipologias: Tipologia[] = [], texto: TextoDoLancamento = {}): ParaOCard {
  const temTipologia = disponiveis(tipologias).length > 0;

  if (temTipologia) {
    const preco = precoAPartirDe(tipologias);
    const dorms = resumoDeDormitorios(tipologias);
    // Tipologia cadastrada mas sem NENHUM número aproveitável cai na reserva:
    // mostrar um card vazio seria pior do que mostrar o texto antigo.
    if (preco !== null || dorms !== null) {
      return {
        dormitorios: dorms,
        preco: preco !== null ? `a partir de ${reais(preco)}` : null,
        area: resumoDeArea(tipologias),
        origem: 'tipologias',
      };
    }
  }

  const precoTexto = String(texto.preco_texto ?? '').trim();
  const precoNum = Number(texto.preco_num);
  const precoDeReserva = precoTexto
    || (Number.isFinite(precoNum) && precoNum > 0 ? `a partir de ${reais(precoNum)}` : null);
  const dormsDeReserva = String(texto.dormitorios ?? '').trim() || null;

  if (!precoDeReserva && !dormsDeReserva) {
    return { dormitorios: null, preco: null, area: null, origem: 'nada' };
  }
  return { dormitorios: dormsDeReserva, preco: precoDeReserva, area: null, origem: 'texto' };
}

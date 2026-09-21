/**
 * Lê o bloco "RANKING CORRETORES" da planilha de comissionamento.
 *
 * A planilha é feita à mão, e o layout mostra isso: a coluna "Vendas" de
 * JANEIRO fica ANTES do mês e a dos demais meses fica DEPOIS; meses que ainda
 * não aconteceram não têm coluna de vendas; e aparecem "#VALUE!"/"#REF!" no
 * meio. Por isso NADA aqui é posição fixa: as colunas saem do cabeçalho, e o
 * que não dá para ler vira `null` + aviso, nunca zero — zero é uma afirmação
 * ("não vendeu"), e chutar isso num ranking é pior do que não mostrar.
 *
 * Quem saiu da casa (bloco "Saida") e o ranking do ano anterior ficam de fora:
 * o campo na Dash é dos corretores de hoje.
 */

const MESES = {
  JANEIRO: 1, FEVEREIRO: 2, MARCO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6,
  JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12,
};

const semAcento = (texto) =>
  String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const normalizado = (texto) => semAcento(texto).toUpperCase();

/** "Vendas" vale para o mês vizinho: tenta a coluna seguinte, senão a anterior. */
function colunaDeVendas(cabecalho, iMes) {
  if (normalizado(cabecalho[iMes + 1]) === 'VENDAS') return iMes + 1;
  if (normalizado(cabecalho[iMes - 1]) === 'VENDAS') return iMes - 1;
  return null;
}

function mapaDeMeses(cabecalho) {
  const mapa = [];
  cabecalho.forEach((celula, i) => {
    // "DEZEMBRO 01 a 15" e afins: basta começar com o nome do mês.
    const nome = Object.keys(MESES).find((m) => normalizado(celula).startsWith(m));
    if (!nome) return;
    if (mapa.some((m) => m.mes === MESES[nome])) return; // primeira ocorrência manda
    mapa.push({ mes: MESES[nome], colunaVendas: colunaDeVendas(cabecalho, i) });
  });
  return mapa;
}

/** Inteiro da célula, ou null quando vazia / erro de fórmula / texto. */
function inteiro(celula) {
  const bruto = String(celula ?? '').trim();
  if (!bruto || bruto.startsWith('#')) return null;
  const limpo = bruto.replace(/[^\d-]/g, '');
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isInteger(n) ? n : null;
}

const FIM_DO_BLOCO = ['TOTAL MENSAL', 'SAIDA', 'RANKING 2025 CORRETORES', 'TOTAL VGC(QUEM SAIU JUNTO)'];

export function lerRankingCorretores(grade) {
  const avisos = [];
  const iCabecalho = (grade || []).findIndex((linha) => normalizado(linha?.[0]) === 'RANKING CORRETORES');
  if (iCabecalho < 0) {
    avisos.push('Bloco "RANKING CORRETORES" não encontrado na aba lida.');
    return { corretores: [], avisos };
  }

  const meses = mapaDeMeses(grade[iCabecalho + 1] || []);
  if (meses.length === 0) avisos.push('Cabeçalho do ranking sem nenhum mês reconhecido.');

  const corretores = [];
  for (let i = iCabecalho + 2; i < grade.length; i += 1) {
    const linha = grade[i] || [];
    const nome = String(linha[0] ?? '').trim();
    if (!nome) continue; // linha de respiro no meio do bloco
    if (FIM_DO_BLOCO.some((marca) => normalizado(nome).startsWith(marca))) break;

    const semNumero = [];
    const linhaMeses = meses.map(({ mes, colunaVendas }) => {
      const vendas = colunaVendas === null ? null : inteiro(linha[colunaVendas]);
      if (colunaVendas !== null && vendas === null) semNumero.push(mes);
      return { mes, vendas };
    });
    if (semNumero.length > 0) {
      avisos.push(`${nome}: sem número de vendas nos meses ${semNumero.join(', ')}.`);
    }

    corretores.push({
      nome,
      nivel: String(linha[1] ?? '').trim() || null,
      equipe: String(linha[2] ?? '').trim() || null,
      meses: linhaMeses,
    });
  }

  return { corretores, avisos };
}

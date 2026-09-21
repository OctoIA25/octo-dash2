/**
 * Liga o nome escrito na planilha ao corretor cadastrado.
 *
 * A base já mistura "Fernanda Souza" com "Fernanda" e "André Marcondes" com
 * "Andre" (P0.2 do plano). Então a regra é conservadora: casa quando só existe
 * um candidato; com dois ou mais, NÃO casa. Venda pendurada no corretor errado
 * é pior do que venda sem dono — a sem dono aparece na lista de não
 * reconhecidos e alguém resolve; a errada ninguém percebe.
 */

const normalizar = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** "fernanda aparecida souza" → "fernanda souza" (primeiro + último). */
function primeiroEUltimo(nome) {
  const partes = normalizar(nome).split(' ').filter(Boolean);
  if (partes.length < 2) return null;
  return `${partes[0]} ${partes[partes.length - 1]}`;
}

function candidatos(nomePlanilha, membros) {
  const alvo = normalizar(nomePlanilha);
  if (!alvo) return [];

  const exatos = membros.filter((m) => normalizar(m.nome) === alvo);
  if (exatos.length > 0) return exatos;

  const alvoCurto = primeiroEUltimo(nomePlanilha) ?? alvo;
  return membros.filter((m) => {
    const nome = normalizar(m.nome);
    if (!nome) return false;
    return primeiroEUltimo(m.nome) === alvoCurto || nome === alvoCurto || nome.startsWith(`${alvo} `);
  });
}

export function casarCorretores(linhas, membros) {
  const naoReconhecidos = [];
  const pares = (linhas || []).map((linha) => {
    const achados = candidatos(linha.nome, membros || []);
    const user_id = achados.length === 1 ? achados[0].user_id : null;
    if (!user_id) naoReconhecidos.push(linha.nome);
    return { ...linha, user_id };
  });
  return { pares, naoReconhecidos };
}

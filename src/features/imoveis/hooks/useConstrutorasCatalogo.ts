/**
 * Catálogo de lançamentos das construtoras (região de Jundiaí).
 *
 * Fonte: planilha-espelho pública no Google Sheets ("app_export"), que puxa via
 * IMPORTRANGE da planilha operacional editada pela equipe.
 *
 * ================================================================
 * LIDO POR POSIÇÃO, NÃO POR NOME. Descoberto em 23/09/2026.
 * ================================================================
 *
 * O cabeçalho do espelho é texto FIXO, escrito uma vez. Os dados vêm por
 * IMPORTRANGE e seguem o layout ATUAL da operacional. Quando alguém insere uma
 * coluna lá, os dados andam uma casa e o cabeçalho do espelho fica onde estava.
 *
 * Foi o que aconteceu, duas vezes: inseriram **`Código na Dash`** na 3ª posição
 * e **`Data de atualização`** na 14ª. Resultado, medido nas 84 linhas:
 *
 *     o código lia `tipo`      e recebia  L005   (o código do empreendimento)
 *     o código lia `endereco`  e recebia  APARTAMENTO
 *     o código lia `cidade`    e recebia  o bairro
 *     o código lia `valor`     e recebia  VAZIO, em 100% das linhas
 *
 * A aba Imóveis › Construtoras mostrou isso na tela por meses, e ninguém
 * percebeu — porque cada campo continha *alguma coisa* plausível.
 *
 * E a validação antiga não pegou: ela conferia se as colunas `construtora` e
 * `empreendimento` EXISTIAM no cabeçalho. Existiam — o cabeçalho estava
 * intacto; o que tinha mudado era o que vinha embaixo dele. Conferir nome de
 * coluna não detecta deslocamento de dados. Por isso agora a checagem olha o
 * DADO (ver `conferirLayout`).
 *
 * Sem gid na URL de export: o arquivo-espelho tem uma única aba (o gid dela é
 * aleatório por ter sido criado via conversão de CSV; sem gid o Google exporta
 * a primeira aba, que é a única).
 */

import { useQuery } from '@tanstack/react-query';

export const CATALOGO_CSV_URL =
  'https://docs.google.com/spreadsheets/d/120VGVT2g7whFdJOkgLhH62d3GHzQ44oTTvgKWR0tkHc/export?format=csv';

export interface EmpreendimentoCatalogo {
  construtora: string;
  empreendimento: string;
  /**
   * O `L0xx` do empreendimento — a coluna "Código na Dash" da operacional.
   * Existe desde sempre na planilha e NUNCA chegava aqui: era ela que o código
   * lia como se fosse `tipo`.
   */
  codigo: string;
  tipo: string;
  endereco: string;
  bairro: string;
  cidade: string;
  previsao_entrega: string;
  cadastrado_octodash: string;
  descricao: string;
  unidades: string;
  garden: string;
  valor: string;
  vagas: string;
  dormitorios: string;
  suites: string;
  book: string;
  decorado: string;
  fotos: string;
  landing_page: string;
  /**
   * Preenchida por script onEdit na planilha original (coluna Y): data da
   * última edição da linha. Vazia em linhas nunca editadas desde a criação
   * do script — a UI mostra "-".
   */
  atualizado_em: string;
}

/**
 * A ordem REAL das colunas, conferida contra a planilha operacional em
 * 23/09/2026. O nome à direita é como a equipe a chama lá.
 *
 * As posições 17, 18 e 19 existem na operacional (`Comissão`, `Condomínio`,
 * `IPTU`) e estão VAZIAS nas 84 linhas — ficam fora do mapa de propósito: um
 * campo que nunca tem valor é ruído na tela e na interface.
 */
const COLUNA = {
  construtora: 0,          // CONSTRUTORA
  empreendimento: 1,       // Empreendimento
  codigo: 2,               // Código na Dash      <- inserida; deslocou o resto
  tipo: 3,                 // Tipo
  endereco: 4,             // Endereço
  bairro: 5,               // Bairro
  cidade: 6,               // Cidade
  previsao_entrega: 7,     // Previsão de entrega
  cadastrado_octodash: 8,  // Cadastrado no OctoDash
  descricao: 9,            // Descrição
  unidades: 10,            // Número de lotes/unidades
  garden: 11,              // Garden
  valor: 12,               // Valor mínimo
  // 13 = Data de atualização  <- inserida; deslocou mais uma casa
  vagas: 14,               // Vagas
  dormitorios: 15,         // Dormitórios
  suites: 16,              // Suítes
  book: 20,
  decorado: 21,
  fotos: 22,
  landing_page: 23,
  atualizado_em: 24,       // Atualizado em (auto)
} as const;

/**
 * O layout ainda é o que esperamos?
 *
 * Confere o DADO, não o nome da coluna — a validação antiga olhava o nome, e
 * foi por isso que meses de dado deslocado passaram em silêncio.
 *
 * Duas âncoras, escolhidas por serem inconfundíveis: a coluna do código traz
 * `L` seguido de dígitos, e a do tipo traz uma palavra de tipo de imóvel.
 * Ambas eram outra coisa quando o layout estava deslocado.
 *
 * Lança em vez de degradar: uma tela vazia com um aviso é recuperável; uma
 * tela cheia de dado errado, não — porque ninguém vai atrás.
 */
export function conferirLayout(linhas: string[][]): void {
  const comConteudo = linhas.filter((l) => (l[COLUNA.empreendimento] ?? '').trim());
  if (comConteudo.length === 0) return;

  const pareceCodigo = comConteudo.filter((l) => /^L\d{2,4}$/i.test((l[COLUNA.codigo] ?? '').trim()));
  const TIPOS = ['apartamento', 'casa', 'loteamento', 'lote', 'comercial', 'sala', 'terreno', 'sobrado', 'studio'];
  const pareceTipo = comConteudo.filter((l) =>
    TIPOS.some((t) => (l[COLUNA.tipo] ?? '').trim().toLowerCase().includes(t)));

  // Metade é folga generosa: a planilha tem linhas incompletas de verdade
  // (o código está em 61 das 84). O que não acontece por acaso é a coluna
  // inteira deixar de parecer o que é.
  const metade = comConteudo.length / 2;
  if (pareceCodigo.length < metade || pareceTipo.length < metade) {
    throw new Error(
      'O layout da planilha de catálogo mudou: as colunas não estão mais onde o sistema espera. '
      + `Na coluna do código encontrei ${pareceCodigo.length} de ${comConteudo.length} parecendo "L0xx", `
      + `e na do tipo ${pareceTipo.length} de ${comConteudo.length} parecendo tipo de imóvel. `
      + 'Provavelmente alguém inseriu ou removeu uma coluna — é preciso reconferir a ordem antes de confiar na tela.',
    );
  }
}

/** true quando o valor da célula é um link navegável (e não "Book.pdf", "Não", "Antigo"...). */
export const isLink = (value: string): boolean => /^https?:\/\//i.test(value.trim());

/**
 * Separado do hook para ser testável sem React. Lança erro com as colunas
 * ausentes quando o cabeçalho do espelho não é o esperado (planilha mexida).
 */
export async function parseCatalogoCsv(csv: string): Promise<EmpreendimentoCatalogo[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(csv, { type: 'string', raw: true });
  // `header: 1` = matriz de posições, SEM usar a primeira linha como nome de
  // coluna. É o ponto do conserto: o cabeçalho do espelho não descreve mais o
  // que vem embaixo dele.
  const linhas = XLSX.utils.sheet_to_json<string[]>(
    wb.Sheets[wb.SheetNames[0]],
    { header: 1, defval: '', blankrows: false, raw: false },
  );

  // A primeira linha é o cabeçalho antigo do espelho — descartada, não lida.
  const dados = linhas.slice(1).map((l) => (Array.isArray(l) ? l.map((c) => String(c ?? '')) : []));
  conferirLayout(dados);

  const em = (l: string[], i: number) => String(l[i] ?? '').trim();

  return dados
    .map((l) => ({
      construtora: em(l, COLUNA.construtora),
      empreendimento: em(l, COLUNA.empreendimento),
      codigo: em(l, COLUNA.codigo),
      tipo: em(l, COLUNA.tipo),
      endereco: em(l, COLUNA.endereco),
      bairro: em(l, COLUNA.bairro),
      cidade: em(l, COLUNA.cidade),
      previsao_entrega: em(l, COLUNA.previsao_entrega),
      cadastrado_octodash: em(l, COLUNA.cadastrado_octodash),
      descricao: em(l, COLUNA.descricao),
      unidades: em(l, COLUNA.unidades),
      garden: em(l, COLUNA.garden),
      valor: em(l, COLUNA.valor),
      vagas: em(l, COLUNA.vagas),
      dormitorios: em(l, COLUNA.dormitorios),
      suites: em(l, COLUNA.suites),
      book: em(l, COLUNA.book),
      decorado: em(l, COLUNA.decorado),
      fotos: em(l, COLUNA.fotos),
      landing_page: em(l, COLUNA.landing_page),
      atualizado_em: em(l, COLUNA.atualizado_em),
    }))
    .filter((e) => e.empreendimento !== '');
}

export async function fetchCatalogoConstrutoras(): Promise<EmpreendimentoCatalogo[]> {
  const res = await fetch(CATALOGO_CSV_URL);
  if (!res.ok) {
    throw new Error(`Falha ao baixar o catálogo (HTTP ${res.status})`);
  }
  return parseCatalogoCsv(await res.text());
}

export function useConstrutorasCatalogo() {
  return useQuery({
    queryKey: ['construtoras-catalogo'],
    queryFn: fetchCatalogoConstrutoras,
    // Planilha muda poucas vezes ao dia; 10min evita rebaixar no Google à toa.
    staleTime: 10 * 60 * 1000,
  });
}

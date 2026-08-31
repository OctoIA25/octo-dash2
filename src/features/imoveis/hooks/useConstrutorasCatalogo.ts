/**
 * Catálogo de lançamentos das construtoras (região de Jundiaí).
 *
 * Fonte: planilha-espelho pública no Google Sheets ("app_export"), que puxa via
 * IMPORTRANGE da planilha operacional editada pela equipe. O espelho tem
 * cabeçalho fixo de 1 linha — se a equipe bagunçar o layout da original, o
 * IMPORTRANGE quebra visivelmente lá, e aqui o parser acusa cabeçalho ausente.
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
  comissao: string;
  condominio: string;
  iptu: string;
  book: string;
  decorado: string;
  fotos: string;
  landing_page: string;
  youtube: string;
  folhetos: string;
  /**
   * Preenchida por script onEdit na planilha original (coluna Y): data da
   * última edição da linha. Vazia em linhas nunca editadas desde a criação
   * do script — a UI mostra "-".
   */
  atualizado_em: string;
}

// Colunas que precisam existir no cabeçalho para o parse fazer sentido.
// As demais degradam para string vazia sem quebrar a tela.
const COLUNAS_OBRIGATORIAS = ['construtora', 'empreendimento'] as const;

/** true quando o valor da célula é um link navegável (e não "Book.pdf", "Não", "Antigo"...). */
export const isLink = (value: string): boolean => /^https?:\/\//i.test(value.trim());

/**
 * Separado do hook para ser testável sem React. Lança erro com as colunas
 * ausentes quando o cabeçalho do espelho não é o esperado (planilha mexida).
 */
export async function parseCatalogoCsv(csv: string): Promise<EmpreendimentoCatalogo[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(csv, { type: 'string', raw: true });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    wb.Sheets[wb.SheetNames[0]],
    { defval: '' },
  );

  if (rows.length > 0) {
    const colunas = Object.keys(rows[0]);
    const ausentes = COLUNAS_OBRIGATORIAS.filter((c) => !colunas.includes(c));
    if (ausentes.length > 0) {
      throw new Error(`Catálogo com cabeçalho inesperado — colunas ausentes: ${ausentes.join(', ')}`);
    }
  }

  return rows
    .map((row) => {
      const get = (key: keyof EmpreendimentoCatalogo) => String(row[key] ?? '').trim();
      return {
        construtora: get('construtora'),
        empreendimento: get('empreendimento'),
        tipo: get('tipo'),
        endereco: get('endereco'),
        bairro: get('bairro'),
        cidade: get('cidade'),
        previsao_entrega: get('previsao_entrega'),
        cadastrado_octodash: get('cadastrado_octodash'),
        descricao: get('descricao'),
        unidades: get('unidades'),
        garden: get('garden'),
        valor: get('valor'),
        vagas: get('vagas'),
        dormitorios: get('dormitorios'),
        suites: get('suites'),
        comissao: get('comissao'),
        condominio: get('condominio'),
        iptu: get('iptu'),
        book: get('book'),
        decorado: get('decorado'),
        fotos: get('fotos'),
        landing_page: get('landing_page'),
        youtube: get('youtube'),
        folhetos: get('folhetos'),
        atualizado_em: get('atualizado_em'),
      };
    })
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

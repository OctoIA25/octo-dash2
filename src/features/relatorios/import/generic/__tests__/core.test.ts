import { describe, it, expect } from 'vitest';
import { parseGenericTable, findHeaderRow, deriveColumns, MAX_ROWS } from '../schemalessParser';
import { discoverMetadata, parseNumeric } from '../metadataDiscovery';
import { heuristicAnalyticsProvider, noopAnalyticsProvider } from '../analytics';

describe('schemalessParser — qualquer topico, sem assumir dominio', () => {
    it('parseia uma planilha de tema NAO imobiliario (estoque de produtos)', () => {
        const data = [
            ['Produto', 'Categoria', 'Preco', 'Em Estoque'],
            ['Notebook', 'Eletronicos', 'R$ 3.500,00', 'sim'],
            ['Cadeira', 'Moveis', 'R$ 450,00', 'nao'],
        ];
        const table = parseGenericTable(data, 'Estoque');

        expect(table.sheetName).toBe('Estoque');
        expect(table.columns.map((c) => c.label)).toEqual(['Produto', 'Categoria', 'Preco', 'Em Estoque']);
        expect(table.rows).toHaveLength(2);
        expect(table.rows[0]).toEqual({
            Produto: 'Notebook', Categoria: 'Eletronicos', Preco: 'R$ 3.500,00', 'Em Estoque': 'sim',
        });
    });

    it('encontra o cabecalho apos linhas de titulo/vazias', () => {
        const data = [
            ['Relatorio Mensal'],
            [],
            ['Cidade', 'Populacao', 'Regiao'],
            ['Sao Paulo', 12000000, 'Sudeste'],
        ];
        expect(findHeaderRow(data)).toBe(2);
        const table = parseGenericTable(data);
        expect(table.columns).toHaveLength(3);
        expect(table.rows[0].Cidade).toBe('Sao Paulo');
    });

    it('desambigua colunas com cabecalho duplicado e nomeia colunas vazias', () => {
        const cols = deriveColumns(['Nome', 'Nome', '', 'Valor']);
        expect(cols.map((c) => c.name)).toEqual(['Nome', 'Nome (2)', 'Coluna 3', 'Valor']);
    });

    it('cabecalho ESPARSO (holes do XLSX) vira colunas densas, sem quebrar', () => {
        // sheet_to_json do XLSX produz arrays ESPARSOS (com holes, não null) quando
        // o cabecalho tem celulas vazias intercaladas — ex.: ["KPI", , , "Janeiro"].
        // O bug: map() pula holes → coluna undefined → crash ao ler a planilha.
        const sparseHeader = ['KPI', , , 'Janeiro', 'Fevereiro']; // eslint-disable-line no-sparse-arrays
        const cols = deriveColumns(sparseHeader);
        expect(cols).toHaveLength(5);                              // denso: nenhum buraco
        expect(cols.every((c) => typeof c.name === 'string')).toBe(true); // nenhum undefined
        expect(cols.map((c) => c.name)).toEqual(['KPI', 'Coluna 2', 'Coluna 3', 'Janeiro', 'Fevereiro']);

        // E o parseGenericTable completo não deve lançar sobre dados com header esparso.
        const data = [sparseHeader, ['Total de Leads', null, null, 100, 120]];
        expect(() => parseGenericTable(data, 'Metas')).not.toThrow();
        const table = parseGenericTable(data, 'Metas');
        expect(table.rows[0]).toMatchObject({ KPI: 'Total de Leads', Janeiro: 100, Fevereiro: 120 });
    });

    it('ignora linhas totalmente vazias e conta totalRows', () => {
        const data = [
            ['A', 'B'],
            ['1', '2'],
            ['', ''],
            ['3', '4'],
        ];
        const table = parseGenericTable(data);
        expect(table.rows).toHaveLength(2);
        expect(table.totalRows).toBe(2);
        expect(table.truncated).toBe(false);
    });

    it('trunca planilhas acima do limite e sinaliza truncated', () => {
        const header = [['X']];
        const body = Array.from({ length: MAX_ROWS + 10 }, (_, i) => [i + 1]);
        const table = parseGenericTable([...header, ...body]);
        expect(table.rows).toHaveLength(MAX_ROWS);
        expect(table.totalRows).toBe(MAX_ROWS + 10);
        expect(table.truncated).toBe(true);
    });

    it('retorna tabela vazia quando nao ha cabecalho reconhecivel', () => {
        const table = parseGenericTable([[]]);
        expect(table.columns).toEqual([]);
        expect(table.rows).toEqual([]);
    });
});

describe('parseNumeric — formatos BR e EN', () => {
    it.each([
        ['R$ 1.234,56', 1234.56],
        ['1,234.56', 1234.56],
        ['1.000', 1000],
        ['42', 42],
        ['-3,5', -3.5],
    ])('parseia %s -> %d', (input, expected) => {
        expect(parseNumeric(input)).toBeCloseTo(expected, 2);
    });

    it('retorna null para texto nao numerico', () => {
        expect(parseNumeric('abc')).toBeNull();
        expect(parseNumeric('')).toBeNull();
    });
});

describe('metadataDiscovery — inferencia de tipo deterministica', () => {
    it('infere number, currency, date, boolean, category e text', () => {
        const data = [
            ['Qtd', 'Preco', 'Data', 'Ativo', 'Status', 'Descricao'],
            [10, 'R$ 100,00', '15/01/2025', 'sim', 'novo', 'Texto livre alfa beta'],
            [20, 'R$ 250,00', '2025-02-20', 'nao', 'usado', 'Outra descricao distinta'],
            [30, 'R$ 99,90', '03/03/2025', 'sim', 'novo', 'Mais um texto unico longo'],
        ];
        const table = parseGenericTable(data);
        const meta = discoverMetadata(table);
        const typeByLabel = Object.fromEntries(meta.map((m) => [m.label, m.type]));

        expect(typeByLabel.Qtd).toBe('number');
        expect(typeByLabel.Preco).toBe('currency');
        expect(typeByLabel.Data).toBe('date');
        expect(typeByLabel.Ativo).toBe('boolean');
        expect(typeByLabel.Status).toBe('category');
        expect(typeByLabel.Descricao).toBe('text');
    });

    it('calcula estatisticas numericas para colunas de valor', () => {
        const data = [['Valor'], ['R$ 100,00'], ['R$ 300,00']];
        const meta = discoverMetadata(parseGenericTable(data));
        expect(meta[0].numeric).toMatchObject({ min: 100, max: 300, sum: 400, avg: 200 });
    });

    it('conta vazios corretamente', () => {
        const data = [['Nome', 'Obs'], ['Ana', ''], ['Bruno', 'x'], ['Carla', '']];
        const meta = discoverMetadata(parseGenericTable(data));
        const obs = meta.find((m) => m.label === 'Obs')!;
        expect(obs.emptyCount).toBe(2);
        expect(obs.filledCount).toBe(1);
    });
});

describe('analytics — providers', () => {
    it('noop nao gera insights', async () => {
        const table = parseGenericTable([['A'], [1]]);
        const meta = discoverMetadata(table);
        expect(await noopAnalyticsProvider.analyze(table, meta)).toEqual([]);
    });

    it('heuristico resume colunas numericas sem IA/rede', async () => {
        const table = parseGenericTable([['Vendas'], ['R$ 100,00'], ['R$ 200,00']]);
        const meta = discoverMetadata(table);
        const insights = await heuristicAnalyticsProvider.analyze(table, meta);

        expect(insights.length).toBeGreaterThan(0);
        expect(insights[0].source).toBe('heuristic');
        expect(insights[0].detail).toContain('Soma');
    });

    it('heuristico aponta colunas muito vazias', async () => {
        const table = parseGenericTable([['Nome', 'Obs'], ['Ana', ''], ['Bruno', ''], ['Carla', 'x']]);
        const meta = discoverMetadata(table);
        const insights = await heuristicAnalyticsProvider.analyze(table, meta);
        expect(insights.some((i) => i.title.includes('pouco preenchida'))).toBe(true);
    });
});

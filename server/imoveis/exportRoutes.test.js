import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import ExcelJS from 'exceljs';
import {
  registerImoveisExportRoutes,
  linhaExportacao,
  gerarPlanilhaImoveis,
  CABECALHO_EXPORTACAO,
  EXPORTAR_PATH,
  exportarJsonParser,
  MAX_LINHAS,
} from './exportRoutes.js';

const OWNER = { id: 'owner-1', email: 'octo.inteligenciaimobiliaria@gmail.com' };
const USER = { id: 'u1', email: 'user@t.com' };

/**
 * Fake que HONRA os `.eq()` de tenant_memberships: o isolamento por tenant do
 * gate depende do filtro tenant_id+user_id, e um fake que o ignorasse daria
 * verde justamente no caso "admin de outro tenant".
 */
function fakeSupabase({ user = USER, memberships = [] } = {}) {
  return {
    auth: { getUser: vi.fn(async () => (user ? { data: { user }, error: null } : { data: null, error: { message: 'jwt' } })) },
    from: () => {
      const filtros = [];
      const chain = {
        select: () => chain,
        eq: (col, val) => { filtros.push([col, val]); return chain; },
        maybeSingle: async () => ({
          data: memberships.find((m) => filtros.every(([c, v]) => m[c] === v)) || null,
          error: null,
        }),
      };
      return chain;
    },
  };
}

const membro = (role, tenant_id = 't1') => [{ user_id: USER.id, tenant_id, role }];

// Igual aos entrypoints: parser da rota ANTES do express.json global (100 KB).
async function servir(supabase) {
  const app = express();
  app.use(EXPORTAR_PATH, exportarJsonParser);
  app.use(express.json());
  registerImoveisExportRoutes(app, supabase);
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const url = `http://127.0.0.1:${server.address().port}${EXPORTAR_PATH}`;
  const call = (body, headers = {}) => fetch(url, {
    method: 'POST',
    headers: { authorization: 'Bearer t', 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { call, close: () => new Promise((r) => server.close(r)) };
}

async function lerPlanilha(arrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(arrayBuffer));
  return wb.worksheets[0];
}

const valoresDaLinha = (sheet, n) => sheet.getRow(n).values.slice(1); // values[0] é sempre vazio

const imovel = (over = {}) => ({
  referencia: 'AP0001', titulo: 'Apto', tipo: 'Apartamento', finalidade: 'venda',
  cidade: 'Santos', bairro: 'Gonzaga', estado: 'SP', endereco: 'Rua A', numero: '10', cep: '11000-000',
  nome_condominio: 'Edifício Sol', valor_venda: 500000, valor_locacao: 0, valor_condominio: 800, valor_iptu: 120,
  area_util: 70, area_total: 90, quartos: 2, suites: 1, banheiro: 2, garagem: 1, corretor_nome: 'Ana',
  destaque: false, super_destaque: false, status_aprovacao: 'aprovado', updated_at: '2026-09-10T15:00:00Z',
  ...over,
});

afterEach(() => vi.restoreAllMocks());

describe('POST /api/v1/imoveis/exportar — gate', () => {
  it('401 sem token', async () => {
    const s = await servir(fakeSupabase({ memberships: membro('admin') }));
    const r = await s.call({ tenantId: 't1', imoveis: [] }, { authorization: '' });
    expect(r.status).toBe(401);
    await s.close();
  });

  it('401 com token inválido', async () => {
    const s = await servir(fakeSupabase({ user: null }));
    const r = await s.call({ tenantId: 't1', imoveis: [] });
    expect(r.status).toBe(401);
    await s.close();
  });

  it('403 para corretor do próprio tenant', async () => {
    const s = await servir(fakeSupabase({ memberships: membro('corretor') }));
    const r = await s.call({ tenantId: 't1', imoveis: [imovel()] });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ error: 'forbidden' });
    await s.close();
  });

  it('403 para admin de OUTRO tenant', async () => {
    const s = await servir(fakeSupabase({ memberships: membro('admin', 't2') }));
    const r = await s.call({ tenantId: 't1', imoveis: [imovel()] });
    expect(r.status).toBe(403);
    await s.close();
  });

  it.each(['admin', 'team_leader'])('%s do tenant exporta', async (role) => {
    const s = await servir(fakeSupabase({ memberships: membro(role) }));
    const r = await s.call({ tenantId: 't1', imoveis: [imovel()] });
    expect(r.status).toBe(200);
    await s.close();
  });

  it('owner da plataforma exporta qualquer tenant sem membership', async () => {
    const s = await servir(fakeSupabase({ user: OWNER }));
    const r = await s.call({ tenantId: 't9', imoveis: [imovel()] });
    expect(r.status).toBe(200);
    await s.close();
  });
});

describe('POST /api/v1/imoveis/exportar — payload', () => {
  it('400 tenant_required (owner sem tenantId)', async () => {
    const s = await servir(fakeSupabase({ user: OWNER }));
    const r = await s.call({ imoveis: [] });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'tenant_required' });
    await s.close();
  });

  it.each([
    ['imoveis ausente', { tenantId: 't1' }],
    ['imoveis não é array', { tenantId: 't1', imoveis: { a: 1 } }],
    ['item nulo', { tenantId: 't1', imoveis: [imovel(), null] }],
    ['item string', { tenantId: 't1', imoveis: ['AP1'] }],
    ['item array', { tenantId: 't1', imoveis: [[1, 2]] }],
  ])('400 invalid_payload: %s', async (_nome, body) => {
    const s = await servir(fakeSupabase({ memberships: membro('admin') }));
    const r = await s.call(body);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'invalid_payload' });
    await s.close();
  });

  it('400 invalid_payload para JSON malformado', async () => {
    const s = await servir(fakeSupabase({ memberships: membro('admin') }));
    const r = await s.call('{"tenantId":');
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'invalid_payload' });
    await s.close();
  });

  it('413 too_many_rows acima do limite de linhas', async () => {
    const s = await servir(fakeSupabase({ memberships: membro('admin') }));
    const r = await s.call({ tenantId: 't1', imoveis: Array.from({ length: MAX_LINHAS + 1 }, () => ({})) });
    expect(r.status).toBe(413);
    expect(await r.json()).toEqual({ error: 'too_many_rows' });
    await s.close();
  });

  it('corpo acima de 100 KB passa (o parser da rota vem antes do global)', async () => {
    const s = await servir(fakeSupabase({ memberships: membro('admin') }));
    const imoveis = Array.from({ length: 600 }, (_, n) => imovel({ referencia: `AP${n}`, titulo: 'x'.repeat(300) }));
    const r = await s.call({ tenantId: 't1', imoveis });
    expect(r.status).toBe(200);
    await s.close();
  });
});

describe('POST /api/v1/imoveis/exportar — planilha', () => {
  it('200 devolve o xlsx com cabeçalho e uma linha por imóvel, na ordem enviada', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const s = await servir(fakeSupabase({ memberships: membro('admin') }));
    const imoveis = [imovel({ referencia: 'AP1', titulo: 'Segredo do título' }), imovel({ referencia: 'CA2' }), imovel({ referencia: 'TE3' })];
    const r = await s.call({ tenantId: 't1', imoveis });

    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(r.headers.get('content-disposition')).toMatch(/^attachment; filename="imoveis-\d{4}-\d{2}-\d{2}\.xlsx"$/);

    const sheet = await lerPlanilha(await r.arrayBuffer());
    expect(valoresDaLinha(sheet, 1)).toEqual(CABECALHO_EXPORTACAO);
    expect(sheet.getRow(1).font).toMatchObject({ bold: true });
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(sheet.rowCount).toBe(1 + imoveis.length);
    expect([2, 3, 4].map((n) => sheet.getRow(n).getCell(1).value)).toEqual(['AP1', 'CA2', 'TE3']);

    // Auditoria: tenant, usuário e contagem — nunca conteúdo das linhas.
    const linhaLog = log.mock.calls.find(([tag]) => tag === '[imoveis/exportar]');
    expect(linhaLog).toBeTruthy();
    expect(JSON.parse(linhaLog[1])).toEqual({ tenantId: 't1', userId: 'u1', linhas: 3 });
    expect(JSON.stringify(log.mock.calls)).not.toContain('Segredo do título');
    await s.close();
  });
});

describe('linhaExportacao', () => {
  const coluna = (nome) => CABECALHO_EXPORTACAO.indexOf(nome);
  const celula = (over, nome) => linhaExportacao(imovel(over))[coluna(nome)];

  it('uma célula por coluna, na ordem do cabeçalho; chave fora da whitelist é ignorada', () => {
    const linha = linhaExportacao(imovel({ proprietario_nome: 'João', proprietario_telefone: '11999', descricao: 'longa' }));
    expect(linha).toHaveLength(CABECALHO_EXPORTACAO.length);
    expect(JSON.stringify(linha)).not.toMatch(/João|11999|longa/);
    expect(linha.slice(0, 10)).toEqual(['AP0001', 'Apto', 'Apartamento', 'Venda', 'Santos', 'Gonzaga', 'SP', 'Rua A, 10', '11000-000', 'Edifício Sol']);
    expect(linha.slice(10, 21)).toEqual([500000, 0, 800, 120, 70, 90, 2, 1, 2, 1, 'Ana']);
  });

  it.each([
    ['venda', 'Venda'], ['locacao', 'Locação'], ['venda_locacao', 'Venda e Locação'], ['outra', null], [undefined, null],
  ])('finalidade %s → %s', (finalidade, rotulo) => {
    expect(celula({ finalidade }, 'Finalidade')).toBe(rotulo);
  });

  it.each([
    [false, false, 'Sem Destaque'],
    [undefined, undefined, 'Sem Destaque'],
    [true, false, 'Destaque'],
    [false, true, 'Super Destaque'],
    [true, true, 'Destaque + Super Destaque'],
    ['true', 'true', 'Sem Destaque'], // só boolean true liga o flag
  ])('destaque=%s super=%s → %s', (destaque, super_destaque, rotulo) => {
    expect(celula({ destaque, super_destaque }, 'Destaque')).toBe(rotulo);
  });

  it.each([
    ['aguardando', 'Aguardando aprovação'],
    ['aprovado', 'Aprovado'],
    ['nao_aprovado', 'Não aprovado'],
    [null, 'Integração (XML)'],
    [undefined, 'Integração (XML)'],
  ])('status %s → %s', (status_aprovacao, rotulo) => {
    expect(celula({ status_aprovacao }, 'Status')).toBe(rotulo);
  });

  it('coage tipos: número em string vira número; lixo vira vazio; objeto nunca passa', () => {
    const linha = linhaExportacao(imovel({
      valor_venda: '350000', valor_locacao: 'abc', quartos: NaN, suites: { formula: '1+1' },
      titulo: { formula: 'HYPERLINK("http://x")' }, cidade: ['Santos'], referencia: 123,
    }));
    expect(linha[coluna('Valor de venda (R$)')]).toBe(350000);
    expect(linha[coluna('Valor de locação (R$)')]).toBeNull();
    expect(linha[coluna('Quartos')]).toBeNull();
    expect(linha[coluna('Suítes')]).toBeNull();
    expect(linha[coluna('Título')]).toBeNull();
    expect(linha[coluna('Cidade')]).toBeNull();
    expect(linha[coluna('Código')]).toBe('123');
  });

  it('corta textos em 1000 caracteres', () => {
    expect(celula({ titulo: 'a'.repeat(5000) }, 'Título')).toHaveLength(1000);
  });

  it('endereço junta logradouro e número, sem vírgula sobrando', () => {
    expect(celula({ numero: undefined }, 'Endereço')).toBe('Rua A');
    expect(celula({ endereco: '', numero: '' }, 'Endereço')).toBeNull();
  });

  it('Atualizado em é o dia de São Paulo (01:30 UTC ainda é o dia anterior)', () => {
    expect(celula({ updated_at: '2026-09-14T01:30:00Z' }, 'Atualizado em')).toEqual(new Date('2026-09-13T00:00:00Z'));
    expect(celula({ updated_at: 'ontem' }, 'Atualizado em')).toBeNull();
    expect(celula({ updated_at: undefined }, 'Atualizado em')).toBeNull();
  });
});

describe('gerarPlanilhaImoveis', () => {
  it('texto que parece fórmula fica como texto; moeda e data com formato', async () => {
    const sheet = await lerPlanilha(await gerarPlanilhaImoveis([imovel({ titulo: '=HYPERLINK("http://evil","x")' })]));
    const titulo = sheet.getRow(2).getCell(CABECALHO_EXPORTACAO.indexOf('Título') + 1);
    expect(titulo.type).toBe(ExcelJS.ValueType.String);
    expect(titulo.formula).toBeUndefined();
    expect(sheet.getRow(2).getCell(CABECALHO_EXPORTACAO.indexOf('Valor de venda (R$)') + 1).numFmt).toBe('"R$" #,##0.00');
    expect(sheet.getRow(2).getCell(CABECALHO_EXPORTACAO.indexOf('Atualizado em') + 1).numFmt).toBe('dd/mm/yyyy');
    expect(sheet.autoFilter).toBeTruthy();
  });

  it('lista vazia gera só o cabeçalho', async () => {
    const sheet = await lerPlanilha(await gerarPlanilhaImoveis([]));
    expect(sheet.rowCount).toBe(1);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Imovel } from './kenloService';

const h = vi.hoisted(() => ({ downloadBlob: vi.fn() }));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'jwt-valido' } } }),
      refreshSession: async () => ({ error: new Error('sem refresh no teste') }),
    },
  },
}));
vi.mock('@/features/relatorios/export/generators/excelReportGenerator', () => ({
  downloadBlob: h.downloadBlob,
}));

import { exportarCatalogo, paraExportavel } from './catalogoExportService';

const imovel = {
  referencia: 'AP0001',
  titulo: 'Apto Centro',
  tipo: 'Apartamento',
  tipoSimplificado: 'apartamento',
  finalidade: 'venda',
  cidade: 'Sorocaba',
  bairro: 'Centro',
  estado: 'SP',
  endereco: 'Rua A',
  numero: '10',
  cep: '18000-000',
  nome_condominio: 'Ed. Sol',
  valor_venda: 500000,
  valor_locacao: 0,
  valor_condominio: 600,
  valor_iptu: 100,
  area_util: 70,
  area_total: 80,
  quartos: 2,
  suites: 1,
  banheiro: 2,
  garagem: 1,
  salas: 1,
  corretor_nome: 'Mariana',
  corretor_email: 'mariana@x.com',
  corretor_numero: '11999999999',
  corretor_foto: 'foto.jpg',
  captador_id: 'u1',
  destaque: true,
  super_destaque: false,
  status_aprovacao: 'aprovado',
  updated_at: '2026-09-01T00:00:00Z',
  descricao: 'Texto longo do anúncio',
  fotos: ['a.jpg'],
  videos: [],
  area_comum: [],
  area_privativa: [],
  latitude: -23.5,
  longitude: -47.4,
} as Imovel;

const resposta = (status: number, headers: Record<string, string> = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(headers),
  arrayBuffer: async () => new ArrayBuffer(4),
  json: async () => ({ error: 'x' }),
});

beforeEach(() => {
  vi.unstubAllGlobals();
  h.downloadBlob.mockReset();
});

describe('paraExportavel', () => {
  it('leva só os campos da whitelist — sem contato do corretor, fotos, descrição ou coordenadas', () => {
    const exportavel = paraExportavel(imovel);

    expect(Object.keys(exportavel).sort()).toEqual([
      'area_total', 'area_util', 'bairro', 'banheiro', 'cep', 'cidade', 'corretor_nome', 'destaque',
      'endereco', 'estado', 'finalidade', 'garagem', 'nome_condominio', 'numero', 'quartos', 'referencia',
      'status_aprovacao', 'suites', 'super_destaque', 'tipo', 'titulo', 'updated_at', 'valor_condominio',
      'valor_iptu', 'valor_locacao', 'valor_venda',
    ]);
    expect(exportavel).toMatchObject({ referencia: 'AP0001', destaque: true, status_aprovacao: 'aprovado' });
  });
});

describe('exportarCatalogo', () => {
  it('manda POST com Bearer e tenantId, e baixa com o nome dado pelo servidor', async () => {
    const f = vi.fn(async () =>
      resposta(200, { 'Content-Disposition': 'attachment; filename="imoveis-2026-09-14.xlsx"' }),
    );
    vi.stubGlobal('fetch', f);

    await exportarCatalogo('t1', [imovel]);

    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/imoveis/exportar');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-valido');
    const body = JSON.parse(init.body as string);
    expect(body.tenantId).toBe('t1');
    expect(body.imoveis).toEqual([paraExportavel(imovel)]);
    expect(h.downloadBlob).toHaveBeenCalledWith(expect.any(ArrayBuffer), 'imoveis-2026-09-14.xlsx');
  });

  it('sem Content-Disposition, cai no nome imoveis-AAAA-MM-DD.xlsx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resposta(200)));

    await exportarCatalogo('t1', [imovel]);

    expect(h.downloadBlob.mock.calls[0][1]).toMatch(/^imoveis-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it('403 vira erro amigável e não baixa nada', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resposta(403)));

    await expect(exportarCatalogo('t1', [imovel])).rejects.toThrow('Sem permissão para exportar');
    expect(h.downloadBlob).not.toHaveBeenCalled();
  });

  it('erro sem mensagem própria vira um genérico', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resposta(500)));

    await expect(exportarCatalogo('t1', [imovel])).rejects.toThrow('Não foi possível exportar os imóveis.');
  });
});

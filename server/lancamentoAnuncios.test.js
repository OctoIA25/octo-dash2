/**
 * De-para anúncio → código de lançamento (L0NN).
 *
 * A regra de negócio vive no banco (20260903_*), fora do alcance do vitest;
 * aqui travamos (a) a lógica pura do resolvedor e (b) os invariantes de código e
 * de migration por leitura de fonte — mesmo padrão de
 * proxy-production.zap-listing-id.test.js e leadClassificationTriggers.test.js.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  extrairOriginListingId,
  temCodigoExplicito,
  resolverCodigoLancamento,
  enriquecerComCodigoLancamento,
} from './lancamentoAnuncios.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(__dirname, rel), 'utf8');

// Payload real do Grupo OLX (lead de teste de 03/set/2026, contato trocado).
// originListingId 2894694297 é o L003 da planilha "relacao lancamentos".
const payloadReal = {
  ddd: '13',
  name: 'Lead Teste',
  email: 'lead@example.com',
  phone: '900000000',
  message: 'Olá, gostaria de ter mais informações para comprar: apartamento, R$ 750.000, '
    + 'Rua Aristides Mariotti, 142 - Recanto Quarto Centenário, Jundiaí - SP que encontrei no Zap.',
  extraData: { izi: '', leadType: 'CONTACT_FORM', leadCerto: false },
  leadOrigin: 'Grupo OLX',
  temperature: 'Alta',
  originLeadId: 'dab33c2c86d04893b3448fc2bfd72279',
  clientListingId: 'OFOUFJ',
  originListingId: '2894694297',
  transactionType: 'SELL',
};

/** Supabase de mentira: só o caminho from→select→eq→eq→maybeSingle que usamos. */
const fakeSupabase = (resultado) => {
  const filtros = {};
  const chain = {
    select: () => chain,
    eq: (col, val) => { filtros[col] = val; return chain; },
    maybeSingle: async () => resultado,
  };
  return { supabase: { from: (t) => { filtros.__tabela = t; return chain; } }, filtros };
};

describe('extrairOriginListingId', () => {
  it('acha o id no topo do payload real', () => {
    expect(extrairOriginListingId(payloadReal)).toBe('2894694297');
  });

  it('aceita snake_case e o aninhado em extraData', () => {
    expect(extrairOriginListingId({ origin_listing_id: '123' })).toBe('123');
    expect(extrairOriginListingId({ extraData: { originListingId: '456' } })).toBe('456');
  });

  it('normaliza número para string e ignora espaço', () => {
    expect(extrairOriginListingId({ originListingId: 2894694297 })).toBe('2894694297');
    expect(extrairOriginListingId({ originListingId: '  789  ' })).toBe('789');
  });

  it('sem id → null (nunca string vazia)', () => {
    expect(extrairOriginListingId({ clientListingId: 'OFOUFJ' })).toBeNull();
    expect(extrairOriginListingId({ originListingId: '' })).toBeNull();
    expect(extrairOriginListingId({})).toBeNull();
    expect(extrairOriginListingId()).toBeNull();
  });
});

describe('temCodigoExplicito', () => {
  it('reconhece as três formas de código explícito', () => {
    expect(temCodigoExplicito({ property_code: 'AP1139' })).toBe(true);
    expect(temCodigoExplicito({ interest_reference: 'AP1139' })).toBe(true);
    expect(temCodigoExplicito({ codigo_imovel: 'AP1139' })).toBe(true);
  });

  it('payload de portal não tem código explícito', () => {
    expect(temCodigoExplicito(payloadReal)).toBe(false);
  });
});

describe('resolverCodigoLancamento', () => {
  it('devolve o código do lançamento e consulta por (tenant, anúncio)', async () => {
    const { supabase, filtros } = fakeSupabase({ data: { codigo: 'L003' }, error: null });
    await expect(resolverCodigoLancamento(supabase, 'tenant-1', payloadReal)).resolves.toBe('L003');
    expect(filtros.__tabela).toBe('lancamento_anuncios');
    expect(filtros.tenant_id).toBe('tenant-1');
    expect(filtros.origin_listing_id).toBe('2894694297');
  });

  it('anúncio fora do de-para → null', async () => {
    const { supabase } = fakeSupabase({ data: null, error: null });
    await expect(resolverCodigoLancamento(supabase, 'tenant-1', payloadReal)).resolves.toBeNull();
  });

  it('erro de banco falha ABERTO — o lead não pode se perder por causa do lookup', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { supabase } = fakeSupabase({ data: null, error: { code: '42P01', message: 'relation does not exist' } });
    await expect(resolverCodigoLancamento(supabase, 'tenant-1', payloadReal)).resolves.toBeNull();
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });

  it('não consulta o banco sem tenant, sem anúncio, ou com código explícito', async () => {
    const naoDeviaChamar = { from: () => { throw new Error('não deveria consultar'); } };
    await expect(resolverCodigoLancamento(naoDeviaChamar, null, payloadReal)).resolves.toBeNull();
    await expect(resolverCodigoLancamento(naoDeviaChamar, 't', { clientListingId: 'X' })).resolves.toBeNull();
    await expect(resolverCodigoLancamento(naoDeviaChamar, 't', { ...payloadReal, property_code: 'AP1139' }))
      .resolves.toBeNull();
  });
});

describe('enriquecerComCodigoLancamento', () => {
  const normalizado = { name: 'Lead Teste', property_code: 'OFOUFJ', interest_reference: 'OFOUFJ', portal: 'ZAP Imóveis' };

  it('substitui o código do portal pelo do lançamento, preservando o resto', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { supabase } = fakeSupabase({ data: { codigo: 'L003' }, error: null });
    const out = await enriquecerComCodigoLancamento(supabase, 'tenant-1', payloadReal, normalizado);
    expect(out).toMatchObject({
      property_code: 'L003', interest_reference: 'L003', interest_type: 'property',
      name: 'Lead Teste', portal: 'ZAP Imóveis',
    });
    log.mockRestore();
  });

  it('sem casamento, devolve o lead intacto (mesma referência)', async () => {
    const { supabase } = fakeSupabase({ data: null, error: null });
    const out = await enriquecerComCodigoLancamento(supabase, 'tenant-1', payloadReal, normalizado);
    expect(out).toBe(normalizado);
  });
});

describe('invariantes nos dois entrypoints', () => {
  const fontes = {
    'proxy-production.js': read('./proxy-production.js'),
    'api-server.js': read('./api-server.js'),
  };

  for (const [arquivo, fonte] of Object.entries(fontes)) {
    it(`${arquivo}: o webhook do ZAP passa pelo de-para`, () => {
      expect(fonte).toContain("from './lancamentoAnuncios.js'");
      expect(fonte).toContain('enriquecerComCodigoLancamento(');
    });

    it(`${arquivo}: transactionType 'SELL' conta como venda`, () => {
      // 'sell'.includes('sale') é false — foi assim que todo lead de venda do
      // ZAP saiu com interest_is_sale=false.
      expect(fonte).toMatch(/includes\('sell'\)/);
    });
  }

  it('proxy-production.js: o webhook do Grupo OLX também passa pelo de-para', () => {
    const trecho = fontes['proxy-production.js'].slice(
      fontes['proxy-production.js'].indexOf("app.post('/api/v1/integrations/grupo-olx/webhook'"),
    ).slice(0, 900);
    expect(trecho).toContain('enriquecerComCodigoLancamento(');
  });
});

describe('migrations', () => {
  const tabela = read('../supabase/migrations/20260903_lancamento_anuncios.sql');
  const regra = read('../supabase/migrations/20260903_classificacao_lancamento_e_revive.sql');

  it('a tabela é chaveada por (tenant, anúncio) e tem RLS ligada', () => {
    expect(tabela).toContain('PRIMARY KEY (tenant_id, origin_listing_id)');
    expect(tabela).toContain('ENABLE ROW LEVEL SECURITY');
  });

  it('o seed traz os 31 anúncios da planilha, sem repetir código nem anúncio', () => {
    const linhas = [...tabela.matchAll(/'(\d{6,})', '(L\d{3})'\)/g)].map((m) => [m[1], m[2]]);
    expect(linhas).toHaveLength(31);
    expect(new Set(linhas.map(([id]) => id)).size).toBe(31);
    expect(new Set(linhas.map(([, cod]) => cod)).size).toBe(31);
    expect(linhas[2]).toEqual(['2894694297', 'L003']); // o do lead de teste
  });

  it('a regra IMMUTABLE não passa a ler tabela — quem lê é o trigger', () => {
    expect(regra).toContain('CREATE OR REPLACE FUNCTION public.eh_codigo_lancamento');
    expect(regra).toMatch(/eh_codigo_lancamento[\s\S]*?LANGUAGE sql STABLE SECURITY DEFINER/);
    // As funções IMMUTABLE da 20260815 não são redefinidas aqui: são elas que os
    // asserts daquela migration provam sem depender de nenhuma tabela.
    expect(regra).not.toContain('CREATE OR REPLACE FUNCTION public.classificar_lead_estagio');
    expect(regra).not.toMatch(/CREATE OR REPLACE FUNCTION public\.classificar_lead\(/);
  });

  it('o trigger de revive usa o mesmo sinal (e freio) da 20260805', () => {
    expect(regra).toMatch(
      /CREATE TRIGGER tr_leads_reclassificar_revive\s+BEFORE UPDATE ON public\.leads\s+FOR EACH ROW\s+WHEN \(NEW\.created_at IS DISTINCT FROM OLD\.created_at/,
    );
    expect(regra).toMatch(/NEW\.created_at >= now\(\) - interval '5 minutes'/);
  });

  it('o nome do trigger de revive ordena DEPOIS do guard de origem', () => {
    // Triggers de mesmo timing disparam em ordem alfabética. Se este vier antes,
    // o guard vê a classificação mudar e carimba 'dashboard'.
    expect('tr_leads_reclassificar_revive' > 'tr_leads_classification_guard').toBe(true);
  });
});

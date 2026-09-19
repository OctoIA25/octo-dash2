import { test, expect, type Page, type Browser } from '@playwright/test';

/**
 * E2E do Mapa de Imóveis (P0.1) — "o Mapa mostra os imóveis que têm endereço".
 *
 * O plano atribui o zero do Mapa a erro de permissão na tabela de imóveis.
 * A medição de 18/09/2026 mostrou outra coisa: o Mapa lia SÓ o catálogo XML,
 * e a Lotus Brokers tem `tenant_xml_config.xml_url` vazio e `backup_data`
 * nulo — a lista chegava vazia e a tela dizia "0 de 0 imóveis no mapa". Os 27
 * imóveis dela (todos com bairro e cidade) estão em `imoveis_locais`, tabela
 * que esta tela não consultava. Não havia 403 nenhum no caminho.
 *
 * A fixture reproduz esse estado: XML desligado + imóveis só em imoveis_locais,
 * com as coordenadas já resolvidas para o teste não depender do Nominatim.
 *
 * PRÉ-CONDIÇÕES: Supabase LOCAL com `e2e/fixtures/mapa-imoveis.seed.sql`
 * aplicada, app servido por `npx vite`, E2E_EMAIL / E2E_PASSWORD.
 */

test.describe.configure({ mode: 'serial' });

let page: Page;

const rodape = () => page.getByText(/\d+ de \d+ imóve/i).first();

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder(/seu@email\.com/i).fill(process.env.E2E_EMAIL!);
  await page.getByPlaceholder('••••••••').first().fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page.getByText(/Boa (tarde|noite|dia)/i).first()).toBeVisible({ timeout: 30_000 });
  await page.goto('/imoveis?tab=mapa-imoveis', { waitUntil: 'domcontentloaded' });
  await expect(rodape()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(6_000);
});

test.afterAll(async () => { await page?.close(); });

test('o Mapa desenha os imóveis do cadastro, mesmo sem catálogo XML', async () => {
  // A fixture deixa a integração XML desligada de propósito, como na Lotus.
  // Antes da correção esta linha dizia "0 de 0".
  await expect(rodape()).toHaveText(/4 de 4 imóve/i);
});

test('cada imóvel vira um pino — e o rascunho fica de fora', async () => {
  // A fixture tem CINCO coordenadas resolvidas em imoveis_geolocalizacao: as
  // quatro aprovadas e a do rascunho MAP005. Exigir exatamente 4 pinos é o que
  // prova o filtro de catálogo: se o rascunho entrasse, viriam 5.
  //
  // (Antes este caso procurava o TÍTULO do rascunho na tela. Não servia: o
  // título só aparece dentro do popup do pino, que o teste nunca abre — ele
  // passaria com o defeito presente.)
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(4);
});

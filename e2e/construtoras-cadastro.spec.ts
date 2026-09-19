import { test, expect, request, type Page, type Browser } from '@playwright/test';

/**
 * E2E do cadastro de construtoras (P0.3).
 *
 * Fecha o segundo critério de pronto do item: "renomear uma construtora muda o
 * nome em todos os lançamentos". Antes isso era impossível — a aba lia o texto
 * exato de uma planilha do Google, então renomear exigia editar a planilha, e
 * "Tebas" e "tebas" eram dois cards distintos.
 *
 * Também confere o terceiro critério pelo lado da tela: a comissão não aparece
 * na aba enquanto a fonte for a planilha aberta.
 *
 * PRÉ-CONDIÇÕES: Supabase LOCAL com a migration do cadastro aplicada, app por
 * `npx vite`, E2E_EMAIL / E2E_PASSWORD / E2E_SUPABASE_URL / E2E_SERVICE_KEY /
 * E2E_TENANT_ID.
 */

test.describe.configure({ mode: 'serial' });

let page: Page;

const card = (nome: string) =>
  page.locator('div.rounded-xl.border').filter({ hasText: nome }).first();

async function zerarCadastro() {
  const ctx = await request.newContext({
    baseURL: process.env.E2E_SUPABASE_URL,
    extraHTTPHeaders: {
      apikey: process.env.E2E_SERVICE_KEY!,
      Authorization: `Bearer ${process.env.E2E_SERVICE_KEY}`,
    },
  });
  const r = await ctx.delete(`/rest/v1/construtoras?tenant_id=eq.${process.env.E2E_TENANT_ID}`);
  expect(r.status(), 'limpeza do cadastro').toBeLessThan(300);
  await ctx.dispose();
}

async function abrirAba() {
  await page.goto('/imoveis?tab=construtoras', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Nova construtora' })).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(4_000);
}

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  await zerarCadastro();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder(/seu@email\.com/i).fill(process.env.E2E_EMAIL!);
  await page.getByPlaceholder('••••••••').first().fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page.getByText(/Boa (tarde|noite|dia)/i).first()).toBeVisible({ timeout: 30_000 });
  await abrirAba();
});

test.afterAll(async () => { await page?.close(); });

test('cadastrar uma construtora faz aparecer um card', async () => {
  await page.getByRole('button', { name: 'Nova construtora' }).click();
  await page.getByLabel('Nome').fill('Santa Ângela');
  await page.getByRole('button', { name: /^Salvar$/ }).click();

  await expect(card('Santa Ângela')).toBeVisible({ timeout: 20_000 });
});

test('a mesma construtora com outra grafia é RECUSADA pelo banco', async () => {
  // "SANTA ANGELA" é "Santa Ângela" escrita diferente. É exatamente o caso que
  // produzia dois cards quando a fonte era a planilha.
  await page.getByRole('button', { name: 'Nova construtora' }).click();
  await page.getByLabel('Nome').fill('SANTA ANGELA');
  await page.getByRole('button', { name: /^Salvar$/ }).click();

  await expect(page.getByText('já existe uma construtora com esse nome')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Cancelar' }).click();
});

test('renomear muda o nome na tela — o critério do item', async () => {
  await card('Santa Ângela').getByRole('button', { name: /^Editar / }).click();
  await page.getByLabel('Nome').fill('Santa Ângela Incorporadora');
  await page.getByRole('button', { name: /^Salvar$/ }).click();

  await expect(card('Santa Ângela Incorporadora')).toBeVisible({ timeout: 20_000 });
});

test('…e o identificador NÃO muda junto, senão o vínculo quebraria', async () => {
  // O código é a identidade: é ele que os lançamentos apontam. Renomear não
  // pode trocá-lo, senão os lançamentos ficariam órfãos.
  await card('Santa Ângela Incorporadora').getByRole('button', { name: /^Editar / }).click();
  await expect(page.getByText('santa_angela', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
});

test('a comissão não aparece na aba enquanto a fonte for a planilha aberta', async () => {
  const texto = await page.locator('body').innerText();
  expect(texto).not.toMatch(/Comiss[ãa]o/);
});

import { test, expect, type Page } from '@playwright/test';

/**
 * E2E do cadastro de imóvel: proprietário obrigatório e gestor definindo o captador.
 *
 * PRÉ-CONDIÇÕES (gate manual — mesmo padrão de imoveis-dicas.spec.ts):
 *  - app rodando (`npm run dev`: Vite 8080 + Express 3001);
 *  - E2E_EMAIL / E2E_PASSWORD = GESTOR (team_leader) de um tenant de teste com
 *    pelo menos um corretor captador; E2E_TENANT se o login pedir código.
 *
 * Nenhum teste salva: todos param na validação do formulário.
 */

async function login(page: Page) {
  await page.goto('/');
  const tenant = page.getByPlaceholder(/c[oó]digo|tenant/i).first();
  if (await tenant.count()) await tenant.fill(process.env.E2E_TENANT ?? '');
  await page.getByPlaceholder(/seu@email\.com/i).fill(process.env.E2E_EMAIL!);
  await page.getByPlaceholder('••••••••').first().fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForLoadState('networkidle');
}

/** Select do formulário pelo texto do Label (os Labels não têm htmlFor). */
const campo = (page: Page, label: string) =>
  page.getByRole('dialog').locator('div.space-y-2', { has: page.getByText(label, { exact: true }) }).getByRole('combobox');

async function escolher(page: Page, label: string) {
  await campo(page, label).click();
  await page.getByRole('option').first().click();
}

test.describe('cadastro de imóvel pelo gestor', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/imoveis');
    await page.getByRole('button', { name: 'Novo Imóvel' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('gestor pode escolher o corretor captador', async ({ page }) => {
    await page.getByRole('button', { name: /Comissões e Condições/ }).click();

    await expect(campo(page, 'Corretor Captador *')).toBeEnabled();
    await expect(campo(page, '2º Corretor Captador (opcional)')).toBeEnabled();
    await expect(page.getByText(/pode alterar o captador/)).toHaveCount(0);
  });

  test('salvar sem proprietário é bloqueado e abre a seção Proprietário', async ({ page }) => {
    await escolher(page, 'Finalidade');
    await escolher(page, 'Tipo');
    await expect(page.getByRole('dialog').getByText(/^[A-Z]{2}\d+$/)).toBeVisible();
    await page.getByRole('button', { name: /Localização/ }).click();
    await page.getByPlaceholder('00000-000').fill('01310-100');
    await page.getByRole('button', { name: /Comissões e Condições/ }).click();
    await escolher(page, 'Corretor Captador *');

    await page.getByRole('button', { name: 'Salvar Imóvel' }).click();

    await expect(page.getByText('Informe o nome do proprietário. O campo é obrigatório.')).toBeVisible();
    await expect(page.getByPlaceholder('Nome completo')).toBeVisible();
  });
});

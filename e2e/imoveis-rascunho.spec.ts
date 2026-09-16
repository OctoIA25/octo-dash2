import { test, expect, type Page } from '@playwright/test';

/**
 * E2E do rascunho de imóvel: salvar pelo formulário, achar na aba Rascunhos,
 * reabrir e excluir.
 *
 * Guarda a regressão de 16/09/2026: o front antigo lia a lista com select('*'),
 * a migration que protege proprietario_* entrou antes do deploy e a aba passou
 * a falhar com "permission denied for table imoveis_locais".
 *
 * PRÉ-CONDIÇÕES (gate manual — mesmo padrão de imoveis-dicas.spec.ts):
 *  - app rodando (`npm run dev`: Vite 8080 + Express 3001);
 *  - E2E_EMAIL / E2E_PASSWORD = usuário com acesso a Imóveis num tenant de TESTE
 *    (o teste grava e exclui um rascunho de verdade); E2E_TENANT se o login pedir código.
 *
 * Se falhar no meio, pode sobrar um rascunho "Sem título" na aba Rascunhos do tenant.
 */

async function login(page: Page) {
  await page.goto('/');
  const tenant = page.getByPlaceholder(/c[oó]digo|tenant/i).first();
  if (await tenant.count()) await tenant.fill(process.env.E2E_TENANT ?? '');
  await page.getByPlaceholder(/seu@email\.com/i).fill(process.env.E2E_EMAIL!);
  await page.getByPlaceholder('••••••••').first().fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: /entrar/i }).click();
  // Sem networkidle: o app faz polling e a rede nunca fica ociosa.
  await expect(page.getByPlaceholder(/seu@email\.com/i)).toHaveCount(0, { timeout: 30_000 });
  // O CriarImovelForm ainda usa o useAuth legado: recarregar a página antes deste
  // cache existir deixa o formulário sem tenantId e o código do imóvel não é gerado.
  await page.waitForFunction(() => localStorage.getItem('auth-state-cache') !== null, null, { timeout: 30_000 });
}

async function abrirAbaRascunhos(page: Page) {
  await page.goto('/imoveis?tab=rascunhos');
  await expect(page.getByRole('heading', { name: 'Rascunhos' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Carregando rascunhos...')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText(/Não foi possível carregar a lista/)).toHaveCount(0);
}

/** Select do formulário pelo texto do Label (os Labels não têm htmlFor). */
const campo = (page: Page, label: string) =>
  page.getByRole('dialog').locator(`div.space-y-2:has(> label:text-is("${label}"))`).getByRole('combobox');

test('rascunho de imóvel: salva, aparece na aba, reabre e exclui', async ({ page }) => {
  await login(page);
  await abrirAbaRascunhos(page);

  await page.getByRole('button', { name: 'Novo Imóvel' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Tipo só habilita depois da finalidade; o código sai do tipo.
  for (const label of ['Finalidade', 'Tipo']) {
    await campo(page, label).click();
    await page.getByRole('option').first().click();
  }
  const codigoEl = dialog.getByText(/^[A-Z]{2}\d+$/).first();
  await expect(codigoEl).toBeVisible({ timeout: 15_000 }); // gerado após consulta ao banco
  const codigo = (await codigoEl.textContent())!.trim();

  await dialog.getByRole('button', { name: 'Salvar rascunho' }).click();
  await expect(page.getByText(`Rascunho ${codigo} salvo`)).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await abrirAbaRascunhos(page);
  await page.getByRole('button', { name: `Continuar cadastro do rascunho ${codigo}` }).click();
  await expect(dialog.getByText('Rascunho de imóvel')).toBeVisible();
  await expect(dialog.getByText(/Último salvamento/)).toBeVisible();
  await expect(dialog.getByText(codigo, { exact: true }).first()).toBeVisible();

  await dialog.getByRole('button', { name: 'Excluir rascunho' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir rascunho' }).click();
  await expect(page.getByText(`Rascunho ${codigo} excluído`)).toBeVisible({ timeout: 20_000 });

  await abrirAbaRascunhos(page);
  await expect(page.getByRole('button', { name: `Continuar cadastro do rascunho ${codigo}` })).toHaveCount(0);
});

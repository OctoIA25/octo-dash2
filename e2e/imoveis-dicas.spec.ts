import { test, expect, type Page } from '@playwright/test';

/**
 * E2E das dicas de cadastro do imóvel (derivadas do completômetro).
 *
 * PRÉ-CONDIÇÕES (gate manual — mesmo padrão de kpis.spec.ts):
 *  - app rodando (`npm run dev`: Vite 8080 + Express 3001);
 *  - usuário de teste com acesso ao módulo Imóveis no tenant de teste;
 *  - variáveis: E2E_TENANT (código do tenant), E2E_EMAIL, E2E_PASSWORD.
 *
 * O teste valida COMPORTAMENTO (a dica aparece, muda e some), não a
 * implementação: nenhum seletor depende da estrutura interna dos componentes.
 */

const dicas = (page: Page) => page.getByRole('region', { name: /como melhorar|quase lá|cadastro completo/i });

async function login(page: Page) {
  await page.goto('/');
  const tenant = page.getByPlaceholder(/c[oó]digo|tenant/i).first();
  if (await tenant.count()) await tenant.fill(process.env.E2E_TENANT ?? '');
  await page.getByPlaceholder(/seu@email\.com/i).fill(process.env.E2E_EMAIL!);
  await page.getByPlaceholder('••••••••').first().fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForLoadState('networkidle');
}

async function abrirNovoImovel(page: Page) {
  await page.goto('/imoveis');
  await page.getByRole('button', { name: 'Novo Imóvel' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test.describe('dicas do cadastro de imóvel', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await abrirNovoImovel(page);
  });

  test('mostra completômetro e dicas acionáveis ao abrir o cadastro', async ({ page }) => {
    await expect(page.getByRole('progressbar', { name: /completude do im[oó]vel/i })).toBeVisible();
    await expect(dicas(page).getByRole('heading', { name: 'Como melhorar seu imóvel' })).toBeVisible();

    // Poucas recomendações, não uma lista enorme.
    await expect(dicas(page).getByRole('listitem')).toHaveCount(3);
    await expect(dicas(page).getByText('Selecione a finalidade do imóvel')).toBeVisible();
  });

  test('"Adicionar agora" abre a seção do formulário correspondente', async ({ page }) => {
    const dicaDePreco = dicas(page).getByRole('listitem').filter({ hasText: 'valor de venda' });
    await dicaDePreco.getByRole('button', { name: 'Adicionar agora' }).click();

    await expect(page.getByLabel(/valor de venda/i).first()).toBeVisible();
  });

  test('a dica desaparece quando o campo é preenchido', async ({ page }) => {
    await expect(dicas(page).getByText('Selecione a finalidade do imóvel')).toBeVisible();

    await page.getByRole('button', { name: /adicionar agora/i }).first().click();
    await page.getByRole('combobox').first().click();
    await page.getByRole('option').first().click();

    await expect(dicas(page).getByText('Selecione a finalidade do imóvel')).toHaveCount(0);
  });

  test('a dica de imagens acompanha quantas fotos ainda faltam', async ({ page }) => {
    await dicas(page).getByRole('button', { name: /ver todas as dicas/i }).click();

    await expect(dicas(page).getByText(/Adicione mais 1 foto/)).toBeVisible();
    // Vídeo e tour existem, mas como recomendação — nunca como erro.
    await expect(dicas(page).getByText('Adicione um vídeo do imóvel')).toBeVisible();
    await expect(dicas(page).getByText('Recomendado').first()).toBeVisible();
  });
});

import { test, expect, type Page } from '@playwright/test';

/**
 * E2E dos KPIs configuráveis.
 *
 * PRÉ-CONDIÇÕES (gate manual — ver plano):
 *  - app rodando (`npm run dev`: Vite 8080 + Express 3001);
 *  - migration `20260620_create_dashboard_kpis` aplicada no Supabase;
 *  - usuário de teste com role de GESTÃO (admin/team_leader) no tenant de teste;
 *  - variáveis: E2E_TENANT (código do tenant), E2E_EMAIL, E2E_PASSWORD.
 *
 * NOTA: os seletores de login dependem do `MinimalLoginScreen` real, que pede
 * CÓDIGO DO TENANT + e-mail + senha. Ajustar ao DOM na 1ª execução (browser_snapshot).
 */

/** Escopo da LINHA (Row) de um KPI, para alcançar seus botões de ação. */
function rowOf(page: Page, kpiName: string) {
  // O Row é o container `div.group` (rounded-xl) do KpiList. `hasText` filtra
  // pela linha que contém o nome — robusto a re-render e à estrutura interna.
  return page.locator('div.group', { hasText: kpiName });
}

async function loginAsManager(page: Page) {
  await page.goto('/');
  // Código do tenant: o campo pode não ter placeholder fixo — tentar por rótulo/posição.
  // (Se o login de teste for via OWNER, o tenantCode é dispensável; ajustar conforme o usuário.)
  const tenant = page.getByPlaceholder(/c[oó]digo|tenant/i).first();
  if (await tenant.count()) await tenant.fill(process.env.E2E_TENANT ?? '');
  await page.getByPlaceholder(/seu@email\.com/i).fill(process.env.E2E_EMAIL!);
  await page.getByPlaceholder('••••••••').first().fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForLoadState('networkidle');
}

async function openKpiAdmin(page: Page) {
  await page.goto('/leads?tab=kpis');
  await page.getByRole('button', { name: /gerenciar kpis/i }).click();
  await expect(page.getByRole('heading', { name: /gest[aã]o de kpis/i })).toBeVisible();
}

test.describe('KPIs configuráveis', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsManager(page);
  });

  test('cria, edita e exclui um KPI', async ({ page }) => {
    await openKpiAdmin(page);

    await page.getByRole('button', { name: /novo kpi/i }).click();
    await page.getByLabel(/nome/i).fill('KPI E2E');
    await page.getByRole('button', { name: /salvar/i }).click();
    await expect(page.getByText('KPI E2E')).toBeVisible();

    // editar
    await rowOf(page, 'KPI E2E').getByLabel(/editar kpi/i).click();
    await page.getByLabel(/nome/i).fill('KPI E2E v2');
    await page.getByRole('button', { name: /salvar/i }).click();
    await expect(page.getByText('KPI E2E v2')).toBeVisible();

    // excluir
    await rowOf(page, 'KPI E2E v2').getByLabel(/excluir kpi/i).click();
    await expect(page.getByText('KPI E2E v2')).toHaveCount(0);
  });

  test('KPI nativo não tem botão de excluir', async ({ page }) => {
    await openKpiAdmin(page);
    // "Total de Leads" é nativo (is_system) → o KpiList não renderiza "Excluir".
    await expect(rowOf(page, 'Total de Leads').getByLabel(/excluir kpi/i)).toHaveCount(0);
    // mas o de editar existe (nativos podem ser editados/reordenados).
    await expect(rowOf(page, 'Total de Leads').getByLabel(/editar kpi/i)).toBeVisible();
  });

  test('wizard de import: upload → preview → mapeamento → dry-run → confirmar', async ({ page }) => {
    await openKpiAdmin(page);
    await page.getByRole('button', { name: /importar planilha/i }).click();

    // Fixture de METAS (não a planilha de leads): coluna KPI + Jan/Fev 2026.
    await page.setInputFiles('input[type=file]', 'e2e/fixtures/metas.xlsx');
    await expect(page.getByText(/Aba:/)).toBeVisible();

    await page.getByRole('button', { name: /^avançar$/i }).click();           // preview → mapeamento
    await page.getByRole('button', { name: /^metas$/i }).click();             // escolhe "Metas"
    await page.getByRole('button', { name: /pré-visualizar importação/i }).click(); // → dry-run
    await expect(page.getByText(/metas a gravar/i)).toBeVisible();

    await page.getByRole('button', { name: /confirmar importação/i }).click();
    // Após confirmar, o dialog FECHA (reset + onOpenChange(false)). Asserção robusta:
    // o título do passo do wizard some (não dependemos do toast transitório do Sonner).
    await expect(page.getByText(/importar metas — passo/i)).toHaveCount(0);
  });
});

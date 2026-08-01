import { test, expect, type Page } from '@playwright/test';

/**
 * E2E do "visualizar como".
 *
 * PRÉ-CONDIÇÕES:
 *  - app rodando (`npm run dev`: Vite 8080 + Express 3001);
 *  - E2E_TENANT / E2E_EMAIL / E2E_PASSWORD = usuário OWNER ou ADMIN do tenant,
 *    com pelo menos um outro membro no tenant;
 *  - opcional: E2E_CORRETOR_EMAIL / E2E_CORRETOR_PASSWORD (corretor do mesmo
 *    tenant) para o caso de autorização negativa — sem eles, esse teste é pulado.
 *
 * Os seletores usam data-testid (view-as-trigger / view-as-search / view-as-reset)
 * — estáveis a mudanças de estilo do header.
 */

async function login(page: Page, email: string, password: string) {
  await page.goto('/');
  const tenant = page.getByPlaceholder(/c[oó]digo|tenant/i).first();
  if (await tenant.count()) await tenant.fill(process.env.E2E_TENANT ?? '');
  await page.getByPlaceholder(/seu@email\.com/i).fill(email);
  await page.getByPlaceholder('••••••••').first().fill(password);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForLoadState('networkidle');

  // O owner da plataforma cai no Owner Dashboard e precisa entrar num tenant
  // antes de o CRM (e o seletor) existirem. Admin de tenant já cai direto.
  const acessar = page.getByRole('button', { name: /^acessar$/i }).first();
  if (await acessar.count()) {
    await acessar.click();
    await page.waitForLoadState('networkidle');
  }
}

test.describe('Visualizar como', () => {
  test('owner/admin troca o contexto pelo header e volta', async ({ page }) => {
    await login(page, process.env.E2E_EMAIL!, process.env.E2E_PASSWORD!);

    const trigger = page.getByTestId('view-as-trigger');
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveText(/meu usu[áa]rio/i);

    // Abrir → buscar → selecionar o primeiro resultado.
    await trigger.click();
    await page.getByTestId('view-as-search').fill('a');
    const firstOption = page.getByRole('option').nth(1); // 0 = "Meu usuário"
    await expect(firstOption).toBeVisible();
    const selectedName = (await firstOption.innerText()).split('\n')[0].trim();
    await firstOption.click();

    // Indicador no header.
    await expect(trigger).toHaveText(/visualizando:/i);
    await expect(trigger).toContainText(selectedName.split(' ')[0]);

    // Contexto sobrevive à navegação entre páginas.
    await page.goto('/meus-leads');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('view-as-trigger')).toHaveText(/visualizando:/i);

    // Voltar para o usuário real — um clique, sem logout.
    await page.getByTestId('view-as-reset').click();
    await expect(page.getByTestId('view-as-trigger')).toHaveText(/meu usu[áa]rio/i);
    await expect(page.getByTestId('view-as-reset')).toHaveCount(0);
  });

  test('corretor não vê o seletor e recebe 403 na API', async ({ page }) => {
    test.skip(
      !process.env.E2E_CORRETOR_EMAIL || !process.env.E2E_CORRETOR_PASSWORD,
      'defina E2E_CORRETOR_EMAIL/E2E_CORRETOR_PASSWORD para rodar este caso',
    );

    await login(page, process.env.E2E_CORRETOR_EMAIL!, process.env.E2E_CORRETOR_PASSWORD!);
    await expect(page.getByTestId('view-as-trigger')).toHaveCount(0);

    // Backend é a fonte da verdade: chamar a rota direto também é negado.
    const status = await page.evaluate(async () => {
      const raw = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
      const token = raw ? JSON.parse(localStorage.getItem(raw)!)?.access_token : null;
      const response = await fetch('/api/v1/view-as/users', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return response.status;
    });
    expect(status).toBe(403);
  });
});

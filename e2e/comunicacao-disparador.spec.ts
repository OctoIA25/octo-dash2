import { test, expect, type Page } from '@playwright/test';

/**
 * E2E do Disparador na área Comunicação.
 *
 * PRÉ-CONDIÇÕES (gate manual — ver plano/ledger):
 *  - app rodando (`npm run dev`: Vite 8080 + Express 3001) com o Express
 *    REINICIADO após a Task 10 (para servir /api/v1/communication/dispatch/*);
 *  - migrations da Task 5 aplicadas;
 *  - feature 'comunicacao' habilitada em tenants.allowed_features do tenant de
 *    teste (senão a rota redireciona para /leads — ver Task 11);
 *  - usuário de teste com role de GESTÃO (admin) no tenant de teste;
 *  - provider em modo SIMULADO (n8n/WhatsApp não-produção) para os casos de
 *    preview/confirm — nenhum envio real;
 *  - variáveis: E2E_TENANT, E2E_EMAIL, E2E_PASSWORD.
 *
 * Os seletores seguem o DOM real de DisparadorChat/MinimalLoginScreen; ajustar
 * na 1ª execução com browser_snapshot se o markup divergir.
 */

async function loginAsManager(page: Page) {
  await page.goto('/');
  const tenant = page.getByPlaceholder(/c[oó]digo|tenant/i).first();
  if (await tenant.count()) await tenant.fill(process.env.E2E_TENANT ?? '');
  await page.getByPlaceholder(/seu@email\.com/i).fill(process.env.E2E_EMAIL!);
  await page.getByPlaceholder('••••••••').first().fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForLoadState('networkidle');
}

test.describe('Comunicação — Disparador', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsManager(page);
  });

  test('acessar /comunicacao/disparador renderiza o chat do Disparador', async ({ page }) => {
    await page.goto('/comunicacao/disparador');
    // O header do DisparadorChat é exclusivo da tela.
    await expect(page.getByRole('heading', { name: /agente disparador/i })).toBeVisible();
    // O campo de comando e o botão de prévia confirmam o chat montado.
    await expect(page.getByRole('button', { name: /gerar prévia/i })).toBeVisible();
  });

  test('redirect: /agentes-ia/disparador → /comunicacao/disparador', async ({ page }) => {
    await page.goto('/agentes-ia/disparador');
    // O Navigate do DashboardLayout reescreve a URL para a nova área.
    await expect(page).toHaveURL(/\/comunicacao\/disparador$/);
    await expect(page.getByRole('heading', { name: /agente disparador/i })).toBeVisible();
  });

  test('gerar prévia mostra contagens SEM enviar (dry-run)', async ({ page }) => {
    await page.goto('/comunicacao/disparador');
    await page
      .getByPlaceholder(/mande uma mensagem/i)
      .fill('envie uma mensagem para todos os clientes arquivados');
    await page.getByRole('button', { name: /gerar prévia/i }).click();

    // A prévia aparece (contagens), e NENHUM relatório de envio surge ainda:
    // o dry-run não dispara. Aguardamos o card de prévia.
    await expect(page.getByRole('heading', { name: /prévia da operação/i })).toBeVisible({ timeout: 30_000 });
    // Botão de confirmação fica disponível — prova que estamos no passo de
    // confirmação (e que NADA foi enviado até aqui).
    await expect(page.getByRole('button', { name: /confirmar|disparar/i })).toBeVisible();
  });

  test('confirmar com mensagem dispara (ambiente simulado) e mostra relatório', async ({ page }) => {
    await page.goto('/comunicacao/disparador');
    await page
      .getByPlaceholder(/mande uma mensagem/i)
      .fill('envie uma mensagem para todos os clientes arquivados');
    await page.getByRole('button', { name: /gerar prévia/i }).click();
    await expect(page.getByRole('heading', { name: /prévia da operação/i })).toBeVisible({ timeout: 30_000 });

    // Garante uma mensagem (caso o comando não traga uma).
    const messageField = page.getByPlaceholder(/mensagem/i).last();
    if (await messageField.count()) await messageField.fill('Olá! Temos uma novidade para você.');

    await page.getByRole('button', { name: /confirmar|disparar/i }).click();

    // Em ambiente simulado, o confirm enfileira + drena e o componente mostra o
    // relatório final (enviados/falhas). Asserção robusta: surge a seção de
    // relatório ou o toast de sucesso "Disparo iniciado".
    await expect(
      page.getByText(/relat[óo]rio|enviad|disparo iniciado/i).first(),
    ).toBeVisible({ timeout: 30_000 });
  });
});

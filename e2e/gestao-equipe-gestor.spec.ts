import { test, expect, type Page } from '@playwright/test';

/**
 * E2E: gestor (team_leader) vê a própria equipe em Gestão de Equipe →
 * Acessos e Permissões (RPC get_tenant_members, migration
 * 20260914_get_tenant_members_gestor_ve_equipe).
 *
 * PRÉ-CONDIÇÕES:
 *  - app rodando (`npm run dev`: Vite 8080 + Express 3001);
 *  - E2E_GESTOR_EMAIL / E2E_GESTOR_PASSWORD = team_leader de uma equipe;
 *  - E2E_GESTOR_LIDERADOS = e-mails (separados por vírgula) dos membros dessa equipe;
 *  - E2E_GESTOR_FORA_EMAIL = membro do mesmo tenant em OUTRA equipe.
 *  Hoje: gestor E2E da "Equipe Gamma" na Área de Teste (valores no .env local).
 *
 * Rodar (requer `npm i -D @playwright/test`, ainda não está no package.json):
 *   env $(grep '^E2E_' .env | xargs) npx playwright test e2e/gestao-equipe-gestor.spec.ts
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function login(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.getByPlaceholder(/seu@email\.com/i).fill(email);
  await page.getByPlaceholder('••••••••').first().fill(password);
  await page.getByRole('button', { name: /entrar/i }).click();
  // networkidle nunca chega (o app faz polling); a saída do login é o sinal.
  await page.getByPlaceholder(/seu@email\.com/i).waitFor({ state: 'hidden', timeout: 60_000 });
}

/** Título do card de membro (h3 com o identificador exibido). */
const cardDe = (page: Page, nome: string) => page.getByRole('heading', { level: 3, name: nome, exact: true });

test('gestor vê a si mesmo (sem UUID) e só os membros da própria equipe', async ({ page }) => {
  const { E2E_GESTOR_EMAIL, E2E_GESTOR_PASSWORD, E2E_GESTOR_LIDERADOS, E2E_GESTOR_FORA_EMAIL } = process.env;
  test.skip(
    !E2E_GESTOR_EMAIL || !E2E_GESTOR_PASSWORD || !E2E_GESTOR_LIDERADOS || !E2E_GESTOR_FORA_EMAIL,
    'defina E2E_GESTOR_EMAIL/PASSWORD/LIDERADOS/FORA_EMAIL para rodar este caso',
  );

  await login(page, E2E_GESTOR_EMAIL!, E2E_GESTOR_PASSWORD!);
  // Pelo menu, sem reload: um goto logo após o login recarrega a página antes de
  // o useAuth da tela ter tenantId, e a lista não chega a ser buscada.
  await page.getByText('Gestão de Equipe', { exact: true }).first().click({ timeout: 60_000 });
  await page.getByText('Acessos e Permissões', { exact: true }).first().click();

  await expect(cardDe(page, E2E_GESTOR_EMAIL!)).toBeVisible({ timeout: 20_000 });

  for (const liderado of E2E_GESTOR_LIDERADOS!.split(',').map((e) => e.trim())) {
    await expect(cardDe(page, liderado)).toBeVisible();
  }

  // Lista já carregada (asserts acima) — agora os negativos não passam por vazio.
  await expect(cardDe(page, E2E_GESTOR_FORA_EMAIL!)).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 3, name: UUID })).toHaveCount(0);
});

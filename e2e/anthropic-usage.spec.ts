import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * E2E do card "Anthropic — Uso semanal" na página Status do Tenant (owner-only).
 *
 * PRÉ-CONDIÇÕES (gate manual — ver plano):
 *  - app rodando (`npm run dev`: Vite 8080 + Express 3001);
 *  - migration `20260729_create_tenant_anthropic_config` aplicada no Supabase;
 *  - snapshot semeado em `tenant_anthropic_config` para o tenant de teste (via
 *    seedAnthropicSnapshot abaixo — precisa de SUPABASE_SERVICE_ROLE_KEY, RLS
 *    sem policies bloqueia anon/authenticated nessa tabela);
 *  - usuários de teste existentes: owner (email hardcoded da plataforma),
 *    gestor (role admin/team_leader) e corretor no tenant de teste;
 *  - variáveis: E2E_TENANT, E2E_TENANT_ID, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD,
 *    E2E_GESTOR_EMAIL, E2E_GESTOR_PASSWORD, E2E_CORRETOR_EMAIL,
 *    E2E_CORRETOR_PASSWORD, VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * NOTA: os seletores de login dependem do `MinimalLoginScreen` real (mesmo
 * padrão de e2e/kpis.spec.ts). Ajustar ao DOM na 1ª execução (browser_snapshot).
 *
 * NOTA sobre auth de API: `POST /api/v1/anthropic/usage` exige `requireOwner`
 * (server/anthropic/routes.js) — ou seja, TANTO gestor quanto corretor devem
 * receber 403 (só o owner da plataforma passa). Os tokens são obtidos via
 * `supabase.auth.signInWithPassword` (Admin API do próprio Supabase, não a UI),
 * o que é uma forma legítima de logar os usuários de teste sem depender do DOM.
 */

const TEST_TENANT_ID = process.env.E2E_TENANT_ID ?? '';

async function loginAs(page: Page, email: string | undefined, password: string | undefined) {
  await page.goto('/');
  const tenant = page.getByPlaceholder(/c[oó]digo|tenant/i).first();
  if (await tenant.count()) await tenant.fill(process.env.E2E_TENANT ?? '');
  await page.getByPlaceholder(/seu@email\.com/i).fill(email!);
  await page.getByPlaceholder('••••••••').first().fill(password!);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForLoadState('networkidle');
}

async function loginAsOwner(page: Page) {
  await loginAs(page, process.env.E2E_OWNER_EMAIL, process.env.E2E_OWNER_PASSWORD);
}

async function gotoTenantStatus(page: Page, tenantId: string) {
  await page.goto('/owner/status');
  // A página exige selecionar o tenant no <select> antes de buscar os cards.
  const select = page.locator('select');
  await select.selectOption(tenantId);
  await page.waitForLoadState('networkidle');
}

/**
 * Semeia diretamente `tenant_anthropic_config` (bypassa a Anthropic real).
 * Espelha as colunas de server/anthropic/service.js::persistSnapshot e da
 * migration 20260729_create_tenant_anthropic_config.
 *
 * Requer SUPABASE_SERVICE_ROLE_KEY (a tabela tem RLS ligado SEM policies —
 * só service_role enxerga, igual tenant_contact2sale_config).
 */
async function seedAnthropicSnapshot(
  tenantId: string,
  snapshot: {
    status: 'not_configured' | 'normal' | 'warning' | 'insufficient_data' | 'error';
    last_state?: string;
    last_percentage?: number | null;
    last_usage_usd?: number | null;
    weekly_limit_usd?: number | null;
    last_window_start?: string | null;
    last_window_end?: string | null;
  },
) {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'seedAnthropicSnapshot: faltam VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no ambiente do teste.',
    );
  }
  const supabase = createClient(url, serviceKey);
  const { error } = await supabase.from('tenant_anthropic_config').upsert(
    {
      tenant_id: tenantId,
      status: snapshot.status,
      last_state: snapshot.last_state ?? snapshot.status,
      last_percentage: snapshot.last_percentage ?? null,
      last_usage_usd: snapshot.last_usage_usd ?? null,
      weekly_limit_usd: snapshot.weekly_limit_usd ?? null,
      last_window_start: snapshot.last_window_start ?? null,
      last_window_end: snapshot.last_window_end ?? null,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id' },
  );
  if (error) throw new Error(`seedAnthropicSnapshot falhou: ${error.message}`);
}

/**
 * Loga um usuário de teste via Admin API do Supabase (não a UI) para obter um
 * access_token — usado só nos testes de autorização via `request` context.
 */
async function loginForToken(email: string | undefined, password: string | undefined): Promise<string> {
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey || !email || !password) {
    throw new Error('loginForToken: faltam VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY ou credenciais do usuário de teste.');
  }
  const supabase = createClient(url, anonKey);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`loginForToken falhou para ${email}: ${error?.message}`);
  return data.session.access_token;
}

test.describe('Anthropic — uso semanal (Status do Tenant)', () => {
  test('Owner vê o card com percentual (uso normal)', async ({ page }) => {
    await seedAnthropicSnapshot(TEST_TENANT_ID, {
      status: 'normal',
      last_percentage: 8.4,
      last_usage_usd: 42,
      weekly_limit_usd: 500,
    });
    await loginAsOwner(page);
    await gotoTenantStatus(page, TEST_TENANT_ID);

    const card = page.getByText('Anthropic — Uso semanal').locator('..').locator('..');
    await expect(card).toContainText('%');
    await expect(card).toContainText('Normal');
  });

  test('≥ 14,30% mostra estado de atenção', async ({ page }) => {
    await seedAnthropicSnapshot(TEST_TENANT_ID, {
      status: 'warning',
      last_percentage: 15.2,
      last_usage_usd: 76,
      weekly_limit_usd: 500,
    });
    await loginAsOwner(page);
    await gotoTenantStatus(page, TEST_TENANT_ID);

    const card = page.getByText('Anthropic — Uso semanal').locator('..').locator('..');
    await expect(card).toContainText('Atenção');
    await expect(card).toContainText('alerta disparado');
  });

  test('estado de atenção persiste e é idêntico após reload (sem duplicação)', async ({ page }) => {
    await seedAnthropicSnapshot(TEST_TENANT_ID, {
      status: 'warning',
      last_percentage: 15.2,
      last_usage_usd: 76,
      weekly_limit_usd: 500,
    });
    await loginAsOwner(page);
    await gotoTenantStatus(page, TEST_TENANT_ID);

    const card = page.getByText('Anthropic — Uso semanal').locator('..').locator('..');
    await expect(card).toContainText('15,20%');

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Mesmo dado, mesma leitura — o card é derivado do snapshot, não recalculado
    // a cada render, então o reload não pode produzir um valor diferente.
    const cardAfterReload = page.getByText('Anthropic — Uso semanal').locator('..').locator('..');
    await expect(cardAfterReload).toContainText('15,20%');
    await expect(cardAfterReload).toContainText('Atenção');
  });

  test('integração desconectada aparece como não configurada (não 0%)', async ({ page }) => {
    await seedAnthropicSnapshot(TEST_TENANT_ID, {
      status: 'not_configured',
      last_percentage: null,
      last_usage_usd: null,
      weekly_limit_usd: null,
    });
    await loginAsOwner(page);
    await gotoTenantStatus(page, TEST_TENANT_ID);

    const card = page.getByText('Anthropic — Uso semanal').locator('..').locator('..');
    await expect(card).toContainText('N/A');
    await expect(card).toContainText('API não configurada');
    // Regressão: sem key/limite deve ler "N/A", NUNCA "0%" (falso positivo de uso zero).
    await expect(card).not.toContainText('0%');
  });
});

test.describe('Anthropic — autorização', () => {
  // POST /api/v1/anthropic/usage usa requireOwner (server/anthropic/routes.js):
  // só o e-mail owner da plataforma passa. Gestor (admin/team_leader) e
  // corretor devem tomar 403 igualmente — dado de consumo é sensível.
  test('Gestor recebe 403 em POST /usage', async ({ request }) => {
    const token = await loginForToken(process.env.E2E_GESTOR_EMAIL, process.env.E2E_GESTOR_PASSWORD);
    const res = await request.post('/api/v1/anthropic/usage', {
      headers: { Authorization: `Bearer ${token}` },
      data: { tenantId: TEST_TENANT_ID },
    });
    expect(res.status()).toBe(403);
  });

  test('Corretor recebe 403 em POST /usage', async ({ request }) => {
    const token = await loginForToken(process.env.E2E_CORRETOR_EMAIL, process.env.E2E_CORRETOR_PASSWORD);
    const res = await request.post('/api/v1/anthropic/usage', {
      headers: { Authorization: `Bearer ${token}` },
      data: { tenantId: TEST_TENANT_ID },
    });
    expect(res.status()).toBe(403);
  });
});

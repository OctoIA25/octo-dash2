import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * E2E do card "Anthropic — Uso semanal" na página Status do Tenant (owner-only).
 *
 * PRÉ-CONDIÇÕES (gate manual — ver plano):
 *  - app rodando (`npm run dev`: Vite 8080 + Express 3001);
 *  - migration `20260729_create_tenant_anthropic_config` aplicada no Supabase;
 *  - migration `20260730_anthropic_fase2_threshold_alert` aplicada no Supabase
 *    (adiciona `alert_threshold_bps`/`last_alerted_at` — sem ela o teste do
 *    campo "Avisar quando passar de (%)" falha ao salvar/persistir);
 *  - migration `20260730_anthropic_fase3_mode` aplicada no Supabase (adiciona
 *    a coluna `mode` + CHECK `('api','max')` — sem ela o toggle MAX e o
 *    ingest `/api/v1/anthropic/usage-report` falham: coluna inexistente);
 *  - env `ANTHROPIC_WEEKLY_BUDGET_USD` setado no processo do servidor (é o
 *    teto semanal GLOBAL, denominador do %; sem ele o card cai em
 *    `insufficient_data` mesmo com key configurada — ver server/anthropic/usage.js);
 *  - snapshot semeado em `tenant_anthropic_config` para o tenant de teste (via
 *    seedAnthropicSnapshot abaixo — precisa de SUPABASE_SERVICE_ROLE_KEY, RLS
 *    sem policies bloqueia anon/authenticated nessa tabela);
 *  - usuários de teste existentes: owner (email hardcoded da plataforma),
 *    gestor (role admin/team_leader) e corretor no tenant de teste;
 *  - para o cenário MAX (teste de request abaixo): uma `tenant_api_key` de
 *    teste cadastrada para o tenant (mesma tabela/fluxo usado pelas rotas
 *    `/api/v1/leads`, validada por `validateApiKey` em server/api-server.js e
 *    server/proxy-production.js — é o que autentica o POST no ingest MAX, já
 *    que essa rota não usa Supabase Auth);
 *  - variáveis: E2E_TENANT, E2E_TENANT_ID, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD,
 *    E2E_GESTOR_EMAIL, E2E_GESTOR_PASSWORD, E2E_CORRETOR_EMAIL,
 *    E2E_CORRETOR_PASSWORD, VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *    E2E_TENANT_API_KEY (só para o teste de ingest MAX — ver NOTA abaixo).
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
 * Leva o owner à aba Integrações (`/configuracoes`, tab default e explícita
 * `?tab=integrations` — ver src/features/settings/pages/IntegracoesPage.tsx)
 * DENTRO do tenant de teste, não no console `/owner/*`.
 *
 * `/configuracoes` é uma rota do `DashboardLayout` (tenant-scoped); o owner só
 * cai nele impersonando um tenant. A UI de impersonation é um botão "abrir"
 * na lista de tenants do OwnerDashboard (`openTenant` em
 * src/components/OwnerDashboard.tsx) que grava `localStorage['owner-impersonation']
 * = {tenantId, tenantCode, tenantName}` e recarrega — replicamos isso direto
 * (mesmo contrato lido em src/hooks/useAuth.ts) em vez de depender do texto/
 * posição exata desse botão, que não faz parte do fluxo sob teste aqui.
 */
async function gotoIntegracoes(page: Page, tenantId: string) {
  await page.evaluate(
    ({ tenantId, tenantCode }) => {
      localStorage.setItem(
        'owner-impersonation',
        JSON.stringify({ tenantId, tenantCode, tenantName: tenantCode }),
      );
    },
    { tenantId, tenantCode: process.env.E2E_TENANT ?? tenantId },
  );
  await page.goto('/configuracoes?tab=integrations');
  await page.waitForLoadState('networkidle');
}

/**
 * Semeia diretamente `tenant_anthropic_config` (bypassa a Anthropic real).
 * Espelha as colunas de server/anthropic/service.js::persistSnapshot e das
 * migrations 20260729_create_tenant_anthropic_config (Fase 1),
 * 20260730_anthropic_fase2_threshold_alert (Fase 2: alert_threshold_bps) e
 * 20260730_anthropic_fase3_mode (Fase 3: coluna `mode`).
 *
 * `alert_threshold_bps` e `last_state` têm default que preserva o comportamento
 * da Fase 1: default 1430 (14,30%, mesmo default da migration/coluna) e
 * `last_state` espelhando o `status` semeado (é o que o scheduler grava —
 * ver server/anthropic/service.js::persistSnapshot). Os 6 testes da Fase 1
 * não passam esses campos, então continuam exercitando exatamente os mesmos
 * valores de antes.
 *
 * `mode` default `'api'` pelo mesmo motivo: os testes de Fase 1/2 não passam
 * esse campo e não podem mudar de semântica — só o cenário MAX (Fase 3) passa
 * `mode: 'max'` explicitamente.
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
    alert_threshold_bps?: number;
    mode?: 'api' | 'max';
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
      alert_threshold_bps: snapshot.alert_threshold_bps ?? 1430,
      mode: snapshot.mode ?? 'api',
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

test.describe('Anthropic — limiar de alerta (aba Integrações, Fase 2)', () => {
  // Este bloco cobre o CAMPO persistido (config/get round-trip), não o disparo
  // do alerta em si. O disparo real (sino+email — server/anthropic/alerts.js,
  // acionado na transição normal→warning pelo scheduler) não é assertável
  // aqui sem SMTP/infra de e-mail e sem esperar um tick real do scheduler.
  // Os efeitos observáveis que ESTE spec assert:
  //  (a) o limiar em % fica persistido e sobrevive a reload (este teste);
  //  (b) o card de atenção aparece quando o snapshot está em `warning`
  //      (já coberto pelos testes da Fase 1 acima, ex. "≥ 14,30% mostra
  //      estado de atenção" — o limiar configurável só muda O NÚMERO que
  //      dispara esse mesmo estado, não o estado em si).
  test('salva e persiste o limiar de aviso em % (round-trip via config/get)', async ({ page }) => {
    // Sem key configurada o card mostraria "Desconectado", mas o campo do
    // limiar é editável independente disso — não precisa semear uma key real
    // aqui (o teste é sobre o campo, não sobre o status "Conectado").
    await loginAsOwner(page);
    await gotoIntegracoes(page, TEST_TENANT_ID);

    // O card não linka <label htmlFor> ao <input> (getByLabel não resolve),
    // então escopamos pelo título do card e usamos o placeholder do campo
    // ("Ex: 14,30") — mesmo padrão de resiliência dos outros testes deste
    // arquivo (getByText(...).locator('..').locator('..')).
    const card = page.getByText('Anthropic (Claude)').locator('..').locator('..');
    await expect(card.getByText('Avisar quando passar de (%)')).toBeVisible();

    const thresholdInput = card.getByPlaceholder('Ex: 14,30');
    await thresholdInput.fill('50,00');
    await card.getByRole('button', { name: /^salvar$/i }).click();

    // "Salvar" reidrata o campo com o que voltou de config/get (ver
    // handleAnthropicSave em IntegracoesPage.tsx) — se o servidor persistiu
    // errado ou não persistiu, o valor mostrado aqui já seria outro.
    await expect(thresholdInput).toHaveValue('50,00');

    // Reload força uma leitura NOVA (fetchAnthropicConfig no useEffect de
    // montagem), não o estado em memória do save acima — é o que garante que
    // o valor está no banco (alert_threshold_bps), não só no state do React.
    await page.reload();
    await page.waitForLoadState('networkidle');

    const cardAfterReload = page.getByText('Anthropic (Claude)').locator('..').locator('..');
    await expect(cardAfterReload.getByPlaceholder('Ex: 14,30')).toHaveValue('50,00');
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

test.describe('Anthropic — modo MAX (aba Integrações, Fase 3)', () => {
  // Trocar de modo é destrutivo do snapshot (handleAnthropicModeChange em
  // IntegracoesPage.tsx reseta o config ao salvar), por isso a UI usa um
  // `window.confirm()` nativo antes de aplicar — o teste aceita esse dialog
  // via `page.on('dialog', ...)` (não há como interagir com um confirm()
  // nativo pelos seletores normais do Playwright).
  test('alternar para MAX esconde a API key e mostra as instruções do reporter', async ({ page }) => {
    await seedAnthropicSnapshot(TEST_TENANT_ID, { status: 'not_configured', mode: 'api' });
    await loginAsOwner(page);
    await gotoIntegracoes(page, TEST_TENANT_ID);

    const card = page.getByText('Anthropic (Claude)').locator('..').locator('..');

    // Toggle segmentado API | MAX visível com os dois modos.
    const apiTab = card.getByRole('button', { name: /^api$/i });
    const maxTab = card.getByRole('button', { name: /^max$/i });
    await expect(apiTab).toBeVisible();
    await expect(maxTab).toBeVisible();

    // Estado inicial (modo api): campo de key visível, bloco do reporter ausente.
    await expect(card.getByPlaceholder('sk-ant-...')).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await maxTab.click();
    await page.waitForLoadState('networkidle');

    // Pós-troca (modo max): campo de key some, instruções do reporter aparecem.
    // `octodash-max-usage-reporter.cjs` é o nome real do script referenciado no
    // bloco de instruções (ver IntegracoesPage.tsx) — string distintiva o
    // suficiente para não colidir com nenhum outro texto da página.
    await expect(card.getByPlaceholder('sk-ant-...')).not.toBeVisible();
    await expect(card).toContainText('octodash-max-usage-reporter.cjs');
  });
});

test.describe('Anthropic — ingest do modo MAX (Fase 3)', () => {
  // POST /api/v1/anthropic/usage-report é autenticado por tenant_api_key
  // (validateApiKey nos entrypoints — server/anthropic/ingest.js não usa
  // Supabase Auth), diferente das demais rotas Anthropic. Requer
  // E2E_TENANT_API_KEY: uma tenant_api_key de teste válida para o tenant de
  // teste (mesmo mecanismo usado por /api/v1/leads). Sem ela, skip alto —
  // não faz sentido rodar este bloco sem essa credencial.
  test.skip(
    !process.env.E2E_TENANT_API_KEY,
    'Requer E2E_TENANT_API_KEY (tenant_api_key de teste) para autenticar o ingest MAX.',
  );

  test('tenant em modo max: 200 e {ok:true}', async ({ request }) => {
    await seedAnthropicSnapshot(TEST_TENANT_ID, { status: 'normal', mode: 'max' });

    const res = await request.post('/api/v1/anthropic/usage-report', {
      headers: { Authorization: `Bearer ${process.env.E2E_TENANT_API_KEY}` },
      data: { week_pct: 42 },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true });
  });

  test('tenant em modo api: 409 (ingest MAX não se aplica)', async ({ request }) => {
    await seedAnthropicSnapshot(TEST_TENANT_ID, { status: 'normal', mode: 'api' });

    const res = await request.post('/api/v1/anthropic/usage-report', {
      headers: { Authorization: `Bearer ${process.env.E2E_TENANT_API_KEY}` },
      data: { week_pct: 42 },
    });

    // ingestMaxUsage retorna code: 'mode_not_max' quando o tenant não está em
    // modo max — os dois entrypoints (api-server.js / proxy-production.js)
    // mapeiam esse code para HTTP 409 (ver `r.code === 'mode_not_max' ? 409 : 400`).
    expect(res.status()).toBe(409);
  });
});

import { test, expect, request, type Page, type Browser } from '@playwright/test';

/**
 * E2E de performance do P0.7 — o que o teste unitário não vê.
 *
 * O plano descreve três travamentos. A medição de 18/09/2026 achou dois deles
 * reais, e por causas diferentes das que o plano supõe (o plano aponta falta
 * de índice; os índices e a projeção de colunas já existiam desde 13/07):
 *
 *   Central de Atividades .. baixava a base INTEIRA de leads para escrever o
 *                            nome do cliente em algumas dezenas de linhas.
 *                            Produção: Japi 9.494 linhas · 6,92 MB · 12 idas
 *                            ao banco; Lotus 1.656 · 1,05 MB.
 *   Ficha do negócio ....... a listagem de negócios era escondida por CSS
 *                            (`hidden`) quando a ficha abria embutida no
 *                            Jurídico — o React montava os ~29.500 nós assim
 *                            mesmo, por cima dos 12.475 do kanban.
 *
 * A terceira queixa (o kanban do Jurídico não rolar) NÃO reproduziu: em seis
 * larguras, de 1920 a 390, ele percorre o alcance inteiro.
 *
 * PRÉ-CONDIÇÕES: Supabase LOCAL com `e2e/fixtures/cadastro-origens.seed.sql`
 * (1.655 leads) e `e2e/fixtures/central-atividades.seed.sql` (40 atividades),
 * app servido por `npx vite`, E2E_EMAIL / E2E_PASSWORD.
 */

test.describe.configure({ mode: 'serial' });

let page: Page;
/** Uma entrada por resposta do PostgREST, desde o último zerar(). */
let rede: Array<{ tabela: string; url: string; bytes: number }> = [];

const zerar = () => { rede = []; };

/**
 * As requisições da Central a `leads`, identificadas pela PROJEÇÃO.
 *
 * Filtrar por tabela não basta: a tela inicial usa `useLeadsMetrics`, cuja
 * busca ainda está em voo quando se navega para cá, e ela também lê `leads` —
 * com outro conjunto de colunas. `assigned_at` só existe na projeção do
 * Kanban, que é a que a Central usa.
 */
const pedidosDaCentral = () =>
  rede.filter((r) => r.tabela === 'leads' && r.url.includes('assigned_at'));

const itemDoMenu = (texto: RegExp) =>
  page.locator('nav a, nav button, aside a, aside button').filter({ hasText: texto }).first();

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  page.on('response', async (r) => {
    if (!r.url().includes('/rest/v1/')) return;
    const tabela = (r.url().split('/rest/v1/')[1] || '').split('?')[0];
    let n = 0;
    try { n = (await r.body()).length; } catch { /* resposta já descartada */ }
    rede.push({ tabela, url: r.url(), bytes: n });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder(/seu@email\.com/i).fill(process.env.E2E_EMAIL!);
  await page.getByPlaceholder('••••••••').first().fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page.getByText(/Boa (tarde|noite|dia)/i).first()).toBeVisible({ timeout: 30_000 });
});

test.afterAll(async () => { await page?.close(); });

test('a Central pede SÓ os leads que as atividades referenciam', async () => {
  zerar();
  await page.goto('/central-leads', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('PENDENTES').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(5_000);

  const pedidos = pedidosDaCentral();
  const kb = pedidos.reduce((a, r) => a + r.bytes, 0) / 1024;
  // A base do tenant tem 1.655 leads: pedi-la inteira custava 1.076 KB em 2
  // páginas. As 40 atividades referenciam 40 leads — cabem numa ida só.
  expect(pedidos.length, 'uma requisição, não uma paginação da base inteira').toBe(1);
  expect(kb, 'KB baixados de `leads` pela Central').toBeLessThan(200);
});

test('…e as linhas continuam mostrando o lead, não só o nome guardado', async () => {
  const comNome = await page.evaluate(() =>
    [...document.querySelectorAll('*')]
      .filter((e) => e.children.length === 0 && /^Volume \d+$/.test(e.textContent || ''))
      .length
  );
  expect(comNome, 'linhas enriquecidas a partir da tabela de leads').toBeGreaterThan(0);
});

test('a base inteira só é pedida quando um diálogo precisa do seletor', async () => {
  zerar();
  await page.getByRole('button', { name: /Nova atividade/i }).first().click();
  // O <Label> não tem htmlFor, então getByLabel não o alcança.
  await expect(page.getByText('Lead (opcional)').first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(6_000);

  expect(pedidosDaCentral().length, 'aí sim a base inteira, paginada').toBeGreaterThan(1);
  await page.keyboard.press('Escape');
});

test('a ficha do negócio NÃO monta a listagem de negócios por baixo', async () => {
  await page.goto('/juridico', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/PROPOSTA CRIADA/i).first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(3_000);

  const antes = await page.evaluate(() => document.querySelectorAll('*').length);
  await page.locator('section > div > button').first().click();
  await page.waitForTimeout(8_000);
  const depois = await page.evaluate(() => document.querySelectorAll('*').length);

  // Com 654 negócios a listagem escondida somava ~29.500 nós. A ficha em si
  // custa algumas centenas; o teto abaixo pega a listagem voltando.
  expect(depois - antes, 'nós acrescentados ao abrir a ficha').toBeLessThan(5_000);
});

test('o kanban do Jurídico alcança a última coluna', async () => {
  await page.keyboard.press('Escape');
  await page.goto('/juridico', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/PROPOSTA CRIADA/i).first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(2_000);

  const r = await page.evaluate(async () => {
    const cols = [...document.querySelectorAll('section')].filter((s) =>
      /PROPOSTA CRIADA|RECEBIDO|ANDAMENTO|EM ANÁLISE|FEITURA/i.test(s.textContent || '')
    );
    const cont = cols[0].parentElement as HTMLElement;
    // `scroll-behavior: smooth` faz a atribuição ser assíncrona: ler o
    // scrollLeft na linha seguinte devolve o valor ANTIGO e parece que a
    // rolagem não funciona. Foi assim que eu mesmo "reproduzi" o defeito.
    cont.style.scrollBehavior = 'auto';
    cont.scrollLeft = 1e6;
    await new Promise((r) => requestAnimationFrame(r));
    const ultima = cols[cols.length - 1].getBoundingClientRect();
    return {
      alcance: cont.scrollWidth - cont.clientWidth,
      chegou: cont.scrollLeft,
      ultimaNaJanela: ultima.right <= window.innerWidth + 1,
    };
  });

  expect(r.chegou, 'a rolagem percorre o alcance inteiro').toBe(r.alcance);
  expect(r.ultimaNaJanela, 'a última coluna fica visível').toBe(true);
});

import { test, expect, request, type Page, type Browser } from '@playwright/test';

/**
 * E2E do cadastro de origem de lead (P0.4).
 *
 * POR QUE EXISTE. O teste unitário prova a REGRA (resolverOrigem, no choke
 * point). Só o navegador prova que a escolha do admin numa tela chega ao
 * gráfico de outra: o cadastro é salvo em Configurações e consumido em
 * Relatórios, por um hook, num tenant com RLS. Nada disso o vitest vê.
 *
 * PRÉ-CONDIÇÕES: Supabase LOCAL, `e2e/fixtures/cadastro-origens.seed.sql`
 * aplicada, app servido por `npx vite` (não `npm run dev`, que ignora o
 * .env.local — ver scripts/dev.js:43), E2E_EMAIL / E2E_PASSWORD.
 *
 * A fixture: Lia (Japi Terceiros) 8 · Lia (Lotus Brokers) 4 · Lia · teste 2
 *            Santa Angela 6 · santa angela 2 · ZAP Imoveis 2   = 24 leads
 *
 * UM LOGIN SÓ, em série: logar por teste custava ~20s e estourava o timeout
 * do arquivo. Os casos também dependem um do outro de propósito — o que
 * cadastra vem antes do que confere se sobreviveu ao reload.
 */

test.describe.configure({ mode: 'serial' });

let page: Page;

const itemDoMenu = (texto: RegExp) =>
  page.locator('nav a, nav button, aside a, aside button').filter({ hasText: texto }).first();

/** A linha de um texto cru DENTRO do card de origens (o de canais repete os mesmos textos). */
const linhaDoTexto = (texto: string) =>
  page
    .locator('div.rounded-xl.border')
    .filter({ has: page.getByText(texto, { exact: true }) })
    .first();

async function abrirCadastroDeOrigens() {
  await itemDoMenu(/Configura/i).click();
  await page.getByRole('button', { name: /Canais de Lead/i }).first().click();
  await expect(page.getByRole('heading', { name: 'Origens de Lead' })).toBeVisible();
  // Espera o hook responder: sem isso a lista ainda está vazia.
  await expect(linhaDoTexto('Lia (Japi Terceiros)')).toBeVisible();
}

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder(/seu@email\.com/i).fill(process.env.E2E_EMAIL!);
  await page.getByPlaceholder('••••••••').first().fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page.getByText(/Boa (tarde|noite|dia)/i).first()).toBeVisible({ timeout: 25_000 });
  await zerarCadastro();
  await abrirCadastroDeOrigens();
});

/**
 * Zera o cadastro do tenant de teste ANTES de abrir a tela.
 *
 * Pela própria tela não dá: `toHaveCount(0)` passa trivialmente enquanto a
 * lista ainda está carregando, e a série começava com o cadastro da execução
 * anterior ainda no banco — o caso seguinte lia "Cadastrada" sem haver
 * defeito nenhum. Aqui é determinístico.
 */
async function zerarCadastro() {
  const ctx = await request.newContext({
    baseURL: process.env.E2E_SUPABASE_URL,
    extraHTTPHeaders: {
      apikey: process.env.E2E_SERVICE_KEY!,
      Authorization: `Bearer ${process.env.E2E_SERVICE_KEY}`,
    },
  });
  const tenant = `eq.${process.env.E2E_TENANT_ID}`;
  for (const t of ['tenant_lead_origin_map', 'tenant_lead_origins']) {
    const r = await ctx.delete(`/rest/v1/${t}?tenant_id=${tenant}`);
    expect(r.status(), `limpeza de ${t}`).toBeLessThan(300);
  }
  await ctx.dispose();
}

test('lista os textos crus que chegam nos leads, com a contagem', async () => {
  for (const [texto, n] of [
    ['Lia (Japi Terceiros)', 8],
    ['Lia (Lotus Brokers)', 4],
    ['Lia · teste', 2],
    ['ZAP Imoveis', 2],
  ] as const) {
    await expect(linhaDoTexto(texto)).toContainText(`${n} leads`);
  }
});

test('"Santa Angela" e "santa angela" contam como UMA linha (8 leads)', async () => {
  // 6 + 2: a chave normaliza a caixa, senão a construtora apareceria duas vezes.
  await expect(linhaDoTexto('Santa Angela')).toContainText('8 leads');
});

test('as três variantes da LIA já vêm agrupadas pela sugestão mecânica', async () => {
  for (const texto of ['Lia (Japi Terceiros)', 'Lia (Lotus Brokers)', 'Lia · teste']) {
    await expect(linhaDoTexto(texto)).toContainText('aparece nos relatórios como LIA');
    await expect(linhaDoTexto(texto)).toContainText('Agrupada automaticamente');
  }
});

test('"Santa Angela" NÃO é agrupada sozinha — quem decide é o negócio', async () => {
  await expect(linhaDoTexto('Santa Angela')).toContainText('Sem cadastro');
  await expect(linhaDoTexto('Santa Angela')).toContainText('aparece nos relatórios como Santa Angela');
});

test('cadastrar "Santa Angela" como parceria muda o rótulo na tela', async () => {
  await page.getByPlaceholder(/Nome da nova origem/i).fill('Parceria construtora');
  await page.getByRole('button', { name: /^Cadastrar$/ }).click();
  await expect(page.getByText('Origem cadastrada').first()).toBeVisible();

  const linha = linhaDoTexto('Santa Angela');
  await linha.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Parceria construtora' }).click();
  await expect(page.getByText('Origem atualizada').first()).toBeVisible();

  await expect(linhaDoTexto('Santa Angela')).toContainText(
    'aparece nos relatórios como Parceria construtora'
  );
  await expect(linhaDoTexto('Santa Angela')).toContainText('Cadastrada');
});

test('a escolha sobrevive ao recarregamento — foi pro banco, não pro estado', async () => {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await abrirCadastroDeOrigens();
  await expect(linhaDoTexto('Santa Angela')).toContainText(
    'aparece nos relatórios como Parceria construtora'
  );
});

/**
 * Os rótulos do gráfico vivem DENTRO do canvas — não há texto no DOM para
 * asserir. Lê-se o `data` que o React entregou ao <Bar>, subindo a fiber a
 * partir do canvas. É o dado que o componente montou, não uma reimplementação
 * do cálculo.
 */
async function dadosDosGraficos() {
  return page.evaluate(() => {
    const saida: Array<{ labels: string[]; datasets: Array<{ label: string | null; cor: unknown }> }> = [];
    document.querySelectorAll('canvas').forEach((c) => {
      const kFiber = Object.keys(c).find((k) => k.startsWith('__reactFiber$'));
      let f: any = kFiber ? (c as any)[kFiber] : null;
      let dados: any = null;
      for (let n = 0; f && n < 12; n++, f = f.return) {
        const d = f.memoizedProps?.data;
        if (d && (Array.isArray(d.labels) || Array.isArray(d.datasets))) { dados = d; break; }
      }
      if (dados) {
        saida.push({
          labels: dados.labels ?? [],
          datasets: (dados.datasets ?? []).map((d: any) => ({ label: d.label ?? null, cor: d.backgroundColor })),
        });
      }
    });
    return saida;
  });
}

/** O gráfico "Leads por Origem" é o que tem um dataset por origem. */
async function origensDoGrafico() {
  const graficos = await dadosDosGraficos();
  const g = graficos.find((x) => x.datasets.length > 1 && x.datasets.every((d) => d.label));
  return g?.datasets.map((d) => ({ nome: d.label as string, cor: d.cor })) ?? [];
}

test('no gráfico de Relatórios a LIA é UMA origem, não três', async () => {
  await itemDoMenu(/Relat/i).click();
  await expect(page.getByText('Leads por Origem - Total')).toBeVisible({ timeout: 25_000 });
  await page.waitForTimeout(3_000);

  const origens = await origensDoGrafico();
  expect(origens.length).toBeGreaterThan(0);
  expect(origens.filter((o) => /^lia\b/i.test(o.nome)).map((o) => o.nome)).toEqual(['LIA']);
});

test('"Santa Angela" e "santa angela" viram UMA barra com o nome do cadastro', async () => {
  const origens = await origensDoGrafico();
  // Foi cadastrada como "Parceria construtora" no teste anterior desta série.
  expect(origens.filter((o) => /santa angela/i.test(o.nome))).toEqual([]);
  expect(origens.map((o) => o.nome)).toContain('Parceria construtora');
});

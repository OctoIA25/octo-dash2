import { test, expect, type Page } from '@playwright/test';

/**
 * E2E dos contadores da aba Métricas (Funil Cliente Interessado).
 *
 * POR QUE ESTE TESTE EXISTE. Em 18/09/2026 o mapeamento dos 102 contadores da
 * aba achou quatro cards errados, todos pelo mesmo mecanismo: comparavam a
 * etapa do lead com palavras que `leads.status` nunca gravou. O teste unitário
 * pega a regra; só o navegador prova que o número CERTO chega à tela — foi no
 * navegador que se viu "24 Clientes Interessados" e "24 Encaminhados Aos
 * Corretores" lado a lado, o mesmo número em dois cards.
 *
 * PRÉ-CONDIÇÕES (gate manual):
 *  - Supabase LOCAL de pé (`scripts/ambiente-local.sh`), NUNCA produção: a
 *    fixture apaga e recria os leads do tenant de teste;
 *  - usuário `e2e.local@octo.dev` criado via admin API do GoTrue local;
 *  - `e2e/fixtures/metricas-contadores.seed.sql` aplicada;
 *  - app apontando para o local. ATENÇÃO: `npm run dev` NÃO serve — o
 *    `scripts/dev.js:43` faz `{ ...process.env, ...envVars }`, então o `.env`
 *    do repo vence o shell e ele nunca lê `.env.local`. Use `npx vite` direto,
 *    que respeita a precedência do `.env.local`;
 *  - `E2E_EMAIL` / `E2E_PASSWORD` do usuário local.
 *
 * ESPERAS: nunca `networkidle` nem o `load` padrão do `goto` — o app faz
 * polling e nenhum dos dois assenta. Use `domcontentloaded` e depois espere um
 * elemento concreto.
 *
 * NAVEGAÇÃO: Métricas não está no menu raiz — fica em Comercial › Funil
 * Cliente Interessado. E não use `goto` logo após o login: componentes com o
 * `useAuth` antigo montam sem tenantId se a página recarrega antes do cache de
 * sessão existir.
 */

/**
 * Os números que a fixture produz. Cada um difere do que o código ANTIGO dava,
 * senão o teste passaria nas duas versões e não provaria nada.
 */
const ESPERADO: Array<{ rotulo: string; valor: string; antes: string }> = [
  { rotulo: 'Clientes Interessados',       valor: '24', antes: '24' },
  { rotulo: 'Pré-Atendimento',             valor: '19', antes: '5'  },
  { rotulo: 'Visitas',                     valor: '3',  antes: '3'  },
  { rotulo: 'Encaminhados Aos Corretores', valor: '4',  antes: '24' },
];

async function entrarNaAbaMetricas(page: Page) {
  // `domcontentloaded` obrigatório: o app faz polling, então o `load` padrão
  // (e `networkidle`) nunca assenta e o goto estoura o timeout.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder(/seu@email\.com/i).fill(process.env.E2E_EMAIL!);
  await page.getByPlaceholder('••••••••').first().fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page.getByText(/Boa (tarde|noite|dia)/i).first()).toBeVisible({ timeout: 20_000 });

  // Locator agnóstico de role: no DOM atual os itens do menu são <button>, não
  // <a>, e `getByRole('link')` não os encontra. Casar por texto dentro de
  // nav/aside sobrevive à troca de um pelo outro.
  const itemDoMenu = (texto: RegExp) =>
    page.locator('nav a, nav button, aside a, aside button').filter({ hasText: texto }).first();

  await itemDoMenu(/Comercial/i).click();
  await itemDoMenu(/Funil Cliente Interessado/i).click();
  await expect(page).toHaveURL(/metricas\/cliente-interessado/, { timeout: 20_000 });
}

/**
 * O valor de um card, ancorado no RÓTULO.
 *
 * Filtrar divs por `hasText` não serve: `hasText` casa contra o texto inteiro
 * do bloco, que é "3\nVisitas" — um `/^Visitas$/` nunca acha, e sem âncora o
 * `.last()` pega um bloco aninhado qualquer. O rótulo é um <p> de texto exato;
 * o pai dele é o card, com número e rótulo nessa ordem.
 *
 * E a busca precisa ser ESCOPADA na grade: "Pré-Atendimento" também é o nome
 * de uma sub-aba, e sem escopo o texto exato casa com o botão da aba — o teste
 * lia "Visão Geral" achando que era o valor do card.
 */
async function valorDoCard(page: Page, rotulo: string): Promise<string> {
  const grade = page.locator('div.grid').filter({ hasText: 'Encaminhados Aos Corretores' }).last();
  const label = grade.getByText(rotulo, { exact: true }).first();
  await label.waitFor({ state: 'visible', timeout: 20_000 });
  const texto = (await label.locator('xpath=..').innerText()).trim();
  return texto.split('\n').map((l) => l.trim()).filter(Boolean)[0];
}

test.describe('contadores da aba Métricas', () => {
  test.beforeEach(async ({ page }) => {
    await entrarNaAbaMetricas(page);
  });

  for (const { rotulo, valor, antes } of ESPERADO) {
    test(`${rotulo} mostra ${valor}${antes !== valor ? ` (o defeito mostrava ${antes})` : ''}`, async ({ page }) => {
      expect(await valorDoCard(page, rotulo), `card "${rotulo}" na tela`).toBe(valor);
    });
  }

  /**
   * O defeito mais visível não era um número solto: eram DOIS cards lado a
   * lado com o mesmo número, um chamado "total" e outro "encaminhados".
   */
  test('"Encaminhados" nao repete o total de leads', async ({ page }) => {
    const total = await valorDoCard(page, 'Clientes Interessados');
    const encaminhados = await valorDoCard(page, 'Encaminhados Aos Corretores');
    expect(encaminhados, 'encaminhados repetindo o total é o defeito de origem').not.toBe(total);
  });
});

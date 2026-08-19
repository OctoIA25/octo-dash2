import { test, expect, type Page } from '@playwright/test';

/**
 * Lead → classificação → banco → tela, pelo fluxo real da tela (sem mocks).
 *
 * PRÉ-CONDIÇÕES:
 *  - app rodando (`npm run dev`: Vite 8080 + Express 3001);
 *  - migrations 20260815_* aplicadas E backfill rodado (senão tudo fica
 *    "Sem classificação" e o primeiro teste não prova nada);
 *  - E2E_TENANT / E2E_EMAIL / E2E_PASSWORD de um admin/owner do tenant, com
 *    acesso liberado a /meus-leads e /bolsao (ambas atrás do mesmo gate
 *    `canAccess('metricas')` em DashboardLayout.tsx). Credenciais de dev:
 *    ver a memória `credenciais-teste-octodash`;
 *  - o 2º teste precisa de pelo menos 1 lead na fila "Disponíveis" do Bolsão
 *    cujo espelhamento já tenha `source_lead_id`/`source_kenlo_id` — uma
 *    linha antiga (pré-espelhamento) faz o Select reverter a escolha
 *    (ver o guard "Lead sem origem" em LeadDetailsModal.tsx) e o teste falha
 *    no assert de `aria-pressed`, o que nesse caso é dado ruim, não bug de teste.
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

const ROTULOS = /^(Lançamento|Pronto|Locação|Sem classificação)$/;

test.describe('Classificação de lead', () => {
  test('a listagem mostra a badge de classificação', async ({ page }) => {
    await login(page, process.env.E2E_EMAIL!, process.env.E2E_PASSWORD!);

    // "Meus Leads" (Kanban) tem rota própria. Admin/owner vê TODOS os leads em
    // andamento do tenant (fetchTodosLeadsCRM), não só os atribuídos a si —
    // por isso não depende de o usuário de teste ter carteira própria. Cada
    // card do Kanban traz a classificação no rodapé, como PONTO colorido
    // (ClassificacaoDots) e não como rótulo escrito: por isso o localizador é
    // por role/aria-label, não por texto visível.
    await page.goto('/meus-leads');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('img', { name: ROTULOS }).first()).toBeVisible({ timeout: 30_000 });
  });

  test('classificar pelo modal atualiza a badge', async ({ page }) => {
    await login(page, process.env.E2E_EMAIL!, process.env.E2E_PASSWORD!);

    // O Bolsão TEM rota própria (DashboardLayout.tsx: <Route path="bolsao">,
    // irmã de "meus-leads" nas mesmas <Routes> sem prefixo) — ao contrário do
    // que se poderia supor de o componente receber `leads` via prop. Os cards
    // desta tela (LeadMiniCard) já mostram a ClassificacaoBadge, em modo leitura
    // (LeadMiniCard.tsx:139) — mas os botões para MUDAR a classificação só existem
    // dentro do LeadDetailsModal, por isso este teste (que precisa deles) usa
    // o Bolsão em vez de Meus Leads: em
    // MeusLeadsAtribuidosSection.tsx o clique no card abre outro modal
    // (CriarLeadQuickModal, via setEditingLead) — o LeadDetailsModal ali é
    // declarado mas nunca aberto (setModalAberto(true) não é chamado nesse
    // arquivo). Em BolsaoSection.tsx o clique no LeadMiniCard SETA
    // leadSelecionado + modalAberto e é esse o único fluxo, no app hoje, que
    // efetivamente abre o LeadDetailsModal.
    await page.goto('/bolsao');
    await page.waitForLoadState('networkidle');

    // LeadMiniCard não tem data-testid; a grade de cards é localizável pela
    // combinação de breakpoints do Tailwind, única nesta tela
    // (BolsaoSection.tsx:1380). Clica no nome do lead (h3 no topo do card,
    // LeadMiniCard.tsx:132) em vez do card inteiro — outras áreas do card
    // (foto, botões de ação) fazem stopPropagation, e clicar no meio do card
    // arriscaria acionar "Assumir Lead" por baixo do ponteiro.
    const primeiroNome = page.locator('div[class*="xl:grid-cols-4"] > div h3').first();
    await expect(primeiroNome).toBeVisible({ timeout: 30_000 });
    await primeiroNome.click();

    // Botões de marcar/desmarcar (não mais um Select): desde a migration
    // 20260818 o lead pode carregar mais de uma classificação ao mesmo tempo.
    const controle = page.getByTestId('classificacao-controle');
    await expect(controle).toBeVisible({ timeout: 15_000 });

    // Alvo = um valor que AINDA NÃO está marcado, senão o clique desmarca e o
    // assert passa sem provar que a escrita chegou ao banco.
    const locacao = controle.getByRole('button', { name: 'Locação' });
    const lancamento = controle.getByRole('button', { name: 'Lançamento' });
    const alvo = (await locacao.getAttribute('aria-pressed')) === 'true' ? lancamento : locacao;

    await alvo.click();
    await expect(alvo).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });

    // Reabrir prova que a marcação PERSISTIU: o estado local é otimista e
    // reverteria sozinho se o UPDATE tivesse falhado.
    const rotulo = (await alvo.textContent())?.trim();
    await page.keyboard.press('Escape');
    await primeiroNome.click();
    await expect(
      page.getByTestId('classificacao-controle').getByRole('button', { name: rotulo! }),
    ).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
  });
});

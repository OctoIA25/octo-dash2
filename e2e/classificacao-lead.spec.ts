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
 *    no `toHaveText`, o que nesse caso é dado ruim, não bug de teste.
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
    // card do Kanban traz a ClassificacaoBadge no rodapé
    // (MeusLeadsAtribuidosSection.tsx:423, dentro de KanbanCardContent).
    await page.goto('/meus-leads');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(ROTULOS).first()).toBeVisible({ timeout: 30_000 });
  });

  test('classificar pelo modal atualiza a badge', async ({ page }) => {
    await login(page, process.env.E2E_EMAIL!, process.env.E2E_PASSWORD!);

    // O Bolsão TEM rota própria (DashboardLayout.tsx: <Route path="bolsao">,
    // irmã de "meus-leads" nas mesmas <Routes> sem prefixo) — ao contrário do
    // que se poderia supor de o componente receber `leads` via prop. Os cards
    // desta tela (LeadMiniCard) já mostram a ClassificacaoBadge, em modo leitura
    // (LeadMiniCard.tsx:139) — mas o Select para MUDAR a classificação só existe
    // dentro do LeadDetailsModal, por isso este teste (que precisa do Select) usa
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

    const seletor = page.getByTestId('select-classificacao');
    await expect(seletor).toBeVisible({ timeout: 15_000 });

    // Escolhe um valor DIFERENTE do atual, senão o assert passa sem provar nada.
    const atual = (await seletor.textContent())?.trim();
    const alvo = atual === 'Locação' ? 'Lançamento' : 'Locação';
    await seletor.click();
    await page.getByRole('option', { name: alvo }).click();

    await expect(seletor).toHaveText(alvo, { timeout: 15_000 });
  });
});

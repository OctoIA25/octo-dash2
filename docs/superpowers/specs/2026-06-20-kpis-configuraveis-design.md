# KPIs Configuráveis e Gerenciáveis — Design

**Data:** 2026-06-20
**Status:** Aprovado para planejamento
**Autor:** Victor + Claude

---

## 1. Objetivo

Transformar a área de KPIs do Dashboard (hoje 100% hardcoded) em entidades
gerenciáveis por gestores: criar, editar, ativar/desativar, excluir, reordenar,
importar metas via planilha Excel e atualizar metas por período.

Princípio condutor: **menor alteração possível + reuso máximo da arquitetura
atual**. A solução não introduz novos frameworks; espelha três padrões já
consolidados no projeto.

---

## 2. Evidências da arquitetura atual (base das decisões)

| Área | Estado hoje | Papel no projeto |
|---|---|---|
| `src/features/kpis/` | Cards são união **fechada** de 6 chaves; funil/fontes/faixas fixos. Cálculo em `server/kpis` (produção) e `supabaseKpisService` (fallback). UI lê só o contrato `KpisService`→`KpisOverview`. | Ponto de extensão: o contrato já isola a UI da fonte. |
| `src/features/metas/` + tabela `goals` | CRUD completo + metas + status + histórico + RLS por tenant. `category_id` texto livre, `config` JSONB, `goal_history`. | **Template exato** a espelhar para `dashboard_kpis`. |
| `src/features/relatorios/import/generic/` + `generic_imports` | Pipeline schema-less: `schemalessParser` (header/colunas/tipos, sem posições fixas) + `metadataDiscovery` (infere tipo/stats por coluna) + `genericImportService` (lê xlsx multi-aba). | **Motor do wizard.** Já satisfaz "não acoplar à planilha". |
| `@dnd-kit/*` | Instalado e usado em `FotosUploader`, `MeusLeadsAtribuidosSection`, `PropostaPage`. Padrão idiomático completo (DndContext+SortableContext+useSortable+arrayMove). | **Reuso** para reordenação (não usar setas). |
| Stepper/Wizard | **Não existe** componente genérico. Existe **padrão de passos** em `Importar16PersonalitiesPage` (upload→preview→persistir com state local + shadcn `Card`). | Seguir esse padrão leve; **não** criar framework de wizard. |
| `server/kpis/index.js` | `buildOverview` é função **pura** alimentada por `Promise.all` de fetchers. | Estender com 1 fetcher + merge, sem reescrever. |

**Planilha de referência (`public/excel_ler.xlsx`):** é uma lista CRUA de leads
(2 abas, layouts diferentes, datas como serial Excel) — **não** tem colunas de
KPI/meta. Confirma que o wizard deve **mapear** colunas, nunca assumir layout.

**Restrição de ambiente:** sem PostgreSQL MCP nesta sessão. A modelagem é
fundamentada nas migrations existentes. Validação com `EXPLAIN` na base real é um
gate **pré-merge documentado** (§9), não executado neste ciclo.

---

## 3. Decisões de produto (fechadas no brainstorming)

1. **Importação alimenta METAS de KPIs** (não agrega dados crus). O gestor define
   o KPI no CRUD; a planilha traz metas/valores por período. O wizard mapeia
   coluna→KPI e colunas→períodos.
2. **Origem do realizado:** `crm` | `manual` | `planilha` (espelha `source` de goals).
3. **Coexistência (seed):** os 6 KPIs nativos viram linhas em `dashboard_kpis`
   (`source='crm'`, `metric_key` apontando para a métrica nativa), marcados
   `is_system=true` (não excluíveis). Funil/fontes/faixas permanecem blocos fixos.
4. **Junção config+realizado no servidor:** `server/kpis` lê a config, calcula o
   realizado dos `crm`, anexa meta/realizado dos `manual`/`planilha`, aplica
   ordem/visibilidade e devolve o `KpisOverview` estendido. Fonte única, 1 round-trip.
   O fallback client-side (`supabaseKpisService`) recebe a **mesma** junção (lendo
   as tabelas via Supabase), para não divergir do servidor em rollback/offline.
5. **Realizado por período:** `manual`/`planilha` guardam realizado **por período**
   (tabela `kpi_values` espelhando `kpi_targets`), para acompanhar a navegação de mês.
6. **Versionamento de importação** (`kpi_import_batches`): cada importação registra
   quem/quando/arquivo/mapeamento; linhas importadas carregam `batch_id` → import
   auditável e revertível.
7. **Dry-run:** o passo de persistência aceita `dryRun`; nesse modo o mapeador
   devolve o plano (criações/atualizações/conflitos/ignoradas) **sem tocar o banco**.

---

## 4. Arquitetura

```
dashboard_kpis (definição + exibição) ──┐
kpi_targets    (meta por período)       │  config
kpi_values     (realizado por período)  │
kpi_import_batches (versão de import)   │
dashboard_kpi_history (auditoria)       │
                                        ▼
            server/kpis  (PONTO DE JUNÇÃO — estende buildOverview)
            lê config + calcula realizado(crm) + anexa meta/realizado
            (manual/planilha) + ordena/filtra → KpisOverview estendido
                                        │
                                        ▼
   features/kpis (aba atual)            features/kpis/admin (novo)
   renderiza lista configurável         - KpiAdminPage (CRUD, reorder dnd-kit,
   + blocos fixos (funil/fontes/faixas)   toggles visibilidade/destaque)
                                        - import/ (wizard 5 passos = padrão
                                          de passos local + motor genérico)
```

Quatro fronteiras, responsabilidade única cada:

- **`features/kpis/domain/`** — entidade `DashboardKpi`, tipos, validação por origem
  (strategy `crm`/`manual`/`planilha`). Puro, testável. Espelha `metas/domain`.
- **`features/kpis/admin/services/kpiAdminService.ts`** — CRUD Supabase isolado por
  tenant + histórico. Copia o molde de `goalsService.ts`.
- **`features/kpis/admin/import/`** — wizard (UI passos) + `targetMappingService`
  (puro) + `kpiImportService` (persist/dry-run). Motor = pipeline genérico existente.
- **`server/kpis`** — junção config↔realizado no `buildOverview`.

---

## 5. Modelo de dados

Todas as tabelas espelham o padrão de `goals` (RLS, índices `tenant_id`-leading,
trigger `updated_at`). DDL completo no plano de implementação; resumo:

### `dashboard_kpis` — definição + configuração de exibição
`id, tenant_id→tenants, name, description, category_id (texto livre, default 'geral'),
unit ('count'|'currency'|'percent'), source ('crm'|'manual'|'planilha'),
metric_key (TEXT, NULL exceto crm — aponta p/ catálogo de server/kpis),
status ('active'|'inactive'), is_visible BOOL, is_featured BOOL, display_order INT,
is_system BOOL (nativos seedados: não excluíveis), config JSONB, created_at, updated_at`.
Índices: `(tenant_id, display_order)`, `(tenant_id, status)`.

### `kpi_targets` — meta por período (o que o import alimenta)
`id, kpi_id→dashboard_kpis (ON DELETE CASCADE), tenant_id, period_type
('month'|'quarter'|'year'), period_start DATE, target_value NUMERIC,
source ('manual'|'import'), batch_id→kpi_import_batches (NULL p/ manual),
created_at, updated_at`.
**`UNIQUE (kpi_id, period_type, period_start)`** → upsert idempotente do import.
Índice: `(tenant_id, kpi_id, period_type, period_start)`.

### `kpi_values` — realizado por período (manual/planilha)
Forma idêntica a `kpi_targets` (`value` no lugar de `target_value`). Mantém realizado
e meta simétricos; o import alimenta os dois pela mesma mecânica. KPIs `crm` não usam
esta tabela (realizado vem calculado).

### `kpi_import_batches` — versão de importação (auditoria)
`id, tenant_id, kpi_id (NULL se múltiplos), nome_arquivo, sheet_name,
mapping JSONB (mapeamento resolvido), rows_created INT, rows_updated INT,
rows_ignored INT, imported_by UUID, imported_by_name TEXT, created_at`.
Responde quem/quando/o quê. Deletar batch → cascade remove `kpi_targets`/`kpi_values`
daquela importação (reversão).

### `dashboard_kpi_history` — auditoria leve (igual `goal_history`)
`id, kpi_id, tenant_id, changed_by_name, change_type, summary, created_at`.

### RLS (espelha `goals`)
- **Leitura:** qualquer membro do tenant (+ owner da plataforma).
- **Escrita (CRUD + import):** `admin`/`team_leader`/`owner` (+ owner da plataforma).

### Seed dos nativos
Migration insere os 6 KPIs nativos por tenant existente (e default p/ novos):
`totalLeads, vendas, valorVendas, imoveisAtivos, tempoMedioResposta, taxaAtendimento`,
todos `source='crm'`, `is_system=true`, `metric_key` = a chave atual. `display_order`
preserva a ordem de hoje.

---

## 6. Wizard de Importação (5 passos)

Padrão de passos local (state `step` + shadcn `Card`/`Button`), **não** framework novo.
Motor = pipeline genérico existente.

| Passo | Faz | Implementação |
|---|---|---|
| 1. Upload | drag/drop xlsx/csv | `GenericImportService.readGenericTable` (reuso) |
| 2. Análise | detecta abas/cabeçalhos/tipos | `schemalessParser` + `metadataDiscovery` (reuso) |
| 3. Preview | KPIs/valores/metas detectados + inconsistências | `metadataDiscovery` (stats/distinct/amostra) |
| 4. Mapeamento | coluna→KPI, colunas→períodos, vincular existente/criar novo, ignorar | **novo:** `targetMappingService` (puro) |
| 5. Importação | **dry-run** mostra o plano; persiste só após confirmar | **novo:** `kpiImportService.persist({dryRun})` |

**`targetMappingService` (único domínio novo, ~120 linhas, puro):** recebe
`GenericTable` + `ColumnMetadata[]` + escolhas do gestor → produz linhas de
`kpi_targets`/`kpi_values`. Estratégias **configuráveis** de normalização de nome de
KPI e de detecção de período por cabeçalho (`Jan`, `01/2026`, serial Excel) — nunca
por índice fixo. **Sugere** mapeamento (coluna textual de baixa cardinalidade = nome
do KPI; cabeçalhos tipo data = período); o gestor confirma.

**Dry-run:** `persist({dryRun:true})` roda o mapeador e devolve
`{ creates, updates, conflicts, ignored }` sem escrever. O passo 5 renderiza esse
plano; só `dryRun:false` grava (criando um `kpi_import_batches` + upsert nas tabelas).

---

## 7. Dashboard configurável

A aba KPIs renderiza a lista do `KpisOverview` estendido (já ordenada/filtrada pelo
servidor). Gestão na `KpiAdminPage`:

- **Reordenar:** `@dnd-kit/sortable` seguindo o padrão de `FotosUploader`
  (`verticalListSortingStrategy`). Persiste `display_order`.
- **Ocultar/Destacar/Ativar:** toggles → `is_visible`/`is_featured`/`status`
  (mecânica de `setFeaturedGoal`).
- **Agrupar por categoria:** `category_id` já no modelo; agrupamento é apresentação.

---

## 8. Segurança

- RLS espelha `goals`: leitura = membro do tenant; escrita = admin/team_leader/owner
  (+ owner da plataforma).
- `KpiAdminPage` guardada pela mesma checagem de role usada hoje. Corretor só visualiza
  a aba KPIs (sem botões de gestão).
- Servidor (`service_role`) deriva o tenant do JWT; cliente nunca escolhe tenant.
- Import valida tipo/tamanho do arquivo (`MAX_ROWS` já existe no pipeline genérico).

---

## 9. Testes

- **Unitários (vitest):** domínio `DashboardKpi` (validação por origem); mapeador
  (layouts variados: colunas fora de ordem, abas extras, meses diferentes, serial
  Excel, colunas faltando/extras); merge config↔realizado; dry-run plan.
- **Integração:** `kpiAdminService` CRUD (mock Supabase, como `metas`); `buildOverview`
  estendido (`server/kpis/*.test.js`).
- **Regressão:** snapshot do `KpisOverview` nativo **antes/depois** (os 6 cards
  seedados produzem os mesmos números); RLS (corretor não escreve).
- **E2E (Playwright MCP):** **criar config do Playwright (não existe)**. Fluxos:
  CRUD de KPI, reordenação, wizard completo (upload→preview→mapeamento→dry-run→persistir),
  permissão (corretor sem gestão), exibição no dashboard.

---

## 10. Trade-offs e riscos

| Risco | Mitigação |
|---|---|
| Tocar `server/kpis` pode regredir `/api/v1/kpis` | `buildOverview` já é puro/isolado; snapshot de regressão dos 6 nativos; seed preserva chaves/ordem. |
| Sem PG MCP → modelagem sem `EXPLAIN` live | Índices `tenant_id`-leading; overview faz ≤2 SELECTs extras por índice; merge em memória (sem N+1). Gate `EXPLAIN` pré-merge documentado. |
| Wizard é a maior superfície nova | Motor é reuso; novo de fato = mapeador (puro, testável) + UI de passos (padrão existente). |
| Dois lugares de "realizado" (server vs import) | Junção única no servidor; `crm`≠`manual`/`planilha` por `source`, sem ambiguidade. |
| Múltiplas empresas/histórico | `tenant_id` em tudo + `kpi_import_batches` + `dashboard_kpi_history`. |

---

## 11. Arquivos impactados (estimativa)

**Novos — banco:**
- `supabase/migrations/<ts>_create_dashboard_kpis.sql` (4 tabelas + RLS + trigger + seed)

**Novos — frontend (`src/features/kpis/`):**
- `domain/types.ts`, `domain/kpiModel.ts`, `domain/__tests__/*`
- `admin/services/kpiAdminService.ts` (+ teste)
- `admin/services/kpiTargetsService.ts` (+ teste)
- `admin/pages/KpiAdminPage.tsx`
- `admin/components/KpiFormDialog.tsx` (espelha `GoalFormDialog`)
- `admin/components/KpiList.tsx` (reorder dnd-kit — padrão `FotosUploader`)
- `admin/import/components/KpiImportWizard.tsx` (passos local)
- `admin/import/services/targetMappingService.ts` (puro, + teste)
- `admin/import/services/kpiImportService.ts` (persist/dry-run, + teste)

**Novos — servidor:**
- `server/kpis/kpisConfig.js` (fetch `dashboard_kpis`/`kpi_targets`/`kpi_values`)
- testes em `server/kpis/*.test.js`

**Modificados (mínimo):**
- `server/kpis/kpisCompute.js` — `buildOverview` mescla config + realizado
- `server/kpis/index.js` — adiciona fetchers ao `Promise.all`
- `src/features/kpis/services/supabaseKpisService.ts` — espelha a junção do servidor (fallback)
- `src/features/kpis/types.ts` — **`KpiSummaryCard.key` deixa de ser união fechada → vira `id: string`**
  (o KPI passa a ser identificado pelo registro); adiciona `target`/`source`/`displayOrder`/`progress`.
  ⚠️ Toca todos os consumidores do `key` fechado (revisar usos em `KpiComponents`/`RelatoriosPage`).
- `src/features/kpis/components/KpiComponents.tsx` — render de meta/progresso + lista dinâmica
- `src/features/kpis/pages/KpisPage.tsx` — botão "Gerenciar KPIs" → abre a `KpiAdminPage`
  (rota/aba dedicada, **padrão de `MetasPage`**; guardado por role)
- `src/types/permissions.ts` — (se necessário) capability de admin de KPIs
- roteamento da `KpiAdminPage` como página dedicada (padrão de `MetasPage`)
- `playwright.config.ts` (novo) + scripts de E2E

---

## 12. Pós-implementação (exigências do escopo)

1. Code Review Plugin sobre o diff.
2. Code Simplifier sobre o código novo.
3. Validações E2E via Playwright MCP.
4. Relatório final de validação (regressão dos nativos + cobertura dos fluxos).

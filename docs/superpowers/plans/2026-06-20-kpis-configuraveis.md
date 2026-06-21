# KPIs Configuráveis e Gerenciáveis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar os KPIs do Dashboard (hoje hardcoded) em entidades gerenciáveis por gestores — CRUD, ordem, ativar/desativar, importação de metas via Excel e metas por período — reusando ao máximo a arquitetura existente.

**Architecture:** Cinco tabelas novas espelhando o padrão de `goals` (`dashboard_kpis`, `kpi_targets`, `kpi_values`, `kpi_import_batches`, `dashboard_kpi_history`). O domínio puro (`features/kpis/domain/`) e o serviço de CRUD (`features/kpis/admin/`) copiam o molde de `metas/`. O wizard de import é uma camada fina sobre o pipeline genérico existente (`relatorios/import/generic/`). A junção config↔realizado acontece no servidor (`server/kpis/buildOverview`), mantendo a fonte única de verdade.

**Tech Stack:** React + TypeScript + Vite, Supabase (Postgres + RLS), Express (server/kpis), vitest, @dnd-kit (já instalado), xlsx (já instalado), TanStack Query, sonner, shadcn/ui.

## Global Constraints

- **Menor alteração possível + reuso máximo.** Não criar frameworks novos (wizard/stepper). Seguir padrões existentes (`metas/`, `relatorios/import/generic/`, `FotosUploader` para dnd-kit).
- **Não acoplar parser à planilha enviada.** Sem índices de coluna fixos; mapeamento por cabeçalho, normalização configurável.
- **Isolamento por tenant em TODA query.** RLS espelha `goals`: leitura = membro do tenant; escrita (CRUD + import) = `admin`/`team_leader`/`owner` (+ owner da plataforma `octo.inteligenciaimobiliaria@gmail.com`).
- **Proteção contra regressão:** os 6 KPIs nativos (`totalLeads`, `vendas`, `valorVendas`, `imoveisAtivos`, `tempoMedioResposta`, `taxaAtendimento`) continuam calculados em `server/kpis` e devem produzir os mesmos números. Seedados como `is_system=true` (não excluíveis).
- **NÃO COMMITAR (protocolo desta execução).** Os passos "Commit" em cada task são **NO-OP** — NÃO rodar `git commit`. Trabalhar em **branch isolada** (`feat/kpis-configuraveis`), sem squash; o progresso fica no working tree da branch + checkboxes. (Se algum dia commitar: NÃO adicionar `Co-Authored-By: Claude` — commits são do Victor.)
- **Gates por task (protocolo Victor):** ANTES de cada task, explicar objetivo + arquivos impactados + possíveis regressões. DEPOIS, mostrar testes executados + resultado do `/code-review` + resultado do `code-simplifier`, e **aguardar aprovação** antes da próxima.
- **Path alias `@/` → `src/`.** Usar em todo import interno.
- **Comandos:** TODOS os testes (front E server) rodam sob **vitest** via `npm run test:run -- <caminho>`. Os testes do servidor (`server/kpis/*.test.js`) usam `import { describe, it, expect } from 'vitest'` (o `vite.config.ts` inclui `server/`). NÃO usar `node --test` (quebra: os arquivos importam vitest). Snapshot = `expect(x).toMatchSnapshot()` (vitest), NÃO `t.assert.snapshot`. Lint: `npm run lint`.
- **Realizado é por período** para `manual`/`planilha` (tabela `kpi_values`), acompanhando a navegação de mês. KPIs `crm` têm realizado calculado, não persistido.

---

## File Structure

**Banco (novo):**
- `supabase/migrations/20260620_create_dashboard_kpis.sql` — 5 tabelas + RLS + trigger + seed dos nativos.

**Domínio puro (novo) — `src/features/kpis/domain/`:**
- `kpiTypes.ts` — `DashboardKpi`, `DashboardKpiDraft`, `KpiSource`, `KpiUnit`, `KpiPeriodType`, `KpiTarget`, `KpiValue`, `NATIVE_METRIC_KEYS`.
- `kpiModel.ts` — `validateKpiDraft`, `resolveProgress`, registry de origem (`crm`/`manual`/`planilha`).
- `kpiFactory.ts` — `createEmptyKpiDraft`, `kpiToDraft`.
- `periods.ts` — `periodKey`, `quarterStart`, `yearStart`, `normalizePeriodStart` (deriva 1º dia do período).
- `__tests__/kpiModel.test.ts`, `__tests__/periods.test.ts`.

**Import (novo) — `src/features/kpis/admin/import/`:**
- `targetMapping.ts` — puro: `suggestMapping`, `buildImportPlan` (dry-run plan). Reusa `GenericTable`/`ColumnMetadata`.
- `excelSerial.ts` — `excelSerialToDate`, `parsePeriodHeader` (Jan, 01/2026, serial).
- `__tests__/targetMapping.test.ts`, `__tests__/excelSerial.test.ts`.

**Serviços de dados (novo) — `src/features/kpis/admin/services/`:**
- `kpiAdminService.ts` — CRUD `dashboard_kpis` + histórico (molde `goalsService`).
- `kpiTargetsService.ts` — leitura/escrita `kpi_targets` + `kpi_values`.
- `kpiImportService.ts` — `persistImport({ dryRun })` → grava batch + upsert.

**UI (novo) — `src/features/kpis/admin/`:**
- `pages/KpiAdminPage.tsx` — página dedicada (padrão `MetasPage`).
- `components/KpiFormDialog.tsx` — criar/editar (molde `GoalFormDialog`).
- `components/KpiList.tsx` — lista + reorder dnd-kit (padrão `FotosUploader`).
- `components/KpiImportWizard.tsx` — passos local (padrão `Importar16PersonalitiesPage`).
- `hooks/useKpiAdmin.ts` — React Query do CRUD.

**Servidor (modificado):**
- `server/kpis/kpisConfig.js` (novo) — `fetchDashboardKpis`, `fetchKpiTargets`, `fetchKpiValues`.
- `server/kpis/kpisCompute.js` (mod) — `buildOverview` mescla config + realizado.
- `server/kpis/index.js` (mod) — adiciona fetchers ao `Promise.all`.
- `server/kpis/kpisConfig.test.js`, `server/kpis/kpisCompute.test.js` (mod).

**Contrato + UI atual (modificado):**
- `src/features/kpis/types.ts` — `KpiSummaryCard.key` (união fechada) → `id: string` + `target`/`source`/`displayOrder`/`progress`.
- `src/features/kpis/components/KpiComponents.tsx` — render meta/progresso + lista dinâmica.
- `src/features/kpis/services/supabaseKpisService.ts` — espelha junção (fallback).
- `src/features/kpis/pages/KpisPage.tsx` — botão "Gerenciar KPIs" (guardado por role).

**E2E (novo):**
- `playwright.config.ts`, `e2e/kpis.spec.ts`.

**Sequenciamento:** DB → domínio/períodos → import puro → serviços → servidor (junção) → contrato+UI → admin UI → wizard UI → E2E. Cada fase entrega software testável.

---

### Task 1: Migration — 5 tabelas, RLS, seed dos nativos

**Files:**
- Create: `supabase/migrations/20260620_create_dashboard_kpis.sql`

**Interfaces:**
- Consumes: tabelas existentes `public.tenants(id)`, `public.tenant_memberships(tenant_id, user_id, role)`.
- Produces: tabelas `dashboard_kpis`, `kpi_targets`, `kpi_values`, `kpi_import_batches`, `dashboard_kpi_history`. Colunas/constraints abaixo são contrato para todas as tasks seguintes.

- [ ] **Step 1: Escrever a migration completa**

```sql
-- ============================================================
-- MIGRATION: KPIs configuráveis do Dashboard
-- Espelha o padrão de `goals`: multi-tenant + RLS + trigger updated_at.
-- `dashboard_kpis` = definição + exibição. `kpi_targets`/`kpi_values` =
-- meta/realizado POR PERÍODO (linhas, não colunas por mês → suporta períodos
-- novos sem migração). `kpi_import_batches` = versão/auditoria de importação.
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- dashboard_kpis ----------
CREATE TABLE IF NOT EXISTS public.dashboard_kpis (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  category_id   TEXT NOT NULL DEFAULT 'geral',
  unit          TEXT NOT NULL DEFAULT 'count' CHECK (unit IN ('count','currency','percent')),
  source        TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('crm','manual','planilha')),
  metric_key    TEXT,  -- só p/ source='crm': aponta p/ catálogo de server/kpis
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  is_visible    BOOLEAN NOT NULL DEFAULT true,
  is_featured   BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_system     BOOLEAN NOT NULL DEFAULT false,
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Integridade da origem: crm exige metric_key; manual/planilha não usam.
  CONSTRAINT dashboard_kpis_metric_key_ck CHECK (
    (source = 'crm' AND metric_key IS NOT NULL)
    OR (source <> 'crm' AND metric_key IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_dashboard_kpis_tenant_order  ON public.dashboard_kpis(tenant_id, display_order);
CREATE INDEX IF NOT EXISTS idx_dashboard_kpis_tenant_status ON public.dashboard_kpis(tenant_id, status);

-- ---------- kpi_import_batches (referenciada por targets/values) ----------
CREATE TABLE IF NOT EXISTS public.kpi_import_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome_arquivo    TEXT,
  sheet_name      TEXT,
  mapping         JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Interpretação gerada no Preview (auditabilidade): colunas detectadas,
  -- tipos inferidos, períodos reconhecidos e avisos — o "porquê" do que foi
  -- importado, congelado no momento da importação.
  preview         JSONB NOT NULL DEFAULT '{}'::jsonb,
  rows_created    INTEGER NOT NULL DEFAULT 0,
  rows_updated    INTEGER NOT NULL DEFAULT 0,
  rows_ignored    INTEGER NOT NULL DEFAULT 0,
  imported_by      UUID,
  imported_by_name TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kpi_import_batches_tenant ON public.kpi_import_batches(tenant_id, created_at DESC);

-- ---------- kpi_targets (meta por período) ----------
CREATE TABLE IF NOT EXISTS public.kpi_targets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id       UUID NOT NULL REFERENCES public.dashboard_kpis(id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_type  TEXT NOT NULL CHECK (period_type IN ('month','quarter','year')),
  period_start DATE NOT NULL,
  target_value NUMERIC NOT NULL DEFAULT 0,
  source       TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import')),
  batch_id     UUID REFERENCES public.kpi_import_batches(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kpi_id, period_type, period_start)
);
CREATE INDEX IF NOT EXISTS idx_kpi_targets_lookup ON public.kpi_targets(tenant_id, kpi_id, period_type, period_start);

-- ---------- kpi_values (realizado por período: manual/planilha) ----------
CREATE TABLE IF NOT EXISTS public.kpi_values (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id       UUID NOT NULL REFERENCES public.dashboard_kpis(id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_type  TEXT NOT NULL CHECK (period_type IN ('month','quarter','year')),
  period_start DATE NOT NULL,
  value        NUMERIC NOT NULL DEFAULT 0,
  source       TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import')),
  batch_id     UUID REFERENCES public.kpi_import_batches(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kpi_id, period_type, period_start)
);
CREATE INDEX IF NOT EXISTS idx_kpi_values_lookup ON public.kpi_values(tenant_id, kpi_id, period_type, period_start);

-- ---------- dashboard_kpi_history (auditoria leve, igual goal_history) ----------
CREATE TABLE IF NOT EXISTS public.dashboard_kpi_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id          UUID NOT NULL REFERENCES public.dashboard_kpis(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  changed_by_name TEXT NOT NULL DEFAULT '',
  change_type     TEXT NOT NULL,
  summary         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dashboard_kpi_history_kpi ON public.dashboard_kpi_history(kpi_id, created_at DESC);

-- ============================================================ RLS
-- Helper inline: membro do tenant; escrita exige role de gestão.
-- ============================================================
ALTER TABLE public.dashboard_kpis        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_targets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_values            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_import_batches    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_kpi_history ENABLE ROW LEVEL SECURITY;

-- dashboard_kpis: SELECT membro; INSERT/UPDATE/DELETE gestão.
-- DROP ... IF EXISTS antes de cada CREATE → migration RE-EXECUTÁVEL (CREATE POLICY
-- não tem "IF NOT EXISTS"; sem o drop, re-rodar dá ERRO 42710 "policy already exists").
DROP POLICY IF EXISTS "dk_select" ON public.dashboard_kpis;
CREATE POLICY "dk_select" ON public.dashboard_kpis FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
  OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com');
DROP POLICY IF EXISTS "dk_insert" ON public.dashboard_kpis;
CREATE POLICY "dk_insert" ON public.dashboard_kpis FOR INSERT WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
  OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com');
DROP POLICY IF EXISTS "dk_update" ON public.dashboard_kpis;
CREATE POLICY "dk_update" ON public.dashboard_kpis FOR UPDATE USING (
  tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
  OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com')
WITH CHECK (
  -- Sem WITH CHECK, um UPDATE poderia mover a linha para outro tenant (cross-tenant leak).
  tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
  OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com');
DROP POLICY IF EXISTS "dk_delete" ON public.dashboard_kpis;
CREATE POLICY "dk_delete" ON public.dashboard_kpis FOR DELETE USING (
  tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
  OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com');

-- Macro pelas demais tabelas (mesmo critério): aplica via DO block.
-- (DROP+CREATE em um EXECUTE sem USING é válido — múltiplos statements no SPI simples.)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['kpi_targets','kpi_values','kpi_import_batches','dashboard_kpi_history'] LOOP
    EXECUTE format($f$
      DROP POLICY IF EXISTS "%1$s_select" ON public.%1$s;
      CREATE POLICY "%1$s_select" ON public.%1$s FOR SELECT USING (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
        OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com');
      DROP POLICY IF EXISTS "%1$s_write" ON public.%1$s;
      CREATE POLICY "%1$s_write" ON public.%1$s FOR ALL USING (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
        OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com')
      WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
        OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com');
    $f$, t);
  END LOOP;
END $$;

-- ---------- trigger updated_at (reusa função se já existir) ----------
CREATE OR REPLACE FUNCTION public.update_dashboard_kpis_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_dashboard_kpis_updated_at ON public.dashboard_kpis;
CREATE TRIGGER trg_dashboard_kpis_updated_at BEFORE UPDATE ON public.dashboard_kpis
  FOR EACH ROW EXECUTE FUNCTION public.update_dashboard_kpis_updated_at();
DROP TRIGGER IF EXISTS trg_kpi_targets_updated_at ON public.kpi_targets;
CREATE TRIGGER trg_kpi_targets_updated_at BEFORE UPDATE ON public.kpi_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_dashboard_kpis_updated_at();
DROP TRIGGER IF EXISTS trg_kpi_values_updated_at ON public.kpi_values;
CREATE TRIGGER trg_kpi_values_updated_at BEFORE UPDATE ON public.kpi_values
  FOR EACH ROW EXECUTE FUNCTION public.update_dashboard_kpis_updated_at();

-- ============================================================ SEED nativos
-- Insere os 6 KPIs nativos por tenant (idempotente via NOT EXISTS por metric_key).
-- source='crm' + is_system=true (não excluíveis). display_order preserva a ordem atual.
-- ============================================================
INSERT INTO public.dashboard_kpis (tenant_id, name, description, category_id, unit, source, metric_key, is_system, display_order)
SELECT te.id, v.name, '', 'comercial', v.unit, 'crm', v.metric_key, true, v.ord
FROM public.tenants te
CROSS JOIN (VALUES
  ('Total de Leads',            'count',    'totalLeads',         0),
  ('Vendas',                    'count',    'vendas',             1),
  ('Valor em Vendas',           'currency', 'valorVendas',        2),
  ('Imóveis Ativos',            'count',    'imoveisAtivos',      3),
  ('Tempo Médio de Resposta',   'count',    'tempoMedioResposta', 4),
  ('Taxa de Atendimento',       'percent',  'taxaAtendimento',    5)
) AS v(name, unit, metric_key, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM public.dashboard_kpis dk
  WHERE dk.tenant_id = te.id AND dk.metric_key = v.metric_key
);

COMMENT ON TABLE public.dashboard_kpis IS 'KPIs configuráveis do Dashboard por tenant. source crm|manual|planilha; metric_key aponta p/ catálogo de server/kpis quando crm.';
COMMENT ON TABLE public.kpi_targets IS 'Meta por período (month|quarter|year). UNIQUE(kpi_id,period_type,period_start) → upsert idempotente do import.';
COMMENT ON TABLE public.kpi_import_batches IS 'Versão/auditoria de importação: quem/quando/arquivo/mapeamento. Reverter = deletar o batch.';
```

- [ ] **Step 2: Validar a sintaxe do SQL localmente**

Run: `grep -c "CREATE TABLE" supabase/migrations/20260620_create_dashboard_kpis.sql`
Expected: `5`

> **Aplicação real:** a migration roda no Supabase do projeto. Como NÃO há PostgreSQL MCP nesta sessão, a aplicação e o `EXPLAIN` dos índices ficam como gate manual (ver "Validação de BD" no fim do plano). Não inventar resultado de query.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260620_create_dashboard_kpis.sql
git commit -m "feat(kpis): migration de KPIs configuráveis (5 tabelas, RLS, seed dos nativos)"
```

---

### Task 2: Domínio — períodos (month/quarter/year)

**Files:**
- Create: `src/features/kpis/domain/periods.ts`
- Test: `src/features/kpis/domain/__tests__/periods.test.ts`

**Interfaces:**
- Produces:
  - `type KpiPeriodType = 'month' | 'quarter' | 'year'`
  - `normalizePeriodStart(isoDate: string, type: KpiPeriodType): string` — devolve o 1º dia do período (YYYY-MM-DD) que contém `isoDate`.
  - `periodKey(type: KpiPeriodType, periodStart: string): string` — chave estável `"<type>:<periodStart>"`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { normalizePeriodStart, periodKey, type KpiPeriodType } from '../periods';

describe('normalizePeriodStart', () => {
  it('mês: zera para o dia 1', () => {
    expect(normalizePeriodStart('2026-06-20', 'month')).toBe('2026-06-01');
  });
  it('trimestre: volta para o 1º dia do trimestre', () => {
    expect(normalizePeriodStart('2026-05-15', 'quarter')).toBe('2026-04-01'); // Q2
    expect(normalizePeriodStart('2026-01-31', 'quarter')).toBe('2026-01-01'); // Q1
    expect(normalizePeriodStart('2026-12-01', 'quarter')).toBe('2026-10-01'); // Q4
  });
  it('ano: 1º de janeiro', () => {
    expect(normalizePeriodStart('2026-08-09', 'year')).toBe('2026-01-01');
  });
});

describe('periodKey', () => {
  it('compõe chave estável', () => {
    expect(periodKey('month', '2026-06-01')).toBe('month:2026-06-01');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/kpis/domain/__tests__/periods.test.ts`
Expected: FAIL — `Cannot find module '../periods'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * Cálculo de períodos para metas/realizado de KPIs.
 *
 * Puro e sem dependências: opera sobre strings ISO 'YYYY-MM-DD' e nunca
 * cria datas a partir do "agora" (determinístico/testável). O 1º dia do
 * período é a CHAVE de identidade usada nas tabelas kpi_targets/kpi_values.
 */
export type KpiPeriodType = 'month' | 'quarter' | 'year';

/** Devolve o 1º dia (YYYY-MM-DD) do período do tipo dado que contém `isoDate`. */
export function normalizePeriodStart(isoDate: string, type: KpiPeriodType): string {
  const [y, m] = isoDate.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (type === 'year') return `${y}-01-01`;
  if (type === 'quarter') {
    const firstMonth = Math.floor((m - 1) / 3) * 3 + 1; // 1,4,7,10
    return `${y}-${pad(firstMonth)}-01`;
  }
  return `${y}-${pad(m)}-01`;
}

/** Chave estável de um período (para indexar metas/realizado em memória). */
export function periodKey(type: KpiPeriodType, periodStart: string): string {
  return `${type}:${periodStart}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/features/kpis/domain/__tests__/periods.test.ts`
Expected: PASS (5 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/features/kpis/domain/periods.ts src/features/kpis/domain/__tests__/periods.test.ts
git commit -m "feat(kpis): cálculo de períodos (month/quarter/year) para metas"
```

---

### Task 3: Domínio — tipos + validação + progresso do KPI

**Files:**
- Create: `src/features/kpis/domain/kpiTypes.ts`
- Create: `src/features/kpis/domain/kpiModel.ts`
- Create: `src/features/kpis/domain/kpiFactory.ts`
- Test: `src/features/kpis/domain/__tests__/kpiModel.test.ts`

**Interfaces:**
- Consumes: `KpiPeriodType` de `./periods` (Task 2).
- Produces:
  - `kpiTypes.ts`:
    - `type KpiSource = 'crm' | 'manual' | 'planilha'`
    - `type KpiUnit = 'count' | 'currency' | 'percent'`
    - `type KpiStatus = 'active' | 'inactive'`
    - `const NATIVE_METRIC_KEYS = ['totalLeads','vendas','valorVendas','imoveisAtivos','tempoMedioResposta','taxaAtendimento'] as const`
    - `interface DashboardKpi { id; tenantId; name; description; categoryId; unit: KpiUnit; source: KpiSource; metricKey: string | null; status: KpiStatus; isVisible: boolean; isFeatured: boolean; displayOrder: number; isSystem: boolean; config: Record<string, unknown>; createdAt: string; updatedAt: string }`
    - `type DashboardKpiDraft = Omit<DashboardKpi, 'id' | 'tenantId' | 'isFeatured' | 'isSystem' | 'createdAt' | 'updatedAt'>`
    - `interface KpiTarget { id; kpiId; tenantId; periodType: KpiPeriodType; periodStart: string; targetValue: number; source: 'manual' | 'import'; batchId: string | null }`
    - `interface KpiValue { id; kpiId; tenantId; periodType: KpiPeriodType; periodStart: string; value: number; source: 'manual' | 'import'; batchId: string | null }`
  - `kpiModel.ts`:
    - `validateKpiDraft(draft: DashboardKpiDraft): string[]` — retorna mensagens de erro (vazio = válido).
    - `resolveProgress(target: number | null, realized: number | null): { percent: number; rawPercent: number }` — clamp 0–100 em `percent`, bruto em `rawPercent`; `target<=0` ou nulo → `{percent:0, rawPercent:0}`.
  - `kpiFactory.ts`:
    - `createEmptyKpiDraft(): DashboardKpiDraft`
    - `kpiToDraft(kpi: DashboardKpi): DashboardKpiDraft`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { validateKpiDraft, resolveProgress } from '../kpiModel';
import { createEmptyKpiDraft, kpiToDraft } from '../kpiFactory';
import type { DashboardKpi, DashboardKpiDraft } from '../kpiTypes';

function makeDraft(over: Partial<DashboardKpiDraft> = {}): DashboardKpiDraft {
  return { ...createEmptyKpiDraft(), ...over };
}

describe('validateKpiDraft', () => {
  it('exige nome', () => {
    expect(validateKpiDraft(makeDraft({ name: '' }))).toContain('Nome é obrigatório.');
  });
  it('crm exige metricKey de catálogo conhecido', () => {
    expect(validateKpiDraft(makeDraft({ source: 'crm', metricKey: null }))).toContain('KPI do CRM exige uma métrica de origem.');
    expect(validateKpiDraft(makeDraft({ source: 'crm', metricKey: 'inexistente' }))).toContain('Métrica de origem desconhecida.');
    expect(validateKpiDraft(makeDraft({ name: 'X', source: 'crm', metricKey: 'vendas' }))).toEqual([]);
  });
  it('manual/planilha NÃO podem ter metricKey', () => {
    expect(validateKpiDraft(makeDraft({ name: 'X', source: 'manual', metricKey: 'vendas' }))).toContain('Apenas KPIs do CRM usam métrica de origem.');
  });
  it('rascunho padrão (manual, sem metricKey) com nome é válido', () => {
    expect(validateKpiDraft(makeDraft({ name: 'Meu KPI' }))).toEqual([]);
  });
});

describe('resolveProgress', () => {
  it('calcula percentual e clampa em 100', () => {
    expect(resolveProgress(100, 50)).toEqual({ percent: 50, rawPercent: 50 });
    expect(resolveProgress(100, 150)).toEqual({ percent: 100, rawPercent: 150 });
  });
  it('alvo nulo/zero → zero', () => {
    expect(resolveProgress(null, 50)).toEqual({ percent: 0, rawPercent: 0 });
    expect(resolveProgress(0, 50)).toEqual({ percent: 0, rawPercent: 0 });
  });
});

describe('kpiToDraft', () => {
  it('descarta campos não-editáveis', () => {
    const kpi: DashboardKpi = {
      id: 'k1', tenantId: 't1', name: 'A', description: '', categoryId: 'geral',
      unit: 'count', source: 'manual', metricKey: null, status: 'active',
      isVisible: true, isFeatured: true, displayOrder: 3, isSystem: true,
      config: {}, createdAt: 'x', updatedAt: 'y',
    };
    const draft = kpiToDraft(kpi);
    expect('id' in draft).toBe(false);
    expect('isSystem' in draft).toBe(false);
    expect(draft.name).toBe('A');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/kpis/domain/__tests__/kpiModel.test.ts`
Expected: FAIL — módulos não encontrados.

- [ ] **Step 3: Write `kpiTypes.ts`**

```typescript
/**
 * Tipos de domínio dos KPIs configuráveis.
 *
 * Espelha a separação de `metas`: campos comuns à entidade + `config` JSONB
 * para extensão futura. `source` define a ORIGEM do realizado:
 *   - 'crm'      → calculado pelo servidor (metricKey aponta p/ o catálogo).
 *   - 'manual'   → digitado pelo gestor (kpi_values, por período).
 *   - 'planilha' → importado de Excel (kpi_values, por período).
 */
import type { KpiPeriodType } from './periods';

export type KpiSource = 'crm' | 'manual' | 'planilha';
export type KpiUnit = 'count' | 'currency' | 'percent';
export type KpiStatus = 'active' | 'inactive';

/** Métricas nativas que o servidor sabe calcular (catálogo fechado p/ crm). */
export const NATIVE_METRIC_KEYS = [
  'totalLeads', 'vendas', 'valorVendas', 'imoveisAtivos', 'tempoMedioResposta', 'taxaAtendimento',
] as const;
export type NativeMetricKey = (typeof NATIVE_METRIC_KEYS)[number];

export interface DashboardKpi {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  categoryId: string;
  unit: KpiUnit;
  source: KpiSource;
  /** Só preenchido quando source='crm'. */
  metricKey: string | null;
  status: KpiStatus;
  isVisible: boolean;
  isFeatured: boolean;
  displayOrder: number;
  /** Nativos seedados: não excluíveis. */
  isSystem: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Campos editáveis no formulário. isFeatured/isSystem têm ações próprias. */
export type DashboardKpiDraft = Omit<
  DashboardKpi, 'id' | 'tenantId' | 'isFeatured' | 'isSystem' | 'createdAt' | 'updatedAt'
>;

export interface KpiTarget {
  id: string;
  kpiId: string;
  tenantId: string;
  periodType: KpiPeriodType;
  periodStart: string;
  targetValue: number;
  source: 'manual' | 'import';
  batchId: string | null;
}

export interface KpiValue {
  id: string;
  kpiId: string;
  tenantId: string;
  periodType: KpiPeriodType;
  periodStart: string;
  value: number;
  source: 'manual' | 'import';
  batchId: string | null;
}
```

- [ ] **Step 4: Write `kpiModel.ts`**

```typescript
/**
 * Regras puras dos KPIs configuráveis: validação de rascunho e cálculo de
 * progresso. Sem React, sem Supabase — 100% testável (molde de metas/models).
 */
import { NATIVE_METRIC_KEYS } from './kpiTypes';
import type { DashboardKpiDraft } from './kpiTypes';

/** Valida um rascunho. Retorna mensagens de erro (vazio = válido). */
export function validateKpiDraft(draft: DashboardKpiDraft): string[] {
  const errors: string[] = [];
  if (!draft.name || draft.name.trim() === '') errors.push('Nome é obrigatório.');

  if (draft.source === 'crm') {
    if (!draft.metricKey) {
      errors.push('KPI do CRM exige uma métrica de origem.');
    } else if (!NATIVE_METRIC_KEYS.includes(draft.metricKey as never)) {
      errors.push('Métrica de origem desconhecida.');
    }
  } else if (draft.metricKey) {
    errors.push('Apenas KPIs do CRM usam métrica de origem.');
  }
  return errors;
}

/** Progresso de uma meta: percent clampeado 0–100; rawPercent bruto. */
export function resolveProgress(
  target: number | null,
  realized: number | null,
): { percent: number; rawPercent: number } {
  if (!target || target <= 0 || realized == null) return { percent: 0, rawPercent: 0 };
  const rawPercent = Math.round((realized / target) * 100 * 10) / 10;
  return { percent: Math.max(0, Math.min(100, rawPercent)), rawPercent };
}
```

- [ ] **Step 5: Write `kpiFactory.ts`**

```typescript
/** Fábricas de rascunho de KPI (valores-padrão num único lugar). */
import type { DashboardKpi, DashboardKpiDraft } from './kpiTypes';

export function createEmptyKpiDraft(): DashboardKpiDraft {
  return {
    name: '',
    description: '',
    categoryId: 'geral',
    unit: 'count',
    source: 'manual',
    metricKey: null,
    status: 'active',
    isVisible: true,
    displayOrder: 0,
    config: {},
  };
}

/** Extrai os campos editáveis de um KPI existente. */
export function kpiToDraft(kpi: DashboardKpi): DashboardKpiDraft {
  const { id, tenantId, isFeatured, isSystem, createdAt, updatedAt, ...draft } = kpi;
  return draft;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test:run -- src/features/kpis/domain/__tests__/kpiModel.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/kpis/domain/kpiTypes.ts src/features/kpis/domain/kpiModel.ts src/features/kpis/domain/kpiFactory.ts src/features/kpis/domain/__tests__/kpiModel.test.ts
git commit -m "feat(kpis): domínio de KPI configurável (tipos, validação, progresso)"
```

---

### Task 4: Import — serial Excel e parsing de cabeçalho de período

**Files:**
- Create: `src/features/kpis/admin/import/excelSerial.ts`
- Test: `src/features/kpis/admin/import/__tests__/excelSerial.test.ts`

**Interfaces:**
- Consumes: `KpiPeriodType` de `@/features/kpis/domain/periods`.
- Produces:
  - `excelSerialToDate(serial: number): string | null` — serial Excel (base 1899-12-30) → 'YYYY-MM-DD'. `null` se fora de faixa plausível.
  - `parsePeriodHeader(header: string): { type: KpiPeriodType; periodStart: string } | null` — reconhece `"Jan/2026"`, `"janeiro 2026"`, `"01/2026"`, `"2026-03"`, `"Q1 2026"`, `"2026"`, e serial numérico. `null` se não parece período.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { excelSerialToDate, parsePeriodHeader } from '../excelSerial';

describe('excelSerialToDate', () => {
  // Âncoras na fórmula CANÔNICA (offset 25569). Dois seriais reais + um redondo:
  // se alguém deslocar o offset p/ "encaixar" um valor, todos quebram.
  it('converte seriais conhecidos com a fórmula canônica', () => {
    expect(excelSerialToDate(45978)).toBe('2025-11-17');
    expect(excelSerialToDate(46081)).toBe('2026-02-28');
    expect(excelSerialToDate(45292)).toBe('2024-01-01');
  });
  it('rejeita valores implausíveis', () => {
    expect(excelSerialToDate(5)).toBeNull();
    expect(excelSerialToDate(999999)).toBeNull();
  });
});

describe('parsePeriodHeader', () => {
  it('mês por extenso e abreviado', () => {
    expect(parsePeriodHeader('Janeiro 2026')).toEqual({ type: 'month', periodStart: '2026-01-01' });
    expect(parsePeriodHeader('Jan/2026')).toEqual({ type: 'month', periodStart: '2026-01-01' });
    expect(parsePeriodHeader('fev 2026')).toEqual({ type: 'month', periodStart: '2026-02-01' });
  });
  it('mês numérico MM/AAAA e AAAA-MM', () => {
    expect(parsePeriodHeader('03/2026')).toEqual({ type: 'month', periodStart: '2026-03-01' });
    expect(parsePeriodHeader('2026-04')).toEqual({ type: 'month', periodStart: '2026-04-01' });
  });
  it('trimestre e ano', () => {
    expect(parsePeriodHeader('Q2 2026')).toEqual({ type: 'quarter', periodStart: '2026-04-01' });
    expect(parsePeriodHeader('2026')).toEqual({ type: 'year', periodStart: '2026-01-01' });
  });
  it('não-período → null', () => {
    expect(parsePeriodHeader('Corretor')).toBeNull();
    expect(parsePeriodHeader('E-MAIL')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/kpis/admin/import/__tests__/excelSerial.test.ts`
Expected: FAIL — `Cannot find module '../excelSerial'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * Reconhecimento de PERÍODOS em cabeçalhos de planilha (sem posições fixas).
 *
 * Datas em Excel costumam vir como "serial" (dias desde 1899-12-30). Cabeçalhos
 * de meta variam muito ("Jan/2026", "01/2026", "Q1 2026", "2026"). Estas funções
 * traduzem essas formas para { type, periodStart } — a base do mapeamento por
 * cabeçalho exigido pelo wizard. Puras e determinísticas.
 */
import type { KpiPeriodType } from '@/features/kpis/domain/periods';

const MONTHS: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
  janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Serial Excel → 'YYYY-MM-DD'. Faixa plausível: ~1990 a ~2100. */
export function excelSerialToDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 32874 || serial > 73415) return null;
  const ms = Math.round((serial - 25569) * 86400 * 1000); // 25569 = 1970-01-01 em serial
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Reconhece um cabeçalho de período; null se não parecer período. */
// NOTA (pós-implementação): assinatura real é `parsePeriodHeader(header, defaultYear?)`.
// `defaultYear` reconhece mês SEM ano ("Janeiro","Jan") — sem ele, esses cabeçalhos
// retornam null (e o import daria 0 KPIs). O ano é INJETADO (parser puro), nunca lido
// de Date aqui; a UI passa new Date().getFullYear() via suggestMapping(table, meta, year).
export function parsePeriodHeader(header: string): { type: KpiPeriodType; periodStart: string } | null {
  const raw = String(header ?? '').trim().toLowerCase();
  if (!raw) return null;

  // Serial numérico isolado (ex.: "45978" como cabeçalho de coluna de mês).
  if (/^\d{5}$/.test(raw)) {
    const iso = excelSerialToDate(Number(raw));
    if (iso) return { type: 'month', periodStart: `${iso.slice(0, 7)}-01` };
  }

  // Trimestre: exige marcador EXPLÍCITO 'q' (prefixo) ou 't' (sufixo) —
  // "Q1 2026", "q1/2026", "1T2026". Sem marcador, dígito+ano não é trimestre.
  const q = raw.match(/^q\s*([1-4])\s*[/ -]?\s*(\d{4})$|^([1-4])\s*t\s*(\d{4})$/);
  if (q) {
    const quarter = Number(q[1] ?? q[3]);
    const year = Number(q[2] ?? q[4]);
    return { type: 'quarter', periodStart: `${year}-${pad((quarter - 1) * 3 + 1)}-01` };
  }

  // Mês por nome: "jan 2026", "Janeiro/2026".
  const named = raw.match(/^([a-zç]+)[\s/._-]+(\d{4})$/);
  if (named && MONTHS[named[1]]) {
    return { type: 'month', periodStart: `${named[2]}-${pad(MONTHS[named[1]])}-01` };
  }

  // Mês numérico: "03/2026" | "2026-03" | "2026/03".
  const mmYyyy = raw.match(/^(\d{1,2})[\s/._-](\d{4})$/);
  if (mmYyyy && Number(mmYyyy[1]) >= 1 && Number(mmYyyy[1]) <= 12) {
    return { type: 'month', periodStart: `${mmYyyy[2]}-${pad(Number(mmYyyy[1]))}-01` };
  }
  const yyyyMm = raw.match(/^(\d{4})[\s/._-](\d{1,2})$/);
  if (yyyyMm && Number(yyyyMm[2]) >= 1 && Number(yyyyMm[2]) <= 12) {
    return { type: 'month', periodStart: `${yyyyMm[1]}-${pad(Number(yyyyMm[2]))}-01` };
  }

  // Ano isolado.
  if (/^\d{4}$/.test(raw)) return { type: 'year', periodStart: `${raw}-01-01` };

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/features/kpis/admin/import/__tests__/excelSerial.test.ts`
Expected: PASS. O offset `25569` é CANÔNICO e produz `45978→2025-11-17`, `46081→2026-02-28`, `45292→2024-01-01`. NÃO altere o offset para "encaixar" um valor — isso desloca todas as datas. Se algum teste falhar, o erro está no VALOR ESPERADO do teste (recalcule com a fórmula), não no offset.

- [ ] **Step 5: Commit**

```bash
git add src/features/kpis/admin/import/excelSerial.ts src/features/kpis/admin/import/__tests__/excelSerial.test.ts
git commit -m "feat(kpis): parsing de período por cabeçalho (serial Excel, MM/AAAA, trimestre)"
```

---

### Task 5: Import — mapeador (sugestão + plano de dry-run)

**Files:**
- Create: `src/features/kpis/admin/import/targetMapping.ts`
- Test: `src/features/kpis/admin/import/__tests__/targetMapping.test.ts`

**Interfaces:**
- Consumes: `GenericTable`, `ColumnMetadata` de `@/features/relatorios/import/generic/types`; `ColumnType` idem; `parsePeriodHeader` de `./excelSerial`; `parseNumeric` de `@/features/relatorios/import/generic/metadataDiscovery`; `KpiPeriodType` de `@/features/kpis/domain/periods`.
- Produces:
  - `interface ImportMapping { kpiNameColumn: string; periodColumns: Array<{ column: string; periodType: KpiPeriodType; periodStart: string }>; target: 'target' | 'value' }` — escolhas do gestor (qual coluna é o nome do KPI, quais colunas são períodos, e se a planilha traz meta ou realizado).
  - `suggestMapping(table: GenericTable, metadata: ColumnMetadata[]): ImportMapping` — heurística: nome do KPI = coluna `category`/`text` de MAIOR cardinalidade que não é período (a coluna de nomes tem ~1 valor por linha; notas são repetitivas); períodos = colunas cujo cabeçalho `parsePeriodHeader` reconhece. NOTA: `parsePeriodHeader` retorna `{type, periodStart}` — mapear `type`→`periodType` ao montar `periodColumns` (não usar spread direto).
  - `interface ImportPlanRow { kpiName: string; periodType: KpiPeriodType; periodStart: string; value: number }`
  - `interface ImportPlan { rows: ImportPlanRow[]; ignoredColumns: string[]; warnings: string[] }`
  - `buildImportPlan(table: GenericTable, mapping: ImportMapping): ImportPlan` — aplica o mapeamento → linhas (KPI × período × valor), ignorando células vazias/não-numéricas (com aviso).
  - `interface ImportPreview { sheetName: string; totalRows: number; columns: Array<{ name: string; label: string; type: ColumnType }>; detectedPeriods: Array<{ column: string; periodType: KpiPeriodType; periodStart: string }>; kpiNameColumn: string; ignoredColumns: string[]; warnings: string[] }` — a INTERPRETAÇÃO mostrada no Preview, serializável para auditoria (persistida no batch).
  - `buildPreview(table: GenericTable, metadata: ColumnMetadata[], mapping: ImportMapping, plan: ImportPlan): ImportPreview` — **puro**: congela o que o Preview exibiu (colunas+tipos detectados, períodos reconhecidos, coluna de KPI, colunas ignoradas, avisos).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { suggestMapping, buildImportPlan, buildPreview, type ImportMapping } from '../targetMapping';
import { parseGenericTable } from '@/features/relatorios/import/generic/schemalessParser';
import { discoverMetadata } from '@/features/relatorios/import/generic/metadataDiscovery';

// Planilha de metas: coluna "KPI" + colunas de mês (ordem arbitrária, coluna extra ignorável).
const matrix = [
  ['KPI', 'Observação', 'Jan/2026', 'Fev/2026'],
  ['Total de Leads', 'meta da diretoria', '100', '120'],
  ['Vendas', '', '10', '15'],
];

describe('suggestMapping', () => {
  it('sugere a coluna de nome do KPI e as colunas de período', () => {
    const table = parseGenericTable(matrix, 'Metas');
    const meta = discoverMetadata(table);
    const mapping = suggestMapping(table, meta);

    expect(mapping.kpiNameColumn).toBe('KPI');
    expect(mapping.periodColumns.map((p) => p.column)).toEqual(['Jan/2026', 'Fev/2026']);
    expect(mapping.periodColumns[0]).toMatchObject({ periodType: 'month', periodStart: '2026-01-01' });
  });
});

describe('buildImportPlan', () => {
  it('gera linhas KPI×período e ignora a coluna não mapeada', () => {
    const table = parseGenericTable(matrix, 'Metas');
    const mapping: ImportMapping = {
      kpiNameColumn: 'KPI',
      periodColumns: [
        { column: 'Jan/2026', periodType: 'month', periodStart: '2026-01-01' },
        { column: 'Fev/2026', periodType: 'month', periodStart: '2026-02-01' },
      ],
      target: 'target',
    };
    const plan = buildImportPlan(table, mapping);

    expect(plan.rows).toHaveLength(4); // 2 KPIs × 2 meses
    expect(plan.rows).toContainEqual({ kpiName: 'Total de Leads', periodType: 'month', periodStart: '2026-01-01', value: 100 });
    expect(plan.rows).toContainEqual({ kpiName: 'Vendas', periodType: 'month', periodStart: '2026-02-01', value: 15 });
    expect(plan.ignoredColumns).toContain('Observação');
  });

  it('ignora célula vazia/não-numérica com aviso, sem quebrar', () => {
    const m2 = [['KPI', 'Mar/2026'], ['Total de Leads', ''], ['Vendas', 'abc']];
    const table = parseGenericTable(m2, 'Metas');
    const mapping: ImportMapping = {
      kpiNameColumn: 'KPI',
      periodColumns: [{ column: 'Mar/2026', periodType: 'month', periodStart: '2026-03-01' }],
      target: 'target',
    };
    const plan = buildImportPlan(table, mapping);
    expect(plan.rows).toHaveLength(0);
    expect(plan.warnings.length).toBeGreaterThan(0);
  });
});

describe('buildPreview', () => {
  it('congela a interpretação (colunas/tipos, períodos, coluna de KPI, ignoradas)', () => {
    const table = parseGenericTable(matrix, 'Metas');
    const meta = discoverMetadata(table);
    const mapping = suggestMapping(table, meta);
    const plan = buildImportPlan(table, mapping);
    const preview = buildPreview(table, meta, mapping, plan);

    expect(preview.sheetName).toBe('Metas');
    expect(preview.kpiNameColumn).toBe('KPI');
    expect(preview.detectedPeriods.map((p) => p.column)).toEqual(['Jan/2026', 'Fev/2026']);
    expect(preview.columns.find((c) => c.name === 'KPI')).toBeTruthy();
    expect(preview.ignoredColumns).toContain('Observação');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/kpis/admin/import/__tests__/targetMapping.test.ts`
Expected: FAIL — `Cannot find module '../targetMapping'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * Mapeador de planilha → metas de KPI. PURO e CONFIGURÁVEL (sem índices fixos).
 *
 * O wizard usa `suggestMapping` para propor (gestor confirma/ajusta no passo 4)
 * e `buildImportPlan` para o dry-run (passo 5): produz exatamente as linhas que
 * seriam gravadas, sem tocar o banco. O nome do KPI é resolvido por TEXTO; a
 * vinculação a um KPI existente / criação acontece na persistência (Task 8).
 */
import type { GenericTable, ColumnMetadata } from '@/features/relatorios/import/generic/types';
import { parseNumeric } from '@/features/relatorios/import/generic/metadataDiscovery';
import { parsePeriodHeader } from './excelSerial';
import type { KpiPeriodType } from '@/features/kpis/domain/periods';

export interface ImportMapping {
  /** Coluna cujo valor é o NOME do KPI (uma linha por KPI). */
  kpiNameColumn: string;
  /** Colunas que representam períodos (cada uma vira metas daquele período). */
  periodColumns: Array<{ column: string; periodType: KpiPeriodType; periodStart: string }>;
  /** A planilha traz META ('target') ou REALIZADO ('value'). */
  target: 'target' | 'value';
}

export interface ImportPlanRow {
  kpiName: string;
  periodType: KpiPeriodType;
  periodStart: string;
  value: number;
}

export interface ImportPlan {
  rows: ImportPlanRow[];
  ignoredColumns: string[];
  warnings: string[];
}

/** Heurística de sugestão — apenas propõe; o gestor confirma. */
export function suggestMapping(table: GenericTable, metadata: ColumnMetadata[]): ImportMapping {
  const periodColumns: ImportMapping['periodColumns'] = [];
  for (const col of table.columns) {
    const parsed = parsePeriodHeader(col.label);
    // parsePeriodHeader devolve {type, periodStart}; periodColumns usa periodType.
    if (parsed) periodColumns.push({ column: col.name, periodType: parsed.type, periodStart: parsed.periodStart });
  }
  const periodNames = new Set(periodColumns.map((p) => p.column));

  // Nome do KPI: coluna textual/categórica de MAIOR cardinalidade que NÃO é período
  // (coluna de nomes tem ~1 valor por linha; notas/observação são repetitivas).
  const candidates = metadata
    .filter((m) => !periodNames.has(m.name))
    .filter((m) => m.type === 'category' || m.type === 'text')
    .sort((a, b) => b.distinctCount - a.distinctCount);
  const kpiNameColumn = candidates[0]?.name ?? table.columns[0]?.name ?? '';

  return { kpiNameColumn, periodColumns, target: 'target' };
}

/** Teto de warnings (o preview é persistido em JSONB; evita payload gigante). */
const MAX_WARNINGS = 50;

/** Aplica o mapeamento → linhas (KPI × período × valor). Dry-run friendly. */
export function buildImportPlan(table: GenericTable, mapping: ImportMapping): ImportPlan {
  const rows: ImportPlanRow[] = [];
  const warnings: string[] = [];
  const mappedNames = new Set<string>([mapping.kpiNameColumn, ...mapping.periodColumns.map((p) => p.column)]);
  const ignoredColumns = table.columns.map((c) => c.name).filter((n) => !mappedNames.has(n));

  let suppressed = 0;
  for (const row of table.rows) {
    const kpiName = String(row[mapping.kpiNameColumn] ?? '').trim();
    if (!kpiName) continue; // linha sem KPI não gera metas
    for (const pc of mapping.periodColumns) {
      const parsed = parseNumeric(row[pc.column]);
      if (parsed == null) {
        if (warnings.length < MAX_WARNINGS) {
          warnings.push(`"${kpiName}" / ${pc.column}: valor vazio ou não-numérico ignorado.`);
        } else {
          suppressed += 1;
        }
        continue;
      }
      rows.push({ kpiName, periodType: pc.periodType, periodStart: pc.periodStart, value: parsed });
    }
  }
  if (suppressed > 0) warnings.push(`… e mais ${suppressed} célula(s) vazia(s)/não-numérica(s) ignorada(s).`);
  return { rows, ignoredColumns, warnings };
}

/**
 * Congela a INTERPRETAÇÃO mostrada no Preview para auditoria (persistida no
 * batch). Puro e serializável: descreve "o que o sistema entendeu" da planilha.
 */
export function buildPreview(
  table: GenericTable,
  metadata: ColumnMetadata[],
  mapping: ImportMapping,
  plan: ImportPlan,
): ImportPreview {
  return {
    sheetName: table.sheetName,
    totalRows: table.totalRows,
    columns: metadata.map((m) => ({ name: m.name, label: m.label, type: m.type })),
    detectedPeriods: mapping.periodColumns,
    kpiNameColumn: mapping.kpiNameColumn,
    ignoredColumns: plan.ignoredColumns,
    warnings: plan.warnings,
  };
}
```

Adicionar o import de tipo no topo do arquivo (junto aos demais):

```typescript
import type { GenericTable, ColumnMetadata, ColumnType } from '@/features/relatorios/import/generic/types';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/features/kpis/admin/import/__tests__/targetMapping.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/kpis/admin/import/targetMapping.ts src/features/kpis/admin/import/__tests__/targetMapping.test.ts
git commit -m "feat(kpis): mapeador de planilha→metas (sugestão por cabeçalho + plano dry-run)"
```

---

### Task 6: Serviço de dados — CRUD de `dashboard_kpis` (+ histórico, + reorder)

**Files:**
- Create: `src/features/kpis/admin/services/kpiAdminService.ts`
- Test: `src/features/kpis/admin/services/__tests__/kpiAdminService.test.ts`

**Interfaces:**
- Consumes: `supabase` de `@/integrations/supabase/client`; `DashboardKpi`, `DashboardKpiDraft` de `@/features/kpis/domain/kpiTypes`.
- Produces (todas com isolamento por tenant, molde `goalsService`):
  - `fetchKpis(tenantId: string): Promise<DashboardKpi[]>` — ordenado por `display_order`.
  - `createKpi(draft: DashboardKpiDraft, ctx: { tenantId: string; actorName: string }): Promise<DashboardKpi>`
  - `updateKpi(id: string, draft: DashboardKpiDraft, ctx): Promise<DashboardKpi>`
  - `deleteKpi(id: string, tenantId: string): Promise<void>` — recusa se `is_system` (lança Error).
  - `reorderKpis(orderedIds: string[], tenantId: string): Promise<void>` — grava `display_order` = índice.
  - `setKpiVisibility(id, isVisible, tenantId): Promise<void>` e `setKpiStatus(id, status, tenantId)`.
  - `mapRowToKpi(row): DashboardKpi` (exportada p/ reuso no fallback client-side, Task 10).

> **Padrão de teste (mock Supabase):** seguir EXATAMENTE o estilo dos testes de `metas`/`relatorios` que mockam `@/integrations/supabase/client`. Verificar `mapRowToKpi` (snake→camel) e a regra `is_system` com testes puros sobre a função exportada, sem rede.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { mapRowToKpi, assertDeletable } from '../kpiAdminService';

describe('mapRowToKpi', () => {
  it('traduz snake_case → camelCase e coage números', () => {
    const kpi = mapRowToKpi({
      id: 'k1', tenant_id: 't1', name: 'Total de Leads', description: '',
      category_id: 'comercial', unit: 'count', source: 'crm', metric_key: 'totalLeads',
      status: 'active', is_visible: true, is_featured: false, display_order: '0',
      is_system: true, config: {}, created_at: 'a', updated_at: 'b',
    });
    expect(kpi.tenantId).toBe('t1');
    expect(kpi.metricKey).toBe('totalLeads');
    expect(kpi.displayOrder).toBe(0);
    expect(kpi.isSystem).toBe(true);
  });
});

describe('assertDeletable', () => {
  it('recusa KPI de sistema', () => {
    expect(() => assertDeletable({ isSystem: true } as never)).toThrow('KPIs nativos não podem ser excluídos.');
  });
  it('permite KPI normal', () => {
    expect(() => assertDeletable({ isSystem: false } as never)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/kpis/admin/services/__tests__/kpiAdminService.test.ts`
Expected: FAIL — `Cannot find module '../kpiAdminService'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * Acesso a dados dos KPIs configuráveis (Supabase). Molde de goalsService:
 *  - traduz snake_case (DB) ↔ camelCase (domínio);
 *  - isola por tenant em TODA operação;
 *  - registra histórico (auxiliar: falha não quebra a operação principal).
 */
import { supabase } from '@/integrations/supabase/client';
import type { DashboardKpi, DashboardKpiDraft } from '@/features/kpis/domain/kpiTypes';

const TABLE = 'dashboard_kpis';
const HISTORY = 'dashboard_kpi_history';

interface ActorContext { tenantId: string; actorName: string; }

const toNumber = (v: number | string): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
};

export function mapRowToKpi(row: Record<string, unknown>): DashboardKpi {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    name: (row.name as string) ?? '',
    description: (row.description as string) ?? '',
    categoryId: (row.category_id as string) ?? 'geral',
    unit: (row.unit as DashboardKpi['unit']) ?? 'count',
    source: (row.source as DashboardKpi['source']) ?? 'manual',
    metricKey: (row.metric_key as string | null) ?? null,
    status: (row.status as DashboardKpi['status']) ?? 'active',
    isVisible: (row.is_visible as boolean) ?? true,
    isFeatured: (row.is_featured as boolean) ?? false,
    displayOrder: toNumber(row.display_order as number | string),
    isSystem: (row.is_system as boolean) ?? false,
    config: (row.config as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapDraftToRow(draft: DashboardKpiDraft, tenantId: string) {
  return {
    tenant_id: tenantId,
    name: draft.name.trim(),
    description: draft.description.trim(),
    category_id: draft.categoryId,
    unit: draft.unit,
    source: draft.source,
    metric_key: draft.metricKey,
    status: draft.status,
    is_visible: draft.isVisible,
    display_order: draft.displayOrder,
    config: draft.config,
  };
}

/** Lança se o KPI for de sistema (nativos seedados não são excluíveis). */
export function assertDeletable(kpi: Pick<DashboardKpi, 'isSystem'>): void {
  if (kpi.isSystem) throw new Error('KPIs nativos não podem ser excluídos.');
}

async function recordHistory(kpiId: string, ctx: ActorContext, changeType: string, summary: string) {
  const { error } = await supabase.from(HISTORY).insert({
    kpi_id: kpiId, tenant_id: ctx.tenantId, changed_by_name: ctx.actorName, change_type: changeType, summary,
  });
  if (error) console.warn('[kpiAdminService] histórico falhou:', error.message);
}

export async function fetchKpis(tenantId: string): Promise<DashboardKpi[]> {
  if (!tenantId) return [];
  const { data, error } = await supabase.from(TABLE).select('*').eq('tenant_id', tenantId).order('display_order', { ascending: true });
  if (error) throw new Error('Não foi possível carregar os KPIs.');
  return (data ?? []).map(mapRowToKpi);
}

export async function createKpi(draft: DashboardKpiDraft, ctx: ActorContext): Promise<DashboardKpi> {
  const { data, error } = await supabase.from(TABLE).insert(mapDraftToRow(draft, ctx.tenantId)).select('*').single();
  if (error || !data) throw new Error('Não foi possível criar o KPI.');
  const kpi = mapRowToKpi(data);
  await recordHistory(kpi.id, ctx, 'created', 'KPI criado');
  return kpi;
}

export async function updateKpi(id: string, draft: DashboardKpiDraft, ctx: ActorContext): Promise<DashboardKpi> {
  const { data, error } = await supabase.from(TABLE).update(mapDraftToRow(draft, ctx.tenantId)).eq('id', id).eq('tenant_id', ctx.tenantId).select('*').single();
  if (error || !data) throw new Error('Não foi possível atualizar o KPI.');
  const kpi = mapRowToKpi(data);
  await recordHistory(kpi.id, ctx, 'updated', 'KPI atualizado');
  return kpi;
}

export async function deleteKpi(id: string, tenantId: string): Promise<void> {
  // Defesa em profundidade (o guard is_system é da APLICAÇÃO, não do RLS): FAIL-CLOSED.
  // Se a leitura falhar, aborta antes do DELETE. maybeSingle() distingue erro de "não achou".
  const { data, error: readError } = await supabase
    .from(TABLE).select('is_system').eq('id', id).eq('tenant_id', tenantId).maybeSingle();
  if (readError) throw new Error('Não foi possível verificar o KPI antes de excluir.');
  if (data) assertDeletable({ isSystem: Boolean(data.is_system) });
  const { error } = await supabase.from(TABLE).delete().eq('id', id).eq('tenant_id', tenantId);
  if (error) throw new Error('Não foi possível excluir o KPI.');
}

export async function reorderKpis(orderedIds: string[], tenantId: string): Promise<void> {
  // supabase-js NÃO rejeita em erro (fica em {error}) → coletar e lançar se algum
  // falhar, senão a reordenação falharia em silêncio (ordem parcial invisível).
  const results = await Promise.all(orderedIds.map((id, index) =>
    supabase.from(TABLE).update({ display_order: index }).eq('id', id).eq('tenant_id', tenantId)));
  if (results.some((r) => r.error)) throw new Error('Não foi possível reordenar os KPIs.');
}

export async function setKpiVisibility(id: string, isVisible: boolean, tenantId: string): Promise<void> {
  const { error } = await supabase.from(TABLE).update({ is_visible: isVisible }).eq('id', id).eq('tenant_id', tenantId);
  if (error) throw new Error('Não foi possível alterar a visibilidade.');
}

export async function setKpiStatus(id: string, status: DashboardKpi['status'], tenantId: string): Promise<void> {
  const { error } = await supabase.from(TABLE).update({ status }).eq('id', id).eq('tenant_id', tenantId);
  if (error) throw new Error('Não foi possível alterar o status.');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/features/kpis/admin/services/__tests__/kpiAdminService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/kpis/admin/services/kpiAdminService.ts src/features/kpis/admin/services/__tests__/kpiAdminService.test.ts
git commit -m "feat(kpis): serviço CRUD de dashboard_kpis (histórico, reorder, guard is_system)"
```

---

### Task 7: Serviço de dados — metas/realizado por período

**Files:**
- Create: `src/features/kpis/admin/services/kpiTargetsService.ts`
- Test: `src/features/kpis/admin/services/__tests__/kpiTargetsService.test.ts`

**Interfaces:**
- Consumes: `supabase`; `KpiTarget`, `KpiValue` de `@/features/kpis/domain/kpiTypes`; `KpiPeriodType` de `@/features/kpis/domain/periods`.
- Produces:
  - `fetchTargets(tenantId, periodType, periodStart): Promise<KpiTarget[]>`
  - `fetchValues(tenantId, periodType, periodStart): Promise<KpiValue[]>`
  - `upsertTarget(input: { kpiId; tenantId; periodType; periodStart; targetValue; source; batchId? }): Promise<void>` — usa `onConflict: 'kpi_id,period_type,period_start'`.
  - `upsertValue(input: { kpiId; tenantId; periodType; periodStart; value; source; batchId? }): Promise<void>`
  - `mapTargetRow(row): KpiTarget`, `mapValueRow(row): KpiValue` (exportadas).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { mapTargetRow, mapValueRow } from '../kpiTargetsService';

describe('mapTargetRow / mapValueRow', () => {
  it('mapeia meta', () => {
    const t = mapTargetRow({ id: 't', kpi_id: 'k', tenant_id: 'te', period_type: 'month', period_start: '2026-06-01', target_value: '100', source: 'import', batch_id: 'b' });
    expect(t).toEqual({ id: 't', kpiId: 'k', tenantId: 'te', periodType: 'month', periodStart: '2026-06-01', targetValue: 100, source: 'import', batchId: 'b' });
  });
  it('mapeia realizado', () => {
    const v = mapValueRow({ id: 'v', kpi_id: 'k', tenant_id: 'te', period_type: 'month', period_start: '2026-06-01', value: '42', source: 'manual', batch_id: null });
    expect(v.value).toBe(42);
    expect(v.batchId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/kpis/admin/services/__tests__/kpiTargetsService.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * Leitura/escrita de metas (kpi_targets) e realizado (kpi_values), por período.
 * O upsert é IDEMPOTENTE (onConflict na chave de período) — re-importar o mesmo
 * mês atualiza em vez de duplicar.
 */
import { supabase } from '@/integrations/supabase/client';
import type { KpiTarget, KpiValue } from '@/features/kpis/domain/kpiTypes';
import type { KpiPeriodType } from '@/features/kpis/domain/periods';

const toNumber = (v: number | string): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
};

export function mapTargetRow(row: Record<string, unknown>): KpiTarget {
  return {
    id: row.id as string, kpiId: row.kpi_id as string, tenantId: row.tenant_id as string,
    periodType: row.period_type as KpiPeriodType, periodStart: row.period_start as string,
    targetValue: toNumber(row.target_value as number | string),
    source: (row.source as KpiTarget['source']) ?? 'manual', batchId: (row.batch_id as string | null) ?? null,
  };
}

export function mapValueRow(row: Record<string, unknown>): KpiValue {
  return {
    id: row.id as string, kpiId: row.kpi_id as string, tenantId: row.tenant_id as string,
    periodType: row.period_type as KpiPeriodType, periodStart: row.period_start as string,
    value: toNumber(row.value as number | string),
    source: (row.source as KpiValue['source']) ?? 'manual', batchId: (row.batch_id as string | null) ?? null,
  };
}

// Soft-fail: metas/realizado não devem quebrar o overview, mas logamos o erro
// para falha de rede não ficar invisível (distinto de "sem meta cadastrada").
export async function fetchTargets(tenantId: string, periodType: KpiPeriodType, periodStart: string): Promise<KpiTarget[]> {
  const { data, error } = await supabase.from('kpi_targets').select('*')
    .eq('tenant_id', tenantId).eq('period_type', periodType).eq('period_start', periodStart);
  if (error) { console.error('[kpiTargetsService] erro ao buscar metas:', error.message); return []; }
  return (data ?? []).map(mapTargetRow);
}

export async function fetchValues(tenantId: string, periodType: KpiPeriodType, periodStart: string): Promise<KpiValue[]> {
  const { data, error } = await supabase.from('kpi_values').select('*')
    .eq('tenant_id', tenantId).eq('period_type', periodType).eq('period_start', periodStart);
  if (error) { console.error('[kpiTargetsService] erro ao buscar realizado:', error.message); return []; }
  return (data ?? []).map(mapValueRow);
}

export async function upsertTarget(input: {
  kpiId: string; tenantId: string; periodType: KpiPeriodType; periodStart: string; targetValue: number; source: 'manual' | 'import'; batchId?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('kpi_targets').upsert({
    kpi_id: input.kpiId, tenant_id: input.tenantId, period_type: input.periodType, period_start: input.periodStart,
    target_value: input.targetValue, source: input.source, batch_id: input.batchId ?? null,
  }, { onConflict: 'kpi_id,period_type,period_start' });
  if (error) throw new Error('Não foi possível salvar a meta.');
}

export async function upsertValue(input: {
  kpiId: string; tenantId: string; periodType: KpiPeriodType; periodStart: string; value: number; source: 'manual' | 'import'; batchId?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('kpi_values').upsert({
    kpi_id: input.kpiId, tenant_id: input.tenantId, period_type: input.periodType, period_start: input.periodStart,
    value: input.value, source: input.source, batch_id: input.batchId ?? null,
  }, { onConflict: 'kpi_id,period_type,period_start' });
  if (error) throw new Error('Não foi possível salvar o realizado.');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/features/kpis/admin/services/__tests__/kpiTargetsService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/kpis/admin/services/kpiTargetsService.ts src/features/kpis/admin/services/__tests__/kpiTargetsService.test.ts
git commit -m "feat(kpis): serviço de metas/realizado por período (upsert idempotente)"
```

---

### Task 8: Import — persistência com dry-run (batch + resolução de KPI)

**Files:**
- Create: `src/features/kpis/admin/services/kpiImportService.ts`
- Test: `src/features/kpis/admin/services/__tests__/kpiImportService.test.ts`

**Interfaces:**
- Consumes: `ImportPlan`, `ImportPlanRow` de `@/features/kpis/admin/import/targetMapping`; `DashboardKpi` de domínio; `createKpi` de `kpiAdminService`; `upsertTarget`/`upsertValue` de `kpiTargetsService`; `supabase`.
- Produces:
  - `interface ResolvedPlan { creates: Array<{ kpiName }>; updates: Array<{ kpiName; periodStart; value }>; conflicts: string[]; ignored: string[] }`
  - `resolvePlan(plan: ImportPlan, existingKpis: DashboardKpi[], target: 'target' | 'value'): ResolvedPlan` — **puro**: classifica cada linha em "vincula a KPI existente (update)" ou "cria KPI novo (create)" por nome normalizado; agrega avisos. **Esta é a função do dry-run** (não toca o banco).
  - `persistImport(input: { plan: ImportPlan; mapping: { target: 'target' | 'value' }; tenantId: string; actor: { id: string; name: string }; fileName: string; sheetName: string; dryRun: boolean }): Promise<ResolvedPlan>` — se `dryRun`, retorna `resolvePlan` sem escrever; senão grava `kpi_import_batches`, cria KPIs faltantes e faz upsert de metas/realizado com `batch_id`.

> **Foco do teste:** `resolvePlan` (puro). A escrita real (`persistImport` com `dryRun:false`) é coberta pelo E2E (Task 15) e por um teste de integração com mock — aqui validamos a CLASSIFICAÇÃO e a idempotência conceitual.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { resolvePlan } from '../kpiImportService';
import type { ImportPlan } from '@/features/kpis/admin/import/targetMapping';
import type { DashboardKpi } from '@/features/kpis/domain/kpiTypes';

function kpi(name: string): DashboardKpi {
  return {
    id: 'id-' + name, tenantId: 't', name, description: '', categoryId: 'geral',
    unit: 'count', source: 'planilha', metricKey: null, status: 'active',
    isVisible: true, isFeatured: false, displayOrder: 0, isSystem: false,
    config: {}, createdAt: '', updatedAt: '',
  };
}

const plan: ImportPlan = {
  rows: [
    { kpiName: 'Total de Leads', periodType: 'month', periodStart: '2026-01-01', value: 100 },
    { kpiName: 'KPI Novo', periodType: 'month', periodStart: '2026-01-01', value: 5 },
  ],
  ignoredColumns: ['Observação'], warnings: ['aviso x'],
};

describe('resolvePlan (dry-run)', () => {
  it('vincula a existente (case-insensitive) e marca o novo p/ criação', () => {
    const resolved = resolvePlan(plan, [kpi('total de leads')], 'target');
    expect(resolved.updates).toContainEqual({ kpiName: 'Total de Leads', periodStart: '2026-01-01', value: 100 });
    expect(resolved.creates).toContainEqual({ kpiName: 'KPI Novo' });
    expect(resolved.ignored).toContain('Observação');
  });
  it('não toca o banco (função pura) — retorna plano determinístico', () => {
    const a = resolvePlan(plan, [], 'target');
    const b = resolvePlan(plan, [], 'target');
    expect(a).toEqual(b);
    expect(a.creates).toHaveLength(2); // ambos novos
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/kpis/admin/services/__tests__/kpiImportService.test.ts`
Expected: FAIL — `Cannot find module '../kpiImportService'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * Persistência da importação de metas/realizado, com DRY-RUN.
 *
 * Fluxo (passo 5 do wizard):
 *   resolvePlan (puro) → preview do que SERIA gravado (creates/updates).
 *   persistImport(dryRun:false) → grava o batch (auditoria), cria KPIs novos e
 *   faz upsert idempotente das metas/realizado com batch_id (reversível).
 */
import { supabase } from '@/integrations/supabase/client';
import type { ImportPlan, ImportPlanRow } from '@/features/kpis/admin/import/targetMapping';
import type { DashboardKpi } from '@/features/kpis/domain/kpiTypes';
import { createKpi, fetchKpis } from './kpiAdminService';
import { upsertTarget, upsertValue } from './kpiTargetsService';

export interface ResolvedPlan {
  creates: Array<{ kpiName: string }>;
  updates: Array<{ kpiName: string; periodStart: string; value: number }>;
  conflicts: string[];
  ignored: string[];
}

const norm = (s: string) => s.trim().toLowerCase();

/** Classifica o plano contra os KPIs existentes. PURO (base do dry-run). */
export function resolvePlan(plan: ImportPlan, existingKpis: DashboardKpi[], _target: 'target' | 'value'): ResolvedPlan {
  const byName = new Map(existingKpis.map((k) => [norm(k.name), k]));
  const creatingNames = new Set<string>();
  const creates: ResolvedPlan['creates'] = [];
  const updates: ResolvedPlan['updates'] = [];

  for (const row of plan.rows) {
    const exists = byName.has(norm(row.kpiName));
    if (!exists && !creatingNames.has(norm(row.kpiName))) {
      creatingNames.add(norm(row.kpiName));
      creates.push({ kpiName: row.kpiName });
    }
    updates.push({ kpiName: row.kpiName, periodStart: row.periodStart, value: row.value });
  }
  return { creates, updates, conflicts: [], ignored: plan.ignoredColumns };
}

export async function persistImport(input: {
  plan: ImportPlan;
  mapping: { target: 'target' | 'value' };
  tenantId: string;
  actor: { id: string; name: string };
  fileName: string;
  sheetName: string;
  /** Interpretação congelada do Preview (auditabilidade): colunas/tipos/períodos/avisos. */
  preview: ImportPreview;
  dryRun: boolean;
  existingKpis: DashboardKpi[];
}): Promise<ResolvedPlan> {
  const resolved = resolvePlan(input.plan, input.existingKpis, input.mapping.target);
  if (input.dryRun) return resolved;

  // 1) Cria o batch (auditoria/versão) — inclui a interpretação do Preview.
  const { data: batch, error: batchErr } = await supabase.from('kpi_import_batches').insert({
    tenant_id: input.tenantId, nome_arquivo: input.fileName, sheet_name: input.sheetName,
    mapping: input.mapping, preview: input.preview, rows_created: resolved.creates.length,
    rows_updated: resolved.updates.length, rows_ignored: resolved.ignored.length,
    imported_by: input.actor.id, imported_by_name: input.actor.name,
  }).select('id').single();
  if (batchErr || !batch) throw new Error('Não foi possível registrar a importação.');

  // 2) Garante os KPIs (cria os novos como source='planilha').
  // RETRY-SAFE: relê o estado ATUAL do banco (não confia só no snapshot do chamador);
  // se um run anterior falhou após criar alguns KPIs, reaproveita-os (não há unique em name).
  const liveKpis = await fetchKpis(input.tenantId);
  const idByName = new Map(liveKpis.map((k) => [norm(k.name), k.id]));
  for (const c of resolved.creates) {
    if (idByName.has(norm(c.kpiName))) continue; // já existe (inclusive de retry) → não duplica
    const created = await createKpi(
      { name: c.kpiName, description: '', categoryId: 'geral', unit: 'count', source: 'planilha', metricKey: null, status: 'active', isVisible: true, displayOrder: 0, config: {} },
      { tenantId: input.tenantId, actorName: input.actor.name },
    );
    idByName.set(norm(c.kpiName), created.id);
  }

  // 3) Upsert de metas/realizado com batch_id (idempotente por período).
  for (const row of input.plan.rows) {
    const kpiId = idByName.get(norm(row.kpiName));
    if (!kpiId) continue;
    const common = { kpiId, tenantId: input.tenantId, periodType: row.periodType, periodStart: row.periodStart, source: 'import' as const, batchId: batch.id };
    if (input.mapping.target === 'target') await upsertTarget({ ...common, targetValue: row.value });
    else await upsertValue({ ...common, value: row.value });
  }
  return resolved;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/features/kpis/admin/services/__tests__/kpiImportService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/kpis/admin/services/kpiImportService.ts src/features/kpis/admin/services/__tests__/kpiImportService.test.ts
git commit -m "feat(kpis): persistência de import com dry-run, batch de auditoria e upsert"
```

---

### Task 9: Contrato — estender `KpiSummaryCard` e `KpisOverview`

**Files:**
- Modify: `src/features/kpis/types.ts`
- Test: `src/features/kpis/__tests__/types.contract.test.ts` (novo — trava o shape)

**Interfaces:**
- Produces (mudança de contrato, consumida por servidor + UI):
  - `KpiSummaryCard` deixa de ter `key` (união fechada) e passa a:
    - `id: string` (id do registro `dashboard_kpis`)
    - `metricKey: string | null`
    - `source: 'crm' | 'manual' | 'planilha'`
    - `unit: 'count' | 'currency' | 'percent'`
    - `displayOrder: number`
    - mantém `label`, `rawValue`, `displayValue`, `trend`
    - adiciona `target: number | null` e `progressPercent: number | null`
  - `KpisOverview` ganha nada novo no topo (os cards já carregam tudo). `cards` continua a lista — agora dinâmica e ordenada.

- [ ] **Step 1: Write the failing test (trava o novo shape)**

```typescript
import { describe, expect, it } from 'vitest';
import type { KpiSummaryCard } from '../types';

describe('contrato KpiSummaryCard', () => {
  it('aceita um card configurável completo', () => {
    const card: KpiSummaryCard = {
      id: 'k1', label: 'Total de Leads', metricKey: 'totalLeads', source: 'crm',
      unit: 'count', displayOrder: 0, rawValue: 100, displayValue: '100',
      target: 120, progressPercent: 83.3, trend: { percent: 5, positive: true },
    };
    expect(card.id).toBe('k1');
    expect(card.target).toBe(120);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/kpis/__tests__/types.contract.test.ts`
Expected: FAIL — propriedades `id`/`target`/`source` não existem em `KpiSummaryCard` (e `key` ainda é exigido). Erro de tipos na compilação do teste.

- [ ] **Step 3: Edit `src/features/kpis/types.ts`**

Substituir a interface `KpiSummaryCard` (linhas ~29–44) por:

```typescript
/** Cartão de KPI já formatado para exibição (configurável, vindo do registro). */
export interface KpiSummaryCard {
  /** Id do registro em `dashboard_kpis`. */
  id: string;
  /** Métrica nativa quando source='crm' (catálogo de server/kpis); senão null. */
  metricKey: string | null;
  source: 'crm' | 'manual' | 'planilha';
  unit: 'count' | 'currency' | 'percent';
  label: string;
  /** Ordem de exibição no dashboard (display_order). */
  displayOrder: number;
  /** Valor numérico bruto (realizado). */
  rawValue: number;
  /** Valor já formatado para a tela. */
  displayValue: string;
  /** Meta do período (null quando não há meta cadastrada). */
  target: number | null;
  /** Progresso vs. meta (0–100, null quando sem meta). */
  progressPercent: number | null;
  trend: KpiTrend | null;
}
```

> **Atenção (regressão):** isto QUEBRA consumidores que liam `card.key`. Procurar e atualizar: `grep -rn "\.key" src/features/kpis src/features/relatorios | grep -i card`. No `KpiComponents.tsx`, trocar `key={card.key}` (React key) por `key={card.id}`.

- [ ] **Step 4: Run test + typecheck**

Run: `npm run test:run -- src/features/kpis/__tests__/types.contract.test.ts`
Expected: PASS.
Run: `npm run lint`
Expected: sem erros novos relacionados a `KpiSummaryCard` (corrigir usos de `.key` que aparecerem).

- [ ] **Step 5: Commit**

```bash
git add src/features/kpis/types.ts src/features/kpis/__tests__/types.contract.test.ts
git commit -m "feat(kpis): estender contrato do card (id, origem, meta, progresso)"
```

---

### Task 10: Servidor — junção config + realizado no `buildOverview`

**Files:**
- Create: `server/kpis/kpisConfig.js`
- Modify: `server/kpis/kpisCompute.js` (função `buildOverview` e `buildCards`)
- Modify: `server/kpis/index.js` (adicionar fetchers ao `Promise.all`)
- Test: `server/kpis/kpisConfig.test.js` (novo); `server/kpis/kpisCompute.test.js` (estender); `server/kpis/kpisCompute.snapshot.test.js` (novo — snapshot de regressão do modo legado)

**Interfaces:**
- Consumes: `dashboard_kpis`, `kpi_targets`, `kpi_values` (via supabase service_role).
- Produces:
  - `kpisConfig.js`: `fetchDashboardKpis(supabase, { tenantId })`, `fetchKpiTargets(supabase, { tenantId, periodType, periodStart })`, `fetchKpiValues(...)`. Retornam arrays já em camelCase mínimo (`{ id, name, source, metricKey, unit, status, isVisible, displayOrder }` etc).
  - `kpisCompute.js`: `buildCards(currentLeads, previousLeads, imoveisAtivos, config)` — quando `config` (lista de KPIs + metas + valores) é fornecida, monta os cards a partir dela: `crm` usa o cálculo nativo via `metricKey`; `manual`/`planilha` usam o realizado de `kpi_values`; aplica `target`/`progressPercent`; filtra `status='active' && isVisible`; ordena por `displayOrder`. Sem `config`, mantém o comportamento atual (compat).

> **Regra de regressão:** sem `config`, `buildCards` e `buildOverview` produzem EXATAMENTE o resultado de hoje (o teste de snapshot existente continua válido). Com `config` contendo os 6 nativos seedados e sem metas, os cards têm os mesmos `rawValue`/`displayValue`/`trend`, agora com `id`/`source`/`target:null`.

- [ ] **Step 1: Write the failing test (kpisCompute, modo configurável)**

Adicionar ao FINAL de `server/kpis/kpisCompute.test.js` (que JÁ usa vitest):

```javascript
// (no topo do arquivo já existe: import { describe, it, expect } from 'vitest';
//  e buildCards já está na lista de imports de ./kpisCompute.js)

describe('buildCards — modo configurável (com config)', () => {
  const NATIVE_CONFIG = [
    { id: 'k1', name: 'Total de Leads', source: 'crm', metricKey: 'totalLeads', unit: 'count', status: 'active', isVisible: true, displayOrder: 0 },
    { id: 'k2', name: 'Vendas', source: 'crm', metricKey: 'vendas', unit: 'count', status: 'active', isVisible: true, displayOrder: 1 },
  ];

  it('nativos por metric_key, com id e ordem', () => {
    const current = [{ status: 'novo', final_sale_value: 0 }, { status: 'novo', final_sale_value: 500000 }];
    const cards = buildCards(current, [], 0, { kpis: NATIVE_CONFIG, targets: [], values: [] });
    const leads = cards.find((c) => c.metricKey === 'totalLeads');
    expect(leads.id).toBe('k1');
    expect(leads.rawValue).toBe(2);
    expect(leads.target).toBe(null);
    expect(cards[0].displayOrder <= cards[1].displayOrder).toBe(true);
  });

  it('card manual usa kpi_values e calcula progresso', () => {
    const config = {
      kpis: [{ id: 'm1', name: 'NPS', source: 'manual', metricKey: null, unit: 'count', status: 'active', isVisible: true, displayOrder: 5 }],
      targets: [{ kpiId: 'm1', targetValue: 80 }],
      values: [{ kpiId: 'm1', value: 60 }],
    };
    const cards = buildCards([], [], 0, config);
    const nps = cards.find((c) => c.id === 'm1');
    expect(nps.rawValue).toBe(60);
    expect(nps.target).toBe(80);
    expect(nps.progressPercent).toBe(75);
  });

  it('oculta inativo/invisível', () => {
    const config = { kpis: [{ id: 'h', name: 'X', source: 'manual', metricKey: null, unit: 'count', status: 'inactive', isVisible: true, displayOrder: 0 }], targets: [], values: [] };
    expect(buildCards([], [], 0, config).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- server/kpis/kpisCompute.test.js`
Expected: FAIL — `buildCards` ignora o 4º argumento hoje.

- [ ] **Step 3: Implement `kpisConfig.js`**

```javascript
/**
 * Leitura da CONFIGURAÇÃO de KPIs (tabelas novas) no servidor. service_role
 * bypassa RLS → o isolamento por tenant é responsabilidade DESTE código
 * (sempre filtra tenant_id), igual ao restante de server/kpis.
 */
const num = (v) => { const n = typeof v === 'string' ? Number(v) : v; return Number.isFinite(n) ? n : 0; };

export async function fetchDashboardKpis(supabase, { tenantId }) {
  const { data, error } = await supabase.from('dashboard_kpis').select('*').eq('tenant_id', tenantId).order('display_order', { ascending: true });
  if (error) return [];
  return (data || []).map((r) => ({
    id: r.id, name: r.name, description: r.description || '', categoryId: r.category_id,
    source: r.source, metricKey: r.metric_key, unit: r.unit, status: r.status,
    isVisible: r.is_visible, isFeatured: r.is_featured, displayOrder: num(r.display_order), isSystem: r.is_system,
  }));
}

async function fetchPeriodScoped(supabase, table, { tenantId, periodType, periodStart }) {
  const { data, error } = await supabase.from(table).select('*')
    .eq('tenant_id', tenantId).eq('period_type', periodType).eq('period_start', periodStart);
  if (error) return [];
  return data || [];
}

export async function fetchKpiTargets(supabase, scope) {
  return (await fetchPeriodScoped(supabase, 'kpi_targets', scope)).map((r) => ({ kpiId: r.kpi_id, targetValue: num(r.target_value) }));
}
export async function fetchKpiValues(supabase, scope) {
  return (await fetchPeriodScoped(supabase, 'kpi_values', scope)).map((r) => ({ kpiId: r.kpi_id, value: num(r.value) }));
}
```

- [ ] **Step 4: Modify `buildCards` and `buildOverview` in `kpisCompute.js`**

No topo de `buildCards`, manter o cálculo nativo num mapa por chave, e ramificar quando vier `config`:

```javascript
// Em kpisCompute.js — refatorar buildCards para aceitar config opcional.
// 1) Extrair os 6 cálculos nativos para um objeto indexado por metricKey:
function nativeCardValues(current, previous, imoveisAtivos) {
  const totalLeads = current.length, totalLeadsPrev = previous.length;
  const vendas = countVendas(current), vendasPrev = countVendas(previous);
  const respMin = avgResponseMinutes(current), respMinPrev = avgResponseMinutes(previous);
  const atendidos = current.filter((l) => !!l.first_response_at).length;
  const taxaAtend = totalLeads > 0 ? round1((atendidos / totalLeads) * 100) : 0;
  const atendidosPrev = previous.filter((l) => !!l.first_response_at).length;
  const taxaAtendPrev = totalLeadsPrev > 0 ? round1((atendidosPrev / totalLeadsPrev) * 100) : 0;
  return {
    totalLeads:        { rawValue: totalLeads, displayValue: totalLeads.toLocaleString('pt-BR'), trend: computeTrend(totalLeads, totalLeadsPrev) },
    vendas:            { rawValue: vendas.qtd, displayValue: vendas.qtd.toLocaleString('pt-BR'), trend: computeTrend(vendas.qtd, vendasPrev.qtd) },
    valorVendas:       { rawValue: vendas.valor, displayValue: BRL(vendas.valor), trend: computeTrend(vendas.valor, vendasPrev.valor) },
    imoveisAtivos:     { rawValue: imoveisAtivos, displayValue: Number(imoveisAtivos || 0).toLocaleString('pt-BR'), trend: null },
    tempoMedioResposta:{ rawValue: respMin, displayValue: formatMinutes(respMin), trend: computeTrend(respMin, respMinPrev, true) },
    taxaAtendimento:   { rawValue: taxaAtend, displayValue: `${taxaAtend.toFixed(1)}%`, trend: computeTrend(taxaAtend, taxaAtendPrev) },
  };
}

const LEGACY_LABELS = {
  totalLeads: 'Total de Leads', vendas: 'Vendas', valorVendas: 'Valor em Vendas',
  imoveisAtivos: 'Imóveis Ativos', tempoMedioResposta: 'Tempo Médio de Resposta', taxaAtendimento: 'Taxa de Atendimento',
};

function clampPercent(target, realized) {
  if (!target || target <= 0 || realized == null) return null;
  return Math.max(0, Math.min(100, round1((realized / target) * 100)));
}

function formatByUnit(value, unit) {
  if (unit === 'currency') return BRL(value);
  if (unit === 'percent') return `${Number(value).toFixed(1)}%`;
  return Number(value || 0).toLocaleString('pt-BR');
}

export function buildCards(current, previous, imoveisAtivos, config) {
  const native = nativeCardValues(current, previous, imoveisAtivos);

  // Modo legado (sem config): preserva 100% o comportamento atual.
  if (!config || !Array.isArray(config.kpis)) {
    return Object.keys(LEGACY_LABELS).map((key, i) => ({
      id: key, metricKey: key, source: 'crm', unit: 'count', label: LEGACY_LABELS[key],
      displayOrder: i, ...native[key], target: null, progressPercent: null,
    }));
  }

  // Modo configurável.
  const targetByKpi = new Map((config.targets || []).map((t) => [t.kpiId, t.targetValue]));
  const valueByKpi = new Map((config.values || []).map((v) => [v.kpiId, v.value]));

  return config.kpis
    .filter((k) => k.status === 'active' && k.isVisible)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((k) => {
      const target = targetByKpi.has(k.id) ? targetByKpi.get(k.id) : null;
      let rawValue, displayValue, trend;
      if (k.source === 'crm' && native[k.metricKey]) {
        ({ rawValue, displayValue, trend } = native[k.metricKey]);
      } else {
        // crm com metricKey que não resolve = config inválida: mostra 0 mas avisa.
        if (k.source === 'crm') {
          console.warn(`[kpis] KPI '${k.name}' (id=${k.id}) é 'crm' mas metricKey '${k.metricKey}' não existe no catálogo nativo; exibindo 0.`);
        }
        rawValue = valueByKpi.has(k.id) ? valueByKpi.get(k.id) : 0;
        displayValue = formatByUnit(rawValue, k.unit);
        trend = null;
      }
      return {
        id: k.id, metricKey: k.metricKey, source: k.source, unit: k.unit, label: k.name,
        displayOrder: k.displayOrder, rawValue, displayValue,
        target, progressPercent: clampPercent(target, rawValue), trend,
      };
    });
}
```

E em `buildOverview`, aceitar e repassar `config`:

```javascript
export function buildOverview({
  period, currentLeads, previousLeads, imoveisAtivos, goals,
  commercialCurrent, commercialPrevious, previousLabel, config, // <-- novo
}) {
  return {
    period,
    cards: buildCards(currentLeads, previousLeads, imoveisAtivos, config), // <-- repassa
    funnel: buildFunnel(currentLeads),
    sources: buildSources(currentLeads),
    priceRanges: buildPriceRanges(currentLeads),
    goals: Array.isArray(goals) ? goals : [],
    commercial: buildCommercialComparison({
      current: commercialCurrent || { vgv: 0, vgc: 0 },
      previous: commercialPrevious || { vgv: 0, vgc: 0 },
      currentLabel: period.label, previousLabel: previousLabel || '',
    }),
  };
}
```

- [ ] **Step 5: Wire fetchers in `index.js`**

Em `makeKpisHandler`, adicionar ao `Promise.all` e passar `config` ao `buildOverview`:

```javascript
import { fetchDashboardKpis, fetchKpiTargets, fetchKpiValues } from './kpisConfig.js';
// ...dentro do handler, após resolver period:
const periodScope = { tenantId, periodType: 'month', periodStart: period.startDate };
const [ currentLeads, previousLeads, imoveisAtivos, goals, commercialCurrent, commercialPrevious, kpis, targets, values ] = await Promise.all([
  fetchLeads(supabase, { tenantId, period }),
  fetchLeads(supabase, { tenantId, period: prevPeriod }),
  countImoveisAtivos(supabase, { tenantId }),
  fetchGoals(supabase, { tenantId }),
  fetchCommercialTotals(supabase, { tenantId, period }),
  fetchCommercialTotals(supabase, { tenantId, period: prevPeriod }),
  fetchDashboardKpis(supabase, { tenantId }),
  fetchKpiTargets(supabase, periodScope),
  fetchKpiValues(supabase, periodScope),
]);
const overview = buildOverview({
  period, currentLeads, previousLeads, imoveisAtivos, goals,
  commercialCurrent, commercialPrevious, previousLabel: prevPeriod.label,
  config: { kpis, targets, values },
});
```

- [ ] **Step 6: Write `kpisConfig.test.js` (mapeamento)**

```javascript
import { describe, it, expect } from 'vitest';
import { fetchDashboardKpis } from './kpisConfig.js';

describe('fetchDashboardKpis', () => {
  it('mapeia snake→camel e filtra por tenant', async () => {
    const calls = {};
    const supabase = { from: () => ({ select: () => ({ eq: (col, val) => { calls[col] = val; return { order: () => ({ data: [
      { id: 'k1', name: 'A', description: '', category_id: 'g', source: 'crm', metric_key: 'vendas', unit: 'count', status: 'active', is_visible: true, is_featured: false, display_order: '0', is_system: true },
    ], error: null }) }; } }) }) };
    const out = await fetchDashboardKpis(supabase, { tenantId: 't1' });
    expect(calls.tenant_id).toBe('t1');
    expect(out[0].metricKey).toBe('vendas');
    expect(out[0].displayOrder).toBe(0);
  });
});
```

- [ ] **Step 7: Snapshot de regressão do `buildOverview` (modo legado)**

Criar `server/kpis/kpisCompute.snapshot.test.js` — congela a saída de `buildOverview` SEM `config` com um conjunto de leads fixo, garantindo que a refatoração não alterou nenhum número dos 6 cards nativos, funil, fontes, faixas e comercial. Usa o snapshot do **vitest** (`toMatchSnapshot()`; gera o arquivo `__snapshots__` na 1ª execução).

```javascript
import { describe, it, expect } from 'vitest';
import { buildOverview } from './kpisCompute.js';

// Conjunto de leads determinístico (cobre venda, funil, resposta, atendimento).
const FIXED_LEADS = [
  { status: 'novo',      source: 'Instagram', final_sale_value: 0,       created_at: '2026-06-01T10:00:00Z', first_response_at: '2026-06-01T10:30:00Z' },
  { status: 'proposta',  source: 'Facebook',  final_sale_value: 0,       created_at: '2026-06-02T10:00:00Z', first_response_at: null },
  { status: 'assinado',  source: 'Indicação', final_sale_value: 650000,  created_at: '2026-06-03T10:00:00Z', first_response_at: '2026-06-03T11:00:00Z' },
  { status: 'visita',    source: 'Instagram', final_sale_value: 0,       created_at: '2026-06-04T10:00:00Z', first_response_at: '2026-06-04T10:05:00Z' },
];
const PERIOD = { startDate: '2026-06-01', endDate: '2026-06-30', label: 'Junho/2026' };

describe('buildOverview — regressão do modo legado (sem config)', () => {
  it('snapshot dos números nativos + asserts explícitos', () => {
    const overview = buildOverview({
      period: PERIOD, currentLeads: FIXED_LEADS, previousLeads: [], imoveisAtivos: 7,
      goals: [], commercialCurrent: { vgv: 1000, vgc: 30 }, commercialPrevious: { vgv: 800, vgc: 24 },
      previousLabel: 'Maio/2026',
      // SEM config → caminho legado, que deve permanecer idêntico ao de hoje.
    });
    // Trava o shape e os valores derivados (cards/funnel/sources/priceRanges/commercial).
    expect(overview).toMatchSnapshot();
    // Asserts explícitos de regressão (além do snapshot), nos pontos mais sensíveis:
    const totalLeads = overview.cards.find((c) => c.metricKey === 'totalLeads');
    expect(totalLeads.rawValue).toBe(4);
    expect(totalLeads.target).toBe(null); // legado não tem meta
    const vendas = overview.cards.find((c) => c.metricKey === 'vendas');
    expect(vendas.rawValue).toBe(1);
  });
});
```

Gerar o snapshot inicial e validar:

Run: `npm run test:run -- server/kpis/kpisCompute.snapshot.test.js` (a 1ª execução cria o `__snapshots__`; vitest grava automaticamente se ausente).
Expected: PASS (snapshot estável). Confira o arquivo `server/kpis/__snapshots__/kpisCompute.snapshot.test.js.snap` gerado.

> **Uso como guarda de regressão:** este snapshot é o "antes". Qualquer task futura que mexa em `kpisCompute.js` re-roda este teste; se algum número nativo mudar, o snapshot falha e a regressão é pega na hora.

- [ ] **Step 8: Run all server tests (regressão + novos)**

Run: `npm run test:run -- server/kpis/kpisCompute.test.js server/kpis/kpisConfig.test.js server/kpis/kpisCompute.snapshot.test.js server/kpis/index.test.js`
Expected: PASS em todos — incluindo os testes existentes (modo legado intacto).

- [ ] **Step 9: NÃO commitar (protocolo Victor)**

Deixar as alterações no working tree da branch isolada. NÃO rodar `git commit`. Arquivos tocados nesta task:
`server/kpis/kpisConfig.js`, `server/kpis/kpisCompute.js`, `server/kpis/index.js`, `server/kpis/kpisConfig.test.js`, `server/kpis/kpisCompute.test.js`, `server/kpis/kpisCompute.snapshot.test.js` (+ pasta de snapshots gerada).

---

### Task 11: Fallback client-side + render de meta/progresso

**Files:**
- Modify: `src/features/kpis/services/supabaseKpisService.ts` (espelhar a junção)
- Modify: `src/features/kpis/components/KpiComponents.tsx` (render meta/progresso + `key={card.id}`)
- Test: `src/features/kpis/components/__tests__/KpiCards.test.tsx` (novo — render)

**Interfaces:**
- Consumes: `fetchKpis` (`kpiAdminService`), `fetchTargets`/`fetchValues` (`kpiTargetsService`), `resolveProgress` (domínio), contrato novo `KpiSummaryCard`.
- Produces: `supabaseKpisService.getOverview` agora monta os cards a partir de `dashboard_kpis` + metas/valores (mesma lógica do servidor), para não divergir em rollback/offline. `KpiCards` exibe meta e barra de progresso quando `card.target != null`.

- [ ] **Step 1: Write the failing test (render do card com meta)**

```typescript
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiCards } from '../KpiComponents';
import type { KpiSummaryCard } from '../../types';

const card: KpiSummaryCard = {
  id: 'k1', label: 'Vendas', metricKey: 'vendas', source: 'crm', unit: 'count',
  displayOrder: 0, rawValue: 8, displayValue: '8', target: 10, progressPercent: 80,
  trend: { percent: 5, positive: true },
};

describe('KpiCards', () => {
  it('mostra o valor, a meta e o progresso', () => {
    render(<KpiCards cards={[card]} isLoading={false} />);
    expect(screen.getByText('Vendas')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText(/Meta:/)).toHaveTextContent('10');
    expect(screen.getByText('80%')).toBeInTheDocument();
  });
  it('sem meta: não renderiza bloco de progresso', () => {
    render(<KpiCards cards={[{ ...card, id: 'k2', target: null, progressPercent: null }]} isLoading={false} />);
    expect(screen.queryByText(/Meta:/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/kpis/components/__tests__/KpiCards.test.tsx`
Expected: FAIL — `KpiCards` atual usa `card.key` e não renderiza meta.

- [ ] **Step 3: Update `KpiCards` em `KpiComponents.tsx`**

Adicionar um helper de formatação por unidade (no topo do arquivo, junto aos demais helpers) e ajustar o `.map` que renderiza cada card (React key → `card.id`; bloco de meta condicional). O helper reusa a mesma regra de formatação por unidade usada nos cards configuráveis:

```tsx
/** Formata um número conforme a unidade do KPI (mesma regra dos cards). */
function formatByUnit(value: number, unit: KpiSummaryCard['unit']): string {
  if (unit === 'currency') return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  if (unit === 'percent') return `${value.toFixed(1)}%`;
  return value.toLocaleString('pt-BR');
}
```

```tsx
{cards.map((card) => (
  <div key={card.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
    <p className="text-[12px] text-slate-500 dark:text-slate-400">{card.label}</p>
    <p className="text-[22px] font-bold text-slate-900 dark:text-slate-100">{card.displayValue}</p>
    {card.trend?.percent != null && (
      <p className={card.trend.positive ? 'text-[11px] text-emerald-600' : 'text-[11px] text-rose-600'}>
        {card.trend.percent > 0 ? '+' : ''}{card.trend.percent}%
      </p>
    )}
    {card.target != null && (
      <div className="mt-2">
        <p className="text-[11px] text-slate-400">Meta: {formatByUnit(card.target, card.unit)}</p>
        <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${card.progressPercent ?? 0}%` }} />
        </div>
        <p className="mt-0.5 text-[10px] text-slate-400">{card.progressPercent ?? 0}%</p>
      </div>
    )}
  </div>
))}
```

> O `import type { KpiSummaryCard } from '../types'` já existe/será necessário neste arquivo para tipar `formatByUnit`.

- [ ] **Step 4: Update `supabaseKpisService.ts` (fallback alinhado)**

Substituir o corpo de `getOverview` para, além do cálculo nativo atual, ler `dashboard_kpis` + metas/valores e montar `cards` pela mesma regra do servidor (reusar `fetchKpis`, `fetchTargets`, `fetchValues`, `resolveProgress`). Os blocos `funnel`/`sources`/`priceRanges`/`goals`/`commercial` permanecem como hoje.

```typescript
// Esboço do novo getOverview (mantém imports atuais + os novos serviços/domínio):
import { fetchKpis } from '@/features/kpis/admin/services/kpiAdminService';
import { fetchTargets, fetchValues } from '@/features/kpis/admin/services/kpiTargetsService';
import { resolveProgress } from '@/features/kpis/domain/kpiModel';
import { normalizePeriodStart } from '@/features/kpis/domain/periods';
// dentro de getOverview, após calcular os 6 valores nativos num mapa `native` por metricKey:
const periodStart = normalizePeriodStart(period.startDate, 'month'); // 1º dia do mês
const [kpis, targets, values] = await Promise.all([
  // fetchKpis LANÇA em erro → .catch p/ NÃO quebrar o dashboard (cai no legado).
  fetchKpis(tenantId).catch(() => []),
  fetchTargets(tenantId, 'month', periodStart),
  fetchValues(tenantId, 'month', periodStart),
]);
const targetByKpi = new Map(targets.map((t) => [t.kpiId, t.targetValue]));
const valueByKpi = new Map(values.map((v) => [v.kpiId, v.value]));
const cards = kpis
  .filter((k) => k.status === 'active' && k.isVisible)
  .sort((a, b) => a.displayOrder - b.displayOrder)
  .map((k) => {
    const target = targetByKpi.has(k.id) ? targetByKpi.get(k.id)! : null;
    const rawValue = k.source === 'crm' ? (native[k.metricKey!]?.rawValue ?? 0) : (valueByKpi.get(k.id) ?? 0);
    const displayValue = k.source === 'crm' ? (native[k.metricKey!]?.displayValue ?? '0') : formatByUnit(rawValue, k.unit);
    const trend = k.source === 'crm' ? (native[k.metricKey!]?.trend ?? null) : null;
    const { percent } = resolveProgress(target, rawValue);
    return { id: k.id, metricKey: k.metricKey, source: k.source, unit: k.unit, label: k.name, displayOrder: k.displayOrder, rawValue, displayValue, target, progressPercent: target == null ? null : percent, trend };
  });
// retornar { ...overviewAtual, cards };
```

> Se `fetchKpis` retornar vazio (tenant sem seed ainda), CAIR no comportamento legado: montar os 6 cards nativos como antes. Isso evita dashboard vazio durante a migração.

- [ ] **Step 5: Run tests**

Run: `npm run test:run -- src/features/kpis/components/__tests__/KpiCards.test.tsx`
Expected: PASS.
Run: `npm run test:run -- src/features/kpis`
Expected: toda a feature passa.

- [ ] **Step 6: Commit**

```bash
git add src/features/kpis/services/supabaseKpisService.ts src/features/kpis/components/KpiComponents.tsx src/features/kpis/components/__tests__/KpiCards.test.tsx
git commit -m "feat(kpis): render de meta/progresso + fallback client-side alinhado ao servidor"
```

---

### Task 12: Hook + página de gestão (dividida em 12a/12b)

> **Dividida** para não quebrar imports: a `KpiAdminPage` (12b) compõe `KpiList`/`KpiFormDialog` (Task 13) e `KpiImportWizard` (Task 14). Ordem real de execução: **12a → 13 → 14 → 12b**.
>
> **`canManage` é ROLE-AWARE** (decisão do Victor, alinhada ao spec "apenas gestores administram"): role ∈ {admin, team_leader, owner} OU owner da plataforma (via `isOwner` do `useAuthContext`). Difere do `useGoals` (que só checa hasTenant). Defesa em 2 camadas: UI esconde + RLS bloqueia.

#### Task 12a: Hook `useKpiAdmin` + `computeCanManageKpis`

**Files:**
- Create: `src/features/kpis/admin/hooks/useKpiAdmin.ts`
- Test: `src/features/kpis/admin/hooks/__tests__/useKpiAdmin.canManage.test.ts`

**Interfaces:**
- Consumes: `useAuthContext` — CONFIRMADO que expõe `{ tenantId?, user: AuthUser|null, isOwner: boolean, isGestao: boolean, isCorretor }`. ⚠️ `user.role` é COLAPSADO em `'gestao'|'corretor'` (admin/team_leader → 'gestao'), NÃO os papéis granulares — por isso NÃO usar `user.role` para gating; usar `isGestao` (sinal canônico de gestor) e `isOwner`.
- Produces:
  - `computeCanManageKpis(actor: { isGestao?: boolean; isOwner?: boolean }): boolean` — `isOwner || isGestao`. PURA.
  - `useKpiAdmin(): { kpis; isLoading; canManage; create; update; remove; reorder; setVisibility; setStatus }`.

- [ ] **Step 1: Write the failing test (canManage)**

```typescript
import { describe, expect, it } from 'vitest';
import { computeCanManageKpis } from '../useKpiAdmin';

describe('computeCanManageKpis', () => {
  it('gestor do tenant (isGestao) pode', () => {
    expect(computeCanManageKpis({ isGestao: true, isOwner: false })).toBe(true);
  });
  it('owner da plataforma (isOwner) pode, mesmo sem isGestao', () => {
    expect(computeCanManageKpis({ isGestao: false, isOwner: true })).toBe(true);
  });
  it('corretor (nem gestão nem owner) NÃO pode', () => {
    expect(computeCanManageKpis({ isGestao: false, isOwner: false })).toBe(false);
  });
  it('sem sinais → não pode', () => {
    expect(computeCanManageKpis({})).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/kpis/admin/hooks/__tests__/useKpiAdmin.canManage.test.ts`
Expected: FAIL — módulo/função não existe.

- [ ] **Step 3: Implement `useKpiAdmin.ts`**

```typescript
/**
 * Orquestração do CRUD de KPIs (TanStack Query). Quem PODE gerenciar: owner da
 * plataforma (isOwner) ou role de gestão do tenant (admin/team_leader/owner).
 * Defesa em 2 camadas — a UI esconde as ações; a RLS bloqueia a escrita no banco.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  fetchKpis, createKpi, updateKpi, deleteKpi, reorderKpis, setKpiVisibility, setKpiStatus,
} from '../services/kpiAdminService';
import type { DashboardKpiDraft } from '@/features/kpis/domain/kpiTypes';

/**
 * Pura e testável. ATENÇÃO: `user.role` do AuthContext é COLAPSADO em
 * 'gestao'|'corretor' (admin/team_leader → 'gestao'), NÃO os papéis granulares.
 * O sinal canônico de "é gestor" é `isGestao` (= role 'gestao' OU owner). Logo:
 * pode gerenciar = isOwner OU isGestao. Corretor fica de fora. RLS é a 2ª camada.
 */
export function computeCanManageKpis(actor: { isGestao?: boolean; isOwner?: boolean }): boolean {
  return Boolean(actor.isOwner || actor.isGestao);
}

export function useKpiAdmin() {
  const { tenantId, user, isOwner, isGestao } = useAuthContext();
  const qc = useQueryClient();
  const canManage = computeCanManageKpis({ isGestao, isOwner });
  const ready = Boolean(tenantId && tenantId !== 'owner');
  const actorName = user?.name || user?.email || 'Gestor';

  // Guarda de escrita: sem tenant REAL (owner sem impersonation → tenantId 'owner')
  // nenhuma mutação grava (evita escrever com tenant_id='owner'). canManage pode ser
  // true p/ o owner; só `ready` garante tenant real.
  function requireTenant(): string {
    if (!ready) throw new Error('Selecione uma imobiliária para gerenciar KPIs.');
    return tenantId as string;
  }

  const kpisQuery = useQuery({
    queryKey: ['kpis', 'admin', tenantId],
    queryFn: () => fetchKpis(tenantId as string),
    enabled: ready,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['kpis', 'admin', tenantId] });
    qc.invalidateQueries({ queryKey: ['kpis', 'overview'] }); // reflete no dashboard
  };

  const create = useMutation({ mutationFn: (d: DashboardKpiDraft) => createKpi(d, { tenantId: requireTenant(), actorName }), onSuccess: invalidate });
  const update = useMutation({ mutationFn: (p: { id: string; draft: DashboardKpiDraft }) => updateKpi(p.id, p.draft, { tenantId: requireTenant(), actorName }), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: string) => deleteKpi(id, requireTenant()), onSuccess: invalidate });
  const reorder = useMutation({ mutationFn: (ids: string[]) => reorderKpis(ids, requireTenant()), onSuccess: invalidate });
  const setVisibility = useMutation({ mutationFn: (p: { id: string; isVisible: boolean }) => setKpiVisibility(p.id, p.isVisible, requireTenant()), onSuccess: invalidate });
  const setStatus = useMutation({ mutationFn: (p: { id: string; status: 'active' | 'inactive' }) => setKpiStatus(p.id, p.status, requireTenant()), onSuccess: invalidate });

  return {
    kpis: kpisQuery.data ?? [], isLoading: kpisQuery.isLoading, canManage,
    create, update, remove, reorder, setVisibility, setStatus,
  };
}
```

- [ ] **Step 4: Implement `useKpiAdmin` body + run tests/lint/tsc**

Run: `npm run test:run -- src/features/kpis/admin/hooks/__tests__/useKpiAdmin.canManage.test.ts` → PASS.
Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "features/kpis"` → 0 (o hook não deve introduzir erro).
Run: `npx eslint src/features/kpis/admin/hooks/useKpiAdmin.ts` → limpo.

- [ ] **Step 5: NÃO commitar.** Deixar no working tree. Arquivos: `useKpiAdmin.ts`, `__tests__/useKpiAdmin.canManage.test.ts`.

---

#### Task 12b: Página `KpiAdminPage` + rota + botão (APÓS Tasks 13 e 14)

**Files:**
- Create: `src/features/kpis/admin/pages/KpiAdminPage.tsx`
- Modify: `src/features/kpis/index.ts` (export `KpiAdminPage`)
- Modify: `src/pages/DashboardLayout.tsx` (lazy + `<Route>` guardada — padrão do `MetasPage`)
- Modify: `src/features/kpis/pages/KpisPage.tsx` (botão "Gerenciar KPIs" só p/ quem pode gerenciar)

**Interfaces:**
- Consumes: `useKpiAdmin` (12a); `KpiList`/`KpiFormDialog` (Task 13); `KpiImportWizard` (Task 14); `react-router` (`useNavigate`/`<Route>`).
- Produces: `KpiAdminPage` (composição) montada em rota nova guardada por permissão; botão de atalho no `KpisPage`.

- [ ] **Step 1: Implement `KpiAdminPage.tsx`** (composição; usa `KpiList` da Task 13 e `KpiImportWizard` da Task 14)

```tsx
/** Página de gestão de KPIs. Composição: lista + form + wizard de import. */
import { useState } from 'react';
import { Plus, Upload, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useKpiAdmin } from '../hooks/useKpiAdmin';
import { KpiList } from '../components/KpiList';
import { KpiFormDialog } from '../components/KpiFormDialog';
import { KpiImportWizard } from '../components/KpiImportWizard';
import type { DashboardKpi, DashboardKpiDraft } from '@/features/kpis/domain/kpiTypes';

export function KpiAdminPage() {
  const { kpis, isLoading, canManage, create, update, remove, reorder, setVisibility, setStatus } = useKpiAdmin();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DashboardKpi | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  if (!canManage) {
    return <div className="px-6 py-10 text-center text-[13px] text-slate-400">Você não tem permissão para gerenciar KPIs.</div>;
  }

  const handleSubmit = async (draft: DashboardKpiDraft) => {
    try {
      if (editing) await update.mutateAsync({ id: editing.id, draft });
      else await create.mutateAsync(draft);
      toast.success(editing ? 'KPI atualizado' : 'KPI criado');
      setFormOpen(false); setEditing(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro ao salvar'); }
  };

  return (
    <div className="px-6 py-5 max-w-[1100px] mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-[22px] font-bold flex items-center gap-2"><BarChart3 className="w-5 h-5" /> Gestão de KPIs</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setWizardOpen(true)}><Upload className="w-4 h-4 mr-2" /> Importar planilha</Button>
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="w-4 h-4 mr-2" /> Novo KPI</Button>
        </div>
      </div>

      <KpiList
        kpis={kpis} isLoading={isLoading}
        onEdit={(k) => { setEditing(k); setFormOpen(true); }}
        onDelete={async (k) => { try { await remove.mutateAsync(k.id); toast.success('KPI excluído'); } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro'); } }}
        onReorder={(ids) => reorder.mutate(ids)}
        onToggleVisible={(k) => setVisibility.mutate({ id: k.id, isVisible: !k.isVisible })}
        onToggleStatus={(k) => setStatus.mutate({ id: k.id, status: k.status === 'active' ? 'inactive' : 'active' })}
      />

      <KpiFormDialog open={formOpen} onOpenChange={setFormOpen} kpi={editing} isSubmitting={create.isPending || update.isPending} onSubmit={handleSubmit} />
      <KpiImportWizard open={wizardOpen} onOpenChange={setWizardOpen} existingKpis={kpis} />
    </div>
  );
}
export default KpiAdminPage;
```

- [ ] **Step 5: Wire route + botão em `KpisPage`**

- [ ] **Step 2: Export + rota no `DashboardLayout` (padrão exato do `MetasPage`)**

- Em `src/features/kpis/index.ts`: adicionar `export { KpiAdminPage } from './admin/pages/KpiAdminPage';`
- Em `src/pages/DashboardLayout.tsx`, ESPELHAR o `MetasPage` (que hoje é: `const MetasPage = lazyWithRetry(() => import('@/features/metas/pages/MetasPage').then(m => ({ default: m.MetasPage })));` + um `<Route ... element={canAccess('metas') ? <MetasPage/> : <Navigate.../>} />`):
  - declarar `const KpiAdminPage = lazyWithRetry(() => import('@/features/kpis').then(m => ({ default: m.KpiAdminPage })));`
  - adicionar uma `<Route path="kpis-admin" element={canAccess('metricas') ? <KpiAdminPage /> : <Navigate to={defaultAllowedRoute} replace />} />` perto da rota de `metas`. (Guardar por `canAccess('metricas')` — a aba KPIs já vive sob 'metricas'/Início; o gate FINO de escrita é o `canManage` na própria página + a RLS. NÃO criar permissão de sidebar nova.)
- Em `KpisPage.tsx`: adicionar no cabeçalho (ao lado de "Atualizar") um botão "Gerenciar KPIs" que `useNavigate()` → `/kpis-admin`, renderizado SÓ quando `computeCanManageKpis({ isGestao, isOwner })` (importar `computeCanManageKpis` de `../admin/hooks/useKpiAdmin` e pegar `{ isGestao, isOwner }` de `useAuthContext`).

> Confirmar o caminho real da rota (prefixo do DashboardLayout) ao implementar — usar o mesmo basepath das demais rotas internas. O `path` exato (`kpis-admin`) deve combinar com o `navigate('/<base>/kpis-admin')` do botão.

- [ ] **Step 3: Run tests + lint + tsc**

Run: `npm run test:run -- src/features/kpis` → PASS (toda a feature).
Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "features/kpis"` → 0.
Run: `npm run lint` → sem erros novos.

- [ ] **Step 4: NÃO commitar.** Deixar no working tree. Arquivos: `KpiAdminPage.tsx`, `index.ts`, `DashboardLayout.tsx`, `KpisPage.tsx`.

---

### Task 13: Componentes — formulário + lista com reordenação (dnd-kit)

**Files:**
- Create: `src/features/kpis/admin/components/KpiFormDialog.tsx`
- Create: `src/features/kpis/admin/components/KpiList.tsx`
- Test: `src/features/kpis/admin/components/__tests__/KpiFormDialog.test.tsx`

**Interfaces:**
- Consumes: shadcn `Dialog`/`Input`/`Label`/`Switch`/`Select`/`Button` (molde `GoalFormDialog`); domínio (`createEmptyKpiDraft`, `kpiToDraft`, `validateKpiDraft`, `NATIVE_METRIC_KEYS`); `@dnd-kit/*` (padrão `FotosUploader`).
- Produces:
  - `KpiFormDialog` props: `{ open; onOpenChange; kpi: DashboardKpi | null; isSubmitting; onSubmit: (draft) => Promise<void> }`. Campos: nome, descrição, categoria (texto), unidade (select), origem (select crm/manual/planilha). Quando origem=crm, mostra select de `metricKey` (de `NATIVE_METRIC_KEYS`); senão esconde. Valida via `validateKpiDraft` antes de `onSubmit` (toast nos erros).
  - `KpiList` props: `{ kpis; isLoading; onEdit; onDelete; onReorder: (ids:string[])=>void; onToggleVisible; onToggleStatus }`. Cada item: handle de arraste, nome+origem, badges (oculto/inativo/sistema), ações (editar; excluir só se `!isSystem`; toggles). Arraste persiste via `onReorder` (lista de ids).

- [ ] **Step 1: Write the failing test (form valida e some metricKey p/ manual)**

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { KpiFormDialog } from '../KpiFormDialog';

describe('KpiFormDialog', () => {
  it('bloqueia submit sem nome', async () => {
    const onSubmit = vi.fn();
    render(<KpiFormDialog open kpi={null} isSubmitting={false} onOpenChange={() => {}} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
  });
  it('com nome, submete o draft', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<KpiFormDialog open kpi={null} isSubmitting={false} onOpenChange={() => {}} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Meu KPI' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Meu KPI', source: 'manual', metricKey: null })));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/kpis/admin/components/__tests__/KpiFormDialog.test.tsx`
Expected: FAIL — componente não existe.

- [ ] **Step 3: Implement `KpiFormDialog.tsx`** (molde `GoalFormDialog`, simplificado)

```tsx
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createEmptyKpiDraft, kpiToDraft } from '@/features/kpis/domain/kpiFactory';
import { validateKpiDraft } from '@/features/kpis/domain/kpiModel';
import { NATIVE_METRIC_KEYS } from '@/features/kpis/domain/kpiTypes';
import type { DashboardKpi, DashboardKpiDraft, KpiSource, KpiUnit } from '@/features/kpis/domain/kpiTypes';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; kpi: DashboardKpi | null; isSubmitting: boolean; onSubmit: (d: DashboardKpiDraft) => Promise<void>; }

export function KpiFormDialog({ open, onOpenChange, kpi, isSubmitting, onSubmit }: Props) {
  const [draft, setDraft] = useState<DashboardKpiDraft>(() => createEmptyKpiDraft());
  useEffect(() => { if (open) setDraft(kpi ? kpiToDraft(kpi) : createEmptyKpiDraft()); }, [open, kpi]);
  const update = (patch: Partial<DashboardKpiDraft>) => setDraft((c) => ({ ...c, ...patch }));

  const changeSource = (source: KpiSource) =>
    update({ source, metricKey: source === 'crm' ? (draft.metricKey ?? NATIVE_METRIC_KEYS[0]) : null });

  const handleSubmit = async () => {
    const errors = validateKpiDraft(draft);
    if (errors.length) { toast.error(errors[0]); return; }
    await onSubmit(draft);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{kpi ? 'Editar KPI' : 'Novo KPI'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label htmlFor="kpi-nome">Nome</Label><Input id="kpi-nome" value={draft.name} onChange={(e) => update({ name: e.target.value })} /></div>
          <div><Label htmlFor="kpi-desc">Descrição</Label><Textarea id="kpi-desc" value={draft.description} onChange={(e) => update({ description: e.target.value })} /></div>
          <div><Label htmlFor="kpi-cat">Categoria</Label><Input id="kpi-cat" value={draft.categoryId} onChange={(e) => update({ categoryId: e.target.value })} /></div>
          <div>
            <Label>Unidade</Label>
            <Select value={draft.unit} onValueChange={(v) => update({ unit: v as KpiUnit })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="count">Quantidade</SelectItem>
                <SelectItem value="currency">Moeda</SelectItem>
                <SelectItem value="percent">Percentual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Origem dos dados</Label>
            <Select value={draft.source} onValueChange={(v) => changeSource(v as KpiSource)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="crm">CRM (calculado)</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="planilha">Planilha</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {draft.source === 'crm' && (
            <div>
              <Label>Métrica do CRM</Label>
              <Select value={draft.metricKey ?? ''} onValueChange={(v) => update({ metricKey: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione a métrica" /></SelectTrigger>
                <SelectContent>{NATIVE_METRIC_KEYS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Implement `KpiList.tsx`** (padrão dnd-kit de `FotosUploader`, `verticalListSortingStrategy`)

```tsx
import { DndContext, closestCenter, useSensor, useSensors, PointerSensor, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DashboardKpi } from '@/features/kpis/domain/kpiTypes';

interface Props {
  kpis: DashboardKpi[]; isLoading: boolean;
  onEdit: (k: DashboardKpi) => void; onDelete: (k: DashboardKpi) => void;
  onReorder: (ids: string[]) => void; onToggleVisible: (k: DashboardKpi) => void; onToggleStatus: (k: DashboardKpi) => void;
}

function Row({ kpi, ...h }: { kpi: DashboardKpi } & Omit<Props, 'kpis' | 'isLoading' | 'onReorder'>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: kpi.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
      <button {...attributes} {...listeners} className="cursor-grab text-slate-400" aria-label="Arrastar"><GripVertical className="w-4 h-4" /></button>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold truncate">{kpi.name}</p>
        <p className="text-[11px] text-slate-400">{kpi.source}{kpi.isSystem ? ' · nativo' : ''}{kpi.status === 'inactive' ? ' · inativo' : ''}{!kpi.isVisible ? ' · oculto' : ''}</p>
      </div>
      <Button variant="ghost" size="sm" onClick={() => h.onToggleVisible(kpi)} aria-label="Visibilidade">{kpi.isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}</Button>
      <Button variant="ghost" size="sm" onClick={() => h.onEdit(kpi)} aria-label="Editar"><Pencil className="w-4 h-4" /></Button>
      {!kpi.isSystem && <Button variant="ghost" size="sm" onClick={() => h.onDelete(kpi)} aria-label="Excluir"><Trash2 className="w-4 h-4" /></Button>}
    </div>
  );
}

export function KpiList({ kpis, isLoading, onReorder, ...h }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  if (isLoading) return <p className="text-[12px] text-slate-400">Carregando KPIs...</p>;
  if (!kpis.length) return <p className="text-[12px] text-slate-400">Nenhum KPI cadastrado.</p>;
  const ids = kpis.map((k) => k.id);
  // DragEndEvent de @dnd-kit/core (tipar corretamente — sem `as never`).
  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const oldIndex = ids.indexOf(String(event.active.id));
    const newIndex = ids.indexOf(String(event.over.id));
    if (oldIndex < 0 || newIndex < 0) return; // id fora da lista (re-render) → não corrompe
    onReorder(arrayMove(ids, oldIndex, newIndex));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">{kpis.map((k) => <Row key={k.id} kpi={k} {...h} />)}</div>
      </SortableContext>
    </DndContext>
  );
}
```

- [ ] **Step 5: Run tests**

Run: `npm run test:run -- src/features/kpis/admin/components/__tests__/KpiFormDialog.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/kpis/admin/components/KpiFormDialog.tsx src/features/kpis/admin/components/KpiList.tsx src/features/kpis/admin/components/__tests__/KpiFormDialog.test.tsx
git commit -m "feat(kpis): formulário de KPI + lista com reordenação dnd-kit"
```

---

### Task 14: Wizard de Importação (passos local + dry-run)

> **Dividida em 3 subtasks (14a/14b/14c)** para revisão e rollback mais finos, conforme pedido. Cada subtask termina com deliverable testável e tem seu próprio gate de aprovação. 14a entrega a lógica pura de passos; 14b a casca + upload/preview; 14c o mapeamento + dry-run + persistência (com a interpretação do Preview).

#### Task 14a: Lógica pura de passos (`wizardSteps.ts`)

**Files:**
- Create: `src/features/kpis/admin/import/wizardSteps.ts`
- Test: `src/features/kpis/admin/import/__tests__/wizardSteps.test.ts`

**Interfaces:**
- Produces:
  - `const WIZARD_STEPS = ['upload','analise','preview','mapeamento','importacao'] as const`
  - `type WizardStep = (typeof WIZARD_STEPS)[number]`
  - `nextStep(s: WizardStep): WizardStep` (clampa no fim), `prevStep(s: WizardStep): WizardStep` (clampa no início)
  - `canAdvance(s: WizardStep, ctx: { hasTable: boolean; hasPlan: boolean }): boolean` — gate: não sai de `upload` sem `hasTable`; não entra em `importacao` sem `hasPlan` (só persiste após preview).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { WIZARD_STEPS, nextStep, prevStep, canAdvance } from '../wizardSteps';

describe('passos do wizard (puro)', () => {
  it('navega dentro dos limites', () => {
    expect(WIZARD_STEPS[0]).toBe('upload');
    expect(WIZARD_STEPS).toHaveLength(4); // upload, preview, mapeamento, importacao
    expect(nextStep('upload')).toBe('preview');
    expect(nextStep('importacao')).toBe('importacao'); // não passa do fim
    expect(prevStep('upload')).toBe('upload'); // não passa do início
    expect(prevStep('mapeamento')).toBe('preview');
  });
  it('gate: não avança de upload sem planilha; não importa sem plano', () => {
    expect(canAdvance('upload', { hasTable: false, hasPlan: false })).toBe(false);
    expect(canAdvance('upload', { hasTable: true, hasPlan: false })).toBe(true);
    expect(canAdvance('mapeamento', { hasTable: true, hasPlan: false })).toBe(false);
    expect(canAdvance('mapeamento', { hasTable: true, hasPlan: true })).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run -- src/features/kpis/admin/import/__tests__/wizardSteps.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implement `wizardSteps.ts`**

```typescript
/** Lógica PURA de navegação do wizard (sem React) — testável isoladamente. */
// A "análise" roda no upload (resultado aparece no preview), NÃO é passo de tela.
export const WIZARD_STEPS = ['upload', 'preview', 'mapeamento', 'importacao'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export const nextStep = (s: WizardStep): WizardStep =>
  WIZARD_STEPS[Math.min(WIZARD_STEPS.indexOf(s) + 1, WIZARD_STEPS.length - 1)];
export const prevStep = (s: WizardStep): WizardStep =>
  WIZARD_STEPS[Math.max(WIZARD_STEPS.indexOf(s) - 1, 0)];

/** Pode avançar a partir de `s`? Gate de segurança do fluxo. */
export function canAdvance(s: WizardStep, ctx: { hasTable: boolean; hasPlan: boolean }): boolean {
  if (s === 'upload') return ctx.hasTable;          // precisa ter lido a planilha
  if (s === 'mapeamento') return ctx.hasPlan;       // só vai p/ importação com plano (pós-preview)
  return true;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:run -- src/features/kpis/admin/import/__tests__/wizardSteps.test.ts`
Expected: PASS.

- [ ] **Step 5: NÃO commitar.** Deixar no working tree da branch. Arquivos: `wizardSteps.ts`, `__tests__/wizardSteps.test.ts`.

---

#### Task 14b: Casca do wizard + upload/análise/preview

**Files:**
- Create: `src/features/kpis/admin/components/KpiImportWizard.tsx` (casca: state, passos 1–3)
- Test: `src/features/kpis/admin/components/__tests__/KpiImportWizard.render.test.tsx`

**Interfaces:**
- Consumes: `WIZARD_STEPS`/`nextStep`/`prevStep`/`canAdvance` (14a); `GenericImportService.readGenericTable` + `discoverMetadata` (motor existente); `suggestMapping`/`buildImportPlan`/`buildPreview` (Task 5); shadcn `Dialog`/`Button`. Props `{ open; onOpenChange; existingKpis }`.
- Produces: o componente renderizando passo `upload` (input file) e `preview` (aba/linhas/colunas + coluna de KPI + períodos detectados). Os passos `mapeamento`/`importacao` ficam como placeholders visuais até 14c (sem persistência ainda).

- [ ] **Step 1: Write the failing test (render do passo upload)**

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
vi.mock('@/contexts/AuthContext', () => ({ useAuthContext: () => ({ tenantId: 't1', user: { id: 'u1', name: 'Gestor' } }) }));
import { KpiImportWizard } from '../KpiImportWizard';

describe('KpiImportWizard (casca)', () => {
  it('passo inicial mostra o input de arquivo', () => {
    render(<KpiImportWizard open onOpenChange={() => {}} existingKpis={[]} />);
    expect(document.body.textContent).toMatch(/passo\s*1\s*de\s*4/i); // 4 passos (sem 'analise')
    expect(document.querySelector('input[type=file]')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run -- src/features/kpis/admin/components/__tests__/KpiImportWizard.render.test.tsx`
Expected: FAIL — componente não existe.

- [ ] **Step 3: Implement a casca (até o passo preview)** — o esqueleto abaixo é a base; 14c completa `mapeamento`/`importacao`.

```tsx
/**
 * Wizard de importação de metas — passos em state local (sem framework novo),
 * padrão de Importar16PersonalitiesPage. Motor de leitura/análise = pipeline
 * genérico existente. 14b: upload→preview. 14c: mapeamento→dry-run→persistir.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuthContext } from '@/contexts/AuthContext';
import { GenericImportService } from '@/features/relatorios/import/generic/services/genericImportService';
import { discoverMetadata } from '@/features/relatorios/import/generic/metadataDiscovery';
import type { GenericTable, ColumnMetadata } from '@/features/relatorios/import/generic/types';
import { suggestMapping, buildImportPlan, buildPreview, type ImportMapping, type ImportPlan, type ImportPreview } from '@/features/kpis/admin/import/targetMapping';
import { persistImport, type ResolvedPlan } from '@/features/kpis/admin/services/kpiImportService';
import { WIZARD_STEPS, nextStep, prevStep, type WizardStep } from '@/features/kpis/admin/import/wizardSteps';
import type { DashboardKpi } from '@/features/kpis/domain/kpiTypes';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; existingKpis: DashboardKpi[]; }

export function KpiImportWizard({ open, onOpenChange, existingKpis }: Props) {
  const { tenantId, user } = useAuthContext() as { tenantId?: string; user?: { id: string; email?: string; name?: string } };
  const [step, setStep] = useState<WizardStep>('upload');
  const [table, setTable] = useState<GenericTable | null>(null);
  const [metadata, setMetadata] = useState<ColumnMetadata[]>([]);
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [dryRun, setDryRun] = useState<ResolvedPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');

  const reset = () => {
    setStep('upload'); setTable(null); setMetadata([]); setMapping(null);
    setPlan(null); setPreview(null); setDryRun(null); setFileName('');
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const t = await GenericImportService.readGenericTable(file);
      const meta = discoverMetadata(t);
      const m = suggestMapping(t, meta);
      setTable(t); setMetadata(meta); setMapping(m); setFileName(file.name); setStep('preview');
    } catch { toast.error('Erro ao ler a planilha'); } finally { setBusy(false); }
  };

  const actor = { id: user?.id || '', name: user?.name || user?.email || 'Gestor' };

  // [Task 14c] mapeamento → dry-run (congela o Preview p/ auditoria) → importação.
  const runDryRun = async () => {
    if (!table || !mapping) return;
    if (!tenantId || tenantId === 'owner') { toast.error('Selecione uma imobiliária para importar.'); return; }
    const p = buildImportPlan(table, mapping);
    const pv = buildPreview(table, metadata, mapping, p); // interpretação auditável
    setPlan(p); setPreview(pv);
    setBusy(true);
    try {
      const resolved = await persistImport({ plan: p, mapping: { target: mapping.target }, preview: pv, tenantId, actor, fileName, sheetName: table.sheetName, dryRun: true, existingKpis });
      setDryRun(resolved);
      setStep('importacao'); // só avança quando a prévia está pronta
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao pré-visualizar a importação.');
    } finally { setBusy(false); }
  };

  const confirmImport = async () => {
    if (!table || !mapping || !plan || !preview) return;
    if (!tenantId || tenantId === 'owner') { toast.error('Selecione uma imobiliária para importar.'); return; }
    setBusy(true);
    try {
      // Persiste a interpretação do Preview junto (kpi_import_batches.preview).
      await persistImport({ plan, mapping: { target: mapping.target }, preview, tenantId, actor, fileName, sheetName: table.sheetName, dryRun: false, existingKpis });
      toast.success('Importação concluída');
      reset(); onOpenChange(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro ao importar'); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Importar metas — passo {WIZARD_STEPS.indexOf(step) + 1} de {WIZARD_STEPS.length}</DialogTitle></DialogHeader>

        {step === 'upload' && (
          <div className="py-6 text-center">
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            {busy && <p className="mt-2 text-[12px] text-slate-400">Lendo planilha...</p>}
          </div>
        )}

        {step === 'preview' && table && (
          <div className="space-y-2 text-[12px]">
            <p>Aba: <b>{table.sheetName}</b> · {table.totalRows} linhas · {table.columns.length} colunas</p>
            <p>Coluna de KPI sugerida: <b>{mapping?.kpiNameColumn}</b></p>
            <p>Períodos detectados: <b>{mapping?.periodColumns.map((p) => p.column).join(', ') || 'nenhum'}</b></p>
          </div>
        )}

        {step === 'mapeamento' && mapping && (
          <div className="space-y-2 text-[12px]">
            <p>Confirme o que a planilha traz:</p>
            <div className="flex gap-2">
              <Button size="sm" variant={mapping.target === 'target' ? 'default' : 'outline'} onClick={() => setMapping({ ...mapping, target: 'target' })}>Metas</Button>
              <Button size="sm" variant={mapping.target === 'value' ? 'default' : 'outline'} onClick={() => setMapping({ ...mapping, target: 'value' })}>Realizado</Button>
            </div>
          </div>
        )}

        {step === 'importacao' && (
          <div className="space-y-2 text-[12px]">
            {!dryRun ? <p className="text-slate-400">Calculando prévia...</p> : (
              <>
                <p><b>{dryRun.creates.length}</b> KPIs novos · <b>{dryRun.updates.length}</b> metas a gravar · <b>{dryRun.ignored.length}</b> colunas ignoradas</p>
                {plan?.warnings.slice(0, 5).map((w, i) => <p key={i} className="text-amber-600">⚠ {w}</p>)}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          {step !== 'upload' && step !== 'importacao' && <Button variant="outline" onClick={() => setStep(prevStep(step))}>Voltar</Button>}
          {step === 'preview' && <Button onClick={() => setStep('mapeamento')}>Avançar</Button>}
          {step === 'mapeamento' && <Button onClick={runDryRun}>Pré-visualizar importação</Button>}
          {step === 'importacao' && <Button onClick={confirmImport} disabled={busy || !dryRun}>Confirmar importação</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

> Na **14b**, os blocos `mapeamento`/`importacao` e os handlers `runDryRun`/`confirmImport` podem ficar como stubs (botão desabilitado / "em breve"); o teste de render da 14b cobre só `upload`/`preview`. A **14c** ativa esses blocos exatamente como mostrado acima.

- [ ] **Step 4: Run render test (14b)**

Run: `npm run test:run -- src/features/kpis/admin/components/__tests__/KpiImportWizard.render.test.tsx`
Expected: PASS.

- [ ] **Step 5: NÃO commitar.** Deixar no working tree. Arquivos: `KpiImportWizard.tsx`, `__tests__/KpiImportWizard.render.test.tsx`.

---

#### Task 14c: Mapeamento + dry-run + confirmação (com persistência do Preview)

**Files:**
- Modify: `src/features/kpis/admin/components/KpiImportWizard.tsx` (ativa `mapeamento`/`importacao`, `runDryRun`/`confirmImport`)
- Test: `src/features/kpis/admin/components/__tests__/KpiImportWizard.flow.test.tsx`

**Interfaces:**
- Consumes: `buildPreview` (Task 5), `persistImport` com `preview` (Task 8). Os blocos e handlers são exatamente os mostrados no código da 14b (que na 14b estavam como stub).
- Produces: fluxo completo — escolher meta/realizado, pré-visualizar (dry-run, sem gravar), confirmar (grava batch + preview + upsert). **Persiste somente após confirmação.**

- [ ] **Step 1: Write the failing test (dry-run não grava; confirmar grava)**

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/contexts/AuthContext', () => ({ useAuthContext: () => ({ tenantId: 't1', user: { id: 'u1', name: 'Gestor' } }) }));
const persistSpy = vi.fn().mockResolvedValue({ creates: [], updates: [{ kpiName: 'X', periodStart: '2026-01-01', value: 1 }], conflicts: [], ignored: [] });
vi.mock('@/features/kpis/admin/services/kpiImportService', () => ({ persistImport: (...a: unknown[]) => persistSpy(...a) }));
vi.mock('@/features/relatorios/import/generic/services/genericImportService', () => ({
  GenericImportService: { readGenericTable: vi.fn().mockResolvedValue({ sheetName: 'Metas', totalRows: 1, truncated: false,
    columns: [{ name: 'KPI', label: 'KPI', index: 0 }, { name: 'Jan/2026', label: 'Jan/2026', index: 1 }],
    rows: [{ KPI: 'X', 'Jan/2026': '1' }] }) },
}));

import { KpiImportWizard } from '../KpiImportWizard';

describe('KpiImportWizard fluxo (14c)', () => {
  it('dry-run chama persistImport com dryRun:true (sem confirmar)', async () => {
    render(<KpiImportWizard open onOpenChange={() => {}} existingKpis={[]} />);
    // upload
    const file = new File(['x'], 'metas.xlsx');
    fireEvent.change(document.querySelector('input[type=file]')!, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText(/Aba:/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /avançar/i }));
    fireEvent.click(screen.getByRole('button', { name: /pré-visualizar/i }));
    await waitFor(() => expect(persistSpy).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true, preview: expect.any(Object) })));
  });
});
```

- [ ] **Step 2: Run to verify it fails (se 14b deixou stubs).** Run: `npm run test:run -- src/features/kpis/admin/components/__tests__/KpiImportWizard.flow.test.tsx` → FAIL.

- [ ] **Step 3: Ativar os blocos `mapeamento`/`importacao` e os handlers** (código já mostrado na 14b — remover os stubs).

- [ ] **Step 4: Run flow test.** Run: `npm run test:run -- src/features/kpis/admin/components/__tests__/KpiImportWizard.flow.test.tsx` → PASS.

- [ ] **Step 5: NÃO commitar.** Deixar no working tree. Arquivos: `KpiImportWizard.tsx`, `__tests__/KpiImportWizard.flow.test.tsx`.

---

### Task 15: E2E com Playwright MCP

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/kpis.spec.ts`
- Modify: `package.json` (script `"e2e": "playwright test"`)

**Interfaces:**
- Consumes: app rodando (Vite 8080 + Express 3001). Usuário de teste com role de gestão (admin/team_leader) no tenant de teste.

> **Execução via Playwright MCP:** os fluxos abaixo são roteirizados para rodar com o Playwright MCP (browser_navigate/click/fill/snapshot). O `playwright.config.ts` serve para execução headless reproduzível em CI; ambos exercitam os mesmos passos.

- [ ] **Step 1: Criar `playwright.config.ts`**

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:8080', trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

- [ ] **Step 2: Registrar script (instalação é GATE MANUAL — não rodar agora)**

Adicionar em `package.json` scripts: `"e2e": "playwright test"`.
> A instalação `npm i -D @playwright/test && npx playwright install chromium` é um **gate manual** (muda deps + baixa browser). NÃO instalar/rodar nesta task — os artefatos ficam prontos; a execução real depende do ambiente (app rodando + usuário/tenant de teste + migration 20260620 aplicada).

- [ ] **Step 3: Escrever `e2e/kpis.spec.ts`** (fluxos exigidos)

> ⚠️ **O arquivo `e2e/kpis.spec.ts` JÁ FOI ENDURECIDO (fonte de verdade).** O bloco abaixo é a versão inicial; o arquivo real corrige 3 fragilidades pegas no review: (1) helper `rowOf(page, nome)` = `page.locator('div.flex.items-center.gap-3', { hasText })` em vez de `locator('..')` (que parava no wrapper do texto, sem os botões Editar/Excluir); (2) login com helper `loginAsManager` que tenta preencher o CÓDIGO DO TENANT (`MinimalLoginScreen` exige tenantCode além de email/senha — `getByPlaceholder(/c[oó]digo|tenant/i)`); (3) pós-import, asserta que o título do passo do wizard sumiu (dialog fechou) em vez de caçar o toast transitório do Sonner. Variáveis: `E2E_TENANT`, `E2E_EMAIL`, `E2E_PASSWORD`.

> **Login real:** `MinimalLoginScreen` pede CÓDIGO DO TENANT + e-mail + senha (login = `(tenantCode, email, password)`). Campos: `type="email"` (placeholder `seu@email.com`), `type="password"` (placeholder `••••••••`), código do tenant, botão "Entrar". Ajustar seletores ao DOM real na 1ª execução (`browser_snapshot` do Playwright MCP).

```typescript
import { test, expect } from '@playwright/test';

// Pré-condição: usuário com role de gestão (admin/team_leader) no tenant de teste,
// migration 20260620 aplicada. Credenciais via E2E_TENANT/E2E_EMAIL/E2E_PASSWORD.

test.describe('KPIs configuráveis', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // MinimalLoginScreen: código do tenant + email + senha. Ajustar seletores ao DOM real.
    await page.getByPlaceholder(/seu@email\.com/i).fill(process.env.E2E_EMAIL!);
    await page.getByPlaceholder('••••••••').first().fill(process.env.E2E_PASSWORD!);
    // o campo de código do tenant pode não ter placeholder fixo — localizar por label/posição na execução.
    await page.getByRole('button', { name: /entrar/i }).click();
    await page.waitForLoadState('networkidle');
  });

  test('cria, edita e exclui um KPI', async ({ page }) => {
    await page.goto('/leads?tab=kpis');
    await page.getByRole('button', { name: /gerenciar kpis/i }).click();
    await page.getByRole('button', { name: /novo kpi/i }).click();
    await page.getByLabel(/nome/i).fill('KPI E2E');
    await page.getByRole('button', { name: /salvar/i }).click();
    await expect(page.getByText('KPI E2E')).toBeVisible();

    // editar
    await page.getByText('KPI E2E').locator('..').getByLabel('Editar').click();
    await page.getByLabel(/nome/i).fill('KPI E2E v2');
    await page.getByRole('button', { name: /salvar/i }).click();
    await expect(page.getByText('KPI E2E v2')).toBeVisible();

    // excluir
    await page.getByText('KPI E2E v2').locator('..').getByLabel('Excluir').click();
    await expect(page.getByText('KPI E2E v2')).toHaveCount(0);
  });

  test('KPI nativo não tem botão de excluir', async ({ page }) => {
    await page.goto('/leads?tab=kpis');
    await page.getByRole('button', { name: /gerenciar kpis/i }).click();
    const nativo = page.getByText('Total de Leads', { exact: true }).locator('..');
    await expect(nativo.getByLabel('Excluir')).toHaveCount(0);
  });

  test('wizard de import: upload → preview → dry-run → confirmar', async ({ page }) => {
    await page.goto('/leads?tab=kpis');
    await page.getByRole('button', { name: /gerenciar kpis/i }).click();
    await page.getByRole('button', { name: /importar planilha/i }).click();
    // Fixture de METAS (não a planilha de leads): coluna KPI + Jan/Fev 2026.
    await page.setInputFiles('input[type=file]', 'e2e/fixtures/metas.xlsx');
    await expect(page.getByText(/Aba:/)).toBeVisible();
    await page.getByRole('button', { name: /avançar/i }).click();
    await page.getByRole('button', { name: /metas/i }).first().click(); // escolhe "Metas" no mapeamento
    await page.getByRole('button', { name: /pré-visualizar/i }).click();
    await expect(page.getByText(/metas a gravar/i)).toBeVisible();
    await page.getByRole('button', { name: /confirmar importação/i }).click();
    await expect(page.getByText(/concluída/i)).toBeVisible();
  });
});
```

> Os seletores de login/edição devem ser ajustados ao DOM real na 1ª execução (usar `browser_snapshot` do Playwright MCP). A fixture `e2e/fixtures/metas.xlsx` (já criada) é uma planilha de METAS pequena (KPI + Jan/Fev 2026 + um KPI novo "Meta E2E Nova"), apropriada p/ o wizard — a planilha de referência `public/excel_ler.xlsx` é de LEADS e não serve para asserts de meta.

- [ ] **Step 4: Execução é GATE MANUAL (não rodar nesta task)**

Quando o ambiente estiver pronto (app via `npm run dev`, usuário de gestão + tenant de teste, migration 20260620 aplicada, `E2E_TENANT`/`E2E_EMAIL`/`E2E_PASSWORD` setados): instalar (`npm i -D @playwright/test && npx playwright install chromium`) e rodar `npm run e2e`. Esperado: 3 testes PASS após ajustar os seletores de login ao DOM real. NESTA task, apenas os artefatos são criados — NÃO instalar, NÃO rodar.

- [ ] **Step 5: NÃO commitar.** Deixar no working tree. Arquivos: `playwright.config.ts`, `e2e/kpis.spec.ts`, `e2e/fixtures/metas.xlsx`, `package.json` (script `e2e`).

---

## Validação de BD (gate pré-merge — manual, sem PG MCP nesta sessão)

Antes do merge, com acesso à base (Supabase SQL editor ou PG MCP quando disponível):

1. Aplicar `20260620_create_dashboard_kpis.sql` e confirmar criação das 5 tabelas + seed dos nativos por tenant.
2. `EXPLAIN ANALYZE` das 3 queries do overview configurável:
   - `SELECT * FROM dashboard_kpis WHERE tenant_id = $1 ORDER BY display_order;`
   - `SELECT * FROM kpi_targets WHERE tenant_id=$1 AND period_type='month' AND period_start=$2;`
   - idem `kpi_values`.
   Confirmar uso dos índices `idx_dashboard_kpis_tenant_order` / `idx_kpi_targets_lookup` / `idx_kpi_values_lookup` (Index Scan, não Seq Scan).
3. Testar RLS: usuário `corretor` NÃO consegue `INSERT/UPDATE/DELETE` em `dashboard_kpis`; consegue `SELECT`.

## Pós-implementação (exigências do escopo)

1. `/code-review` (Code Review Plugin) sobre o diff completo.
2. Code Simplifier (`code-simplifier`) sobre o código novo.
3. Validações E2E via Playwright MCP (Task 15).
4. Relatório final: snapshot de regressão dos 6 nativos (mesmos números) + cobertura dos fluxos exigidos.

/**
 * Feature KPIs — barrel público.
 *
 * Consumidores devem importar apenas daqui. A fronteira de dados é o contrato
 * `KpisService` (types.ts); a implementação concreta (Supabase hoje, REST
 * amanhã) fica encapsulada e é trocável via `setKpisService`.
 */

export { KpisPage } from './pages/KpisPage';
export { KpiAdminPage } from './admin/pages/KpiAdminPage';
export { useKpis, setKpisService } from './hooks/useKpis';
export { restKpisService } from './services/restKpisService';
export { supabaseKpisService } from './services/supabaseKpisService';
export { monthPeriod, previousMonthPeriod } from './period';
export type {
  KpisService,
  KpisOverview,
  KpiPeriod,
  KpiSummaryCard,
  KpiFunnel,
  KpiSourceBreakdown,
  KpiPriceRange,
  KpiGoalProgress,
} from './types';

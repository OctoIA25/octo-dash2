/**
 * Feature: Leads (Kanban, Central, Bolsao, Funnis)
 *
 * Feature mais complexa do CRM — contem toda a gestao de leads:
 * - Kanban de leads atribuidos
 * - Central de leads (integração Kenlo)
 * - Bolsao (pool de leads redistribuidos)
 * - Funnis de conversao
 * - Graficos de origem, temperatura, etapas
 */

// Pages
export { LeadsPage } from './pages/LeadsPage';
export { MeusLeadsPage } from './pages/MeusLeadsPage';
export { CentralLeadsPage } from './pages/CentralLeadsPage';
export { BolsaoPage } from './pages/BolsaoPage';
export { ClienteInteressadoPage } from './pages/ClienteInteressadoPage';
export { ClienteProprietarioPage } from './pages/ClienteProprietarioPage';

// Hooks
export { useLeadsData } from './hooks/useLeadsData';
export { useLeadsMetrics } from './hooks/useLeadsMetrics';

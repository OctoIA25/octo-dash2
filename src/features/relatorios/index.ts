/**
 * Feature: Relatorios e Dashboards
 */

export { RelatoriosPage } from './pages/RelatoriosPage';

// Importacao de planilhas Excel (schema-less, qualquer topico) no contexto de Relatorios.
// Rota: /relatorios/importacao | Permissao: 'excel'
export { GenericImportPage as RelatorioImportPage } from './import/generic/pages/GenericImportPage';

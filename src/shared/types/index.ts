/**
 * Tipos compartilhados do projeto
 */

// Re-exportar tipos de ProcessedLead
export type { ProcessedLead } from '@/data/realLeadsProcessor';

// Tipos de navegação
export type SidebarSection = 'gestao' | 'meus-leads' | 'bolsao';
export type DashboardSubSection = 'leads' | 'proprietarios' | 'corretores' | 'imoveis' | 'geral';
export type LeadsSubSection = 'todos' | 'venda' | 'locacao';
export type ProprietariosSubSection = 'vendedor' | 'locatario';
export type ClienteInteressadoSubSection = 'geral' | 'pre-atendimento' | 'bolsao' | 'atendimento';
export type ClienteProprietarioSubSection = 'cliente-proprietario' | 'estudo-mercado';

// Tipos de métricas
export interface MetricCard {
  label: string;
  value: number | string;
  icon?: React.ComponentType;
  color?: string;
  trend?: number;
}

export interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string | string[];
  }[];
}

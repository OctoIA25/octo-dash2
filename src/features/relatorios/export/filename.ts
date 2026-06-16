import type { ReportModel, ExportFormat } from './types';

/** Gera um nome de arquivo seguro e legível: "relatorio-marketing-2026-06-14.pdf". */
export function buildReportFilename(model: ReportModel, format: ExportFormat): string {
  const slug = model.title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const date = new Date().toISOString().slice(0, 10);
  return `${slug || 'relatorio'}-${date}.${format}`;
}

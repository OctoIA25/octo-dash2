import type * as XLSXType from 'xlsx';
import { supabase } from '@/lib/supabaseClient';
import { parseGenericTable } from '../schemalessParser';
import { discoverMetadata } from '../metadataDiscovery';
import { defaultAnalyticsProvider, type AnalyticsProvider } from '../analytics';
import type { GenericReport, GenericTable } from '../types';

let xlsxPromise: Promise<typeof XLSXType> | null = null;
const loadXLSX = (): Promise<typeof XLSXType> => {
    if (!xlsxPromise) xlsxPromise = import('xlsx');
    return xlsxPromise;
};

export interface GenericImportRecord {
    id: string;
    nome_arquivo: string | null;
    sheet_name: string | null;
    columns: GenericTable['columns'];
    rows: GenericTable['rows'];
    metadata: GenericReport['metadata'];
    total_rows: number;
    truncated: boolean;
    created_at: string;
}

/**
 * Pipeline generico de importacao de planilhas.
 *
 *   Excel -> parse (schema-less) -> discovery (metadata) -> analytics (insights)
 *
 * Sem dependencia de dominio: aceita planilhas de qualquer topico.
 */
export class GenericImportService {
    /** Le o arquivo e roda o pipeline completo, retornando o relatorio generico. */
    static async buildReport(
        file: File,
        analytics: AnalyticsProvider = defaultAnalyticsProvider,
    ): Promise<GenericReport> {
        const table = await this.readGenericTable(file);
        const metadata = discoverMetadata(table);
        const insights = await analytics.analyze(table, metadata);
        return { table, metadata, insights };
    }

    /** Le a primeira aba com dados em uma GenericTable. */
    static async readGenericTable(file: File): Promise<GenericTable> {
        const XLSX = await loadXLSX();

        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (event) => {
                try {
                    const workbook = XLSX.read(event.target?.result, { type: 'array' });

                    for (const sheetName of workbook.SheetNames) {
                        const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
                            header: 1,
                        }) as unknown[][];
                        const table = parseGenericTable(matrix, sheetName);
                        if (table.rows.length > 0) {
                            resolve(table);
                            return;
                        }
                    }

                    resolve({ sheetName: '', columns: [], rows: [], totalRows: 0, truncated: false });
                } catch (err) {
                    reject(err);
                }
            };

            reader.onerror = (error) => reject(error);
            reader.readAsArrayBuffer(file);
        });
    }

    /** Persiste um relatorio generico para o tenant. */
    static async save(
        report: GenericReport,
        tenantId: string,
        filename: string,
        userId: string,
    ): Promise<string> {
        const { data, error } = await supabase
            .from('generic_imports')
            .insert({
                tenant_id: tenantId,
                nome_arquivo: filename,
                sheet_name: report.table.sheetName,
                columns: report.table.columns,
                rows: report.table.rows,
                metadata: report.metadata,
                total_rows: report.table.totalRows,
                truncated: report.table.truncated,
                criado_por: userId,
            })
            .select('id')
            .single();

        if (error) throw new Error(error.message);
        return data.id;
    }

    /** Lista as importacoes genericas do tenant (sem o payload pesado de rows). */
    static async list(tenantId: string): Promise<Array<Omit<GenericImportRecord, 'rows'>>> {
        const { data, error } = await supabase
            .from('generic_imports')
            .select('id, nome_arquivo, sheet_name, columns, metadata, total_rows, truncated, created_at')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false });

        if (error) return [];
        return data ?? [];
    }

    /** Carrega uma importacao completa (com rows) por id. */
    static async getById(id: string, tenantId: string): Promise<GenericImportRecord | null> {
        const { data, error } = await supabase
            .from('generic_imports')
            .select('*')
            .eq('id', id)
            .eq('tenant_id', tenantId)
            .single();

        if (error) return null;
        return data;
    }

    static async remove(id: string, tenantId: string): Promise<boolean> {
        const { error } = await supabase
            .from('generic_imports')
            .delete()
            .eq('id', id)
            .eq('tenant_id', tenantId);

        if (error) throw new Error(error.message);
        return true;
    }
}

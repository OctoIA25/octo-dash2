import { supabase } from '@/lib/supabaseClient';
import { ExcelRow, ExcelImportData, ExcelUploadResult } from '../types';

export class ExcelImportService {

    static async importExcelData(
        rows: ExcelRow[],
        tenantId: string,
        filename: string,
        userId: string,
        anoReferencia: number
    ): Promise<ExcelUploadResult> {
        let imported = 0;
        const errors: string[] = [];

        try {
            if (rows.length === 0) {
                throw new Error('Nenhum registro valido encontrado na planilha');
            }

            const validUserId = userId;

            const dataToInsert: ExcelImportData[] = rows.map(row => ({
                tenant_id: tenantId,
                nome_arquivo: filename,
                ano_referencia: anoReferencia,
                corretor_nome: row.corretor,
                corretor_nivel: row.nivel || '',
                equipe: row.equipe || '',
                janeiro: this.toNumber(row.janeiro),
                fevereiro: this.toNumber(row.fevereiro),
                marco: this.toNumber(row.marco),
                abril: this.toNumber(row.abril),
                maio: this.toNumber(row.maio),
                junho: this.toNumber(row.junho),
                julho: this.toNumber(row.julho),
                agosto: this.toNumber(row.agosto),
                setembro: this.toNumber(row.setembro),
                outubro: this.toNumber(row.outubro),
                novembro: this.toNumber(row.novembro),
                dezembro: this.toNumber(row.dezembro),
                total_mensal: this.toNumber(row.total_mensal),
                valor_total: this.toNumber(row.valor_total),
                criado_por: validUserId,
            }));

            await this.replaceYearRows(dataToInsert, tenantId, anoReferencia);
            imported = dataToInsert.length;

        } catch (err: any) {
            console.error('[importExcelData] Erro fatal:', err);
            errors.push(`Erro: ${err.message || 'Erro desconhecido'}`);
        }

        return {
            success: errors.length === 0,
            imported,
            errors,
            filename,
            anoReferencia,
        };
    }

    private static toNumber(value: unknown): number {
        if (value === null || value === undefined || value === '') return 0;
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

        const compact = String(value).replace(/[R$\s]/g, '');
        const lastComma = compact.lastIndexOf(',');
        const lastDot = compact.lastIndexOf('.');
        let cleaned = compact;

        if (lastComma !== -1 && lastDot !== -1) {
            cleaned = lastComma > lastDot
                ? compact.replace(/\./g, '').replace(',', '.')
                : compact.replace(/,/g, '');
        } else if (lastComma !== -1) {
            cleaned = compact.replace(/\./g, '').replace(',', '.');
        } else if (lastDot !== -1) {
            const decimalDigits = compact.length - lastDot - 1;
            cleaned = decimalDigits > 2 ? compact.replace(/\./g, '') : compact;
        }

        const numericValue = Number(cleaned);
        return Number.isFinite(numericValue) ? numericValue : 0;
    }

    private static async replaceYearRows(
        dataToInsert: ExcelImportData[],
        tenantId: string,
        anoReferencia: number
    ) {
        const { error: deleteError } = await supabase
            .from('excel_imports')
            .delete()
            .eq('tenant_id', tenantId)
            .eq('ano_referencia', anoReferencia);

        if (deleteError) throw deleteError;

        const { error: insertError } = await supabase
            .from('excel_imports')
            .insert(dataToInsert);

        if (insertError) throw insertError;
    }

    static async getExcelImports(tenantId: string, ano?: number) {
        let query = supabase
            .from('excel_imports')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('corretor_nome', { ascending: true });

        if (ano) query = query.eq('ano_referencia', ano);

        const { data, error } = await query;
        if (error) return [];
        return data;
    }

    static async deleteExcelImport(id: string, tenantId: string) {
        const { error } = await supabase
            .from('excel_imports')
            .delete()
            .eq('id', id)
            .eq('tenant_id', tenantId);

        if (error) throw new Error(error.message);
        return true;
    }

    static async getDistinctAnos(tenantId: string): Promise<number[]> {
        const { data, error } = await supabase
            .from('excel_imports')
            .select('ano_referencia')
            .eq('tenant_id', tenantId);

        if (error) return [];

        const anos = data.map((d: any) => Number(d.ano_referencia)).filter(n => !isNaN(n));
        return Array.from(new Set(anos)).sort((a, b) => b - a);
    }
}

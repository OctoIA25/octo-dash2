export interface ExcelImportData {
    id?: string;
    tenant_id: string;
    nome_arquivo?: string;
    ano_referencia: number;
    corretor_nome: string;
    corretor_nivel?: string;
    equipe?: string;
    janeiro: number;
    fevereiro: number;
    marco: number;
    abril: number;
    maio: number;
    junho: number;
    julho: number;
    agosto: number;
    setembro: number;
    outubro: number;
    novembro: number;
    dezembro: number;
    total_mensal: number;
    valor_total: number;
    criado_por?: string;
}

export interface ExcelRow {
    corretor: string;
    nivel?: string;
    equipe?: string;
    [key: string]: string | number | undefined;
}

export interface ExcelUploadResult {
    success: boolean;
    imported: number;
    errors: string[];
    filename: string;
    anoReferencia?: number;
}

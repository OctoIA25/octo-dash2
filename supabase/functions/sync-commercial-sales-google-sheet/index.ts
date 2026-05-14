import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const DEFAULT_SPREADSHEET_ID = "1kxCtpZ04tDig_x7m_4QOIqDNWv-AIbLA";
const DEFAULT_SHEET_GID = "292051209";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MONTHS: Record<string, number> = {
  JANEIRO: 1,
  FEVEREIRO: 2,
  MARCO: 3,
  MARÇO: 3,
  ABRIL: 4,
  MAIO: 5,
  JUNHO: 6,
  JULHO: 7,
  AGOSTO: 8,
  SETEMBRO: 9,
  OUTUBRO: 10,
  NOVEMBRO: 11,
  DEZEMBRO: 12,
};

type CommercialSaleRow = {
  tenant_id: string;
  import_batch_id: string | null;
  nome_arquivo: string;
  spreadsheet_id: string;
  sheet_gid: string;
  source_row_number: number;
  source_row_key: string;
  content_hash: string;
  empreendimento: string | null;
  quadra: string | null;
  unidade: string | null;
  origem: string | null;
  area_m2: number;
  valor_m2: number;
  total_unidade: number;
  valor_vgv: number;
  valor_vgc: number;
  cliente_nome: string | null;
  corretor_nome: string | null;
  corretor_email: string | null;
  tipo: string | null;
  repasse_20: number;
  repasse_40: number;
  repasse_45: number;
  repasse_50: number;
  team_leader_nome: string | null;
  team_leader_valor: number;
  indicacao: string | null;
  valor_imovel: number;
  comissao_total_venda: number;
  valor_conta_japi: number;
  data_assinatura: string | null;
  data_recebimento: string | null;
  mes_referencia: number | null;
  ano_referencia: number;
  observacoes: string | null;
  raw_row: Record<string, unknown>;
  is_active: boolean;
  last_seen_at: string;
};

type ExistingSale = {
  id: string;
  source_row_number: number;
  content_hash: string | null;
  is_active: boolean;
};

type SyncRequest = {
  tenantId?: string;
  spreadsheetId?: string;
  sheetGid?: string;
  sourceUrl?: string;
  filename?: string;
  anoReferencia?: number;
  dryRun?: boolean;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function nullableText(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const next = csv[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function parseNumber(value: string | null | undefined): number {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;

  const compact = raw
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .replace(/%/g, "")
    .replace(/[^\d,.-]/g, "");

  if (!compact || compact === "-" || compact === "," || compact === ".") return 0;

  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  let cleaned = compact;

  if (lastComma !== -1 && lastDot !== -1) {
    cleaned = lastComma > lastDot
      ? compact.replace(/\./g, "").replace(",", ".")
      : compact.replace(/,/g, "");
  } else if (lastComma !== -1) {
    cleaned = compact.replace(/\./g, "").replace(",", ".");
  } else if (lastDot !== -1) {
    const decimalDigits = compact.length - lastDot - 1;
    cleaned = decimalDigits > 2 ? compact.replace(/\./g, "") : compact;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value: string | null | undefined, fallbackYear: number): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const brDate = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (brDate) {
    const day = Number(brDate[1]);
    const month = Number(brDate[2]);
    let year = brDate[3] ? Number(brDate[3]) : fallbackYear;
    if (year < 100) year += 2000;

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
    }
  }

  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;

  return null;
}

function findHeaderRow(rows: string[][]): number {
  return rows.findIndex((row) => {
    const normalized = row.map(normalizeText);
    return normalized.includes("EMPREENDIMENTO") &&
      normalized.includes("QUADRA") &&
      normalized.some((cell) => cell.includes("TOTAL") && cell.includes("-3"));
  });
}

function findColumn(headers: string[], candidates: string[], fallback: number): number {
  const normalizedHeaders = headers.map(normalizeText);

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeText(candidate);
    const exactIndex = normalizedHeaders.findIndex((header) => header === normalizedCandidate);
    if (exactIndex !== -1) return exactIndex;
  }

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeText(candidate);
    const partialIndex = normalizedHeaders.findIndex((header) => header.includes(normalizedCandidate));
    if (partialIndex !== -1) return partialIndex;
  }

  return fallback;
}

function buildColumnMap(headers: string[]) {
  return {
    empreendimento: findColumn(headers, ["Empreendimento"], 0),
    quadra: findColumn(headers, ["Quadra"], 1),
    unidade: findColumn(headers, ["Unidade"], 2),
    origem: findColumn(headers, ["Origem"], 3),
    areaM2: findColumn(headers, ["Área M²", "Area M2"], 4),
    valorM2: findColumn(headers, ["R$ M²", "R$ M2"], 5),
    totalUnidade: findColumn(headers, ["Total Unidade"], 6),
    valorVgv: findColumn(headers, ["Total (-3%)"], 7),
    valorVgc: findColumn(headers, ["Comissão Total", "Comissao Total"], 8),
    cliente: findColumn(headers, ["Cliente"], 9),
    corretor: findColumn(headers, ["Corretor"], 11),
    tipo: findColumn(headers, ["Tipo"], 12),
    repasse20: findColumn(headers, ["20%"], 13),
    repasse40: findColumn(headers, ["40%"], 14),
    repasse45: findColumn(headers, ["45%"], 15),
    repasse50: findColumn(headers, ["50%"], 16),
    teamLeader: findColumn(headers, ["Team Leader"], 17),
    indicacao: findColumn(headers, ["Indicação", "Indicacao"], 18),
    valorImovel: findColumn(headers, ["Valor do imóvel", "Valor do imovel"], 20),
    comissaoTotalVenda: findColumn(headers, ["Comiss. total da venda", "Comiss total da venda"], 21),
    valorContaJapi: findColumn(headers, ["FICA Conta Japi"], 22),
    dataAssinatura: findColumn(headers, ["Data de Assinatura"], 23),
    dataRecebimento: findColumn(headers, ["Data de recebimento"], 24),
  };
}

function getMonthFromRow(row: string[]): number | null {
  const normalizedRow = normalizeText(row.join(" "));
  if (!normalizedRow.includes("TOTAL DE VENDAS")) return null;

  const firstFilledCell = row.find((cell) => String(cell ?? "").trim());
  const normalized = normalizeText(firstFilledCell);
  return MONTHS[normalized] || null;
}

function isTotalOrSectionRow(row: string[]): boolean {
  const normalized = normalizeText(row.join(" "));
  return normalized.includes("TOTAL DE VENDAS") ||
    normalized.includes("FATURAMENTO TOTAL") ||
    normalized.includes("VGV VGC") ||
    normalized === "";
}

function isEmptyRow(row: string[]): boolean {
  return row.every((cell) => !String(cell ?? "").trim());
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function parseCommercialSalesRows(
  rows: string[][],
  params: {
    tenantId: string;
    batchId: string | null;
    filename: string;
    spreadsheetId: string;
    sheetGid: string;
    anoReferencia: number;
  },
): Promise<{ sales: CommercialSaleRow[]; ignored: number; headerRow: number }> {
  const headerRow = findHeaderRow(rows);
  if (headerRow === -1) throw new Error("Cabeçalho da planilha não encontrado");

  const columns = buildColumnMap(rows[headerRow]);
  const sales: CommercialSaleRow[] = [];
  let ignored = 0;
  let currentMonth: number | null = null;
  const now = new Date().toISOString();

  for (let rowIndex = headerRow + 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] || [];

    if (isEmptyRow(row)) {
      ignored++;
      continue;
    }

    const detectedMonth = getMonthFromRow(row);
    if (detectedMonth) {
      currentMonth = detectedMonth;
      ignored++;
      continue;
    }

    if (isTotalOrSectionRow(row)) {
      ignored++;
      continue;
    }

    const empreendimento = nullableText(row[columns.empreendimento]);
    const quadra = nullableText(row[columns.quadra]);
    const unidade = nullableText(row[columns.unidade]);
    const origem = nullableText(row[columns.origem]);
    const clienteNome = nullableText(row[columns.cliente]);
    const corretorNome = nullableText(row[columns.corretor]);
    const tipo = nullableText(row[columns.tipo]);
    const rawTeamLeader = nullableText(row[columns.teamLeader]);
    const teamLeaderValor = parseNumber(row[columns.teamLeader]);
    const teamLeaderNome = teamLeaderValor > 0 ? null : rawTeamLeader;
    const indicacao = nullableText(row[columns.indicacao]);

    const areaM2 = parseNumber(row[columns.areaM2]);
    const valorM2 = parseNumber(row[columns.valorM2]);
    const totalUnidade = parseNumber(row[columns.totalUnidade]);
    const valorVgv = parseNumber(row[columns.valorVgv]);
    const valorVgc = parseNumber(row[columns.valorVgc]);
    const repasse20 = parseNumber(row[columns.repasse20]);
    const repasse40 = parseNumber(row[columns.repasse40]);
    const repasse45 = parseNumber(row[columns.repasse45]);
    const repasse50 = parseNumber(row[columns.repasse50]);
    const valorImovel = parseNumber(row[columns.valorImovel]);
    const comissaoTotalVenda = parseNumber(row[columns.comissaoTotalVenda]);
    const valorContaJapi = parseNumber(row[columns.valorContaJapi]);

    const hasIdentity = Boolean(
      empreendimento || quadra || unidade || origem || clienteNome || corretorNome || tipo || teamLeaderNome || indicacao
    );
    const hasMoney = [
      areaM2,
      valorM2,
      totalUnidade,
      valorVgv,
      valorVgc,
      repasse20,
      repasse40,
      repasse45,
      repasse50,
      teamLeaderValor,
      valorImovel,
      comissaoTotalVenda,
      valorContaJapi,
    ].some((value) => value > 0);

    if (!hasIdentity || !hasMoney) {
      ignored++;
      continue;
    }

    const rawDataAssinatura = row[columns.dataAssinatura];
    const rawDataRecebimento = row[columns.dataRecebimento];
    const dataAssinatura = parseDate(rawDataAssinatura, params.anoReferencia);
    const dataRecebimento = parseDate(rawDataRecebimento, params.anoReferencia);

    const extraNotes = row
      .slice(columns.dataRecebimento + 1)
      .map((cell) => String(cell ?? "").trim())
      .filter(Boolean);

    if (rawDataAssinatura && !dataAssinatura) extraNotes.push(`Data de assinatura: ${rawDataAssinatura}`);
    if (rawDataRecebimento && !dataRecebimento) extraNotes.push(`Data de recebimento: ${rawDataRecebimento}`);

    const rawRow = {
      row_number: rowIndex + 1,
      values: row,
    };
    const normalizedForHash = JSON.stringify({
      spreadsheet_id: params.spreadsheetId,
      sheet_gid: params.sheetGid,
      row_number: rowIndex + 1,
      values: row.map((cell) => String(cell ?? "").trim()),
    });

    const contentHash = await sha256(normalizedForHash);

    sales.push({
      tenant_id: params.tenantId,
      import_batch_id: params.batchId,
      nome_arquivo: params.filename,
      spreadsheet_id: params.spreadsheetId,
      sheet_gid: params.sheetGid,
      source_row_number: rowIndex + 1,
      source_row_key: `${params.spreadsheetId}:${params.sheetGid}:${rowIndex + 1}`,
      content_hash: contentHash,
      empreendimento,
      quadra,
      unidade,
      origem,
      area_m2: areaM2,
      valor_m2: valorM2,
      total_unidade: totalUnidade,
      valor_vgv: valorVgv,
      valor_vgc: valorVgc,
      cliente_nome: clienteNome,
      corretor_nome: corretorNome,
      corretor_email: null,
      tipo,
      repasse_20: repasse20,
      repasse_40: repasse40,
      repasse_45: repasse45,
      repasse_50: repasse50,
      team_leader_nome: teamLeaderNome,
      team_leader_valor: teamLeaderValor,
      indicacao,
      valor_imovel: valorImovel,
      comissao_total_venda: comissaoTotalVenda,
      valor_conta_japi: valorContaJapi,
      data_assinatura: dataAssinatura,
      data_recebimento: dataRecebimento,
      mes_referencia: currentMonth,
      ano_referencia: params.anoReferencia,
      observacoes: extraNotes.length > 0 ? extraNotes.join(" | ") : null,
      raw_row: rawRow,
      is_active: true,
      last_seen_at: now,
    });
  }

  return { sales, ignored, headerRow: headerRow + 1 };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Use POST" }, 405);
  }

  try {
    const configuredSecret = Deno.env.get("COMMERCIAL_SALES_SYNC_SECRET");
    const requestSecret = req.headers.get("x-sync-secret");
    if (configuredSecret && requestSecret !== configuredSecret) {
      return jsonResponse({ ok: false, error: "Não autorizado" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = (await req.json().catch(() => ({}))) as SyncRequest;
    const spreadsheetId = body.spreadsheetId || Deno.env.get("COMMERCIAL_SALES_SPREADSHEET_ID") || DEFAULT_SPREADSHEET_ID;
    const sheetGid = body.sheetGid || Deno.env.get("COMMERCIAL_SALES_SHEET_GID") || DEFAULT_SHEET_GID;
    const tenantId = body.tenantId || Deno.env.get("COMMERCIAL_SALES_TENANT_ID");
    const anoReferencia = body.anoReferencia || Number(Deno.env.get("COMMERCIAL_SALES_YEAR")) || new Date().getFullYear();
    const filename = body.filename || "google-sheet-commercial-sales.csv";
    const sourceUrl = body.sourceUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${sheetGid}`;

    if (!tenantId) {
      return jsonResponse({ ok: false, error: "tenantId é obrigatório" }, 400);
    }

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id")
      .eq("id", tenantId)
      .maybeSingle();

    if (tenantError || !tenant) {
      return jsonResponse({ ok: false, error: `Tenant não encontrado: ${tenantId}` }, 404);
    }

    const csvResponse = await fetch(sourceUrl);
    if (!csvResponse.ok) {
      return jsonResponse({
        ok: false,
        error: `Erro ao baixar CSV: ${csvResponse.status} ${csvResponse.statusText}`,
      }, 502);
    }

    const csv = await csvResponse.text();
    const parsedCsvRows = parseCsv(csv);

    if (body.dryRun) {
      const parsed = await parseCommercialSalesRows(parsedCsvRows, {
        tenantId,
        batchId: null,
        filename,
        spreadsheetId,
        sheetGid,
        anoReferencia,
      });

      return jsonResponse({
        ok: true,
        dryRun: true,
        totalCsvRows: parsedCsvRows.length,
        headerRow: parsed.headerRow,
        parsedRows: parsed.sales.length,
        ignoredRows: parsed.ignored,
        sample: parsed.sales.slice(0, 3),
      });
    }

    const { data: batch, error: batchError } = await supabase
      .from("commercial_sales_import_batches")
      .insert({
        tenant_id: tenantId,
        nome_arquivo: filename,
        status: "processing",
        source_type: "google_sheet",
        spreadsheet_id: spreadsheetId,
        sheet_gid: sheetGid,
        source_url: sourceUrl,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (batchError || !batch) {
      throw batchError || new Error("Não foi possível criar o batch de importação");
    }

    const parsed = await parseCommercialSalesRows(parsedCsvRows, {
      tenantId,
      batchId: batch.id,
      filename,
      spreadsheetId,
      sheetGid,
      anoReferencia,
    });

    const { data: existingRows, error: existingError } = await supabase
      .from("commercial_sales")
      .select("id, source_row_number, content_hash, is_active")
      .eq("tenant_id", tenantId)
      .eq("spreadsheet_id", spreadsheetId)
      .eq("sheet_gid", sheetGid);

    if (existingError) throw existingError;

    const existingByRowNumber = new Map<number, ExistingSale>();
    (existingRows || []).forEach((row: ExistingSale) => {
      existingByRowNumber.set(row.source_row_number, row);
    });

    const seenRowNumbers = new Set(parsed.sales.map((sale) => sale.source_row_number));
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let deactivated = 0;

    for (const sale of parsed.sales) {
      const existing = existingByRowNumber.get(sale.source_row_number);

      if (!existing) {
        const { error } = await supabase.from("commercial_sales").insert(sale);
        if (error) throw error;
        inserted++;
        continue;
      }

      if (existing.content_hash !== sale.content_hash || !existing.is_active) {
        const { error } = await supabase
          .from("commercial_sales")
          .update(sale)
          .eq("id", existing.id);
        if (error) throw error;
        updated++;
      } else {
        const { error } = await supabase
          .from("commercial_sales")
          .update({
            import_batch_id: batch.id,
            last_seen_at: sale.last_seen_at,
            is_active: true,
          })
          .eq("id", existing.id);
        if (error) throw error;
        unchanged++;
      }
    }

    for (const existing of existingByRowNumber.values()) {
      if (seenRowNumbers.has(existing.source_row_number) || !existing.is_active) continue;

      const { error } = await supabase
        .from("commercial_sales")
        .update({ is_active: false, last_seen_at: new Date().toISOString(), import_batch_id: batch.id })
        .eq("id", existing.id);

      if (error) throw error;
      deactivated++;
    }

    const { error: updateBatchError } = await supabase
      .from("commercial_sales_import_batches")
      .update({
        total_linhas: parsedCsvRows.length,
        linhas_importadas: parsed.sales.length,
        linhas_atualizadas: updated,
        linhas_ignoradas: parsed.ignored,
        status: "completed",
        finished_at: new Date().toISOString(),
      })
      .eq("id", batch.id);

    if (updateBatchError) throw updateBatchError;

    return jsonResponse({
      ok: true,
      batchId: batch.id,
      sourceUrl,
      totalCsvRows: parsedCsvRows.length,
      headerRow: parsed.headerRow,
      parsedRows: parsed.sales.length,
      ignoredRows: parsed.ignored,
      inserted,
      updated,
      unchanged,
      deactivated,
    });
  } catch (error) {
    console.error("[sync-commercial-sales-google-sheet] erro:", error);
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    }, 500);
  }
});

/**
 * Exportação do catálogo de imóveis em XLSX (aba Catálogo > "Exportar").
 *
 *   POST /api/v1/imoveis/exportar  { tenantId, imoveis: ImovelExportavel[] }
 *
 * O catálogo é montado no front (XML + imoveis_locais + filtros em memória), então
 * o cliente manda a lista JÁ filtrada e o servidor só valida, monta a planilha e
 * aplica o gate de papel: owner da plataforma OU admin/team_leader do tenant.
 * O gate precisa ficar aqui — esconder o botão não impede um corretor de chamar a rota.
 *
 * O layout da planilha é do servidor: só as colunas de COLUNAS saem, qualquer outra
 * chave do payload é ignorada (sem PII de proprietário) e todo valor é coagido para
 * texto/número/data — nunca objeto, que o exceljs interpretaria como fórmula.
 */
import express from 'express';
import { PassThrough } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { makeRequireSupabaseAuth } from '../kpis/index.js';
import { makeRequireOwnerOrTenantAdmin } from '../zap/routes.js';

export const EXPORTAR_PATH = '/api/v1/imoveis/exportar';
export const MAX_LINHAS = 10000;
const MAX_TEXTO = 1000;
const FUSO = 'America/Sao_Paulo';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const FORMATO_MOEDA = '"R$" #,##0.00';

// 10 mil imóveis ≈ 6 MB de JSON. O api-server tem o limite padrão de 100 KB no
// express.json global, por isso os entrypoints montam este parser ANTES do global
// (o body-parser pula corpo já lido) em vez de subir o limite de todas as rotas.
const jsonParser = express.json({ limit: '10mb' });
export function exportarJsonParser(req, res, next) {
  jsonParser(req, res, (err) => {
    if (!err) return next();
    // Sem isto o erro cai no handler global (500 em prod, HTML em dev).
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'payload_too_large' });
    return res.status(400).json({ error: 'invalid_payload' });
  });
}

const texto = (v) => {
  if (typeof v === 'string') return v.slice(0, MAX_TEXTO) || null;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
};

const numero = (v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** Dia civil em São Paulo no formato YYYY-MM-DD. */
const diaEmSaoPaulo = (data) => data.toLocaleDateString('en-CA', { timeZone: FUSO });

// Célula de data de verdade (ordenável no Excel) no dia de São Paulo: o Excel não
// tem fuso, então grava a meia-noite UTC desse dia.
const dataAtualizacao = (v) => {
  if (typeof v !== 'string') return null;
  const data = new Date(v);
  return Number.isNaN(data.getTime()) ? null : new Date(`${diaEmSaoPaulo(data)}T00:00:00Z`);
};

const FINALIDADES = { venda: 'Venda', locacao: 'Locação', venda_locacao: 'Venda e Locação' };

const STATUS = { aguardando: 'Aguardando aprovação', aprovado: 'Aprovado', nao_aprovado: 'Não aprovado' };

const rotuloDestaque = ({ destaque, super_destaque: superDestaque }) => {
  if (destaque === true && superDestaque === true) return 'Destaque + Super Destaque';
  if (superDestaque === true) return 'Super Destaque';
  if (destaque === true) return 'Destaque';
  return 'Sem Destaque';
};

// Imóvel só do XML não tem status de aprovação.
const rotuloStatus = ({ status_aprovacao: status }) =>
  (status === null || status === undefined || status === '' ? 'Integração (XML)' : STATUS[status] ?? texto(status));

const endereco = (item) => texto([texto(item.endereco), texto(item.numero)].filter(Boolean).join(', '));

const COLUNAS = [
  { header: 'Código', width: 12, valor: (i) => texto(i.referencia) },
  { header: 'Título', width: 40, valor: (i) => texto(i.titulo) },
  { header: 'Tipo', width: 18, valor: (i) => texto(i.tipo) },
  { header: 'Finalidade', width: 16, valor: (i) => FINALIDADES[i.finalidade] ?? null },
  { header: 'Cidade', width: 18, valor: (i) => texto(i.cidade) },
  { header: 'Bairro', width: 20, valor: (i) => texto(i.bairro) },
  { header: 'UF', width: 6, valor: (i) => texto(i.estado) },
  { header: 'Endereço', width: 36, valor: endereco },
  { header: 'CEP', width: 11, valor: (i) => texto(i.cep) },
  { header: 'Condomínio', width: 24, valor: (i) => texto(i.nome_condominio) },
  { header: 'Valor de venda (R$)', width: 18, numFmt: FORMATO_MOEDA, valor: (i) => numero(i.valor_venda) },
  { header: 'Valor de locação (R$)', width: 18, numFmt: FORMATO_MOEDA, valor: (i) => numero(i.valor_locacao) },
  { header: 'Condomínio (R$)', width: 16, numFmt: FORMATO_MOEDA, valor: (i) => numero(i.valor_condominio) },
  { header: 'IPTU (R$)', width: 14, numFmt: FORMATO_MOEDA, valor: (i) => numero(i.valor_iptu) },
  { header: 'Área útil (m²)', width: 14, valor: (i) => numero(i.area_util) },
  { header: 'Área total (m²)', width: 14, valor: (i) => numero(i.area_total) },
  { header: 'Quartos', width: 9, valor: (i) => numero(i.quartos) },
  { header: 'Suítes', width: 9, valor: (i) => numero(i.suites) },
  { header: 'Banheiros', width: 10, valor: (i) => numero(i.banheiro) },
  { header: 'Vagas', width: 8, valor: (i) => numero(i.garagem) },
  { header: 'Captador', width: 24, valor: (i) => texto(i.corretor_nome) },
  { header: 'Destaque', width: 24, valor: rotuloDestaque },
  { header: 'Status', width: 22, valor: rotuloStatus },
  { header: 'Atualizado em', width: 14, numFmt: 'dd/mm/yyyy', valor: (i) => dataAtualizacao(i.updated_at) },
];

export const CABECALHO_EXPORTACAO = COLUNAS.map((c) => c.header);

/** Linha da planilha (na ordem de COLUNAS) a partir de um item do payload. Pura. */
export const linhaExportacao = (item) => COLUNAS.map((c) => c.valor(item));

/**
 * Gera o .xlsx (Buffer) com cabeçalho em negrito, primeira linha congelada e autofiltro.
 * Writer em streaming: 10 mil linhas custam ~40 MB de heap contra ~260 MB do Workbook
 * em memória — a prod roda com --max-old-space-size=512. A saída (~1 MB) é juntada
 * num Buffer para uma falha virar 500 JSON em vez de um download cortado.
 */
export async function gerarPlanilhaImoveis(imoveis) {
  const { default: ExcelJS } = await import('exceljs');
  const saida = new PassThrough();
  const arquivo = buffer(saida); // consome desde já: o 'finish' do commit não garante o último chunk lido

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: saida, useStyles: true, useSharedStrings: false });
  const sheet = workbook.addWorksheet('Imóveis', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = COLUNAS.map(({ header, width, numFmt }) => ({ header, width, ...(numFmt ? { style: { numFmt } } : {}) }));
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUNAS.length } };
  for (const item of imoveis) sheet.addRow(linhaExportacao(item)).commit();
  sheet.commit();
  const [, conteudo] = await Promise.all([workbook.commit(), arquivo]);
  return conteudo;
}

const ehObjeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

export function registerImoveisExportRoutes(app, supabase) {
  // O gate da ZAP (owner OU admin/team_leader do req.body.tenantId) não expõe o
  // usuário; a auth dos KPIs põe req.userId para o log de auditoria.
  // ponytail: getUser roda 2x por exportação (clique manual, raro) — some quando o gate expuser o usuário.
  const requireAuth = makeRequireSupabaseAuth(supabase);
  const requireManager = makeRequireOwnerOrTenantAdmin(supabase);

  app.post(EXPORTAR_PATH, exportarJsonParser, requireAuth, requireManager, async (req, res) => {
    const { tenantId, imoveis } = req.body || {};
    if (typeof tenantId !== 'string' || !tenantId.trim()) return res.status(400).json({ error: 'tenant_required' });
    if (!Array.isArray(imoveis)) return res.status(400).json({ error: 'invalid_payload' });
    if (imoveis.length > MAX_LINHAS) return res.status(413).json({ error: 'too_many_rows' });
    if (!imoveis.every(ehObjeto)) return res.status(400).json({ error: 'invalid_payload' });

    try {
      const planilha = await gerarPlanilhaImoveis(imoveis);
      // Auditoria: quem exportou quanto de qual tenant — nunca o conteúdo das linhas.
      console.log('[imoveis/exportar]', JSON.stringify({ tenantId, userId: req.userId, linhas: imoveis.length }));
      res.set({
        'Content-Type': XLSX_MIME,
        'Content-Disposition': `attachment; filename="imoveis-${diaEmSaoPaulo(new Date())}.xlsx"`,
      });
      res.send(planilha);
    } catch (err) {
      console.error('[imoveis/exportar] falha ao gerar a planilha:', err?.message);
      res.status(500).json({ error: 'export_failed' });
    }
  });
}

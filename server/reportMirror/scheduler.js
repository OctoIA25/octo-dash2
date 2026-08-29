/**
 * Reescreve a aba ESPELHO do REPORT no Google Sheets de hora em hora.
 * Flag-gated pelo chamador (REPORT_MIRROR_SCHEDULER=1), só em proxy-production —
 * mesmo padrão de eNPS/Kenlo/C2S. Falhou? Loga e espera o próximo tick (D9).
 */
import { coletarVendas, montarMatriz } from './buildReport.js';
import { makeSheetsClient } from './googleSheets.js';
import { recordHeartbeat } from '../observability/heartbeat.js';

export function makeReportMirrorRunner(supabase, processEnv = process.env) {
  const sheetId = processEnv.REPORT_MIRROR_SHEET_ID;
  const tenantId = processEnv.REPORT_MIRROR_TENANT_ID;
  const email = processEnv.GOOGLE_SA_EMAIL;
  const keyB64 = processEnv.GOOGLE_SA_PRIVATE_KEY_B64;
  if (!sheetId || !tenantId || !email || !keyB64) {
    throw new Error('[reportMirror] faltam envs: REPORT_MIRROR_SHEET_ID, REPORT_MIRROR_TENANT_ID, GOOGLE_SA_EMAIL, GOOGLE_SA_PRIVATE_KEY_B64');
  }
  const sheets = makeSheetsClient({ email, privateKeyPem: Buffer.from(keyB64, 'base64').toString('utf8') });
  return async function run() {
    const vendas = await coletarVendas(supabase, tenantId);
    const matriz = montarMatriz(vendas, new Date().toISOString());
    await sheets.overwriteTab({ spreadsheetId: sheetId, tab: 'ESPELHO', values: matriz });
    return { vendas: vendas.length, linhas: matriz.length };
  };
}

export async function startReportMirrorScheduler(supabase, options = {}) {
  const processEnv = options.processEnv || process.env;
  const cronExpr = processEnv.REPORT_MIRROR_CRON || '17 * * * *';
  let cron = options.cronImpl;
  if (!cron) {
    try { ({ default: cron } = await import(/* @vite-ignore */ 'node-cron')); }
    catch { console.warn('[reportMirror] node-cron não instalado — agendamento desabilitado.'); return null; }
  }
  const runner = options.runner || makeReportMirrorRunner(supabase, processEnv);
  return cron.schedule(cronExpr, async () => {
    const startedAt = Date.now();
    try {
      const r = await runner();
      console.log(`[reportMirror] {"event":"report_mirror.tick","vendas":${r?.vendas ?? 0}}`);
      await recordHeartbeat(supabase, 'report_mirror', { result: r, ok: true, durationMs: Date.now() - startedAt });
    } catch (e) {
      console.error(`[reportMirror] tick falhou: ${e?.message}`);
      await recordHeartbeat(supabase, 'report_mirror', { ok: false, error: e?.message, durationMs: Date.now() - startedAt }).catch(() => {});
    }
  });
}

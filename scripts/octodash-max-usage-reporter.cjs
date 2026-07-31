#!/usr/bin/env node
// scripts/octodash-max-usage-reporter.cjs
/**
 * Reporter do modo MAX (Anthropic/OctoDash) — single-shot, feito para cron.
 *
 * Roda NA MÁQUINA logada na conta Claude Max (OAuth em ~/.claude — tipicamente
 * o servidor onde a IA 24/7 roda). Lê o % oficial da assinatura via comando de
 * controle get_usage do Claude Code (zero consumo do plano) e POSTa no ingest
 * do OctoDash. Fallback: `claude -p "/usage"` + regex.
 *
 * Instalação (crontab -e):
 *   *\/5 * * * * OCTODASH_URL=https://SEU_DOMINIO OCTODASH_API_KEY=xxx node /caminho/octodash-max-usage-reporter.cjs
 *
 * Envs: OCTODASH_URL (base, sem barra final), OCTODASH_API_KEY (key da aba API
 * do OctoDash — tenant_api_keys). Fail-silent: sai 0 sempre; erros só em stderr.
 * A API get_usage é EXPERIMENTAL (Anthropic) — parse defensivo; re-testar ao
 * atualizar o Claude Code (`claude -p "/usage"` continua como rede de segurança).
 */
'use strict';
const { spawn } = require('node:child_process');

/** Busca profunda por um objeto com rate_limits.seven_day.utilization numérico. */
function findRateLimits(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return null;
  if (node.rate_limits && typeof node.rate_limits === 'object') {
    const rl = node.rate_limits;
    if (typeof rl?.seven_day?.utilization === 'number') return rl;
  }
  for (const v of Object.values(node)) {
    const hit = findRateLimits(v, depth + 1);
    if (hit) return hit;
  }
  return null;
}

function parseGetUsageLines(lines) {
  for (const line of lines) {
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const rl = findRateLimits(obj);
    if (rl) {
      return {
        weekPct: rl.seven_day.utilization,
        fiveHourPct: typeof rl.five_hour?.utilization === 'number' ? rl.five_hour.utilization : null,
        resetsAt: rl.seven_day.resets_at ?? null,
      };
    }
  }
  return null;
}

function parseUsageText(text) {
  const week = /week \(all models\)[^\d]*(\d+)\s*%/i.exec(text);
  if (!week) return null;
  const session = /current session[^\d]*(\d+)\s*%/i.exec(text);
  return { weekPct: Number(week[1]), fiveHourPct: session ? Number(session[1]) : null, resetsAt: null };
}

/** Spawna `claude` com args, escreve stdin (opcional), devolve stdout até timeout. */
function runClaude(args, stdin, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn('claude', args, { stdio: ['pipe', 'pipe', 'ignore'] });
    let out = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(out); }, timeoutMs);
    child.stdout.on('data', (d) => { out += String(d); });
    child.on('close', () => { clearTimeout(timer); resolve(out); });
    child.on('error', () => { clearTimeout(timer); resolve(out); });
    if (stdin) child.stdin.write(stdin);
    // não fecha stdin no stream-json: a resposta chega antes do timeout e o kill encerra.
  });
}

async function postReport(fetchImpl, env, report) {
  const base = env.OCTODASH_URL;
  const key = env.OCTODASH_API_KEY;
  if (!base || !key || !report) return false;
  try {
    const res = await fetchImpl(`${String(base).replace(/\/+$/, '')}/api/v1/anthropic/usage-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        week_pct: report.weekPct,
        ...(report.fiveHourPct != null ? { five_hour_pct: report.fiveHourPct } : {}),
        ...(report.resetsAt ? { resets_at: report.resetsAt } : {}),
        source: require('node:os').hostname(),
      }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (err) {
    process.stderr.write(`[octodash-reporter] POST falhou: ${err?.message}\n`);
    return false;
  }
}

async function main() {
  const req = '{"type":"control_request","request_id":"r1","request":{"subtype":"get_usage"}}\n';
  const out = await runClaude(['--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '-p'], req, 15000);
  let report = parseGetUsageLines(out.split('\n'));
  if (!report) {
    process.stderr.write('[octodash-reporter] get_usage sem rate_limits — tentando fallback /usage\n');
    const txt = await runClaude(['-p', '/usage'], null, 20000);
    report = parseUsageText(txt);
  }
  if (!report) { process.stderr.write('[octodash-reporter] sem dados de uso (claude ausente/deslogado?)\n'); return; }
  const ok = await postReport(fetch, process.env, report);
  if (ok) process.stdout.write(`[octodash-reporter] ok week=${report.weekPct}%\n`);
}

module.exports = { parseGetUsageLines, parseUsageText, postReport, findRateLimits };
if (require.main === module) main().catch((e) => { process.stderr.write(`[octodash-reporter] ${e?.message}\n`); });

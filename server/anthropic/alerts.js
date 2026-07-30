/**
 * Aviso de uso semanal ao OWNER (sino + e-mail). Best-effort: telemetria/aviso
 * jamais derruba o tick — cada canal em try/catch próprio.
 *
 * Dedup por TRANSIÇÃO de estado (normal→warning): a janela de 7d é rolante
 * (startsAt avança diariamente), então dedup por janela re-alertaria todo dia.
 * A memória da transição é o last_state persistido (sobrevive a restart/deploy).
 * last_alerted_at é só auditoria (write-only).
 *
 * Sino: insert service_role em notifications com tenant_id do tenant afetado +
 * user_id do owner (platform_owners). Caveat: o Owner vê o sino ao impersonar o
 * tenant; o E-MAIL é o canal garantido.
 */

import { loadAnthropicEnv } from './config.js';
import { createEmailTransport, fromAddressFromEnv } from '../recommendations/emailTransport.js';

const CONFIG_TABLE = 'tenant_anthropic_config';

/** Dispara só na transição para warning (permanecer em warning não re-alerta). */
export function shouldAlert(dto, prevState) {
  return dto?.status === 'warning' && prevState !== 'warning';
}

/** user_id do owner via platform_owners (PK email). userId null = só e-mail. */
export async function resolveOwnerRecipient(supabase, alertEmail) {
  const email = String(alertEmail || '').toLowerCase();
  const { data, error } = await supabase
    .from('platform_owners').select('user_id').eq('email', email).maybeSingle();
  if (error) console.warn(`[anthropic] lookup platform_owners falhou: ${error.message}`);
  return { email, userId: data?.user_id ?? null };
}

const fmtPct = (p) => (p == null ? '—' : `${p.toFixed(2).replace('.', ',')}%`);
const fmtUsd = (n) => (n == null ? '—' : `US$ ${n.toFixed(2)}`);
const fmtDay = (iso) => (iso ? iso.slice(5, 10).split('-').reverse().join('/') : '—');

/** Conteúdo do aviso a partir do DTO real. NUNCA inclui a API key. */
export function buildAlertContent(dto, tenantId) {
  const pct = fmtPct(dto.usage.percentage);
  const subject = `⚠ Uso semanal Anthropic atingiu ${pct} (tenant ${tenantId})`;
  const lines = [
    `O uso semanal da Anthropic do tenant ${tenantId} cruzou o limiar de alerta.`,
    `Percentual atual: ${pct}`,
    `Consumo (7 dias): ${fmtUsd(dto.usage.current)}`,
    `Teto configurado: ${fmtUsd(dto.usage.limit)}`,
    `Janela: ${fmtDay(dto.window.startsAt)} → ${fmtDay(dto.window.endsAt)}`,
    `Atualizado em: ${dto.fetchedAt}`,
  ];
  const text = lines.join('\n');
  return {
    subject,
    title: `Uso Anthropic ≥ limiar (${pct})`,
    body: `Tenant ${tenantId}: ${fmtUsd(dto.usage.current)} de ${fmtUsd(dto.usage.limit)} na janela ${fmtDay(dto.window.startsAt)}–${fmtDay(dto.window.endsAt)}.`,
    html: `<p>${lines.join('</p><p>')}</p>`,
    text,
  };
}

/** Envia e-mail + insere notificação. Best-effort: nunca lança. */
export async function sendOwnerAlert(supabase, { dto, tenantId, recipient, transport, from }) {
  const content = buildAlertContent(dto, tenantId);
  let emailOk = false;
  let bellOk = false;

  try {
    await transport.send({ from, to: recipient.email, subject: content.subject, html: content.html, text: content.text });
    emailOk = true;
  } catch (err) {
    console.warn(`[anthropic] email de alerta falhou tenant=${tenantId}: ${err?.message}`);
  }

  if (recipient.userId) {
    try {
      await supabase.from('notifications').insert({
        tenant_id: tenantId,
        user_id: recipient.userId,
        title: content.title,
        body: content.body,
        type: 'warning',
        metadata: {
          provider: 'anthropic',
          percentage: dto.usage.percentage,
          window_start: dto.window.startsAt,
          window_end: dto.window.endsAt,
        },
      }).select('id').single();
      bellOk = true;
    } catch (err) {
      console.warn(`[anthropic] notificação de alerta falhou tenant=${tenantId}: ${err?.message}`);
    }
  }

  return { emailOk, bellOk };
}

/** Auditoria: quando o último aviso foi enviado (nenhuma lógica lê). */
export async function markAlerted(supabase, tenantId, atIso) {
  await supabase.from(CONFIG_TABLE).update({ last_alerted_at: atIso }).eq('tenant_id', tenantId);
}

/**
 * Checa a transição e dispara o aviso (email+sino) quando ela ocorre.
 * Best-effort: nunca lança. Compartilhado entre scheduler e rotas de recálculo
 * manual (/usage, /refresh) para nenhum caminho de recálculo engolir a transição.
 * Cria transporte por chamada — transições são raras; custo desprezível.
 */
export async function checkAndSendOwnerAlert(supabase, { dto, prevState, tenantId, processEnv = process.env }) {
  if (!shouldAlert(dto, prevState)) return { alerted: false };
  try {
    const env = loadAnthropicEnv(processEnv);
    const transport = await createEmailTransport({ processEnv });
    const recipient = await resolveOwnerRecipient(supabase, env.alertEmail);
    await sendOwnerAlert(supabase, { dto, tenantId, recipient, transport, from: fromAddressFromEnv(processEnv) });
    await markAlerted(supabase, tenantId, new Date().toISOString());
    return { alerted: true };
  } catch (err) {
    console.warn(`[anthropic] checkAndSendOwnerAlert falhou tenant=${tenantId}: ${err?.message}`);
    return { alerted: false };
  }
}

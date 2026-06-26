/**
 * 📬 Rotas de recomendação de imóveis.
 *
 *   POST /api/v1/recommendations/send     — envia o e-mail de recomendação e registra histórico
 *   GET  /api/v1/recommendations/history  — lista o histórico de envios do lead/tenant
 *
 * Responsabilidade do servidor (mantida fina de propósito):
 *   1. Autenticar (JWT Supabase) e checar acesso ao tenant.
 *   2. Resolver o destinatário com proteção entre ambientes (recipientResolver).
 *   3. Enviar via transporte (SMTP real ou simulado).
 *   4. Persistir o histórico (auditoria + métricas futuras).
 *
 * O HTML/texto chegam prontos do cliente (mesma fonte do preview → fidelidade
 * total). O servidor apenas envelopa o assunto quando há redirecionamento.
 */

import crypto from 'crypto';
import {
  environmentFromEnv,
  testSubjectPrefix,
} from './recipientResolver.js';
import {
  createSmtpTransport,
  createSimulatedTransport,
} from './emailTransport.js';
import { encryptSecret, decryptSecret, hasEncryptionKey } from './crypto.js';
import { CHANNELS, resolveDelivery } from './channels.js';
import { loadWhatsappContext, sendWhatsappTemplate } from './whatsappSender.js';
import { runDueSchedules, computeNextRun } from './scheduler.js';
import { runDueRecovery } from './recoveryWorker.js';
import { runDueActions } from '../agent-actions/actionWorker.js';
import { runDueCampaigns } from '../agent-actions/campaignScheduler.js';
import { makeCampaignDispatchDeps } from '../agent-actions/campaignDispatch.js';

const PLATFORM_OWNER_EMAIL = 'octo.inteligenciaimobiliaria@gmail.com';
const HISTORY_TABLE = 'lead_recommendations';
const CONFIG_TABLE = 'tenant_recommendation_config';
const SECRETS_TABLE = 'tenant_email_secrets';

// Remetente (From) usado quando o tenant não definiu um próprio. É uma constante
// (NÃO vem do .env): a configuração de e-mail é 100% por tenant. Só aparece no
// transporte simulado, que não dispara e-mail de verdade.
const DEFAULT_FROM = 'Recomendações <nao-responda@octodash.local>';

// Intervalo/janela padrão (em dias) quando o tenant ainda não configurou cadência.
const DEFAULT_INTERVAL_DAYS = 7;
const DEFAULT_INTEREST_WINDOW_DAYS = 7;

/** Converte um valor em dias positivo; cai no fallback quando inválido. */
function toPositiveDays(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Log estruturado (uma linha por evento) do fluxo de envio de recomendações.
 * Serve para acompanhar, no terminal/observabilidade, SE as recomendações estão
 * saindo para os clientes (redirecionado=false + status=sent), se foram para o
 * inbox de teste (redirecionado=true) ou se falharam (status=failed + erro=...).
 *
 * Campos nulos/vazios são omitidos; valores com espaço saem entre aspas.
 * Não loga conteúdo do e-mail — apenas metadados de roteamento e resultado.
 */
function logSend(event, fields, level = 'log') {
  const line = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => {
      const s = String(v);
      return `${k}=${s.includes(' ') ? `"${s}"` : s}`;
    })
    .join(' ');
  const fn = level === 'warn' ? console.warn : level === 'error' ? console.error : console.log;
  fn(`📬 [recommendations:${event}] ${line}`);
}

/**
 * Resolve o transporte de e-mail PARA UM TENANT.
 * Precedência: SMTP do tenant (senha cifrada no banco) → SMTP global do env →
 * transporte simulado. Retorna também o remetente (From) apropriado.
 */
export function makeResolveTenantTransport(supabase, options = {}) {
  const processEnv = options.processEnv || process.env;
  const logger = options.logger || console;

  return async function resolveTenantTransport(tenantId) {
    try {
      const { data: cfg } = await supabase
        .from(CONFIG_TABLE)
        .select('smtp_host, smtp_port, smtp_secure, smtp_user, smtp_from')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (cfg?.smtp_host) {
        let pass;
        const { data: sec } = await supabase
          .from(SECRETS_TABLE)
          .select('smtp_pass_encrypted')
          .eq('tenant_id', tenantId)
          .maybeSingle();

        if (sec?.smtp_pass_encrypted) {
          try {
            pass = decryptSecret(sec.smtp_pass_encrypted, processEnv);
          } catch (err) {
            logger.error?.('[recommendations] falha ao decifrar senha SMTP do tenant:', err.message);
          }
        }
        const transport = await createSmtpTransport({
          smtp: {
            host: cfg.smtp_host,
            port: cfg.smtp_port || 587,
            secure: Boolean(cfg.smtp_secure),
            user: cfg.smtp_user,
            pass,
          },
          logger,
        });

        return { transport, from: cfg.smtp_from || cfg.smtp_user || DEFAULT_FROM };
      }
    } catch (err) {
      logger.error?.('[recommendations] erro ao resolver SMTP do tenant:', err.message);
    }

    // Sem SMTP do tenant → transporte SIMULADO (não envia de verdade). NÃO há
    // fallback para SMTP do .env: o envio é configurado exclusivamente por tenant.
    return { transport: createSimulatedTransport({ logger }), from: DEFAULT_FROM };
  };
}

const isPlatformOwner = (email) => (email || '').toLowerCase() === PLATFORM_OWNER_EMAIL;

/** Middleware: valida JWT Supabase e injeta req.userId/req.userEmail. */
function makeRequireSupabaseAuth(supabase) {
  return async function requireSupabaseAuth(req, res, next) {
    try {
      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ ok: false, error: 'missing_authorization' });
      }
      const token = authHeader.slice(7);
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) {
        return res.status(401).json({ ok: false, error: 'invalid_token' });
      }
      req.userId = data.user.id;
      req.userEmail = data.user.email;
      next();
    } catch (err) {
      console.error('[recommendations] erro validando token:', err);
      res.status(500).json({ ok: false, error: 'auth_internal_error' });
    }
  };
}

/** Verifica acesso do usuário ao tenant (bypass para owner da plataforma). */
async function ensureTenantAccess(supabase, req, tenantId) {
  if (!tenantId) return false;
  if (isPlatformOwner(req.userEmail)) return true;
  const { data, error } = await supabase
    .from('tenant_memberships')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('user_id', req.userId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

/** Sanitiza o snapshot de imóveis recebido para gravação no histórico. */
function sanitizeProperties(properties) {
  if (!Array.isArray(properties)) return [];
  return properties.slice(0, 50).map((p) => ({
    referencia: String(p?.referencia ?? ''),
    titulo: String(p?.titulo ?? ''),
    localizacao: p?.localizacao ? String(p.localizacao) : undefined,
    preco: p?.preco ?? null,
    score: typeof p?.score === 'number' ? p.score : undefined,
  }));
}

/** Chave de idempotência: mesmo tenant+lead+canal+conjunto de imóveis → mesma chave. */
function computeIdempotencyKey({ tenantId, leadId, channel, refs }) {
  const refsSorted = [...refs].map((r) => String(r)).sort().join(',');
  return crypto
    .createHash('sha256')
    .update(`${tenantId}|${leadId ?? ''}|${channel}|${refsSorted}`)
    .digest('hex');
}

/**
 * Busca um envio recente idêntico (mesma idempotency_key) já concluído, dentro
 * da janela. Best-effort: qualquer erro retorna null (segue o fluxo normal).
 */
export async function findRecentDuplicate(supabase, { tenantId, key, windowMs }) {
  try {
    const sinceIso = new Date(Date.now() - windowMs).toISOString();
    const { data } = await supabase
      .from(HISTORY_TABLE)
      .select('id, status, recipient, message_id, transport')
      .eq('tenant_id', tenantId)
      .eq('idempotency_key', key)
      .gte('created_at', sinceIso)
      .in('status', ['sent', 'simulated', 'test'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data || null;
  } catch (err) {
    console.warn('[recommendations] verificação de idempotência indisponível:', err?.message);
    return null;
  }
}

/**
 * 🚚 Núcleo de entrega de UM canal (idempotência → envio → persistência).
 *
 * Reutilizado pelo handler HTTP E pelo worker de agendamento (Fase 2) — fonte
 * única da regra de envio/persistência. Recebe a entrega já RESOLVIDA (delivery)
 * e o conteúdo; não conhece HTTP nem agendamento.
 *
 * @returns resultado estruturado (sem res): { outcome, ok, status, channel,
 *          recipient, redirected, intended, intendedEmail, messageId, historyId,
 *          errorMessage, deduplicated }
 */
export async function deliverRecommendation(supabase, params, deps) {
  const {
    tenantId,
    channel,
    lead,
    delivery,
    content = {},
    sanitizedProps,
    isTest = false,
    sentBy = {},
    // Overrides opcionais (retrocompatíveis). Usados pelo Agente Disparador, que
    // não envia lista de imóveis: a idempotência é por evento (ex.: run) e os
    // parâmetros do template são a mensagem do usuário. Recomendações continuam
    // usando o comportamento padrão (refs dos imóveis + [nome, qtd]).
    idempotencyRefs,
    whatsappParams,
    // Template escolhido para ESTE disparo (campanha). Ausente → o envio usa o
    // template FIXO do tenant (recomendações automáticas e Agente de Recuperação).
    templateName,
  } = params;
  const { resolveTransport, sendWhatsapp, findDuplicate } = deps;

  // Idempotência: retry com mesma chave dentro da janela não duplica.
  const refs = idempotencyRefs ?? sanitizedProps.map((p) => p.referencia);
  const idempotencyKey = computeIdempotencyKey({ tenantId, leadId: lead.id, channel, refs });
  const duplicate = await findDuplicate({ tenantId, key: idempotencyKey });
  if (duplicate) {
    logSend('dedup', {
      tenant: tenantId,
      canal: channel,
      destino: duplicate.recipient,
      status: duplicate.status,
      historyId: duplicate.id,
      obs: 'ja-enviado-na-janela-de-idempotencia',
    });
    return {
      outcome: 'deduplicated',
      ok: true,
      deduplicated: true,
      status: duplicate.status,
      channel,
      recipient: duplicate.recipient,
      historyId: duplicate.id,
      messageId: duplicate.message_id ?? null,
      transport: duplicate.transport ?? null,
    };
  }

  const finalSubject =
    channel === 'email' ? `${testSubjectPrefix(delivery)}${content.subject || ''}` : 'Recomendações (WhatsApp)';
  let sendResult = { transport: channel, messageId: null };
  let status;
  let errorMessage = null;

  // Intenção de envio (antes de tentar). Se aparecer este log sem o "resultado"
  // correspondente, o envio travou no meio (ex.: SMTP sem resposta).
  logSend('envio', {
    tenant: tenantId,
    canal: channel,
    teste: isTest,
    ambiente: delivery.environment,
    destino: delivery.recipient,
    redirecionado: Boolean(delivery.redirected),
    cliente: delivery.intended ?? delivery.intendedEmail ?? undefined,
    porUsuario: sentBy.email ?? undefined,
  });

  try {
    if (delivery.simulate) {
      status = isTest ? 'test' : 'simulated';
      sendResult = { transport: 'simulated', messageId: null };
    } else if (channel === 'email') {
      const { transport, from } = await resolveTransport(tenantId);
      const r = await transport.send({
        from,
        to: delivery.recipient,
        subject: finalSubject,
        html: content.html,
        text: content.text,
      });
      sendResult = { transport: r.transport || transport.kind, messageId: r.messageId };
      status = isTest ? 'test' : r.simulated ? 'simulated' : 'sent';
    } else {
      // Por padrão (recomendações): [nome do lead, qtd de imóveis]. O Agente
      // Disparador sobrescreve com whatsappParams (a mensagem do usuário).
      const params2 = whatsappParams ?? [lead.name || 'tudo bem', String(sanitizedProps.length)];
      const r = await sendWhatsapp({ tenantId, to: delivery.recipient, params: params2, templateName });
      sendResult = { transport: 'whatsapp', messageId: r.messageId };
      status = 'sent';
    }
  } catch (sendErr) {
    console.error(`[recommendations] falha no envio (${channel}):`, sendErr);
    status = 'failed';
    errorMessage = sendErr?.message || 'erro desconhecido no envio';
  }

  // Resultado do envio (sempre logado). É a contraparte do log "envio" acima.
  logSend(
    'resultado',
    {
      tenant: tenantId,
      canal: channel,
      destino: delivery.recipient,
      status,
      transporte: sendResult.transport,
      redirecionado: Boolean(delivery.redirected),
      cliente: delivery.intended ?? delivery.intendedEmail ?? undefined,
      messageId: status === 'failed' ? undefined : sendResult.messageId ?? undefined,
      erro: errorMessage ?? undefined,
    },
    status === 'failed' ? 'error' : 'log',
  );

  let historyId = null;
  try {
    const { data, error } = await supabase
      .from(HISTORY_TABLE)
      .insert({
        tenant_id: tenantId,
        channel,
        lead_id: lead.id != null ? String(lead.id) : null,
        lead_source: lead.source || null,
        lead_name: lead.name || null,
        lead_email: channel === 'email' ? delivery.intended ?? delivery.intendedEmail : null,
        recipient: delivery.recipient,
        recipient_email: channel === 'email' ? delivery.recipient : null,
        redirected: Boolean(delivery.redirected),
        is_test: isTest,
        environment: delivery.environment,
        subject: finalSubject,
        custom_message: channel === 'whatsapp' ? content.whatsappBody : content.message || null,
        properties: sanitizedProps,
        property_count: sanitizedProps.length,
        status,
        error_message: errorMessage,
        transport: sendResult.transport,
        message_id: sendResult.messageId || null,
        idempotency_key: idempotencyKey,
        sent_by_user_id: sentBy.userId ?? null,
        sent_by_email: sentBy.email ?? null,
      })
      .select('id')
      .single();
    if (error) throw error;
    historyId = data?.id ?? null;
  } catch (histErr) {
    console.error('[recommendations] falha ao gravar histórico:', histErr);
  }

  return {
    outcome: status,
    ok: status !== 'failed',
    status,
    channel,
    recipient: delivery.recipient,
    redirected: Boolean(delivery.redirected),
    isTest,
    environment: delivery.environment,
    intended: delivery.intended ?? delivery.intendedEmail ?? null,
    intendedEmail: channel === 'email' ? delivery.intendedEmail : null,
    messageId: sendResult.messageId || null,
    transport: sendResult.transport,
    historyId,
    errorMessage,
  };
}

/** Constrói a função de envio WhatsApp padrão (contexto do tenant + Meta). */
export function makeDefaultSendWhatsapp(supabase, options = {}) {
  return async ({ tenantId, to, params, templateName }) => {
    const ctx = await loadWhatsappContext(supabase, tenantId, options.processEnv || process.env, templateName);
    if (!ctx.ok) {
      const err = new Error(ctx.error);
      err.code = ctx.error;
      throw err;
    }
    return sendWhatsappTemplate({
      config: ctx.config,
      template: ctx.template,
      to,
      params,
      graphVersion: ctx.graphVersion,
      fetchImpl: options.fetchImpl,
    });
  };
}

/**
 * Cria o handler de envio (multicanal: email | whatsapp).
 *
 * Um envio = um canal por requisição (o cliente chama uma vez por canal). Isso
 * mantém status, idempotência e histórico independentes por canal. Dependências
 * injetáveis (resolveTransport/getTransport, sendWhatsapp, getEnvironment,
 * findDuplicate) permitem testes determinísticos sem rede.
 */
export function makeSendHandler(supabase, options = {}) {
  const getEnvironment = options.getEnvironment || (() => environmentFromEnv());
  const idempotencyWindowMs = options.idempotencyWindowMs ?? 10 * 60 * 1000; // 10 min
  const findDuplicate =
    options.findDuplicate ||
    ((args) => findRecentDuplicate(supabase, { ...args, windowMs: idempotencyWindowMs }));

  // Transporte de e-mail (compat: resolveTransport > getTransport+fromAddress > por tenant).
  let resolveTransport;
  if (options.resolveTransport) {
    resolveTransport = options.resolveTransport;
  } else if (options.getTransport) {
    const fromAddress = options.fromAddress || DEFAULT_FROM;
    resolveTransport = async () => ({ transport: await options.getTransport(), from: fromAddress });
  } else {
    resolveTransport = makeResolveTenantTransport(supabase, options);
  }

  // Envio WhatsApp (injetável p/ testes). Default: contexto do tenant + Meta API.
  const sendWhatsapp = options.sendWhatsapp || makeDefaultSendWhatsapp(supabase, options);

  return async function sendHandler(req, res) {
    try {
      const {
        tenantId,
        channel = 'email',
        lead = {},
        subject,
        message,
        html,
        text,
        whatsappBody,
        properties,
        testEmail,
        isTest = false,
      } = req.body || {};

      // Validação comum
      if (!tenantId) return res.status(400).json({ ok: false, error: 'missing_tenant_id' });
      if (!CHANNELS.includes(channel)) {
        return res.status(400).json({ ok: false, error: 'unsupported_channel' });
      }
      const sanitizedProps = sanitizeProperties(properties);
      if (!isTest && sanitizedProps.length === 0) {
        return res.status(400).json({ ok: false, error: 'no_properties_selected' });
      }
      // Validação de conteúdo por canal
      if (channel === 'email' && (!html || !subject)) {
        return res.status(400).json({ ok: false, error: 'missing_email_content' });
      }
      if (channel === 'whatsapp' && (!whatsappBody || typeof whatsappBody !== 'string')) {
        return res.status(400).json({ ok: false, error: 'missing_whatsapp_content' });
      }

      // Autorização do tenant
      const allowed = await ensureTenantAccess(supabase, req, tenantId);
      if (!allowed) return res.status(403).json({ ok: false, error: 'forbidden_tenant' });

      // Resolução de entrega (proteção entre ambientes, por canal)
      const environment = getEnvironment();
      const delivery = resolveDelivery({
        channel,
        environment,
        leadEmail: lead.email,
        leadPhone: lead.phone,
        configuredTestEmail: testEmail,
        isTest,
      });
      if (!delivery.recipient) {
        logSend(
          'bloqueado',
          {
            tenant: tenantId,
            canal: channel,
            teste: isTest,
            motivo: delivery.reason,
            cliente: lead.email ?? undefined,
            detalhe: delivery.error ?? undefined,
          },
          'warn',
        );
        return res.status(422).json({ ok: false, error: delivery.reason, message: delivery.error });
      }

      // Núcleo compartilhado: idempotência + envio + persistência.
      const result = await deliverRecommendation(
        supabase,
        {
          tenantId,
          channel,
          lead,
          delivery,
          content: { subject, message, html, text, whatsappBody },
          sanitizedProps,
          isTest,
          sentBy: { userId: req.userId, email: req.userEmail },
        },
        { resolveTransport, sendWhatsapp, findDuplicate },
      );

      if (result.deduplicated) {
        return res.status(200).json({
          ok: true,
          status: result.status,
          channel,
          recipient: result.recipient,
          deduplicated: true,
          historyId: result.historyId,
          messageId: result.messageId,
          transport: result.transport,
        });
      }
      if (result.status === 'failed') {
        return res.status(502).json({
          ok: false,
          error: 'send_failed',
          channel,
          message: result.errorMessage,
          historyId: result.historyId,
        });
      }
      return res.status(200).json({
        ok: true,
        status: result.status,
        channel,
        recipient: result.recipient,
        redirected: result.redirected,
        isTest,
        environment: result.environment,
        intended: result.intended,
        intendedEmail: result.intendedEmail,
        messageId: result.messageId,
        transport: result.transport,
        historyId: result.historyId,
      });
    } catch (err) {
      console.error('[recommendations] erro inesperado:', err);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  };
}

/** Handler de listagem de histórico. */
export function makeHistoryHandler(supabase) {
  return async function historyHandler(req, res) {
    try {
      const tenantId = req.query.tenantId;
      const leadId = req.query.leadId;
      if (!tenantId) return res.status(400).json({ ok: false, error: 'missing_tenant_id' });

      const allowed = await ensureTenantAccess(supabase, req, tenantId);
      if (!allowed) return res.status(403).json({ ok: false, error: 'forbidden_tenant' });

      let query = supabase
        .from(HISTORY_TABLE)
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (leadId) query = query.eq('lead_id', String(leadId));

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ ok: true, items: data || [] });
    } catch (err) {
      console.error('[recommendations] erro ao listar histórico:', err);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  };
}

/** Handler de leitura da configuração (NUNCA devolve a senha — só `hasPassword`). */
export function makeGetConfigHandler(supabase, options = {}) {
  const processEnv = options.processEnv || process.env;
  return async function getConfigHandler(req, res) {
    try {
      const tenantId = req.query.tenantId;
      if (!tenantId) return res.status(400).json({ ok: false, error: 'missing_tenant_id' });
      const allowed = await ensureTenantAccess(supabase, req, tenantId);
      if (!allowed) return res.status(403).json({ ok: false, error: 'forbidden_tenant' });

      const { data: cfg } = await supabase
        .from(CONFIG_TABLE)
        .select(
          'test_email, company_name, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_from, whatsapp_template_name, whatsapp_template_language, recommendation_interval_days, interest_window_days, recovery_agent_enabled, recovery_message, recovery_properties',
        )
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const { data: sec } = await supabase
        .from(SECRETS_TABLE)
        .select('smtp_pass_encrypted')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      return res.status(200).json({
        ok: true,
        config: {
          testEmail: cfg?.test_email ?? '',
          companyName: cfg?.company_name ?? '',
          smtp: {
            host: cfg?.smtp_host ?? '',
            port: cfg?.smtp_port ?? 587,
            secure: Boolean(cfg?.smtp_secure),
            user: cfg?.smtp_user ?? '',
            from: cfg?.smtp_from ?? '',
            hasPassword: Boolean(sec?.smtp_pass_encrypted),
          },
          whatsapp: {
            templateName: cfg?.whatsapp_template_name ?? '',
            templateLanguage: cfg?.whatsapp_template_language ?? 'pt_BR',
          },
          // Cadência configurável por tenant ("prazo" das recomendações).
          intervalDays: toPositiveDays(cfg?.recommendation_interval_days, DEFAULT_INTERVAL_DAYS),
          interestWindowDays: toPositiveDays(cfg?.interest_window_days, DEFAULT_INTEREST_WINDOW_DAYS),
          // Agente de Recuperação: liga/desliga, mensagem e lista fixa de imóveis.
          recovery: {
            enabled: Boolean(cfg?.recovery_agent_enabled),
            message: cfg?.recovery_message ?? '',
            properties: Array.isArray(cfg?.recovery_properties) ? cfg.recovery_properties : [],
          },
          encryptionAvailable: hasEncryptionKey(processEnv),
        },
      });
    } catch (err) {
      console.error('[recommendations] erro ao ler config:', err);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  };
}

/** Handler de gravação da configuração. A senha (se enviada) é cifrada server-side. */
export function makeSaveConfigHandler(supabase, options = {}) {
  const processEnv = options.processEnv || process.env;
  return async function saveConfigHandler(req, res) {
    try {
      const {
        tenantId,
        testEmail,
        companyName,
        smtp = {},
        whatsapp = {},
        intervalDays,
        interestWindowDays,
        recovery,
      } = req.body || {};
      if (!tenantId) return res.status(400).json({ ok: false, error: 'missing_tenant_id' });
      const allowed = await ensureTenantAccess(supabase, req, tenantId);
      if (!allowed) return res.status(403).json({ ok: false, error: 'forbidden_tenant' });

      // Config do Agente de Recuperação (opcional no payload: só grava o que veio).
      const recoveryFields = {};
      if (recovery && typeof recovery === 'object') {
        if (typeof recovery.enabled === 'boolean') {
          recoveryFields.recovery_agent_enabled = recovery.enabled;
        }
        if (typeof recovery.message === 'string') {
          recoveryFields.recovery_message = recovery.message.trim() || null;
        }
        if (recovery.properties !== undefined) {
          recoveryFields.recovery_properties = sanitizeProperties(recovery.properties);
        }
      }

      const { error: cfgError } = await supabase.from(CONFIG_TABLE).upsert(
        {
          tenant_id: tenantId,
          test_email: testEmail?.trim() || null,
          company_name: companyName?.trim() || null,
          smtp_host: smtp.host?.trim() || null,
          smtp_port: smtp.port ? Number(smtp.port) : null,
          smtp_secure: Boolean(smtp.secure),
          smtp_user: smtp.user?.trim() || null,
          smtp_from: smtp.from?.trim() || null,
          whatsapp_template_name: whatsapp.templateName?.trim() || null,
          whatsapp_template_language: whatsapp.templateLanguage?.trim() || 'pt_BR',
          recommendation_interval_days: toPositiveDays(intervalDays, DEFAULT_INTERVAL_DAYS),
          interest_window_days: toPositiveDays(interestWindowDays, DEFAULT_INTEREST_WINDOW_DAYS),
          ...recoveryFields,
        },
        { onConflict: 'tenant_id' },
      );
      if (cfgError) throw cfgError;

      // Só grava o segredo quando uma senha nova é enviada (campo vazio = manter atual).
      if (typeof smtp.password === 'string' && smtp.password.length > 0) {
        if (!hasEncryptionKey(processEnv)) {
          return res.status(500).json({
            ok: false,
            error: 'encryption_unavailable',
            message: 'EMAIL_ENCRYPTION_KEY não configurada no servidor.',
          });
        }
        const encrypted = encryptSecret(smtp.password, processEnv);
        const { error: secError } = await supabase
          .from(SECRETS_TABLE)
          .upsert({ tenant_id: tenantId, smtp_pass_encrypted: encrypted }, { onConflict: 'tenant_id' });
        if (secError) throw secError;
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[recommendations] erro ao salvar config:', err);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  };
}

const SCHEDULES_TABLE = 'recommendation_schedules';

/** Dependências do worker/agendamento, com defaults de produção. */
export function makeSchedulerDeps(supabase, options = {}) {
  const processEnv = options.processEnv || process.env;
  return {
    deliver: deliverRecommendation,
    resolveDelivery,
    resolveTransport: options.resolveTransport || makeResolveTenantTransport(supabase, options),
    sendWhatsapp: options.sendWhatsapp || makeDefaultSendWhatsapp(supabase, options),
    findDuplicate:
      options.findDuplicate ||
      ((args) => findRecentDuplicate(supabase, { ...args, windowMs: 10 * 60 * 1000 })),
    getEnvironment: options.getEnvironment || (() => environmentFromEnv(processEnv)),
    logger: options.logger || console,
  };
}

/** Cria um agendamento (snapshot do conteúdo atual). */
export function makeCreateScheduleHandler(supabase, options = {}) {
  return async function createScheduleHandler(req, res) {
    try {
      const {
        tenantId,
        lead = {},
        channels,
        content = {},
        properties,
        interestWindowDays,
        intervalDays,
      } = req.body || {};
      if (!tenantId) return res.status(400).json({ ok: false, error: 'missing_tenant_id' });
      const chs = Array.isArray(channels) ? channels.filter((c) => CHANNELS.includes(c)) : [];
      if (chs.length === 0) return res.status(400).json({ ok: false, error: 'no_channels' });
      const props = sanitizeProperties(properties);
      if (props.length === 0) return res.status(400).json({ ok: false, error: 'no_properties_selected' });

      const allowed = await ensureTenantAccess(supabase, req, tenantId);
      if (!allowed) return res.status(403).json({ ok: false, error: 'forbidden_tenant' });

      // Cadência ("prazo"): o request pode sobrescrever pontualmente, mas o padrão
      // vem da config do tenant. Leitura best-effort — uma falha aqui usa os
      // defaults e NÃO impede o agendamento.
      let cadenceCfg = null;
      try {
        ({ data: cadenceCfg } = await supabase
          .from(CONFIG_TABLE)
          .select('recommendation_interval_days, interest_window_days')
          .eq('tenant_id', tenantId)
          .maybeSingle());
      } catch (cfgErr) {
        console.warn('[recommendations] cadência do tenant indisponível, usando padrões:', cfgErr?.message);
      }
      const resolvedInterval = toPositiveDays(
        intervalDays,
        toPositiveDays(cadenceCfg?.recommendation_interval_days, DEFAULT_INTERVAL_DAYS),
      );
      const resolvedWindow = toPositiveDays(
        interestWindowDays,
        toPositiveDays(cadenceCfg?.interest_window_days, DEFAULT_INTEREST_WINDOW_DAYS),
      );

      // Primeira execução: daqui a `resolvedInterval` dias (o envio "agora" é o
      // manual). A cadência é gravada como snapshot, imune a mudanças futuras.
      const nextRun = computeNextRun(Date.now(), resolvedInterval);

      const { data, error } = await supabase
        .from(SCHEDULES_TABLE)
        .insert({
          tenant_id: tenantId,
          lead_id: lead.id != null ? String(lead.id) : null,
          lead_source: lead.source || null,
          lead_name: lead.name || null,
          lead_email: lead.email || null,
          lead_phone: lead.phone || null,
          channels: chs,
          subject: content.subject || null,
          custom_message: content.message || null,
          email_html: content.html || null,
          email_text: content.text || null,
          whatsapp_body: content.whatsappBody || null,
          properties: props,
          frequency: 'weekly', // legado (CHECK aceita só 'weekly'); cadência real = interval_days
          interval_days: resolvedInterval,
          interest_window_days: resolvedWindow,
          active: true,
          next_run_at: nextRun,
          created_by_user_id: req.userId,
          created_by_email: req.userEmail,
        })
        .select('id')
        .single();
      if (error) throw error;
      return res.status(201).json({ ok: true, id: data?.id, nextRunAt: nextRun });
    } catch (err) {
      console.error('[recommendations] erro ao criar agendamento:', err);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  };
}

/** Lista agendamentos do tenant (opcionalmente por lead). */
export function makeListSchedulesHandler(supabase) {
  return async function listSchedulesHandler(req, res) {
    try {
      const tenantId = req.query.tenantId;
      const leadId = req.query.leadId;
      if (!tenantId) return res.status(400).json({ ok: false, error: 'missing_tenant_id' });
      const allowed = await ensureTenantAccess(supabase, req, tenantId);
      if (!allowed) return res.status(403).json({ ok: false, error: 'forbidden_tenant' });

      let query = supabase
        .from(SCHEDULES_TABLE)
        .select('id, lead_id, lead_name, channels, active, frequency, interest_window_days, next_run_at, last_run_at, run_count, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (leadId) query = query.eq('lead_id', String(leadId));
      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ ok: true, items: data || [] });
    } catch (err) {
      console.error('[recommendations] erro ao listar agendamentos:', err);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  };
}

/** Cancela (desativa) um agendamento. */
export function makeCancelScheduleHandler(supabase) {
  return async function cancelScheduleHandler(req, res) {
    try {
      const { tenantId, id } = req.body || {};
      if (!tenantId || !id) return res.status(400).json({ ok: false, error: 'missing_fields' });
      const allowed = await ensureTenantAccess(supabase, req, tenantId);
      if (!allowed) return res.status(403).json({ ok: false, error: 'forbidden_tenant' });
      const { error } = await supabase
        .from(SCHEDULES_TABLE)
        .update({ active: false })
        .eq('id', id)
        .eq('tenant_id', tenantId);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[recommendations] erro ao cancelar agendamento:', err);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  };
}

/** Disparo manual do worker (somente owner da plataforma) — útil p/ validação. */
export function makeRunSchedulesHandler(supabase, options = {}) {
  return async function runSchedulesHandler(req, res) {
    try {
      if (!isPlatformOwner(req.userEmail)) {
        return res.status(403).json({ ok: false, error: 'forbidden' });
      }
      const summary = await runDueSchedules(supabase, makeSchedulerDeps(supabase, options));
      return res.status(200).json({ ok: true, summary });
    } catch (err) {
      console.error('[recommendations] erro ao rodar agendamentos:', err);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  };
}

/**
 * Inicia o cron do worker (lazy-import de node-cron). Flag-gated pelo chamador.
 * Default: de hora em hora (next_run_at tem granularidade de dia).
 */
export async function startRecommendationScheduler(supabase, options = {}) {
  const processEnv = options.processEnv || process.env;
  const cronExpr = processEnv.RECOMMENDATION_SCHEDULER_CRON || '0 * * * *';
  let cron;
  try {
    ({ default: cron } = await import(/* @vite-ignore */ 'node-cron'));
  } catch {
    console.warn('[scheduler] node-cron não instalado — agendamento desabilitado.');
    return null;
  }
  const deps = makeSchedulerDeps(supabase, options);
  const task = cron.schedule(cronExpr, () => {
    // Mesmo tick atende os dois consumidores da fila de envio: agendamentos
    // vencidos e a fila do Agente de Recuperação. Reutilizam as MESMAS deps
    // (deliver, resolveDelivery, sendWhatsapp, findDuplicate, ambiente).
    runDueSchedules(supabase, deps).catch((e) =>
      console.error('[scheduler] erro na execução:', e?.message),
    );
    runDueRecovery(supabase, deps).catch((e) =>
      console.error('[recovery] erro na execução:', e?.message),
    );
  });

  // Loop contínuo do outbox de ações (agent_action_queue).
  // Drena a fila a cada OUTBOX_LOOP_MS ms (default 5s), com guarda de
  // reentrância: se o tick anterior ainda está rodando, o novo é ignorado.
  // O cron horário acima funciona como rede de segurança; o loop aqui garante
  // baixa latência de entrega das ações do Agente Disparador.
  const outboxLoopMs = Number(processEnv.OUTBOX_LOOP_MS) || 5_000;
  let outboxTickRunning = false;
  setInterval(() => {
    if (outboxTickRunning) return; // tick anterior ainda em andamento: pula
    outboxTickRunning = true;
    // `deps` (makeSchedulerDeps) É o bundle que deliverRecommendation precisa:
    // passamos deliver/getEnvironment achatados E o bundle inteiro como
    // schedulerDeps (mesma forma do drain pós-confirm em agent-actions/routes.js).
    // Passar `deps` cru deixaria deps.schedulerDeps=undefined e quebraria o envio.
    runDueActions(supabase, {
      deliver: deps.deliver,
      schedulerDeps: deps,
      getEnvironment: deps.getEnvironment,
    }).catch((e) =>
      console.error('[agent-actions] erro no loop do outbox:', e?.message),
    ).finally(() => {
      outboxTickRunning = false;
    });
  }, outboxLoopMs);

  // Loop contínuo de campanhas agendadas (communication_campaigns).
  // setInterval SEPARADO (não acoplado ao outbox) para isolar falhas: uma
  // exceção aqui não impede o drain do outbox e vice-versa. Mesma guarda de
  // reentrância. As deps vêm de funções IMPORTÁVEIS (makeCampaignDispatchDeps),
  // que reusam a MESMA implementação da rota HTTP de dispatch; `deps` é o bundle
  // do scheduler (makeSchedulerDeps), do qual se extrai deliver/getEnvironment.
  let campaignTickRunning = false;
  setInterval(() => {
    if (campaignTickRunning) return; // tick anterior ainda em andamento: pula
    campaignTickRunning = true;
    runDueCampaigns(supabase, makeCampaignDispatchDeps(deps))
      .catch((e) => console.error('[campaigns] erro no loop de agendamento:', e?.message))
      .finally(() => { campaignTickRunning = false; });
  }, outboxLoopMs);

  console.log(`⏰ [scheduler] recomendações + recuperação ativos (cron: ${cronExpr})`);
  console.log(`⚙️  [agent-actions] outbox loop ativo (intervalo: ${outboxLoopMs}ms)`);
  console.log(`📣 [campaigns] loop de agendamento ativo (intervalo: ${outboxLoopMs}ms)`);
  return task;
}

/** Disparo manual do worker de recuperação (somente owner) — útil p/ validação. */
export function makeRunRecoveryHandler(supabase, options = {}) {
  return async function runRecoveryHandler(req, res) {
    try {
      if (!isPlatformOwner(req.userEmail)) {
        return res.status(403).json({ ok: false, error: 'forbidden' });
      }
      const summary = await runDueRecovery(supabase, makeSchedulerDeps(supabase, options));
      return res.status(200).json({ ok: true, summary });
    } catch (err) {
      console.error('[recovery] erro ao rodar fila:', err);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  };
}

/** Registra as rotas de recomendação no app Express. */
export function registerRecommendationRoutes(app, supabase, options = {}) {
  const requireSupabaseAuth = makeRequireSupabaseAuth(supabase);
  app.post(
    '/api/v1/recommendations/send',
    requireSupabaseAuth,
    makeSendHandler(supabase, options),
  );
  app.get(
    '/api/v1/recommendations/history',
    requireSupabaseAuth,
    makeHistoryHandler(supabase),
  );
  app.get(
    '/api/v1/recommendations/config',
    requireSupabaseAuth,
    makeGetConfigHandler(supabase, options),
  );
  app.post(
    '/api/v1/recommendations/config',
    requireSupabaseAuth,
    makeSaveConfigHandler(supabase, options),
  );
  // Agendamentos (Fase 2)
  app.post(
    '/api/v1/recommendations/schedules',
    requireSupabaseAuth,
    makeCreateScheduleHandler(supabase, options),
  );
  app.get(
    '/api/v1/recommendations/schedules',
    requireSupabaseAuth,
    makeListSchedulesHandler(supabase),
  );
  app.post(
    '/api/v1/recommendations/schedules/cancel',
    requireSupabaseAuth,
    makeCancelScheduleHandler(supabase),
  );
  app.post(
    '/api/v1/recommendations/schedules/run',
    requireSupabaseAuth,
    makeRunSchedulesHandler(supabase, options),
  );
  // Agente de Recuperação: disparo manual da fila (owner only) p/ validação.
  app.post(
    '/api/v1/recommendations/recovery/run',
    requireSupabaseAuth,
    makeRunRecoveryHandler(supabase, options),
  );
}

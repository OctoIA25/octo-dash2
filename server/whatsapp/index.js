/**
 * Integração WhatsApp Cloud API (Meta) — envio de mensagens e listagem de templates.
 *
 * O **recebimento** de mensagens é feito pelo **n8n**, que grava diretamente
 * nas tabelas whatsapp_conversations / whatsapp_messages do Supabase.
 *
 * Endpoints:
 *   POST /api/v1/whatsapp/send       — envio de texto OU template (JWT Supabase)
 *   GET  /api/v1/whatsapp/templates  — lista templates aprovados do tenant
 */

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';
const PLATFORM_OWNER_EMAIL = 'octo.inteligenciaimobiliaria@gmail.com';

function normalizePhone(value) {
  if (!value) return '';
  return String(value).replace(/\D+/g, '');
}

function isPlatformOwner(email) {
  return (email || '').toLowerCase() === PLATFORM_OWNER_EMAIL;
}

/**
 * Middleware: valida JWT Supabase do header Authorization e injeta req.userId.
 */
function makeRequireSupabaseAuth(supabase) {
  return async function requireSupabaseAuth(req, res, next) {
    try {
      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'missing_authorization' });
      }
      const token = authHeader.slice(7);
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) {
        return res.status(401).json({ error: 'invalid_token' });
      }
      req.userId = data.user.id;
      req.userEmail = data.user.email;
      next();
    } catch (err) {
      console.error('[whatsapp] erro validando token Supabase:', err);
      res.status(500).json({ error: 'auth_internal_error' });
    }
  };
}

/**
 * Verifica acesso do usuário ao tenant (bypass para platform owner).
 */
async function ensureTenantAccess(supabase, req, tenantId) {
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

export function registerWhatsappRoutes(app, supabase, options = {}) {
  const requireSupabaseAuth = makeRequireSupabaseAuth(supabase);

  // -----------------------------------------------------------------------
  // POST /api/v1/whatsapp/send — envio de texto OU template
  // body:
  //   { conversationId, to, body }                              ← texto livre
  //   { conversationId, to, template: { name, language, bodyParameters? } }  ← template HSM
  //   { conversationId, to, media: { type: 'image'|'audio'|'video'|'document',
  //                                  url: 'https://...', caption?, filename? } }
  // -----------------------------------------------------------------------
  app.post('/api/v1/whatsapp/send', requireSupabaseAuth, async (req, res) => {
    const { conversationId, to, body, template, media } = req.body || {};
    if (!conversationId || !to) {
      return res.status(400).json({ error: 'missing_fields' });
    }
    if (!template && !body && !media) {
      return res.status(400).json({ error: 'missing_content' });
    }
    if (template && (!template.name || !template.language)) {
      return res.status(400).json({ error: 'invalid_template' });
    }
    if (media) {
      const allowedTypes = ['image', 'audio', 'video', 'document'];
      if (!media.type || !allowedTypes.includes(media.type)) {
        return res.status(400).json({ error: 'invalid_media_type' });
      }
      if (!media.url || typeof media.url !== 'string' || !/^https?:\/\//i.test(media.url)) {
        return res.status(400).json({ error: 'invalid_media_url' });
      }
    }

    try {
      // Buscar conversa e validar acesso
      const { data: conv, error: convErr } = await supabase
        .from('whatsapp_conversations')
        .select('id, tenant_id, contact_phone')
        .eq('id', conversationId)
        .maybeSingle();
      if (convErr) throw convErr;
      if (!conv) return res.status(404).json({ error: 'conversation_not_found' });

      const allowed = await ensureTenantAccess(supabase, req, conv.tenant_id);
      if (!allowed) return res.status(403).json({ error: 'not_a_member' });

      // Buscar credenciais Meta do tenant
      const { data: config, error: cfgErr } = await supabase
        .from('whatsapp_config')
        .select('phone_number_id, access_token, is_active')
        .eq('tenant_id', conv.tenant_id)
        .maybeSingle();
      if (cfgErr) throw cfgErr;
      if (!config || !config.is_active) {
        return res.status(400).json({ error: 'whatsapp_not_configured' });
      }

      const recipient = normalizePhone(to);
      const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${config.phone_number_id}/messages`;

      // Montar payload da Meta
      let metaPayload;
      if (template) {
        const params = Array.isArray(template.bodyParameters) ? template.bodyParameters : [];
        const components =
          params.length > 0
            ? [
                {
                  type: 'body',
                  parameters: params.map((p) => ({ type: 'text', text: String(p) })),
                },
              ]
            : undefined;
        metaPayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipient,
          type: 'template',
          template: {
            name: template.name,
            language: { code: template.language },
            ...(components ? { components } : {}),
          },
        };
      } else if (media) {
        // Tipos com caption: image, video, document. Audio NÃO aceita caption.
        const mediaObj = { link: media.url };
        if (media.caption && media.type !== 'audio') mediaObj.caption = media.caption;
        if (media.filename && media.type === 'document') mediaObj.filename = media.filename;
        metaPayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipient,
          type: media.type,
          [media.type]: mediaObj,
        };
      } else {
        metaPayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipient,
          type: 'text',
          text: { body, preview_url: false },
        };
      }

      const metaResponse = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metaPayload),
      });

      const metaJson = await metaResponse.json().catch(() => ({}));

      const messageType = template ? 'template' : media ? media.type : 'text';
      const bodyToSave = template
        ? `[template:${template.name}]${
            Array.isArray(template.bodyParameters) && template.bodyParameters.length > 0
              ? ' ' + template.bodyParameters.join(' | ')
              : ''
          }`
        : media
          ? media.caption ?? null
          : body;
      const mediaUrlToSave = media?.url ?? null;

      if (!metaResponse.ok) {
        const errorMsg =
          metaJson?.error?.message || `Meta API HTTP ${metaResponse.status}`;
        await supabase.from('whatsapp_messages').insert({
          conversation_id: conv.id,
          tenant_id: conv.tenant_id,
          direction: 'outbound',
          message_type: messageType,
          body: bodyToSave,
          media_url: mediaUrlToSave,
          status: 'failed',
          error_message: errorMsg,
          sent_by_user_id: req.userId,
          metadata: {
            meta_error: metaJson?.error ?? null,
            template: template ?? null,
            media: media ?? null,
          },
        });
        return res.status(502).json({ error: 'meta_send_failed', detail: errorMsg });
      }

      const waMessageId = metaJson?.messages?.[0]?.id ?? null;
      const { error: insErr } = await supabase.from('whatsapp_messages').insert({
        conversation_id: conv.id,
        tenant_id: conv.tenant_id,
        wa_message_id: waMessageId,
        direction: 'outbound',
        message_type: messageType,
        body: bodyToSave,
        media_url: mediaUrlToSave,
        status: 'sent',
        sent_by_user_id: req.userId,
        wa_timestamp: new Date().toISOString(),
        metadata: {
          meta_response: metaJson,
          template: template ?? null,
          media: media ?? null,
        },
      });
      if (insErr) {
        console.error('[whatsapp] erro persistindo mensagem outbound:', insErr);
      }

      return res.json({ ok: true, waMessageId });
    } catch (err) {
      console.error('[whatsapp] erro em /send:', err);
      return res.status(500).json({ error: 'internal_error' });
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/whatsapp/templates?tenantId=... — lista templates aprovados
  // -----------------------------------------------------------------------
  app.get('/api/v1/whatsapp/templates', requireSupabaseAuth, async (req, res) => {
    const tenantId = req.query.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'missing_tenant_id' });

    try {
      const allowed = await ensureTenantAccess(supabase, req, tenantId);
      if (!allowed) return res.status(403).json({ error: 'not_a_member' });

      const { data: config, error: cfgErr } = await supabase
        .from('whatsapp_config')
        .select('business_account_id, access_token, is_active')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (cfgErr) throw cfgErr;
      if (!config || !config.is_active) {
        return res.status(400).json({ error: 'whatsapp_not_configured' });
      }
      if (!config.business_account_id) {
        return res.status(400).json({ error: 'missing_business_account_id' });
      }

      const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${config.business_account_id}/message_templates?limit=200`;
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${config.access_token}` },
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) {
        return res.status(502).json({
          error: 'meta_error',
          detail: json?.error?.message ?? `HTTP ${r.status}`,
        });
      }

      const templates = (json.data || []).filter((t) => t.status === 'APPROVED');
      return res.json({ templates });
    } catch (err) {
      console.error('[whatsapp] erro em /templates:', err);
      return res.status(500).json({ error: 'internal_error' });
    }
  });

  if (options.verbose !== false) {
    console.log('   ├─ 📱 POST /api/v1/whatsapp/send                          → Envia texto/template WhatsApp');
    console.log('   └─ 📱 GET  /api/v1/whatsapp/templates?tenantId=...        → Lista templates aprovados');
  }
}

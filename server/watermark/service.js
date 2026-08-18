/**
 * 🧩 Serviço de marca d'água — orquestra DB + Storage. Sem Express, sem sharp.
 *
 * Responsabilidades:
 *   - ingestMaster: guarda o original e enfileira o processamento (caminho do upload).
 *   - setTenantLogo: troca o logo → pré-computa a máscara branca → bump de versão
 *     → reenfileira tudo (re-watermark em massa, baixa prioridade).
 *   - enqueuePhoto / reprocessTenant: produção de jobs idempotente.
 *
 * O CONSUMO da fila vive em worker.js. Aqui só produzimos trabalho.
 */
import crypto from 'crypto';
import { buildLogoWatermark, composeWatermark } from './watermarkEngine.js';
import { createStorageRepo, masterKey, derivedKey, cleanKey } from './storageRepo.js';
import { SIZES, WATERMARK_DEFAULTS, WATERMARK_POSITIONS, formatFor } from './config.js';

export function createWatermarkService(supabase) {
  const storage = createStorageRepo(supabase);

  /**
   * Caminho do UPLOAD: persiste o master e cria a linha da foto. NÃO enfileira:
   * o derivado é gerado de forma SÍNCRONA logo depois (ensureDerivative via rota
   * lazy ou backfill). A fila (watermark_jobs) é usada só no lote de troca de logo
   * (reprocessTenant), que é desenhado para um worker. Passe { enqueue: true } se
   * quiser delegar o processamento a um worker em vez de gerar na hora.
   */
  async function ingestMaster({ tenantId, propertyId, buffer, contentType, position = 0, caption = '', enqueue = false }) {
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Dedup por conteúdo: re-upload da MESMA foto (retry/double-submit) reaproveita
    // o master existente em vez de criar duplicata (índice uq_property_photos_dedup).
    const { data: existing } = await supabase
      .from('property_photos')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('property_id', propertyId ?? null)
      .eq('content_hash', hash)
      .maybeSingle();
    if (existing) return existing;

    const imageId = crypto.randomUUID();
    const key = masterKey({ tenantId, propertyId, imageId });
    await storage.putMaster(key, buffer, contentType || 'application/octet-stream');

    const { data: photo, error } = await supabase
      .from('property_photos')
      .insert({
        id: imageId,
        tenant_id: tenantId,
        property_id: propertyId ?? null,
        master_path: key,
        content_hash: hash,
        position,
        caption,
        status: 'pending',
      })
      .select()
      .single();
    if (error) throw new Error(`ingestMaster/insert: ${error.message}`);

    if (enqueue) await enqueuePhoto(photo, await getTenantLogoVersion(tenantId));
    return photo;
  }

  /** Insere um job idempotente (no-op se já existe um para a mesma versão). */
  async function enqueuePhoto(photo, logoVersion, priority = 100) {
    const { error } = await supabase
      .from('watermark_jobs')
      .upsert(
        {
          photo_id: photo.id,
          tenant_id: photo.tenant_id,
          logo_version: logoVersion,
          status: 'queued',
          priority,
          run_after: new Date(0).toISOString(),
        },
        { onConflict: 'photo_id,logo_version', ignoreDuplicates: true },
      );
    if (error) throw new Error(`enqueuePhoto: ${error.message}`);
  }

  /**
   * TROCA DE LOGO — o cenário caro. NÃO reescreve arquivos:
   *   1. pré-computa a máscara branca uma única vez;
   *   2. incrementa logo_version (invalida logicamente todos os derivados);
   *   3. reenfileira as fotos do tenant com baixa prioridade (batch).
   *
   * As URLs do CRM passam a pedir wm_v{nova} — geradas sob demanda (routes.js)
   * enquanto o batch processa em background. Zero downtime, zero edição in-place.
   */
  async function setTenantLogo({ tenantId, logoBuffer, contentType }) {
    const mask = await buildLogoWatermark(logoBuffer); // logo colorido c/ fundo transparente

    const { data: tenant, error: tErr } = await supabase
      .from('tenants')
      .select('logo_version')
      .eq('id', tenantId)
      .single();
    if (tErr) throw new Error(`setTenantLogo/select: ${tErr.message}`);

    const newVersion = (tenant.logo_version || 0) + 1;
    const maskPath = await storage.putLogoMask(tenantId, newVersion, mask);
    // Guarda o original colorido (público) só para mostrar na tela de config.
    const originalKey = await storage.putLogoOriginal(tenantId, newVersion, logoBuffer, contentType);
    const logoUrl = storage.publicUrl(originalKey);

    const { error: uErr } = await supabase
      .from('tenants')
      .update({ logo_version: newVersion, logo_mask_path: maskPath, logo_url: logoUrl })
      .eq('id', tenantId);
    if (uErr) throw new Error(`setTenantLogo/update: ${uErr.message}`);

    // O reapontamento (regenerar derivados + atualizar as URLs no JSONB) é feito
    // pela rota em background (repointTenantPhotos), pois é pesado para o request.
    return { logoVersion: newVersion, maskPath, logoUrl };
  }

  /** Lê o progresso DURÁVEL do reprocessamento (tabela watermark_reprocess). */
  async function getReprocessProgress(tenantId) {
    const { data } = await supabase
      .from('watermark_reprocess')
      .select('status, done, total, error, started_at, updated_at')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    return data || { status: 'idle', done: 0, total: 0, error: null };
  }

  // Best-effort: se a migration da tabela ainda não foi aplicada, o reprocesso
  // continua funcionando — só não há rastreamento de progresso.
  async function setReprocessProgress(tenantId, patch) {
    try {
      await supabase
        .from('watermark_reprocess')
        .upsert({ tenant_id: tenantId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' });
    } catch {
      /* tabela ausente ou erro transitório — ignora */
    }
  }

  /**
   * REPROCESSA de fato: para cada foto do tenant (imóveis, condomínios, lançamentos),
   * regenera o derivado da variante/versão ATUAL e ATUALIZA a URL no JSONB `fotos`.
   * É o que faz a troca de logo / o toggle refletirem nas fotos com URLs de CDN direta.
   *
   * Profissional: paralelizado (pool de concorrência limitada para cortar o tempo
   * de parede sem starvar a API), progresso DURÁVEL no banco (sobrevive a restart),
   * idempotente e retomável. Pesado → chamar em background.
   */
  async function repointTenantPhotos(tenantId, { concurrency = 5 } = {}) {
    const { count: total } = await supabase
      .from('property_photos')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);
    await setReprocessProgress(tenantId, {
      status: 'running', done: 0, total: total || 0, error: null, started_at: new Date().toISOString(),
    });

    const TABLES = ['imoveis_locais', 'condominios', 'lancamentos'];
    let done = 0;
    let lastWritten = 0;
    try {
      for (const table of TABLES) {
        let from = 0;
        const page = 200;
        while (true) {
          const { data: rows, error } = await supabase
            .from(table)
            .select('id, fotos, updated_at')
            .eq('tenant_id', tenantId)
            .not('fotos', 'is', null)
            .range(from, from + page - 1);
          if (error) break; // tabela pode não existir em todos os schemas
          if (!rows || rows.length === 0) break;

          for (const row of rows) {
            const fotos = Array.isArray(row.fotos) ? row.fotos : [];
            // Paraleliza as fotos da linha (pool limitado). Mantém O(n) total, mas
            // o tempo de parede cai ~concurrency×.
            const results = await mapPool(fotos, concurrency, async (f) => {
              const fo = typeof f === 'string' ? { url: f } : { ...f };
              if (!fo.id) return { fo, counted: false, changed: false };
              try {
                const { url } = await ensureDerivative(fo.id, 'portal');
                return { fo: { ...fo, url }, counted: true, changed: fo.url !== url };
              } catch {
                return { fo, counted: true, changed: false };
              }
            });

            const changed = results.some((r) => r.changed);
            if (changed) {
              // Reenvia updated_at para o trigger não contar reprocessamento de
              // marca d'água como ajuste do corretor (regra do imóvel
              // desatualizado). Só imoveis_locais respeita o valor enviado;
              // condominios tem trigger incondicional e lancamentos não tem
              // nenhum — nas duas o efeito é o mesmo de antes.
              await supabase
                .from(table)
                .update({ fotos: results.map((r) => r.fo), ...(row.updated_at ? { updated_at: row.updated_at } : {}) })
                .eq('id', row.id);
            }
            done += results.filter((r) => r.counted).length;
            // Grava progresso por linha (não por foto) — evita tempestade de writes.
            if (done - lastWritten >= 10) {
              await setReprocessProgress(tenantId, { status: 'running', done });
              lastWritten = done;
            }
          }
          if (rows.length < page) break;
          from += page;
        }
      }
      await setReprocessProgress(tenantId, { status: 'done', done, total: total || done });
    } catch (e) {
      await setReprocessProgress(tenantId, { status: 'error', done, error: String(e.message).slice(0, 500) });
      throw e;
    }
    return done;
  }

  /** Lê as configurações de marca d'água do tenant (para a tela de config). */
  async function getWatermarkSettings(tenantId) {
    const { data, error } = await supabase
      .from('tenants')
      .select('logo_url, logo_version, watermark_enabled, watermark_opacity, watermark_scale, watermark_position')
      .eq('id', tenantId)
      .single();
    if (error) throw new Error(`getWatermarkSettings: ${error.message}`);
    return data;
  }

  /** Atualiza opacidade/escala/posição/on-off. NÃO mexe no logo nem na versão. */
  async function updateWatermarkSettings(tenantId, { enabled, opacity, scale, position }) {
    const patch = {};
    if (enabled !== undefined) patch.watermark_enabled = !!enabled;
    if (opacity !== undefined) patch.watermark_opacity = clampNum(opacity, 0, 1);
    if (scale !== undefined) patch.watermark_scale = clampNum(scale, 0.05, 1);
    if (position !== undefined) {
      if (!WATERMARK_POSITIONS.includes(position)) throw new Error(`watermark_position inválida: ${position}`);
      patch.watermark_position = position;
    }
    if (Object.keys(patch).length === 0) return getWatermarkSettings(tenantId);

    const { error } = await supabase.from('tenants').update(patch).eq('id', tenantId);
    if (error) throw new Error(`updateWatermarkSettings: ${error.message}`);
    return getWatermarkSettings(tenantId);
  }

  /** Reenfileira todas as fotos do tenant para a versão-alvo (baixa prioridade). */
  async function reprocessTenant(tenantId, logoVersion) {
    if (logoVersion == null) logoVersion = await getTenantLogoVersion(tenantId);

    let from = 0;
    const page = 1000;
    let total = 0;
    // Pagina para não materializar milhões de linhas em memória.
    while (true) {
      const { data, error } = await supabase
        .from('property_photos')
        .select('id, tenant_id')
        .eq('tenant_id', tenantId)
        .range(from, from + page - 1);
      if (error) throw new Error(`reprocessTenant: ${error.message}`);
      if (!data || data.length === 0) break;

      await supabase.from('watermark_jobs').upsert(
        data.map((p) => ({
          photo_id: p.id,
          tenant_id: p.tenant_id,
          logo_version: logoVersion,
          status: 'queued',
          priority: 200, // batch cede a frente para uploads novos (priority 100)
          run_after: new Date(0).toISOString(),
        })),
        { onConflict: 'photo_id,logo_version', ignoreDuplicates: true },
      );

      total += data.length;
      if (data.length < page) break;
      from += page;
    }
    return total;
  }

  async function getTenantLogoVersion(tenantId) {
    const { data, error } = await supabase
      .from('tenants')
      .select('logo_version')
      .eq('id', tenantId)
      .single();
    if (error) throw new Error(`getTenantLogoVersion: ${error.message}`);
    return data?.logo_version || 0;
  }

  /**
   * Garante o derivado de UM tamanho para a versão de logo atual (idempotente):
   * reaproveita se já existe, senão gera, persiste no banco e devolve a URL pública.
   * Fonte única usada pela rota lazy e pelo backfill.
   */
  async function ensureDerivative(photoId, sizeName) {
    const size = SIZES[sizeName];
    if (!size) throw new Error(`tamanho inválido: ${sizeName}`);

    const { data: photo, error: pErr } = await supabase
      .from('property_photos').select('*').eq('id', photoId).single();
    if (pErr) throw new Error(`ensureDerivative/photo: ${pErr.message}`);

    const { data: tenant } = await supabase
      .from('tenants')
      .select('logo_version, logo_mask_path, watermark_enabled, watermark_opacity, watermark_scale, watermark_position')
      .eq('id', photo.tenant_id).single();

    const version = tenant?.logo_version || 0;
    const enabled = tenant?.watermark_enabled !== false && !!tenant?.logo_mask_path;
    const opacity = tenant?.watermark_opacity ?? WATERMARK_DEFAULTS.opacity;
    const scale = tenant?.watermark_scale ?? WATERMARK_DEFAULTS.scale;
    const position = WATERMARK_POSITIONS.includes(tenant?.watermark_position)
      ? tenant.watermark_position
      : WATERMARK_DEFAULTS.position;
    const ref = { tenantId: photo.tenant_id, propertyId: photo.property_id, imageId: photo.id };

    // A chave codifica a VARIANTE (marcado vs limpo) E os parâmetros (versão do
    // logo + opacidade + escala + posição + formato/extensão do perfil). Qualquer
    // mudança → chave nova → regenera e troca a URL, sem servir o arquivo antigo
    // cacheado na CDN. O toggle decide em tempo de serviço; os demais parâmetros
    // refletem ao reapontar (repointTenantPhotos).
    const expectedKey = enabled ? derivedKey(ref, version, sizeName, opacity, scale, position) : cleanKey(ref, sizeName);

    // Idempotência pelo banco: o derivado ATIVO já é o esperado? Serve direto.
    if (photo.derivatives?.[sizeName] === expectedKey) {
      return { url: storage.publicUrl(expectedKey), key: expectedKey, generated: false };
    }

    const master = await storage.getMaster(photo.master_path);
    const mask = enabled ? await storage.getLogoMask(tenant.logo_mask_path) : null;
    const out = await composeWatermark(master, mask, {
      size: enabled ? size : { ...size, watermark: false },
      opacity,
      scale,
      position,
    });
    await storage.putDerivative(expectedKey, out, formatFor(sizeName).contentType);

    // Merge ATÔMICO no banco (jsonb concat via RPC) — evita lost-update do mapa
    // derivatives quando duas requisições concorrentes geram tamanhos diferentes.
    // p_processed_version NULL no caminho desligado preserva a versão anterior.
    // Fallback (read-modify-write) se a migration da RPC ainda não foi aplicada.
    const { error: mErr } = await supabase.rpc('set_photo_derivative', {
      p_id: photo.id,
      p_size: sizeName,
      p_key: expectedKey,
      p_processed_version: enabled ? version : null,
    });
    if (mErr) {
      if (!/set_photo_derivative|PGRST202|does not exist|find the function/i.test(mErr.message)) {
        throw new Error(`set_photo_derivative: ${mErr.message}`);
      }
      const merged = { ...(photo.derivatives || {}), [sizeName]: expectedKey };
      await supabase
        .from('property_photos')
        .update({ derivatives: merged, processed_logo_version: enabled ? version : photo.processed_logo_version, status: 'ready' })
        .eq('id', photo.id);
    }
    return { url: storage.publicUrl(expectedKey), key: expectedKey, generated: true };
  }

  async function getPhotoStatus(photoId) {
    const { data, error } = await supabase
      .from('property_photos')
      .select('id, status, processed_logo_version, derivatives, error')
      .eq('id', photoId)
      .single();
    if (error) throw new Error(`getPhotoStatus: ${error.message}`);
    const urls = {};
    for (const [size, key] of Object.entries(data.derivatives || {})) {
      urls[size] = storage.publicUrl(key);
    }
    return { ...data, urls };
  }

  return {
    storage,
    ingestMaster,
    enqueuePhoto,
    setTenantLogo,
    reprocessTenant,
    repointTenantPhotos,
    getReprocessProgress,
    getTenantLogoVersion,
    getPhotoStatus,
    ensureDerivative,
    getWatermarkSettings,
    updateWatermarkSettings,
  };
}

const clampNum = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0));

/**
 * Aplica `fn` a cada item com no máximo `limit` execuções concorrentes (pool).
 * Mantém a ordem do resultado. Trabalho total O(n); tempo de parede ≈ n/limit.
 */
async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

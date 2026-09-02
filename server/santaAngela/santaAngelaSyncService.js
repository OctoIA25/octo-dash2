/**
 * Sincroniza leads da Santa Ângela para a tabela `leads`, por tenant.
 * Lógica de dedup/insert/update portada do client santaAngelaSyncService.ts,
 * agora server-side (supabase service role). Atualiza last_sync_at/leads_count.
 *
 * IDEMPOTÊNCIA — rodar o mesmo lead N vezes não duplica nem corrompe:
 *   - chave natural = source_lead_id. Existe → UPDATE (origem vence: status e
 *     corretor refletem a Santa Ângela), mas com dirty-check: só grava se algum
 *     campo realmente mudou, então re-rodar com o mesmo payload é no-op.
 *   - não existe → INSERT; telefone já usado sob OUTRO source_id → pula (não
 *     viola unique_phone_per_tenant).
 *   Isso vale igualmente para o disparo automático (cron) e o manual (botão):
 *   ambos chamam o MESMO syncTenant, e o mesmo runner (guarda de reentrância)
 *   impede dois ciclos concorrentes no processo — ver syncRunner.js.
 *
 * FALHAS TRANSITÓRIAS (rede/timeout/5xx) — estratégia "próximo cron":
 *   o tenant falha NAQUELE ciclo, loga o erro e é re-tentado no próximo tick
 *   (sem retry imediato em loop, que amplificaria uma API instável). O timeout
 *   por requisição vive no apiClient; o timeout por tenant, no syncAllTenants.
 */
import crypto from 'node:crypto';
import { mapSantaAngelaToLead } from './leadMapper.js';
import { getDeletedTenantIds } from '../utils/tenantSoftDelete.js';

const noopLogger = { info() {}, warn() {}, error() {} };
const CONFIG_TABLE = 'tenant_santa_angela_config';
const DEFAULT_CONCURRENCY = 5;       // tenants sincronizados em paralelo por ciclo
const DEFAULT_TENANT_TIMEOUT_MS = 60000; // teto por tenant; estourou → erro no ciclo, não bloqueia os demais

export function createSantaAngelaSyncService({
  supabase, apiClient, logger = noopLogger, processEnv = process.env, pLimitImpl,
}) {
  const concurrency = Number(processEnv.SANTA_ANGELA_SYNC_CONCURRENCY) || DEFAULT_CONCURRENCY;
  const tenantTimeoutMs = Number(processEnv.SANTA_ANGELA_TENANT_TIMEOUT_MS) || DEFAULT_TENANT_TIMEOUT_MS;
  // Retorna null em erro de leitura — e o ciclo do tenant DEVE abortar nesse
  // caso. Retornar sets vazios aqui (comportamento antigo) fazia o sync tratar
  // a página inteira como leads novos e RE-INSERIR os 100 mais recentes a cada
  // ciclo que a leitura falhasse (statement timeout etc.) — foi a origem das
  // centenas de duplicatas com phone null em produção.
  async function getExisting(tenantId) {
    // Paginado: PostgREST corta em 1000 linhas SEM erro; um tenant com mais
    // leads Santa Ângela que isso teria existentes invisíveis ao dedup.
    const data = [];
    for (let from = 0; ; from += 1000) {
      const { data: page, error } = await supabase
        .from('leads').select('phone, source_lead_id, status, assigned_agent_name, property_code')
        .eq('tenant_id', tenantId).eq('source', 'Santa Angela')
        .order('id').range(from, from + 999);
      if (error) { logger.warn(`[santa-angela] erro lendo existentes: ${error.message}`); return null; }
      data.push(...(page || []));
      if (!page || page.length < 1000) break;
    }
    const phoneSet = new Set((data || []).map((l) => l.phone).filter(Boolean));
    // filter(Boolean): um source_lead_id nulo no banco não pode virar match
    // contra uma saLead.id ausente (causaria falso "update" / .eq sem alvo).
    const sourceIdSet = new Set((data || []).map((l) => l.source_lead_id).filter(Boolean));
    // Estado atual por source_lead_id: alimenta o dirty-check do updateExisting,
    // pra só gravar quando status/corretor da origem realmente mudaram.
    const bySourceId = new Map((data || [])
      .filter((l) => l.source_lead_id)
      .map((l) => [l.source_lead_id, {
        status: l.status,
        assigned_agent_name: l.assigned_agent_name,
        property_code: l.property_code,
      }]));
    return { phoneSet, sourceIdSet, bySourceId };
  }

  async function insertNew(lead, { phoneNullFallback = true } = {}) {
    const { error } = await supabase.from('leads').insert(lead);
    if (!error) return true;
    if (String(error.message || '').includes('unique_phone_per_tenant')) {
      // Lead fresco com telefone já usado por outro source entra sem telefone
      // (não perder lead vivo). No backfill histórico o fallback é desligado:
      // duplicar uma pessoa antiga é pior que pular.
      if (!phoneNullFallback) return false;
      const { error: e2 } = await supabase.from('leads').insert({ ...lead, phone: null });
      return !e2;
    }
    logger.warn(`[santa-angela] insert falhou: ${error.message}`);
    return false;
  }

  // Origem vence: status e corretor refletem a Santa Ângela. Mas só gravamos
  // quando ALGO mudou (dirty-check contra `current`), por dois motivos:
  //   1) o polling de 60s faz leads recentes reaparecerem na 1ª página e caírem
  //      aqui a cada ciclo — UPDATE incondicional seria escrita inútil em escala;
  //   2) o trigger tg_update_leads_assigned_at reseta assigned_at sempre que
  //      assigned_agent_name muda (IS DISTINCT FROM). Regravar o MESMO corretor
  //      não dispara o trigger, mas o dirty-check garante que nem chegamos a
  //      gravar — assigned_at só reinicia numa troca real de corretor (que é o
  //      comportamento correto: nova atribuição reinicia o countdown do bolsão).
  // Retorna 'updated' | 'unchanged' | 'error'.
  async function updateExisting(lead, tenantId, current) {
    const next = { status: lead.status, assigned_agent_name: lead.assigned_agent_name };
    // property_code só entra quando temos um valor NOVO: o detalhe do prospect pode
    // falhar (400 de carteira alheia) e null não pode apagar um código já gravado.
    const fillsPropertyCode = Boolean(lead.property_code) && lead.property_code !== current?.property_code;
    const changed = !current
      || current.status !== next.status
      || current.assigned_agent_name !== next.assigned_agent_name
      || fillsPropertyCode;
    if (!changed) return 'unchanged';

    const { error } = await supabase.from('leads')
      .update({
        status: next.status,
        assigned_agent_name: next.assigned_agent_name,
        custom_fields: lead.custom_fields,
        ...(fillsPropertyCode ? { property_code: lead.property_code } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('source_lead_id', lead.source_lead_id).eq('tenant_id', tenantId);
    return error ? 'error' : 'updated';
  }

  // Defesa em profundidade: o import histórico NÃO confia no gate de frescor do
  // banco. Em 02/09 um trigger gêmeo (`trg_`, criado fora de migration, sem
  // WHEN) furou o gate e 480 leads de 2015-2025 foram entregues à Lia. Aqui a
  // supressão é do próprio sync: pré-grava o lead.created já 'delivered' com o
  // mesmo (event_type, source_table, source_id) que o trigger usaria — se algum
  // trigger disparar, cai no ON CONFLICT DO NOTHING, e o poller só processa
  // 'pending'. Exige id gerado no cliente (o trigger usa NEW.id).
  async function suppressLeadCreated(tenantId, leadId) {
    const { error } = await supabase.from('webhook_events').insert({
      tenant_id: tenantId,
      event_type: 'lead.created',
      source_table: 'leads',
      source_id: leadId,
      payload: { backfill: true, source: 'santa-angela-full-sync' },
      status: 'delivered',
      delivered_at: new Date().toISOString(),
    });
    if (error) logger.warn(`[santa-angela] supressão de lead.created falhou: ${error.message}`);
    return !error;
  }

  // Qual imóvel o lead procura. O grid não diz — só o detalhe do prospect
  // (/prospects/{id} → empreendimento_id) cruzado com /empreendimentos.
  //
  // Custo: 1 requisição por lead SEM código. Quem já tem código não é consultado
  // de novo, então o custo cai a ~zero depois do primeiro ciclo e o histórico é
  // preenchido sozinho ao longo dos ciclos seguintes.
  // ponytail: teto = tamanho da página (100 detalhes/ciclo a 5 req/s ≈ 20s). Se a
  // página crescer, buscar os detalhes em lote/paralelo antes de estourar o timeout do tenant.
  async function resolveEmpreendimento(tenantId, saLead, current) {
    if (current?.property_code) return null; // já sabemos o imóvel deste lead
    const detail = await apiClient.fetchProspectDetail(tenantId, saLead.id);
    const empreendimentoId = detail?.empreendimento_id;
    if (!empreendimentoId) return null;
    const byId = await apiClient.fetchEmpreendimentos(tenantId); // cacheado por tenant
    return byId.get(String(empreendimentoId)) || null;
  }

  // `full: true` (primeiro sync do tenant, last_sync_at null) varre TODAS as
  // páginas do grid — sem isso a base histórica nunca entra: o polling só lê a
  // página 1 (100 mais recentes por data de cadastro) e um lead antigo jamais
  // aparece nela. Leads históricos (>48h) entram com participa_bolsao=false
  // (não inundam o bolsão/expiração) e assigned_at original; o gate de frescor
  // no trigger de lead.created (migration 20260902) impede que disparem a Lia.
  async function syncTenant(tenantId, runId = '-', { full = false } = {}) {
    const startedAt = Date.now();
    logger.info(`[santa-angela] {"event":"santa-angela.sync.tenant.start","runId":"${runId}","tenantId":"${tenantId}","full":${full}}`);
    const result = { tenantId, success: false, totalFetched: 0, newLeads: 0, updatedLeads: 0, errors: 0, message: '' };

    const finish = () => {
      const durationMs = Date.now() - startedAt;
      if (result.success) {
        logger.info(`[santa-angela] {"event":"santa-angela.sync.tenant.done","runId":"${runId}","tenantId":"${tenantId}","durationMs":${durationMs},"totalFetched":${result.totalFetched},"new":${result.newLeads},"updated":${result.updatedLeads},"errors":${result.errors}}`);
      } else {
        logger.warn(`[santa-angela] {"event":"santa-angela.sync.tenant.error","runId":"${runId}","tenantId":"${tenantId}","durationMs":${durationMs},"error":${JSON.stringify(result.message)}}`);
      }
      return result;
    };

    const leads = [];
    let page = 1; let ultimaPagina = 1;
    do {
      const fetched = await apiClient.fetchLeads(tenantId, page);
      if (!fetched.ok) {
        result.errors = 1;
        result.message = `Falha ao buscar leads (página ${page}): ${fetched.error || fetched.status}`;
        return finish();
      }
      leads.push(...fetched.leads);
      ultimaPagina = fetched.ultimaPagina || 1;
      page++;
    } while (full && page <= ultimaPagina);

    result.totalFetched = leads.length;
    if (leads.length === 0) {
      result.success = true; result.message = 'Nenhum lead encontrado na API';
      await touchSync(tenantId, 0);
      return finish();
    }

    const existing = await getExisting(tenantId);
    if (!existing) {
      // Sem visão dos existentes NÃO se insere nada — tratar como "tudo novo"
      // duplicaria a página inteira. Falha o ciclo; o próximo cron re-tenta.
      result.errors = 1;
      result.message = 'Falha ao ler leads existentes — ciclo abortado';
      return finish();
    }
    const { phoneSet, sourceIdSet, bySourceId } = existing;
    const freshCutoff = Date.now() - 48 * 60 * 60 * 1000;
    for (const saLead of leads) {
      const current = saLead.id ? bySourceId.get(saLead.id) : undefined;
      // ponytail: no full sync não se resolve empreendimento por lead (seriam
      // ~1 req/lead a 5 req/s = minutos); histórico entra sem property_code.
      const historical = full && new Date(saLead.datahoracadastro || Date.now()).getTime() < freshCutoff;
      const empreendimento = historical ? null : await resolveEmpreendimento(tenantId, saLead, current);
      const mapped = mapSantaAngelaToLead(saLead, tenantId, empreendimento);
      if (saLead.id && sourceIdSet.has(saLead.id)) {
        if (await updateExisting(mapped, tenantId, current) === 'updated') result.updatedLeads++;
      } else if (mapped.phone && phoneSet.has(mapped.phone)) {
        // pula: telefone já existe sob outro source_id (evita violar unique_phone_per_tenant)
      } else {
        const lead = historical
          ? { ...mapped, id: crypto.randomUUID(), participa_bolsao: false, assigned_at: mapped.created_at }
          : mapped;
        // Sem supressão gravada, o lead histórico NÃO entra: melhor faltar um
        // lead antigo (recuperável no próximo full) que a Lia abordar alguém de 2019.
        if (historical && !(await suppressLeadCreated(tenantId, lead.id))) {
          result.errors++;
        } else if (await insertNew(lead, { phoneNullFallback: !historical })) {
          result.newLeads++;
          if (mapped.phone) phoneSet.add(mapped.phone); // dedup intra-ciclo (full traz a base inteira)
        } else {
          // Insert rejeitado (ex.: status fora de leads_status_check) é PERDA de
          // lead — conta como erro para aparecer no log do ciclo em vez de sumir.
          result.errors++;
          if (historical) {
            await supabase.from('webhook_events').delete()
              .eq('source_table', 'leads').eq('source_id', lead.id);
          }
        }
      }
    }

    result.success = true;
    result.message = `Sincronização concluída: ${result.newLeads} novos, ${result.updatedLeads} atualizados`
      + (result.errors ? `, ${result.errors} leads NÃO inseridos` : '');
    await touchSync(tenantId, result.newLeads + result.updatedLeads);
    return finish();
  }

  // Teto de tempo por tenant: um tenant pendurado não pode segurar o ciclo. Se
  // estourar, retorna erro (não lança) — o allSettled segue com os demais e o
  // tenant é re-tentado no próximo cron.
  // NOTA: o syncTenant que perdeu o race NÃO é cancelado — segue em background
  // até concluir. A escrita tardia é inofensiva: o sync é idempotente (chave
  // source_lead_id) e a guarda de reentrância impede ciclos sobrepostos; no pior
  // caso um touchSync atrasado regrava last_sync_at com valor levemente anterior.
  function withTenantTimeout(tenantId, runId, { full = false } = {}) {
    // Primeiro sync (full) varre a base inteira e insere centenas de leads —
    // não cabe nos 60s. Teto próprio, folgado: se o race de 60s vencesse, a
    // guarda de reentrância liberaria e o próximo tick iniciaria OUTRO full
    // concorrente com o que ficou rodando em background (inserts duplicados).
    const timeoutMs = full
      ? (Number(processEnv.SANTA_ANGELA_FULL_SYNC_TIMEOUT_MS) || 15 * 60 * 1000)
      : tenantTimeoutMs;
    return Promise.race([
      syncTenant(tenantId, runId, { full }),
      new Promise((resolve) => setTimeout(
        () => resolve({ tenantId, success: false, totalFetched: 0, newLeads: 0, updatedLeads: 0, errors: 1,
          message: `timeout do tenant após ${timeoutMs}ms` }),
        timeoutMs,
      )),
    ]);
  }

  async function syncAllTenants(runId = String(Date.now())) {
    const cycleStart = Date.now();
    const { data, error } = await supabase
      .from(CONFIG_TABLE).select('tenant_id, last_sync_at').eq('status', 'active');
    if (error) {
      logger.error(`[santa-angela] {"event":"santa-angela.sync.cycle.error","runId":"${runId}","error":${JSON.stringify(error.message)}}`);
      return [];
    }
    // Tenant soft-deletado (tenants.deleted_at) não sincroniza — service_role
    // bypassa RLS, então o filtro é explícito aqui.
    const deletedIds = await getDeletedTenantIds(supabase, (data || []).map((r) => r.tenant_id));
    const rows = (data || []).filter((r) => !deletedIds.has(r.tenant_id));
    logger.info(`[santa-angela] {"event":"santa-angela.sync.cycle.start","runId":"${runId}","tenantsAtivos":${rows.length},"concurrency":${concurrency}}`);

    // p-limit: no máximo `concurrency` tenants em paralelo — evita abrir centenas
    // de sincronizações de uma vez conforme a base cresce. Injetável p/ testes.
    const limit = pLimitImpl ? pLimitImpl(concurrency) : (await import('p-limit')).default(concurrency);
    // Tenant que nunca sincronizou (last_sync_at null) faz o primeiro sync
    // completo: todas as páginas do grid, importando a base histórica.
    const settled = await Promise.allSettled(
      rows.map((r) => limit(() => withTenantTimeout(r.tenant_id, runId, { full: !r.last_sync_at }))),
    );
    const results = settled.map((s, i) => (s.status === 'fulfilled'
      ? s.value
      : { tenantId: rows[i]?.tenant_id, success: false, errors: 1, message: s.reason?.message }));

    const ok = results.filter((r) => r.success).length;
    logger.info(`[santa-angela] {"event":"santa-angela.sync.cycle.done","runId":"${runId}","durationMs":${Date.now() - cycleStart},"ok":${ok},"failed":${results.length - ok}}`);
    return results;
  }

  async function touchSync(tenantId, count) {
    const { error } = await supabase.from(CONFIG_TABLE)
      .update({ last_sync_at: new Date().toISOString(), leads_count: count })
      .eq('tenant_id', tenantId);
    if (error) logger.warn(`[santa-angela] touchSync falhou: ${error.message}`);
  }

  return { syncTenant, syncAllTenants };
}

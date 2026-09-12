/**
 * Atribuição automática de corretor a leads. Porta a prioridade já validada no
 * frontend (kenloLeadsService.ts): código do imóvel (mais confiável) → attendedBy.
 * Lookups injetados; memoização evita N+1.
 *
 * Cache vive no escopo da INSTÂNCIA (não por chamada): no sync streaming, `assign`
 * roda uma vez por página, então o cache precisa persistir entre páginas do mesmo
 * tenant.
 *
 * A chave INCLUI o tenantId. O engine sincroniza os tenants em PARALELO
 * (crmSync/engine.js: Promise.allSettled sobre runTenantCycle) usando UMA instância
 * compartilhada de assigner (kenloScheduler) — com chave só por código/nome, o
 * mesmo "AP100" (ou o mesmo nome de corretor) resolvido antes por outro tenant
 * devolvia o corretor ERRADO, de outra imobiliária. `reset()` continua existindo
 * para limitar o crescimento do cache, mas já não é o que garante o isolamento.
 */
export function createBrokerAssigner({
  getCorretorByPropertyCode,
  findCorretorInSystem,
  // Sem o lookup injetado nada é filtrado — é o comportamento anterior. A wiring
  // real (makeBrokerLookups) sempre o traz; o default existe para os testes que
  // não se importam com a marca.
  recebeLeadAutomatico = async () => true,
}) {
  const byCodeCache = new Map();
  const byNameCache = new Map();
  const recebeCache = new Map();
  const cacheKey = (tenantId, value) => `${tenantId} ${value}`;

  async function assign(tenantId, rows) {
    const resolveCode = async (codigo) => {
      const key = cacheKey(tenantId, codigo);
      if (byCodeCache.has(key)) return byCodeCache.get(key);
      const r = await getCorretorByPropertyCode(tenantId, codigo);
      byCodeCache.set(key, r);
      return r;
    };
    const resolveName = async (nome) => {
      const key = cacheKey(tenantId, nome);
      if (byNameCache.has(key)) return byNameCache.get(key);
      const r = await findCorretorInSystem(tenantId, { nome });
      byNameCache.set(key, r);
      return r;
    };
    const recebeAuto = async (brokerId) => {
      const key = cacheKey(tenantId, brokerId);
      if (!recebeCache.has(key)) recebeCache.set(key, await recebeLeadAutomatico(tenantId, brokerId));
      return recebeCache.get(key);
    };

    for (const row of rows) {
      let id = null, nome = null;
      if (row.interest_reference) {
        const c = await resolveCode(row.interest_reference);
        if (c) {
          if (c.id) { id = c.id; nome = c.nome; }
          else {
            const m = await resolveName(c.nome);
            if (m) { id = m.id; nome = m.nome; } else { nome = c.nome; }
          }
        }
      }
      if (!id && row.attended_by_name) {
        const m = await resolveName(row.attended_by_name);
        if (m) { id = m.id; nome = m.nome; } else { nome = row.attended_by_name; }
      }
      // Captador — ou qualquer um marcado como "não recebe lead automático" — não
      // fica com o lead: a linha sai SEM corretor e a distribuição normal decide.
      // O NOME tem de ser limpo também: o espelho do bolsão copia
      // `attended_by_name` para `corretor_responsavel`
      // (20260427_mirror_leads_and_kenlo_into_bolsao.sql:205), então deixar o nome
      // entregaria o lead a ele por outra porta. Sem id resolvido não há o que
      // checar — segue o comportamento de sempre.
      if (id && !(await recebeAuto(id))) {
        row.attended_by_name = null;
        row.attended_by_id = null;
        continue;
      }

      if (nome) row.attended_by_name = nome;
      if (id) row.attended_by_id = id;
    }
    return rows;
  }

  function reset() {
    byCodeCache.clear();
    byNameCache.clear();
    recebeCache.clear();
  }

  return { assign, reset };
}

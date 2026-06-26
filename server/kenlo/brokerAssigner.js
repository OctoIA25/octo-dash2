/**
 * Atribuição automática de corretor a leads. Porta a prioridade já validada no
 * frontend (kenloLeadsService.ts): código do imóvel (mais confiável) → attendedBy.
 * Lookups injetados; memoização por execução evita N+1.
 */
export function createBrokerAssigner({ getCorretorByPropertyCode, findCorretorInSystem }) {
  async function assign(tenantId, rows) {
    const byCodeCache = new Map();
    const byNameCache = new Map();
    const resolveCode = async (codigo) => {
      if (byCodeCache.has(codigo)) return byCodeCache.get(codigo);
      const r = await getCorretorByPropertyCode(tenantId, codigo);
      byCodeCache.set(codigo, r);
      return r;
    };
    const resolveName = async (nome) => {
      if (byNameCache.has(nome)) return byNameCache.get(nome);
      const r = await findCorretorInSystem(tenantId, { nome });
      byNameCache.set(nome, r);
      return r;
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
      if (nome) row.attended_by_name = nome;
      if (id) row.attended_by_id = id;
    }
    return rows;
  }
  return { assign };
}

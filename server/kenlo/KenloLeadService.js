/**
 * Busca leads do Kenlo: paginação real por idMediaOrigin e enriquecimento com
 * detalhes (concorrência limitada). Lógica de negócio pura — delega resiliência
 * ao apiClient.
 */
import { loadKenloEnv } from './kenloConfig.js';

const BASE = 'https://leads.ingaia.com.br/leads/ingaia/';

const extractLeads = (body) => {
  const leads = body?.data || body?.leads || body;
  return Array.isArray(leads) ? leads : [];
};

export function createKenloLeadService({ apiClient, processEnv = process.env, pLimitImpl }) {
  const cfg = loadKenloEnv(processEnv);

  async function fetchLeadsPage(integration, { mediaOrigin, page }) {
    const url = `${BASE}?page=${page}&perPage=${cfg.perPage}&idMediaOrigin=${mediaOrigin}`;
    const { status, body } = await apiClient.getJson(integration, url);
    return { status, leads: extractLeads(body) };
  }

  async function fetchAllPages(integration, { mediaOrigin }) {
    const all = [];
    let page = 1;
    let status = 200;
    for (;;) {
      const r = await fetchLeadsPage(integration, { mediaOrigin, page });
      status = r.status;
      if (r.status !== 200) break;             // erro: devolve o acumulado
      all.push(...r.leads);
      if (r.leads.length < cfg.perPage) break; // última página
      page++;
    }
    return { status, leads: all };
  }

  async function fetchDetails(integration, leads) {
    const limit = pLimitImpl
      ? pLimitImpl(10)
      : (await import('p-limit')).default(10);
    const tasks = leads.map((lead) => limit(async () => {
      const id = lead._id || lead.id;
      if (!id) return lead;
      const url = `${BASE}${id}?fields=interest%2Cmessage%2CattendedBy`;
      const { status, body } = await apiClient.getJson(integration, url);
      return status === 200 && body ? { ...lead, ...body } : lead;
    }));
    return Promise.all(tasks);
  }

  return { fetchLeadsPage, fetchAllPages, fetchDetails };
}

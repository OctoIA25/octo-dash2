/**
 * Coleta as vendas assinadas e monta a matriz da aba ESPELHO.
 * `montarMatriz` é pura (dados -> any[][]) — todo o cálculo testável mora aqui;
 * `coletarVendas` só junta tabelas via service role.
 */
import { calcularLinhaEspelho, derivarComissaoTotal, NIVEIS } from './motor.js';

export const HEADER = [
  'Mês', 'Assinatura', 'Empreendimento', 'Unidade', 'Cliente', 'Corretor', 'Nível',
  'VGV', '% Com.', 'Comissão Total', 'Corretor R$', 'Líder', 'Líder R$', 'Lotus R$', 'Obs',
];

const r2 = (n) => Math.round(n * 100) / 100;

// O negócio roda em horário de Brasília, não UTC — bucketar por mês em UTC
// (bug histórico neste projeto, ver memória "Erro removeChild"/vários outros)
// jogaria uma venda assinada às 23h de 31/07 BRT pro mês 08. `fmtSP` formata
// em America/Sao_Paulo; `mesDe` e a coluna Assinatura derivam dele.
const fmtSP = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
});
const dataSP = (iso) => fmtSP.format(new Date(iso)); // 'YYYY-MM-DD' em horário de SP
const mesDe = (iso) => {
  const [ano, mes] = dataSP(iso).split('-');
  return `${mes}/${ano}`;
};

export function montarMatriz(vendas, geradoEm) {
  const linhas = [
    ['REPORT — ESPELHO AUTOMÁTICO (não editar — reescrito de hora em hora pela dash)', `Gerado em ${geradoEm}`],
    HEADER,
  ];
  const ordenadas = [...vendas].sort((a, b) => String(a.signedAt).localeCompare(String(b.signedAt)));
  let mesAtual = null;
  let subtotal = null;
  const fechaMes = () => { if (subtotal) linhas.push(['SUBTOTAL', '', '', '', '', '', '', r2(subtotal.vgv), '', r2(subtotal.comissao), r2(subtotal.corretor), '', r2(subtotal.lider), r2(subtotal.lotus), '']); };

  for (const v of ordenadas) {
    const mes = mesDe(v.signedAt);
    if (mes !== mesAtual) {
      fechaMes();
      linhas.push([mes]);
      mesAtual = mes;
      subtotal = { vgv: 0, comissao: 0, corretor: 0, lider: 0, lotus: 0 };
    }
    const { percentual, valor: comissao } = derivarComissaoTotal(v.vgv, v.classification, v.commissionOverride);
    const nivelOk = v.corretorNivel && NIVEIS[v.corretorNivel];
    // Ruling: "corretor: null" no motor é reservado ao caso SEM corretor algum
    // (100% pra Lotus, sem bloqueio). Com corretor presente mas nível não
    // cadastrado, passamos o nível mesmo assim — o motor decide L003.
    const temCorretor = Boolean(v.corretorNome);
    const split = calcularLinhaEspelho({
      comissao,
      corretor: temCorretor ? { nome: v.corretorNome, nivel: v.corretorNivel } : null,
      lider: v.liderNome && v.liderNivel ? { nome: v.liderNome, nivel: v.liderNivel } : null,
    });
    const bloqueado = split.bloqueio !== null;
    const obs = bloqueado
      ? `${split.bloqueio}: revisar à mão (nível/líder ausente ou anômalo)`
      : '';
    linhas.push([
      '', // mês só na linha de seção — senão viraria seção falsa no filtro por regex
      dataSP(v.signedAt),
      v.empreendimento || '',
      v.unidade || '',
      v.cliente || '',
      v.corretorNome || '',
      nivelOk ? NIVEIS[v.corretorNivel].label : (v.corretorNivel || ''),
      r2(v.vgv || 0),
      percentual ?? '',
      r2(comissao),
      bloqueado ? '' : r2(split.corretorValor),
      v.liderNome || '',
      bloqueado ? '' : r2(split.liderValor),
      bloqueado ? '' : r2(split.lotusValor),
      obs,
    ]);
    // F5: acumula os valores JÁ arredondados (r2) — senão o SUBTOTAL pode
    // divergir por centavos da soma manual das células exibidas (arredondadas).
    subtotal.vgv += r2(v.vgv || 0);
    if (!bloqueado) {
      subtotal.comissao += r2(comissao);
      subtotal.corretor += r2(split.corretorValor);
      subtotal.lider += r2(split.liderValor);
      subtotal.lotus += r2(split.lotusValor);
    }
  }
  fechaMes();
  return linhas;
}

const PAGE_SIZE = 1000;

/**
 * PostgREST corta em 1000 linhas por padrão, sem erro (footgun documentado
 * neste projeto) — num espelho financeiro isso sub-relataria comissão em
 * silêncio. `montarQuery(from, to)` deve devolver uma query nova a cada
 * chamada (reaproveitar o mesmo builder entre .range() não é seguro).
 */
async function paginarTudo(montarQuery) {
  const linhas = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await montarQuery(offset, offset + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    const pagina = data || [];
    linhas.push(...pagina);
    if (pagina.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return { data: linhas, error: null };
}

const CHUNK_SIZE = 200;

/**
 * Mesmo teto silencioso do paginarTudo, mas do lado do `.in(coluna, ids)`:
 * uma lista de ids grande pode casar mais de 1000 linhas e o PostgREST corta
 * em 1000 sem erro (aqui, classificação/nome sumindo em silêncio faria a
 * comissão cair de 6% pra 3,5% sem ninguém perceber). `emLotes` quebra a
 * lista em pedaços de CHUNK_SIZE e concatena os resultados de cada chamada.
 */
async function emLotes(ids, fetchLote) {
  const linhas = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const lote = ids.slice(i, i + CHUNK_SIZE);
    const { data, error } = await fetchLote(lote);
    if (error) return { data: null, error };
    linhas.push(...(data || []));
  }
  return { data: linhas, error: null };
}

export async function coletarVendas(supabase, tenantId) {
  const { data: proposals, error } = await paginarTudo((from, to) => supabase
    .from('proposals')
    .select('id, value, signed_at, commission_total, forecast_empreendimento, forecast_unidade, agent_user_id, agent_name, lead_id')
    .eq('tenant_id', tenantId)
    .eq('stage_id', 'proposta-assinada')
    .not('signed_at', 'is', null)
    .order('signed_at', { ascending: true })
    .order('id', { ascending: true }) // desempate estável — sem ele o range pode repetir/pular linha entre páginas
    .range(from, to));
  if (error) throw new Error(`proposals: ${error.code || ''} ${error.message}`);
  if (!proposals?.length) return [];

  const leadIds = [...new Set(proposals.map((p) => p.lead_id).filter(Boolean))];
  const propIds = proposals.map((p) => p.id);
  const userIds = [...new Set(proposals.map((p) => p.agent_user_id).filter(Boolean))];

  const [leadsRes, partiesRes, membersRes] = await Promise.all([
    leadIds.length
      ? emLotes(leadIds, (lote) => supabase.from('leads').select('id, classification').in('id', lote))
      : { data: [], error: null },
    emLotes(propIds, (lote) => supabase
      .from('proposal_parties').select('proposal_id, full_name').eq('party_type', 'comprador').in('proposal_id', lote)),
    // F3: sem ORDER BY, paginação por offset (.range) pode pular/repetir linha
    // entre páginas — mesmo raciocínio do desempate em `proposals` acima.
    paginarTudo((from, to) => supabase
      .from('tenant_memberships').select('user_id, leader_user_id, permissions').eq('tenant_id', tenantId)
      .order('user_id', { ascending: true }).range(from, to)),
  ]);
  for (const [nome, res] of [['leads', leadsRes], ['proposal_parties', partiesRes], ['tenant_memberships', membersRes]]) {
    if (res.error) throw new Error(`${nome}: ${res.error.code || ''} ${res.error.message}`);
  }

  const classPorLead = new Map((leadsRes.data || []).map((l) => [l.id, l.classification]));
  const clientePorProposta = new Map((partiesRes.data || []).map((p) => [p.proposal_id, p.full_name]));
  const memberPorUser = new Map((membersRes.data || []).map((m) => [m.user_id, m]));

  // Nomes dos líderes: tenant_brokers por auth_user_id (coluna confirmada no Step 1).
  const liderIds = [...new Set(
    userIds.map((u) => memberPorUser.get(u)?.leader_user_id).filter(Boolean),
  )];
  let nomePorUser = new Map();
  if (liderIds.length) {
    const { data: brokers, error: bErr } = await emLotes(liderIds, (lote) => supabase
      .from('tenant_brokers').select('auth_user_id, name').in('auth_user_id', lote));
    if (bErr) throw new Error(`tenant_brokers: ${bErr.code || ''} ${bErr.message}`);
    nomePorUser = new Map((brokers || []).map((b) => [b.auth_user_id, b.name]));
  }

  return proposals.map((p) => {
    const member = p.agent_user_id ? memberPorUser.get(p.agent_user_id) : null;
    const liderId = member?.leader_user_id || null;
    const liderMember = liderId ? memberPorUser.get(liderId) : null;
    return {
      signedAt: p.signed_at,
      empreendimento: p.forecast_empreendimento || '',
      unidade: p.forecast_unidade || '',
      cliente: clientePorProposta.get(p.id) || '',
      corretorNome: p.agent_name || '',
      corretorNivel: member?.permissions?.nivel_comissao || null,
      liderNome: liderId ? (nomePorUser.get(liderId) || 'Líder') : null,
      liderNivel: liderMember?.permissions?.nivel_comissao || null,
      vgv: typeof p.value === 'string' ? Number(p.value) : p.value,
      classification: classPorLead.get(p.lead_id) ?? null,
      commissionOverride: p.commission_total,
    };
  });
}

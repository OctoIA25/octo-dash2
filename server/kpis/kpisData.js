/**
 * 🔌 Acesso a dados dos KPIs (Supabase).
 *
 * Camada FINA e isolada: só lê do banco e devolve linhas/contagens cruas. Toda
 * a regra de cálculo vive em kpisCompute.js (puro). Separar permite testar a
 * regra sem rede e trocar a fonte sem tocar na regra.
 *
 * Notas de corretude (auditoria de KPIs):
 *  - Todas as queries filtram tenant_id E archived_at IS NULL.
 *  - Leads são paginados (evita o corte silencioso de 1000 linhas do PostgREST).
 *  - Imóveis ativos são CONTADOS no banco (count exact, head) — não traz linhas.
 */

import { dayEndUtc, dayStartUtc } from './kpisPeriod.js';

const LEADS_PAGE_SIZE = 1000;

// Na tabela `leads`, o estágio do funil é a coluna `status` (não existe
// `etapa_atual` — esse nome só aparece no ProcessedLead normalizado do front).
// `first_response_at` saiu daqui: a coluna é gravada quando o card deixa a
// primeira coluna do kanban (leadsService.ts:602), não quando alguém fala com o
// lead. Quem mede interação agora é a view `primeira_interacao`.
const LEAD_FIELDS = 'status,source,final_sale_value,created_at';

/**
 * Lê todos os leads do período (paginado), escopados por tenant e sem
 * arquivados. `agentId` opcional restringe ao corretor (escopo individual).
 */
export async function fetchLeads(supabase, { tenantId, period, agentId }) {
  const rows = [];
  let from = 0;

  for (;;) {
    let query = supabase
      .from('leads')
      .select(LEAD_FIELDS)
      .eq('tenant_id', tenantId)
      .is('archived_at', null)
      .gte('created_at', dayStartUtc(period.startDate))
      .lte('created_at', dayEndUtc(period.endDate))
      .range(from, from + LEADS_PAGE_SIZE - 1);

    if (agentId) {
      query = query.eq('assigned_agent_id', agentId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const page = data || [];
    rows.push(...page);
    if (page.length < LEADS_PAGE_SIZE) break;
    from += LEADS_PAGE_SIZE;
  }

  return rows;
}

const INTERACAO_PAGE_SIZE = 1000;

/**
 * Minutos até a primeira interação de cada lead do período, dos dois lados.
 *
 * Lê as views `primeira_interacao` (LIA) e `primeira_interacao_corretor`. Os
 * filtros são os MESMOS de `fetchLeads` — tenant, período por data de criação,
 * não arquivado e, no escopo individual, o corretor — senão a taxa de
 * atendimento passa de 100% (arquivado no numerador, fora do denominador) e a
 * tela de um corretor mostra o tempo do tenant inteiro.
 *
 * Devolve os minutos crus, não a mediana: a regra de cálculo mora em
 * kpisCompute.js, que é puro e testável sem rede.
 *
 * Erro de leitura devolve array VAZIO, e quem consome transforma isso em
 * "Sem dados". Não devolve 0 de propósito: zero minuto é uma medição, ausência
 * de medição é outra coisa.
 */
export async function fetchPrimeiraInteracao(supabase, { tenantId, period, agentId }) {
  const lerView = async (view) => {
    const minutos = [];
    let from = 0;

    for (;;) {
      let query = supabase
        .from(view)
        .select('minutos_ate_primeiro_contato')
        .eq('tenant_id', tenantId)
        .is('archived_at', null)
        .gte('lead_criado_em', dayStartUtc(period.startDate))
        .lte('lead_criado_em', dayEndUtc(period.endDate))
        .range(from, from + INTERACAO_PAGE_SIZE - 1);

      if (agentId) {
        query = query.eq('assigned_agent_id', agentId);
      }

      const { data, error } = await query;
      if (error) {
        console.error(`[kpis] falha ao ler ${view}:`, error.message);
        return [];
      }

      const page = data || [];
      for (const row of page) {
        const n = Number(row.minutos_ate_primeiro_contato);
        if (Number.isFinite(n)) minutos.push(n);
      }

      if (page.length < INTERACAO_PAGE_SIZE) break;
      from += INTERACAO_PAGE_SIZE;
    }

    return minutos;
  };

  const [lia, corretor] = await Promise.all([
    lerView('primeira_interacao'),
    lerView('primeira_interacao_corretor'),
  ]);

  return { lia, corretor };
}

const COMMERCIAL_PAGE_SIZE = 1000;

/**
 * Soma VGV e VGC das vendas ASSINADAS no período.
 *
 * Fonte única: a view `vendas_assinadas`. Até 17/09 esta função lia
 * `commercial_sales`, que CONGELOU em 01/09 quando o sync horário da planilha
 * foi desligado — a aba KPIs mostrava um retrato de 01/09 enquanto o resto da
 * dash já lia a venda do funil no mesmo dia.
 *
 * A view resolve, de uma vez e para os dois lados (servidor e front), três
 * coisas que antes eram feitas em dois lugares diferentes: a origem
 * (`proposals` em proposta-assinada), a comissão (gravada, ou 3,5% lançamento /
 * 6% terceiros) e o fuso — `data_assinatura` já vem como DATE de São Paulo,
 * então a comparação com as datas ISO do período continua valendo e a venda da
 * virada do mês não escorrega para o mês seguinte.
 *
 * Retorna { vgv, vgc } (números). Em erro, loga e retorna zeros — VGV/VGC são
 * KPIs auxiliares e não devem derrubar o painel inteiro.
 */
/**
 * VGV, VGC e a QUANTIDADE de vendas assinadas do período.
 *
 * `qtd` passou a sair daqui em 18/09 porque os cards "Vendas" e "Valor em
 * Vendas" contavam `leads.final_sale_value`, coluna vazia em produção — a
 * Lotus tem 0 preenchidas em 1.685 leads e 36 propostas assinadas.
 *
 * Falha de leitura devolve `null` em tudo, não zeros: zero é um número
 * plausível e esconderia a falha atrás de um painel que parece certo.
 */
export async function fetchCommercialTotals(supabase, { tenantId, period }) {
  let vgv = 0;
  let vgc = 0;
  // As linhas cruas viajam junto porque os blocos "negócios por fonte" e
  // "faixas de preço" precisam de venda a venda, não só do total. Eles somavam
  // `leads.final_sale_value`, coluna vazia em produção, e apareciam zerados.
  const vendas = [];
  let page = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('vendas_assinadas')
      .select('vgv,vgc,fonte')
      .eq('tenant_id', tenantId)
      .gte('data_assinatura', period.startDate)
      .lte('data_assinatura', period.endDate)
      .range(page * COMMERCIAL_PAGE_SIZE, (page + 1) * COMMERCIAL_PAGE_SIZE - 1);

    if (error) {
      console.error('[kpis] falha ao somar VGV/VGC comerciais:', error.message);
      return { vgv: null, vgc: null, qtd: null, vendas: null };
    }

    const rows = data || [];
    for (const row of rows) {
      const valor = Number(row.vgv) || 0;
      vgv += valor;
      vgc += Number(row.vgc) || 0;
      vendas.push({ valor, fonte: row.fonte || 'Outros' });
    }

    if (rows.length < COMMERCIAL_PAGE_SIZE) break;
    page += 1;
  }

  return { vgv, vgc, qtd: vendas.length, vendas };
}

/** Conta imóveis ativos do tenant (agregação no banco; não traz linhas). Rascunho não conta. */
export async function countImoveisAtivos(supabase, { tenantId }) {
  const { count, error } = await supabase
    .from('imoveis_locais')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .neq('status_aprovacao', 'rascunho');
  if (error) {
    // Falha aqui não derruba o painel — mas também não vira zero. Zero é um
    // número plausível ("a imobiliária não tem imóvel") e esconderia o erro.
    // `null` sobe como "Sem dados", que é o que o plano pede.
    console.error('[kpis] falha ao contar imóveis ativos:', error.message);
    return null;
  }
  return count || 0;
}

/**
 * Conta imóveis captados no período por exclusividade (imoveis_locais.created_at).
 * Dois counts agregados (head: true) → zero linhas trafegadas, agregação no banco.
 * Em erro, retorna zeros (KPI auxiliar não derruba o painel).
 */
export async function countCaptacao(supabase, { tenantId, period }) {
  const base = () => supabase
    .from('imoveis_locais')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    // Rascunho não é captação. Depois de publicado conta pelo created_at, a data do rascunho.
    .neq('status_aprovacao', 'rascunho')
    .gte('created_at', dayStartUtc(period.startDate))
    .lte('created_at', dayEndUtc(period.endDate));

  const [exc, sem] = await Promise.all([
    base().eq('exclusivo', true),
    // IS NOT TRUE: "Indiferente" (NULL) conta como sem exclusividade.
    base().not('exclusivo', 'is', true),
  ]);

  if (exc.error || sem.error) {
    // `null`, não zero: ver a nota em countImoveisAtivos.
    console.error('[kpis] falha ao contar captação:', (exc.error || sem.error).message);
    return { exclusiva: null, semExclusividade: null };
  }
  return { exclusiva: exc.count || 0, semExclusividade: sem.count || 0 };
}

/**
 * Conta corretores ATIVOS do tenant.
 *
 * Nesta base, `tenant_memberships` NÃO tem coluna `status`: a tabela só guarda
 * (id, tenant_id, user_id, role, team_id, leader_user_id, permissions,
 * created_at). "Ativo" = possuir uma membership com role comercial — não há um
 * estado de ativação a filtrar. Agregação no banco; em erro, 0.
 */
export async function countCorretoresAtivos(supabase, { tenantId }) {
  const { count, error } = await supabase
    .from('tenant_memberships')
    .select('user_id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .in('role', ['corretor', 'admin', 'team_leader']);
  if (error) {
    // .message do Supabase vem vazio em erros de schema (ex.: coluna inexistente,
    // código 42703); logar code/details/hint expõe a causa raiz.
    console.error('[kpis] falha ao contar corretores:', error.message, error.code, error.details, error.hint);
    // `null`, não zero: ver a nota em countImoveisAtivos.
    return null;
  }
  return count || 0;
}

const clampPercent = (n) => Math.max(0, Math.min(100, n));

function formatGoalValue(value, unit) {
  const v = Number(value) || 0;
  if (unit === 'currency') {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }
  if (unit === 'percent') return `${Math.round(v)}%`;
  return v.toLocaleString('pt-BR');
}

/**
 * Lê metas ativas do tenant e devolve o progresso já formatado.
 *
 * Usa os valores persistidos (current_value/target_value) — a mesma base que a
 * sincronização automática (auto-sync) grava. Mantém simples de propósito: não
 * re-deriva o domínio de metas no servidor.
 */
export async function fetchGoals(supabase, { tenantId, limit = 6 }) {
  const { data, error } = await supabase
    .from('goals')
    .select('id,name,unit,status,target_value,current_value')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  if (error) {
    console.error('[kpis] falha ao ler metas:', error.message);
    return [];
  }

  return (data || [])
    .map((row) => {
      const current = Number(row.current_value) || 0;
      const target = Number(row.target_value) || 0;
      const percent = target > 0 ? clampPercent((current / target) * 100) : 0;
      return {
        id: row.id,
        name: row.name,
        realizadoDisplay: formatGoalValue(current, row.unit),
        metaDisplay: formatGoalValue(target, row.unit),
        percent: Math.round(percent),
      };
    })
    .sort((a, b) => b.percent - a.percent)
    .slice(0, limit);
}

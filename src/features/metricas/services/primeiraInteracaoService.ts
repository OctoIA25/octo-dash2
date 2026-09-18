/**
 * Tempo até a primeira interação com o lead — fonte única do lado do browser.
 *
 * Lê a view `primeira_interacao`, que entrega os minutos entre o lead entrar na
 * base e a LIA enviar a primeira mensagem no WhatsApp. Antes esse número saía
 * de `leads.first_response_at`, gravada quando o card deixa a primeira coluna
 * do kanban (`leadsService.ts:602`) — na Lotus isso dava 41 leads de 1.684,
 * média de 12,9 dias, com um valor negativo e outro de 203 dias.
 *
 * SÓ O LADO DA LIA VEM POR AQUI. O tempo até o CORRETOR falar mora na view
 * `primeira_interacao_corretor`, que nasce de `lead_toques` — tabela com RLS
 * sem policy, server-only por decisão já registrada em `toquesService.ts:4`.
 * Tentar lê-la daqui devolve 42501. Quem precisa desse número pede ao servidor
 * (`server/kpis/kpisData.js`), que usa `service_role`.
 *
 * MEDIANA, NÃO MÉDIA. Nos mesmos dados da Lotus a média dá 2.432 min e a
 * mediana dá 1,4 min: um punhado de leads recontatados semanas depois desloca
 * a média em horas e não toca a mediana.
 */
import { supabase } from '@/lib/supabaseClient';
import { normalizarNome } from './vendasAssinadasService';

/**
 * Mesma regra de `isAgentKeyUuid` em `relatoriosService.ts:23`, repetida aqui
 * de propósito: importar de lá fecharia um ciclo, já que aquele módulo importa
 * este. É um teste de formato, não uma regra de negócio.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PAGE_SIZE = 1000;

export interface AmostraInteracao {
  /** Minutos por lead contatado. A view já descarta negativo. */
  minutos: number[];
  /**
   * Quantos leads do período a LIA chegou a contatar. É o "base: N leads" que
   * acompanha o número na tela — sem ele, uma mediana de 4 leads parece a
   * equipe inteira.
   *
   * `null` quando a leitura FALHOU, que é diferente de zero contatados. Um
   * "0" nessa posição é um número plausível e foi exatamente assim que o bug
   * das colunas inexistentes passou meses despercebido nesta tela.
   */
  leadsContatados: number | null;
}

const FALHOU: AmostraInteracao = { minutos: [], leadsContatados: null };

function toDayStartIso(dateStr: string): string {
  return dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00.000Z`;
}

function toDayEndIso(dateStr: string): string {
  return dateStr.includes('T') ? dateStr : `${dateStr}T23:59:59.999Z`;
}

/**
 * Mediana dos minutos. Devolve `null` sem amostra — `null` é "não dá para
 * medir" e a tela mostra "Sem dados"; `0` seria "medimos e deu zero".
 *
 * Espelha `medianMinutes` de `server/kpis/kpisCompute.js`. São duas cópias
 * porque servidor e browser não compartilham módulo neste repo (é o mesmo
 * arranjo de `kpisCompute.js` × `supabaseKpisService.ts`); o que NÃO está
 * duplicado é a definição de qual evento conta, que mora na view.
 */
export function medianaMinutos(minutos: number[]): number | null {
  const v = (minutos || [])
    // Antes do Number(): `Number(null)` é 0, e um nulo virando zero afirmaria
    // que a LIA respondeu instantaneamente. String entra porque o PostgREST
    // devolve coluna `numeric` como texto.
    .filter((n) => typeof n === 'number' || (typeof n === 'string' && String(n).trim() !== ''))
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b);

  if (v.length === 0) return null;

  const meio = Math.floor(v.length / 2);
  return v.length % 2 === 0 ? (v[meio - 1] + v[meio]) / 2 : v[meio];
}

/**
 * Amostra do período. Os filtros são os MESMOS que as telas usam em `leads`
 * — tenant, data de criação, não arquivado e, quando há, o corretor — senão a
 * taxa de atendimento passa de 100% e o painel individual mostra o tempo do
 * tenant inteiro.
 *
 * O corretor vem por UUID ou por NOME, e os dois caminhos são diferentes: por
 * UUID o filtro vai ao banco; por nome ele é feito aqui, com comparação
 * normalizada, porque `assigned_agent_name` guarda a grafia da origem
 * ("FABIO GONCALVES") e a tela manda a do cadastro ("Fábio Gonçalves"). Mandar
 * um nome no `eq` do `assigned_agent_id` não casaria com nada e o painel de
 * todo corretor sem UUID diria "Sem dados" — é a mesma armadilha que
 * `relatoriosService.ts:28` documenta para `leads`.
 *
 * Falha de leitura devolve `leadsContatados: null` (a tela diz "Sem dados"),
 * nunca zero.
 */
export async function buscarPrimeiraInteracao(
  tenantId: string,
  inicio: string,
  fim: string,
  opcoes?: { corretorId?: string | null },
): Promise<AmostraInteracao> {
  const linhas = await lerLinhas(tenantId, inicio, fim, opcoes?.corretorId);
  if (linhas === null) return FALHOU;

  const minutos = linhas
    .map((l) => Number(l.minutos_ate_primeiro_contato))
    .filter((n) => Number.isFinite(n));

  return { minutos, leadsContatados: minutos.length };
}

interface LinhaInteracao {
  minutos_ate_primeiro_contato: number | string;
  assigned_agent_name: string | null;
}

/** Leitura paginada da view. `null` = falhou (diferente de "nenhuma linha"). */
async function lerLinhas(
  tenantId: string,
  inicio: string,
  fim: string,
  corretorId?: string | null,
): Promise<LinhaInteracao[] | null> {
  const chave = (corretorId || '').trim();
  const porUuid = chave !== '' && UUID_RE.test(chave);
  const porNome = chave !== '' && !porUuid ? normalizarNome(chave) : null;

  const linhas: LinhaInteracao[] = [];
  let from = 0;

  for (;;) {
    let query = supabase
      .from('primeira_interacao')
      .select('minutos_ate_primeiro_contato, assigned_agent_name')
      .eq('tenant_id', tenantId)
      .is('archived_at', null)
      .gte('lead_criado_em', toDayStartIso(inicio))
      .lte('lead_criado_em', toDayEndIso(fim))
      .range(from, from + PAGE_SIZE - 1);

    if (porUuid) {
      query = query.eq('assigned_agent_id', chave);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[primeiraInteracao] falha ao ler a view:', error.message);
      return null;
    }

    const pagina = (data || []) as LinhaInteracao[];
    for (const linha of pagina) {
      if (porNome && normalizarNome(linha.assigned_agent_name) !== porNome) continue;
      linhas.push(linha);
    }

    // A quebra olha a PÁGINA CRUA, não o que sobrou do filtro por nome: uma
    // página cheia sem nenhum lead do corretor pararia a leitura cedo.
    if (pagina.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return linhas;
}

export interface InteracaoDoCorretor {
  /** O nome como veio em `assigned_agent_name`, para casar com a lista da tela. */
  nome: string;
  /** Mediana de minutos. `null` = nenhum lead dele foi contatado no período. */
  mediana: number | null;
  /** Quantos leads entraram na conta — o "base: N" que acompanha a barra. */
  base: number;
}

/**
 * A mesma mediana, quebrada por corretor. Serve o gráfico de Relatórios, que
 * até 18/09 calculava `Data_visita - data_entrada` e chamava isso de "tempo de
 * primeira interação": media tempo até a VISITA, e `Data_visita` está vazia em
 * 100% dos leads da base, então a barra era zero fixo para todo corretor.
 *
 * Os nomes são casados normalizados porque `assigned_agent_name` guarda a
 * grafia da origem e a tela lista a do cadastro.
 */
export async function buscarPrimeiraInteracaoPorCorretor(
  tenantId: string,
  inicio: string,
  fim: string,
  nomes: string[],
): Promise<InteracaoDoCorretor[]> {
  const linhas = await lerLinhas(tenantId, inicio, fim);
  if (linhas === null) return nomes.map((nome) => ({ nome, mediana: null, base: 0 }));

  const porNome = new Map<string, number[]>();
  for (const linha of linhas) {
    const chave = normalizarNome(linha.assigned_agent_name);
    const n = Number(linha.minutos_ate_primeiro_contato);
    if (!Number.isFinite(n)) continue;
    const atual = porNome.get(chave);
    if (atual) atual.push(n);
    else porNome.set(chave, [n]);
  }

  return nomes.map((nome) => {
    const minutos = porNome.get(normalizarNome(nome)) ?? [];
    return { nome, mediana: medianaMinutos(minutos), base: minutos.length };
  });
}

/**
 * Minutos como a tela mostra. Espelha `formatMinutes` de
 * `server/kpis/kpisCompute.js` para os dois lados dizerem a mesma coisa.
 *
 * `null` vira "Sem dados" — e é por isso que este formatador existe em vez de
 * um `${x} min` em cada tela: com `?? 0` espalhado, ausência de medição virava
 * "0min", que numa tela com semáforo por faixa ainda pintava de verde.
 */
export function formatarMinutos(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min) || min < 0) return 'Sem dados';
  if (min < 1) return 'menos de 1min';
  if (min < 60) return `${Math.round(min)}min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Minutos por lead, indexados pelo id. Para quem já tem as linhas de `leads`
 * em mãos e só precisa pendurar o tempo em cada uma — é o caso das três
 * agregações de `teamMetricsService` (corretor, equipe e geral), que
 * compartilhavam uma única função de cálculo.
 *
 * Mapa vazio quando a leitura falha; quem consome trata lead ausente como
 * "não contatado", que é o mesmo caminho de "Sem dados".
 */
export async function buscarMinutosPorLead(
  tenantId: string,
  inicio?: string | null,
  fim?: string | null,
): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  let from = 0;

  for (;;) {
    let query = supabase
      .from('primeira_interacao')
      .select('lead_id, minutos_ate_primeiro_contato')
      .eq('tenant_id', tenantId)
      .is('archived_at', null)
      .range(from, from + PAGE_SIZE - 1);

    // Período é opcional aqui: as agregações da Central chamam sem data para
    // dizer "tudo o que existe", e mandar um `gte(undefined)` viraria filtro
    // inválido em vez de nenhum filtro.
    if (inicio) query = query.gte('lead_criado_em', toDayStartIso(inicio));
    if (fim) query = query.lte('lead_criado_em', toDayEndIso(fim));

    const { data, error } = await query;

    if (error) {
      console.error('[primeiraInteracao] falha ao indexar por lead:', error.message);
      return new Map();
    }

    const pagina = (data || []) as Array<{ lead_id: string; minutos_ate_primeiro_contato: number | string }>;
    for (const linha of pagina) {
      const n = Number(linha.minutos_ate_primeiro_contato);
      if (Number.isFinite(n)) mapa.set(linha.lead_id, n);
    }

    if (pagina.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return mapa;
}

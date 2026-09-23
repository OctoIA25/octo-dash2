/**
 * Vendas do corretor segundo a planilha de comissionamento.
 *
 * A tabela é preenchida de hora em hora pelo importador do servidor
 * (server/rankingPlanilha), que lê a aba do ranking. Aqui é só leitura.
 *
 * Este número NÃO é o da Dash. A Dash conta propostas assinadas dentro do CRM;
 * a planilha inclui vendas que nunca passaram por aqui (terceiros, parcerias).
 * Os dois convivem na tela, cada um com o seu rótulo — o dia em que um
 * sobrescrever o outro é o dia em que alguém decide com o número errado.
 *
 * Granularidade é MÊS: período que pega parte de um mês conta o mês inteiro.
 */
import { supabase } from '@/lib/supabaseClient';

export interface LinhaVendasPlanilha {
  ano: number;
  mes: number;
  vendas: number;
  atualizado_em: string;
  user_id: string | null;
  nome_planilha: string;
}

export interface VendasPlanilha {
  /** Vendas nos meses que o período toca. */
  noPeriodo: number;
  /** Vendas no ano do período — o contexto que o mês sozinho não dá. */
  noAno: number;
  /** Última vez que o importador leu a planilha. */
  atualizadoEm: string | null;
}

export interface PeriodoPlanilha {
  inicio: string; // yyyy-MM-dd
  fim: string;    // yyyy-MM-dd
}

export interface CorretorAlvo {
  /** Quando a planilha já foi reconhecida, é por aqui que se casa. */
  userId?: string | null;
  nome: string;
}

const normalizar = (texto: string | null | undefined) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Identificador manda; sem ele, o nome da planilha, sem acento e sem caixa. */
export function linhaEhDoCorretor(linha: LinhaVendasPlanilha, alvo: CorretorAlvo): boolean {
  if (alvo.userId) return linha.user_id === alvo.userId;
  const nome = normalizar(alvo.nome);
  return nome.length > 0 && normalizar(linha.nome_planilha) === nome;
}

const anoMesDe = (data: string) => {
  const [ano, mes] = data.split('-').map(Number);
  return ano * 12 + mes;
};

export function resumirVendasPlanilha(
  linhas: LinhaVendasPlanilha[],
  periodo: PeriodoPlanilha,
): VendasPlanilha | null {
  if (!linhas || linhas.length === 0) return null;

  const anoDoPeriodo = Number(periodo.fim.slice(0, 4));
  const inicio = anoMesDe(periodo.inicio);
  const fim = anoMesDe(periodo.fim);

  const doAno = linhas.filter((l) => l.ano === anoDoPeriodo);
  const doPeriodo = doAno.filter((l) => {
    const quando = l.ano * 12 + l.mes;
    return quando >= inicio && quando <= fim;
  });

  const somar = (lista: LinhaVendasPlanilha[]) => lista.reduce((total, l) => total + (l.vendas || 0), 0);
  const ultimaLeitura = doAno
    .map((l) => l.atualizado_em)
    .filter(Boolean)
    .sort()
    .pop() ?? null;

  return { noPeriodo: somar(doPeriodo), noAno: somar(doAno), atualizadoEm: ultimaLeitura };
}

/**
 * Busca e resume. Devolve `null` quando a planilha não tem nada desse corretor
 * — a tela esconde o campo em vez de mostrar zero, que seria uma afirmação.
 */
export async function buscarVendasPlanilha(
  tenantId: string,
  alvo: CorretorAlvo,
  periodo: PeriodoPlanilha,
): Promise<VendasPlanilha | null> {
  if (!tenantId || tenantId === 'owner') return null;

  const { data, error } = await supabase
    .from('corretor_vendas_planilha')
    .select('ano, mes, vendas, atualizado_em, user_id, nome_planilha')
    .eq('tenant_id', tenantId)
    .eq('ano', Number(periodo.fim.slice(0, 4)));

  if (error) {
    // Sem planilha a tela segue com o número da Dash: é campo a mais, não o
    // principal. Falhar aqui não pode derrubar as métricas individuais.
    console.error('Erro ao ler vendas da planilha:', error.message);
    return null;
  }

  const minhas = ((data || []) as LinhaVendasPlanilha[]).filter((l) => linhaEhDoCorretor(l, alvo));
  return resumirVendasPlanilha(minhas, periodo);
}

/**
 * Atividades do lead = linhas de `agenda_eventos` com `lead_id`.
 *
 * Aqui mora só o que é conta pura: o prazo de uma atividade, em que faixa ela
 * cai (atrasada / hoje / próximas) e em que aba do painel ela aparece. Sem
 * Supabase, sem React — dá pra testar sem subir nada.
 */

export type AtividadeStatus = 'pendente' | 'confirmado' | 'concluido' | 'cancelado';

/** Subconjunto de `agenda_eventos` que a tela precisa. */
export interface Atividade {
  id: string;
  titulo: string;
  descricao?: string | null;
  /** YYYY-MM-DD */
  data: string;
  /** HH:MM (ou HH:MM:SS). Nulo = atividade "do dia", vence 23:59. */
  horario?: string | null;
  tipo: string;
  status: AtividadeStatus | string;
  prioridade?: 'alta' | 'media' | 'baixa' | null;
  corretor_email: string;
  /** `leads.id` (uuid). `agenda_eventos.lead_id`, o id inteiro do bolsão, é outra coisa. */
  lead_uuid?: string | null;
  lead_nome?: string | null;
  lead_telefone?: string | null;
}

/** Quanto o painel olha pra trás. Atividade mais velha que isso não é cobrança. */
export const JANELA_DIAS = 30;

/**
 * Tipos cujo atraso bloqueia o corretor de receber leads do bolsão.
 * Mantido igual ao que já existia em `activityBlockingService`: qualquer tipo
 * pode atrasar, mas só estes dois tiram o corretor da roleta.
 */
export const TIPOS_BLOQUEANTES = ['retornar_cliente', 'visita_agendada'] as const;

/**
 * As categorias de atividade, em um lugar só. O painel usa pros chips de filtro
 * e o modal do lead usa pras opções pré-definidas — duas listas separadas
 * divergiriam na primeira vez que alguém acrescentasse um tipo.
 *
 * `tituloPadrao` é o que vai pro campo `titulo` quando o corretor só clica na
 * opção e não escreve nada: escolher "Retornar para o cliente" já é a descrição
 * da tarefa, obrigar a digitar de novo é atrito à toa.
 */
export const TIPOS_ATIVIDADE: {
  value: string;
  label: string;
  emoji: string;
  tituloPadrao: string;
}[] = [
  { value: 'retornar_cliente', label: 'Retornar para o cliente', emoji: '📞', tituloPadrao: 'Retornar para o cliente' },
  { value: 'visita_agendada', label: 'Visita agendada', emoji: '📅', tituloPadrao: 'Visita agendada' },
  { value: 'visita_realizada', label: 'Visita realizada', emoji: '✅', tituloPadrao: 'Visita realizada' },
  { value: 'visita_nao_realizada', label: 'Visita não realizada', emoji: '❌', tituloPadrao: 'Visita não realizada' },
  { value: 'reuniao', label: 'Reunião', emoji: '👥', tituloPadrao: 'Reunião' },
  { value: 'tarefa', label: 'Tarefa', emoji: '📋', tituloPadrao: 'Tarefa' },
  { value: 'outro', label: 'Outro', emoji: '🔧', tituloPadrao: 'Atividade' },
];

export const rotuloTipoAtividade = (tipo: string) =>
  TIPOS_ATIVIDADE.find((t) => t.value === tipo)?.label ?? tipo;

/**
 * Instante em que a atividade vence.
 * Sem horário, o prazo é o fim do dia — mesma regra do activityBlockingService,
 * senão toda tarefa sem hora nasceria atrasada à meia-noite.
 */
export function prazoAtividade(a: Pick<Atividade, 'data' | 'horario'>): Date {
  const [ano, mes, dia] = a.data.slice(0, 10).split('-').map(Number);
  const prazo = new Date(ano, (mes || 1) - 1, dia || 1);
  const horario = (a.horario || '').toString();
  if (/^\d{2}:\d{2}/.test(horario)) {
    const [hh, mm] = horario.split(':').map(Number);
    prazo.setHours(hh || 0, mm || 0, 0, 0);
  } else {
    prazo.setHours(23, 59, 59, 999);
  }
  return prazo;
}

export type Faixa = 'atrasada' | 'hoje' | 'proximas' | 'concluida' | 'cancelada' | 'futura';

/** Em que faixa do painel a atividade aparece. */
export function faixaDaAtividade(a: Atividade, agora: Date = new Date()): Faixa {
  if (a.status === 'concluido') return 'concluida';
  if (a.status === 'cancelado') return 'cancelada';

  const prazo = prazoAtividade(a);
  if (prazo.getTime() < agora.getTime()) return 'atrasada';

  const fimDeHoje = new Date(agora);
  fimDeHoje.setHours(23, 59, 59, 999);
  if (prazo.getTime() <= fimDeHoje.getTime()) return 'hoje';

  const fimDaSemana = new Date(fimDeHoje);
  fimDaSemana.setDate(fimDaSemana.getDate() + 7);
  return prazo.getTime() <= fimDaSemana.getTime() ? 'proximas' : 'futura';
}

const porPrazo = (a: Atividade, b: Atividade) =>
  prazoAtividade(a).getTime() - prazoAtividade(b).getTime();

/** Agrupa nas três faixas que o painel mostra, cada uma ordenada pelo prazo. */
export function agruparAtividades(atividades: Atividade[], agora: Date = new Date()) {
  const grupos: Record<'atrasadas' | 'hoje' | 'proximas', Atividade[]> = {
    atrasadas: [],
    hoje: [],
    proximas: [],
  };
  for (const a of atividades) {
    const faixa = faixaDaAtividade(a, agora);
    if (faixa === 'atrasada') grupos.atrasadas.push(a);
    else if (faixa === 'hoje') grupos.hoje.push(a);
    else if (faixa === 'proximas') grupos.proximas.push(a);
  }
  grupos.atrasadas.sort(porPrazo);
  grupos.hoje.sort(porPrazo);
  grupos.proximas.sort(porPrazo);
  return grupos;
}

/**
 * As abas do painel. Não são filtros de categoria — são ESTÁGIOS de tempo, e é
 * assim que o corretor pensa: "o que eu tenho que fazer agora", "quais visitas
 * eu marquei", "o que está agendado pra frente".
 *
 * O ciclo de vida de uma atividade percorre as abas sozinho, só pelo relógio:
 *   criada pra depois → `futuras`
 *   chegou o dia       → `afazer`, no grupo "Hoje"
 *   passou do dia      → `afazer`, no grupo "Pendentes"
 *   concluída          → sai de todas, fica só em `todos`
 *
 * `visitas` é transversal de propósito: uma visita agendada aparece TAMBÉM na
 * aba dela, seja ela de hoje, de amanhã ou atrasada. É a pergunta "o que eu
 * marquei de visita", que não se responde olhando prazo.
 */
export type AbaAtividades = 'afazer' | 'visitas' | 'futuras' | 'todos';

const TIPOS_VISITA: ReadonlySet<string> = new Set(['visita_agendada']);

export function atividadeNaAba(
  a: Atividade,
  aba: AbaAtividades,
  agora: Date = new Date()
): boolean {
  if (aba === 'todos') return true;

  const faixa = faixaDaAtividade(a, agora);
  const emAberto = faixa === 'atrasada' || faixa === 'hoje' || faixa === 'proximas' || faixa === 'futura';
  if (!emAberto) return false;

  if (aba === 'visitas') return TIPOS_VISITA.has(a.tipo);
  if (aba === 'afazer') return faixa === 'atrasada' || faixa === 'hoje';
  return faixa === 'proximas' || faixa === 'futura'; // 'futuras'
}

export function filtrarPorAba(
  atividades: Atividade[],
  aba: AbaAtividades,
  agora: Date = new Date()
): Atividade[] {
  return atividades.filter((a) => atividadeNaAba(a, aba, agora));
}

/** Números dos badges. Uma varredura só, porque as abas se sobrepõem. */
export function contarAbas(
  atividades: Atividade[],
  agora: Date = new Date()
): Record<AbaAtividades, number> {
  const contagem: Record<AbaAtividades, number> = { afazer: 0, visitas: 0, futuras: 0, todos: 0 };
  for (const a of atividades) {
    contagem.todos += 1;
    if (atividadeNaAba(a, 'afazer', agora)) contagem.afazer += 1;
    if (atividadeNaAba(a, 'visitas', agora)) contagem.visitas += 1;
    if (atividadeNaAba(a, 'futuras', agora)) contagem.futuras += 1;
  }
  return contagem;
}

/** Dentro de "A fazer": o que venceu vem primeiro, e é o que cobra o corretor. */
export function separarAFazer(atividades: Atividade[], agora: Date = new Date()) {
  const pendentes: Atividade[] = [];
  const hoje: Atividade[] = [];
  for (const a of filtrarPorAba(atividades, 'afazer', agora)) {
    (faixaDaAtividade(a, agora) === 'atrasada' ? pendentes : hoje).push(a);
  }
  pendentes.sort(porPrazo);
  hoje.sort(porPrazo);
  return { pendentes, hoje };
}

/** Ordena pelo prazo — o que vence antes aparece antes. */
export const ordenarPorPrazo = (atividades: Atividade[]): Atividade[] =>
  [...atividades].sort(porPrazo);

/**
 * Criar atividade move o lead no funil. Regra que morava embutida no modal do
 * Bolsão (`handleCriarAtividade`) — extraída porque agora dois lugares criam
 * atividade e a regra não pode viver só em um deles.
 *
 * Marcar visita é afirmar que a visita existe, então o estágio vai junto.
 * Retorno e reunião só empurram lead que ainda está no começo: quem já está em
 * proposta não volta pra "Visita Agendada" por causa de um telefonema.
 *
 * Devolve `null` quando não há o que mover.
 */
const ETAPAS_INICIAIS = ['novos-leads', 'novo', 'interacao', 'assumido'];

export function etapaAposAtividade(tipo: string, statusAtual: string | null | undefined): string | null {
  if (tipo === 'visita_agendada' || tipo === 'visita_realizada') return 'visita-agendada';

  if (tipo === 'retornar_cliente' || tipo === 'reuniao') {
    const atual = (statusAtual || '').toLowerCase().replace(/\s+/g, '-');
    return ETAPAS_INICIAIS.includes(atual) ? 'visita-agendada' : null;
  }

  return null;
}

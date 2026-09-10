/**
 * Histórico do lead — regras puras. Sem I/O, sem Express: dá para testar a
 * linha do tempo inteira sem banco.
 *
 * O PROBLEMA QUE ESTE ARQUIVO RESOLVE
 * Os eventos passam a ser gravados a partir do deploy. Todo lead que já existe
 * hoje — a base inteira — teria histórico vazio, e uma tela vazia para 100%
 * dos leads não serve para nada no dia 1.
 *
 * Mas o lead JÁ carrega parte da própria história em colunas: created_at diz
 * quando entrou, assigned_at + o nome do corretor dizem para quem foi,
 * bolsao.data_atendimento diz quando foi atendido, archived_at diz quando foi
 * arquivado. Isso é reconstruído aqui como evento DERIVADO.
 *
 * DERIVADO É INFERÊNCIA, NÃO REGISTRO — e a tela precisa dizer isso. Um
 * derivado só conhece o estado ATUAL: se o lead passou por três corretores, a
 * coluna guarda apenas o último, e o derivado mostra um só. Por isso cada um
 * vai marcado `derivado: true`, e some assim que existir evento real do mesmo
 * tipo (o real sabe de/para; o derivado só sabe "para").
 */

/**
 * Ordem de desempate quando dois eventos têm o mesmo instante. Acontece de
 * verdade: a roleta atribui o lead no MESMO INSERT que o cria (trigger
 * tr_leads_assign_roleta), então criação e atribuição nascem com o mesmo
 * timestamp e sem isto apareceriam em ordem aleatória.
 */
const ORDEM_NO_EMPATE = [
  'lead.created',
  'lead.assigned',
  'lead.attended',
  'lead.stage_changed',
  'lead.classified',
  'lead.archived',
  'lead.unarchived',
];

const rank = (tipo) => {
  const i = ORDEM_NO_EMPATE.indexOf(tipo);
  // Tipo desconhecido (evento da LIA) vai para o fim do empate: ele é
  // consequência do que a dash fez, não causa.
  return i === -1 ? ORDEM_NO_EMPATE.length : i;
};

const instante = (iso) => {
  const t = Date.parse(iso ?? '');
  return Number.isNaN(t) ? null : t;
};

/** Evento real vindo do banco, no formato que a tela consome. */
function daLinha(linha) {
  return {
    id: linha.id,
    tipo: linha.event_type,
    descricao: linha.descricao ?? null,
    de: linha.de ?? null,
    para: linha.para ?? null,
    ator: {
      tipo: linha.ator_tipo ?? 'sistema',
      nome: linha.ator_nome ?? null,
      user_id: linha.ator_user_id ?? null,
    },
    metadata: linha.metadata ?? {},
    quando: linha.created_at,
    derivado: false,
  };
}

/** Evento reconstruído a partir das colunas do lead. */
function derivado(tipo, quando, extras = {}) {
  return {
    // Prefixo fixo: não é id de linha nenhuma, e a tela usa como key.
    id: `derivado:${tipo}`,
    tipo,
    descricao: null,
    de: null,
    para: null,
    metadata: {},
    ator: { tipo: 'sistema', nome: null, user_id: null },
    ...extras,
    quando,
    derivado: true,
  };
}

/**
 * Monta os eventos que dá para inferir do estado atual do lead.
 * Só entra o que tem data — evento sem instante não tem lugar na linha do tempo.
 */
function eventosDerivados(lead, bolsao) {
  const fora = [];
  if (!lead) return fora;

  const criadoEm = lead.event_at ?? lead.created_at;
  if (criadoEm) {
    fora.push(derivado('lead.created', criadoEm, { para: lead.origem ?? null }));
  }

  // kenlo_leads não tem assigned_at; o espelho do bolsão é a única data.
  const atribuidoEm = lead.assigned_at ?? bolsao?.data_atribuicao ?? null;
  const corretor = lead.corretor_nome ?? bolsao?.corretor_responsavel ?? null;
  // Sem nome de corretor não há o que afirmar: `assigned_at` tem DEFAULT now()
  // em `leads` e existe mesmo em lead que nunca foi atribuído a ninguém.
  if (atribuidoEm && corretor) {
    fora.push(derivado('lead.assigned', atribuidoEm, { para: corretor }));
  }

  // Não tem contrapartida real: nenhum trigger emite "atendido". Vem sempre do
  // espelho do bolsão, que é onde o CRM registra a confirmação.
  if (bolsao?.data_atendimento) {
    fora.push(derivado('lead.attended', bolsao.data_atendimento, { para: corretor }));
  }

  if (lead.archived_at) {
    fora.push(derivado('lead.archived', lead.archived_at, { para: lead.archive_reason ?? null }));
  }

  return fora;
}

/**
 * Linha do tempo do lead: eventos reais + o que dá para inferir, em ordem
 * cronológica.
 *
 * @param {object} args
 * @param {object} args.lead      lead normalizado (buscarLead)
 * @param {object[]} args.eventos linhas de lead_events
 * @param {object|null} args.bolsao espelho do bolsão, se houver
 * @param {boolean} args.truncated a consulta bateu no teto de linhas
 */
export function montarHistorico({ lead, eventos = [], bolsao = null, truncated = false }) {
  const reais = eventos.map(daLinha);

  // Um derivado some quando já existe evento real do mesmo tipo: o real sabe
  // de/para e quem fez, o derivado só sabe o estado final. Mostrar os dois
  // duplicaria a mesma passagem na tela.
  const tiposReais = new Set(reais.map((e) => e.tipo));
  const inferidos = eventosDerivados(lead, bolsao).filter((e) => !tiposReais.has(e.tipo));

  const linha = [...reais, ...inferidos]
    .filter((e) => instante(e.quando) !== null)
    .sort((a, b) => (instante(a.quando) - instante(b.quando)) || (rank(a.tipo) - rank(b.tipo)));

  return {
    eventos: linha,
    resumo: {
      total: linha.length,
      reais: reais.length,
      derivados: inferidos.length,
      truncated,
    },
  };
}

/**
 * Cadência da LIA — regra pura (sem I/O, sem Supabase, sem Express).
 *
 * Recebe as linhas cruas de `lia_followups` de UM lead mais os horários das
 * mensagens que o lead mandou no WhatsApp, e devolve o resumo e a linha do
 * tempo que o card mostra. Isolado de propósito: é aqui que mora a decisão de
 * "o lead respondeu ou não", e ela precisa ser testável sem banco.
 *
 * DE ONDE VEM "FOI RESPONDIDO" (ordem de confiança, ver detectarResposta)
 *  1. `replied_at` declarado pela LIA — só existe em canal fora do WhatsApp.
 *  2. cancelamento com `cancelled_reason = 'lead_returned'`: a LIA cancelou a
 *     cadência PORQUE o lead voltou a falar. É 79% das linhas em produção e
 *     hoje é o sinal mais forte que existe.
 *  3. primeira mensagem inbound do WhatsApp dentro da janela do envio.
 *
 * DUAS TAXAS, NÃO UMA. Cadência cancelada por retorno do lead nunca chegou a
 * sair — colocá-la no numerador de "taxa de resposta" infla a métrica com
 * mensagens que ninguém mandou. Por isso o resumo separa:
 *   - taxa_resposta      = respondidas DEPOIS de enviadas ÷ enviadas
 *   - retornos_espontaneos = o lead voltou antes de a cadência sair
 *
 * CUSTO: uma ordenação na entrada (O(n log n)) e um casamento por DOIS
 * PONTEIROS (O(n+m)) entre envios e mensagens do lead. Nada de `find` dentro
 * de `map`, que seria O(n·m) e é o jeito fácil de escrever isso errado.
 */

/** Motivo de cancelamento que significa "o lead voltou a falar". */
const RETORNO_DO_LEAD = 'lead_returned';

/** Uma resposta conta para o envio se vier em até 72h — depois disso é outro assunto. */
const JANELA_RESPOSTA_MS = 72 * 60 * 60 * 1000;

const DIA_MS = 24 * 60 * 60 * 1000;

/** Resultado derivado quando a LIA não declarou `outcome`. */
const RESULTADO_POR_STATUS = {
  sent: 'sem_resposta',
  pending: 'aguardando',
  expired: 'expirado',
  cancelled: 'cancelado',
};

/** Desfechos que implicam que o lead falou. */
const RESULTADOS_COM_RESPOSTA = new Set(['respondido', 'visita_agendada']);

/** ISO → epoch ms, ou null. Data inválida vira null em vez de NaN contagioso. */
function ms(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/**
 * Instante que ancora a cadência na linha do tempo: quando saiu, senão quando
 * deveria sair, senão quando a linha nasceu. Nunca null para linha válida.
 */
function ancora(fw) {
  return ms(fw.sent_at) ?? ms(fw.scheduled_at) ?? ms(fw.created_at) ?? 0;
}

/** A cadência de fato saiu? `sent_at` é a prova; `status` é o que a LIA afirma. */
function foiEnviada(fw) {
  return fw.sent_at != null || fw.status === 'sent';
}

function ehRetornoDoLead(fw) {
  return fw.status === 'cancelled' && fw.cancelled_reason === RETORNO_DO_LEAD;
}

/**
 * Casa cada ENVIO com a primeira mensagem do lead que o sucede, em uma passada.
 *
 * As janelas são disjuntas e crescentes (cada uma termina no envio seguinte ou
 * 72h depois, o que vier antes), então um ponteiro só sobre as mensagens basta:
 * ele nunca precisa voltar.
 *
 * @param {number[]} enviosMs  instantes de envio, CRESCENTES
 * @param {number[]} inboundMs instantes das mensagens do lead, CRESCENTES
 * @returns {(number|null)[]} para cada envio, o instante da resposta ou null
 */
export function casarRespostas(enviosMs, inboundMs) {
  const casadas = new Array(enviosMs.length).fill(null);
  let j = 0;
  for (let i = 0; i < enviosMs.length; i += 1) {
    const inicio = enviosMs[i];
    const proximoEnvio = enviosMs[i + 1] ?? Infinity;
    const fim = Math.min(proximoEnvio, inicio + JANELA_RESPOSTA_MS);
    while (j < inboundMs.length && inboundMs[j] <= inicio) j += 1;
    if (j < inboundMs.length && inboundMs[j] < fim) casadas[i] = inboundMs[j];
  }
  return casadas;
}

/**
 * O lead respondeu ESTA cadência? Quatro guardas em sequência, do sinal mais
 * confiável para o mais inferido. `em` pode ser null mesmo com respondeu=true:
 * a LIA às vezes cancela por retorno sem registrar quando o retorno foi.
 */
function detectarResposta(fw, inboundCasada) {
  if (fw.replied_at) return { respondeu: true, em: ms(fw.replied_at) };
  if (ehRetornoDoLead(fw)) {
    return { respondeu: true, em: ms(fw.cancelled_at) ?? ms(fw.last_lead_msg_at) };
  }
  if (inboundCasada != null) return { respondeu: true, em: inboundCasada };
  return { respondeu: false, em: null };
}

/** `outcome` declarado pela LIA vence o derivado — ela sabe mais que a gente. */
function resultadoDe(fw, respondeu) {
  if (fw.outcome) return fw.outcome;
  if (respondeu) return 'respondido';
  return RESULTADO_POR_STATUS[fw.status] ?? 'desconhecido';
}

/** Mediana de uma lista NÃO ordenada; null se vazia. */
export function mediana(valores) {
  if (valores.length === 0) return null;
  const ord = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  return ord.length % 2 === 1 ? ord[meio] : Math.round((ord[meio - 1] + ord[meio]) / 2);
}

/** Soma acumulada em um Map de contadores — usado por tentativa e por tag. */
function acumular(mapa, chave, campo) {
  const atual = mapa.get(chave) ?? { enviadas: 0, respondidas: 0 };
  atual[campo] += 1;
  mapa.set(chave, atual);
}

/**
 * Próxima cadência agendada. Prefere a mais próxima AINDA no futuro; se todas
 * as pendentes já passaram da hora, devolve a mais recente marcada como
 * atrasada — sumir com ela esconderia justamente a cadência que travou.
 */
function proximaAgendada(followups, agora) {
  const pendentes = followups
    .filter((fw) => fw.status === 'pending' && fw.scheduled_at)
    .sort((a, b) => ms(a.scheduled_at) - ms(b.scheduled_at));
  if (pendentes.length === 0) return null;

  const futura = pendentes.find((fw) => ms(fw.scheduled_at) >= agora);
  const escolhida = futura ?? pendentes[pendentes.length - 1];
  return {
    scheduled_at: escolhida.scheduled_at,
    tag: escolhida.tag ?? null,
    attempt_number: escolhida.attempt_number ?? null,
    atrasada: futura == null,
  };
}

/**
 * Resumo + linha do tempo da cadência de um lead.
 *
 * @param {object}   params
 * @param {object[]} params.followups     linhas de lia_followups (ordem livre)
 * @param {string[]} params.inboundTimes  ISO das mensagens do lead, ordem livre
 * @param {object}   [params.leadExtra]   linha de lia_lead_extra, se houver
 * @param {boolean}  [params.truncated]   a consulta bateu no teto de linhas
 * @param {number}   [params.now]         relógio injetável para teste
 */
export function resumirCadencia({
  followups = [],
  inboundTimes = [],
  leadExtra = null,
  truncated = false,
  now = Date.now(),
} = {}) {
  const ordenadas = [...followups].sort((a, b) => ancora(a) - ancora(b));
  const inboundMs = inboundTimes.map(ms).filter((t) => t != null).sort((a, b) => a - b);

  // O casamento só olha as que saíram; as demais entram com resposta null.
  const indicesEnviadas = [];
  ordenadas.forEach((fw, i) => {
    if (foiEnviada(fw) && fw.sent_at) indicesEnviadas.push(i);
  });
  const casadas = casarRespostas(
    indicesEnviadas.map((i) => ms(ordenadas[i].sent_at)),
    inboundMs,
  );
  const respostaPorIndice = new Map(indicesEnviadas.map((idx, k) => [idx, casadas[k]]));

  const porTentativa = new Map();
  const porTag = new Map();
  const temposResposta = [];
  const contagem = { enviadas: 0, pendentes: 0, canceladas: 0, expiradas: 0 };
  let respondidasAposEnvio = 0;
  let retornosEspontaneos = 0;
  let ultimaInteracao = null;

  const timeline = ordenadas.map((fw, i) => {
    const { respondeu, em } = detectarResposta(fw, respostaPorIndice.get(i) ?? null);
    const resultado = resultadoDe(fw, respondeu);
    const enviada = foiEnviada(fw);
    const contouResposta = respondeu || RESULTADOS_COM_RESPOSTA.has(resultado);

    if (enviada) contagem.enviadas += 1;
    if (fw.status === 'pending') contagem.pendentes += 1;
    if (fw.status === 'cancelled') contagem.canceladas += 1;
    if (fw.status === 'expired') contagem.expiradas += 1;
    if (ehRetornoDoLead(fw)) retornosEspontaneos += 1;

    let tempoMin = null;
    if (enviada) {
      const tentativa = fw.attempt_number ?? 0;
      acumular(porTentativa, tentativa, 'enviadas');
      if (fw.tag) acumular(porTag, fw.tag, 'enviadas');
      if (contouResposta) {
        respondidasAposEnvio += 1;
        acumular(porTentativa, tentativa, 'respondidas');
        if (fw.tag) acumular(porTag, fw.tag, 'respondidas');
        const saiu = ms(fw.sent_at);
        if (saiu != null && em != null && em >= saiu) {
          tempoMin = Math.round((em - saiu) / 60000);
          temposResposta.push(tempoMin);
        }
      }
    }

    for (const t of [em, ms(fw.last_lead_msg_at)]) {
      if (t != null && (ultimaInteracao == null || t > ultimaInteracao)) ultimaInteracao = t;
    }

    return {
      id: fw.id,
      tag: fw.tag ?? null,
      attempt_number: fw.attempt_number ?? null,
      channel: fw.channel ?? null,
      status: fw.status ?? null,
      resultado,
      respondeu: contouResposta,
      scheduled_at: fw.scheduled_at ?? null,
      sent_at: fw.sent_at ?? null,
      respondido_em: em == null ? null : new Date(em).toISOString(),
      tempo_ate_resposta_min: tempoMin,
      motivo: fw.motivo ?? null,
      cancelled_reason: fw.cancelled_reason ?? null,
      template_name: fw.template_name ?? null,
    };
  });

  const ultimaInbound = inboundMs.length > 0 ? inboundMs[inboundMs.length - 1] : null;
  for (const t of [ultimaInbound, ms(leadExtra?.last_seen)]) {
    if (t != null && (ultimaInteracao == null || t > ultimaInteracao)) ultimaInteracao = t;
  }

  const resumo = {
    total: ordenadas.length,
    ...contagem,
    respondidas: respondidasAposEnvio,
    retornos_espontaneos: retornosEspontaneos,
    // null (e não 0) quando nada saiu: 0% diria que a LIA tentou e falhou.
    taxa_resposta:
      contagem.enviadas === 0
        ? null
        : Math.round((respondidasAposEnvio / contagem.enviadas) * 100),
    tempo_resposta_min: {
      mediana: mediana(temposResposta),
      amostra: temposResposta.length,
    },
    por_tentativa: [...porTentativa.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([attempt_number, v]) => ({ attempt_number, ...v })),
    por_tag: [...porTag.entries()]
      .sort((a, b) => b[1].enviadas - a[1].enviadas)
      .map(([tag, v]) => ({ tag, ...v })),
    proxima: proximaAgendada(ordenadas, now),
    ultima_interacao_lead: ultimaInteracao == null ? null : new Date(ultimaInteracao).toISOString(),
    dias_em_silencio:
      ultimaInteracao == null ? null : Math.max(0, Math.floor((now - ultimaInteracao) / DIA_MS)),
    interaction_count: leadExtra?.interaction_count ?? null,
    truncated,
  };

  // Card mostra o mais recente primeiro; o cálculo precisou da ordem cronológica.
  return { resumo, timeline: timeline.reverse() };
}

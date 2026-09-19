/**
 * De quem é este lead — a REGRA, como consulta.
 *
 * Decidido pelo chefe em 19/09/2026: a Lia continua distribuindo. O Octo NÃO
 * volta a distribuir sozinho; ele responde "de quem é este lead" e a Lia
 * atribui. Por isso tudo aqui é PURO: recebe o lead e o estado, devolve a
 * decisão, e não grava nada. O simulador (P1.2) e o painel ao vivo (P1.3)
 * usam exatamente esta função — uma regra só, não três.
 *
 * A REGRA DA LOTUS, como ficou depois das decisões de 19/09:
 *
 *   Imóvel de TERCEIROS ....... vai para o CAPTADOR do imóvel.
 *                               Sem captador cadastrado (7 dos 29 imóveis da
 *                               Lotus, medido em 19/09) -> roleta geral.
 *                               Captador sem atender em 1h -> ROLETA, direto
 *                               para outro corretor. Isto DIVERGE do plano,
 *                               que manda ir para o bolsão; vale a decisão do
 *                               chefe.
 *   LANÇAMENTO ................ a Lia atende primeiro; quando ela passa, vai
 *                               por roleta em ordem para 1 corretor.
 *   Não bate em nada .......... roleta geral (fila "pega-tudo").
 *
 * ROLETA NÃO É SORTEIO: é rodízio em ordem. Cada corretor recebe na sua vez e
 * todos têm a mesma chance. Quem está pausado ou no limite de leads é PULADO
 * e MANTÉM a vez — é a diferença entre "pulou hoje" e "perdeu o lugar na
 * fila", e foi por não respeitar isso que a roleta antiga irritou a equipe.
 */

/** Motivos de uma decisão, para o extrato e para a tela explicar. */
export const MOTIVOS = {
  CAPTADOR: 'captador_do_imovel',
  SEM_CAPTADOR: 'imovel_sem_captador',
  CAPTADOR_INDISPONIVEL: 'captador_indisponivel',
  LIA_PRIMEIRO: 'lancamento_atendido_pela_lia',
  ROLETA: 'roleta_em_ordem',
  SEM_CORRETOR: 'nenhum_corretor_disponivel',
};

const norm = (t) => String(t ?? '').trim().toLowerCase();

/**
 * Um corretor pode receber agora?
 * `pausado` e `noLimite` PULAM a vez sem perdê-la; `semPermissao` sai da fila.
 */
export function podeReceber(corretor) {
  if (!corretor || !corretor.id) return false;
  if (corretor.semPermissao) return false;
  if (corretor.pausado) return false;
  if (corretor.noLimite) return false;
  return true;
}

/**
 * O próximo da roleta, a partir de quem recebeu por último.
 *
 * `participantes` vem ORDENADO pela posição na fila. Devolve `null` quando
 * ninguém pode receber — e aí quem chama decide o que fazer, em vez de esta
 * função escolher alguém que não podia.
 */
export function proximoDaRoleta(participantes, ultimaPosicao = -1) {
  const fila = (participantes || []).filter((c) => c && c.id && !c.semPermissao);
  if (fila.length === 0) return null;

  const inicio = Number.isInteger(ultimaPosicao) ? ultimaPosicao : -1;
  for (let i = 1; i <= fila.length; i += 1) {
    const idx = (inicio + i) % fila.length;
    if (podeReceber(fila[idx])) return { corretor: fila[idx], posicao: idx };
  }
  return null;
}

/** O lead é de um imóvel de terceiros (do Catálogo) ou de um lançamento? */
export function tipoDoLead(lead) {
  const t = norm(lead?.tipoImovel || lead?.tipo_imovel);
  if (t === 'lancamento' || t === 'lançamento') return 'lancamento';
  if (t === 'terceiros' || t === 'terceiro' || t === 'catalogo' || t === 'catálogo') return 'terceiros';
  // Sem tipo declarado, o código do imóvel decide: se há imóvel, é terceiros.
  return lead?.codigoImovel || lead?.codigo_imovel ? 'terceiros' : 'indefinido';
}

/**
 * De quem é este lead, AGORA.
 *
 * Não grava nada e não olha o relógio do sistema: quem chama passa o estado.
 * `captador` é o corretor do imóvel (ou null). `participantes` é a roleta em
 * ordem. `ultimaPosicao` é quem recebeu por último.
 */
export function decidirDestino({ lead, captador = null, participantes = [], ultimaPosicao = -1 }) {
  const tipo = tipoDoLead(lead);

  if (tipo === 'lancamento') {
    // A Lia atende primeiro. Só quando ela passa é que entra a roleta.
    if (!lead?.liaPassou) {
      return { destino: 'lia', corretorId: null, motivo: MOTIVOS.LIA_PRIMEIRO, tipo };
    }
    const r = proximoDaRoleta(participantes, ultimaPosicao);
    return r
      ? { destino: 'corretor', corretorId: r.corretor.id, posicao: r.posicao, motivo: MOTIVOS.ROLETA, tipo }
      : { destino: 'ninguem', corretorId: null, motivo: MOTIVOS.SEM_CORRETOR, tipo };
  }

  if (tipo === 'terceiros') {
    if (captador && podeReceber(captador)) {
      return { destino: 'corretor', corretorId: captador.id, motivo: MOTIVOS.CAPTADOR, tipo };
    }
    // Decisão de 19/09: sem captador — ou com o captador indisponível — o lead
    // vai para a roleta geral, e não fica parado esperando alguém que não
    // pode atender.
    const r = proximoDaRoleta(participantes, ultimaPosicao);
    const motivo = captador ? MOTIVOS.CAPTADOR_INDISPONIVEL : MOTIVOS.SEM_CAPTADOR;
    return r
      ? { destino: 'corretor', corretorId: r.corretor.id, posicao: r.posicao, motivo, tipo }
      : { destino: 'ninguem', corretorId: null, motivo: MOTIVOS.SEM_CORRETOR, tipo };
  }

  const r = proximoDaRoleta(participantes, ultimaPosicao);
  return r
    ? { destino: 'corretor', corretorId: r.corretor.id, posicao: r.posicao, motivo: MOTIVOS.ROLETA, tipo }
    : { destino: 'ninguem', corretorId: null, motivo: MOTIVOS.SEM_CORRETOR, tipo };
}

/**
 * O lead foi atendido? "Atendido" é o que o plano define: o corretor mandou
 * mensagem ao lead OU criou uma atividade agendada para ele. Abrir a ficha
 * não conta, e arrastar o card no kanban também não — foi exatamente essa
 * confusão que fez o tempo de resposta medir o arrastar de um card.
 */
export function foiAtendido(lead) {
  return Boolean(lead?.mensagemEnviadaEm || lead?.atividadeAgendadaEm);
}

/**
 * Expirou o prazo do corretor? Quem chama passa o prazo já calculado pela
 * janela (ver janela.js) e o instante de referência.
 */
export function expirou({ prazo, agora }) {
  if (!(prazo instanceof Date) || Number.isNaN(prazo.getTime())) return false;
  if (!(agora instanceof Date) || Number.isNaN(agora.getTime())) return false;
  return agora > prazo;
}

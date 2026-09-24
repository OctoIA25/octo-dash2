/**
 * De quem é este lead — a REGRA, como consulta.
 *
 * Decidido pelo chefe em 19/09/2026: a Lia continua distribuindo. O Octo NÃO
 * volta a distribuir sozinho; ele responde "de quem é este lead" e a Lia
 * atribui. Por isso tudo aqui é PURO: recebe o lead e o estado, devolve a
 * decisão, e não grava nada. O simulador (P1.2) e o painel ao vivo (P1.3)
 * usam exatamente esta função — uma regra só, não três.
 *
 * A REGRA DA LOTUS, como ficou depois das decisões de 19/09 e **22/09**:
 *
 *   TODO LEAD .................. a Lia atende PRIMEIRO. Nada vai para corretor
 *                               antes de ela passar. Decidido em 22/09,
 *                               perguntado diretamente: "a LIA atende primeiro
 *                               também os leads de terceiros, ou eles vão
 *                               direto ao captador?" — "todos vão para a LIA
 *                               primeiro". ANTES, só lançamento esperava.
 *
 *   Depois que a Lia passa:
 *
 *   Imóvel de TERCEIROS ....... vai para o CAPTADOR do imóvel.
 *                               Sem captador cadastrado (7 dos 29 imóveis da
 *                               Lotus, medido em 19/09) -> roleta geral.
 *                               Captador sem atender em 1h -> ROLETA, direto
 *                               para outro corretor. Isto DIVERGE do plano,
 *                               que manda ir para o bolsão; vale a decisão do
 *                               chefe.
 *   LANÇAMENTO ................ roleta em ordem para 1 corretor.
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
  // Renomeado em 22/09: era `lancamento_atendido_pela_lia`, e passou a valer
  // para TODO lead. O nome antigo descrevia o único caso que existia e teria
  // virado mentira no extrato. A tabela não existe em produção — nenhum
  // histórico foi reescrito.
  LIA_PRIMEIRO: 'atendido_pela_lia_primeiro',
  ROLETA: 'roleta_em_ordem',
  SEM_CORRETOR: 'nenhum_corretor_disponivel',
  // Pedido do chefe em 24/09: recrutamento e "vendedores" não são cliente
  // comprador e não entram no rodízio. Têm dono fixo, configurado por casa.
  DONO_FIXO: 'tipo_tem_dono_fixo',
  SEM_DONO_FIXO: 'tipo_sem_dono_configurado',
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
 * Em que POOL este lead cai. Espelha `atendePool` do motor antigo.
 * Lançamento exige a marca; o resto aceita prontos OU alugados.
 */
export function atendePool(corretor, pool) {
  const a = Array.isArray(corretor?.atuacoes) ? corretor.atuacoes : null;
  // Sem atuação declarada, atende tudo — falha aberto, igual ao motor antigo.
  if (!a || a.length === 0) return true;
  return pool === 'lancamentos'
    ? a.includes('lancamentos')
    : a.includes('prontos') || a.includes('alugados');
}

/**
 * O próximo da roleta, a partir de quem recebeu por último.
 *
 * `ultimaPosicao` aceita o número cru ou `{ posicao, corretorId }`. Quando vem
 * o id, ele MANDA: a fila muda de tamanho quando alguém entra ou sai da
 * equipe, e um índice antigo passa a apontar para outra pessoa — o que faz o
 * vizinho perder a vez sem ninguém entender por quê. O índice fica como
 * reserva, para quando quem recebeu por último não está mais na fila.
 *
 * `pool` filtra por atuação. Ignorar isso foi o que fez a roleta antiga
 * mandar lead de lançamento para corretor de prontos — e foi por isso que a
 * distribuição automática do Octo foi desligada na Lotus em 14/09/2026.
 *
 * Devolve `null` quando ninguém pode receber: quem chama decide, em vez de
 * esta função escolher alguém que não podia.
 */
export function proximoDaRoleta(participantes, ultimaPosicao = -1, pool = null) {
  const fila = (participantes || [])
    .filter((c) => c && c.id && !c.semPermissao)
    .filter((c) => (pool ? atendePool(c, pool) : true));
  if (fila.length === 0) return null;

  const cru = typeof ultimaPosicao === 'object' && ultimaPosicao !== null ? ultimaPosicao : { posicao: ultimaPosicao };
  const porId = cru.corretorId ? fila.findIndex((c) => c.id === cru.corretorId) : -1;
  const inicio = porId >= 0
    ? porId
    : (Number.isInteger(cru.posicao) ? cru.posicao : -1);
  for (let i = 1; i <= fila.length; i += 1) {
    const idx = (inicio + i) % fila.length;
    if (podeReceber(fila[idx])) return { corretor: fila[idx], posicao: idx };
  }
  return null;
}

/** O lead é de um imóvel de terceiros (do Catálogo) ou de um lançamento? */
export function tipoDoLead(lead) {
  const t = norm(lead?.tipoImovel || lead?.tipo_imovel);
  // Os dois que não são cliente comprador (24/09). Ficam ANTES do resto
  // porque não dependem de haver código de imóvel: quem quer trabalhar aqui,
  // ou quer vender a própria casa, não chega com um imóvel do catálogo.
  if (t === 'recrutamento') return 'recrutamento';
  if (t === 'vendedores' || t === 'vendedor' || t === 'proprietario' || t === 'proprietário') return 'vendedores';
  if (t === 'lancamento' || t === 'lançamento') return 'lancamento';
  if (t === 'terceiros' || t === 'terceiro' || t === 'catalogo' || t === 'catálogo') return 'terceiros';
  // Sem tipo declarado, o código do imóvel decide: se há imóvel, é terceiros.
  return lead?.codigoImovel || lead?.codigo_imovel ? 'terceiros' : 'indefinido';
}

/** Os tipos que têm dono fixo e NÃO entram no rodízio. */
export const TIPOS_COM_DONO_FIXO = ['recrutamento', 'vendedores'];

/**
 * De quem é este lead, AGORA.
 *
 * Não grava nada e não olha o relógio do sistema: quem chama passa o estado.
 * `captador` é o corretor do imóvel (ou null). `participantes` é a roleta em
 * ordem. `ultimaPosicao` é quem recebeu por último.
 */
export function decidirDestino({
  lead, captador = null, participantes = [], ultimaPosicao = -1,
  /**
   * Quem recebe cada tipo de dono fixo, vindo de
   * `tenant_bolsao_config.destino_por_tipo`. Sem isto, os dois tipos novos
   * caem em "ninguém" — de propósito: voltar para a roleta por omissão é
   * exatamente o problema que o chefe pediu para resolver, e voltaria calado.
   */
  destinoPorTipo = null,
}) {
  const tipo = tipoDoLead(lead);
  // Lançamento tem pool próprio; o resto cai em prontos/alugados.
  const pool = tipo === 'lancamento' ? 'lancamentos' : 'prontos';

  // A LIA ATENDE PRIMEIRO — TODOS, decisão de 22/09.
  //
  // Esta guarda vale para qualquer tipo, e é por isso que ela está aqui em
  // cima e não dentro de cada ramo: repetida três vezes, um ramo novo nasceria
  // sem ela um dia, e o lead sairia para o corretor sem a LIA ter falado.
  // Antes de 22/09 só lançamento esperava, e o lead de terceiros ia direto ao
  // captador.
  if (!lead?.liaPassou) {
    return { destino: 'lia', corretorId: null, motivo: MOTIVOS.LIA_PRIMEIRO, tipo };
  }

  // OS DOIS TIPOS DE DONO FIXO, antes de qualquer roleta.
  //
  // Vêm depois da guarda da Lia de propósito: o chefe disse "sempre passa pela
  // mão dela". Recrutamento e vendedor também são atendidos por ela primeiro;
  // o que muda é para QUEM ela passa depois.
  if (TIPOS_COM_DONO_FIXO.includes(tipo)) {
    const donoId = destinoPorTipo?.[tipo] || null;
    if (!donoId) {
      return { destino: 'ninguem', corretorId: null, motivo: MOTIVOS.SEM_DONO_FIXO, tipo };
    }
    // O dono fixo NÃO passa por `podeReceber`: ele não está no rodízio, e
    // "pausado" ali quer dizer "pule a vez dele na roleta" — não "não me mande
    // o currículo de ninguém". Barrá-lo mandaria o lead para ninguém num dia
    // em que ele marcou pausa, e ninguém entenderia por quê.
    return { destino: 'corretor', corretorId: donoId, motivo: MOTIVOS.DONO_FIXO, tipo };
  }

  if (tipo === 'lancamento') {
    const r = proximoDaRoleta(participantes, ultimaPosicao, pool);
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
    const r = proximoDaRoleta(participantes, ultimaPosicao, pool);
    const motivo = captador ? MOTIVOS.CAPTADOR_INDISPONIVEL : MOTIVOS.SEM_CAPTADOR;
    return r
      ? { destino: 'corretor', corretorId: r.corretor.id, posicao: r.posicao, motivo, tipo }
      : { destino: 'ninguem', corretorId: null, motivo: MOTIVOS.SEM_CORRETOR, tipo };
  }

  const r = proximoDaRoleta(participantes, ultimaPosicao, pool);
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

const ATUACAO_TIPOS = ['lancamentos', 'prontos', 'alugados'];

/**
 * Em que o corretor atua. Mesma leitura do motor antigo (`atuacoesOf`) e do
 * front (`atuacoesDe`). FALHA ABERTO: ausente, vazio ou lixo = atende os três
 * — fechar aqui tiraria da fila os 111 membros sem o campo gravado.
 */
export function atuacoesDoMembro(permissions) {
  const v = permissions?.atuacao;
  if (v === 'lancamentos') return ['lancamentos'];
  if (v === 'prontos') return ['prontos', 'alugados'];
  if (Array.isArray(v)) {
    const validos = ATUACAO_TIPOS.filter((t) => v.includes(t));
    if (validos.length > 0) return validos;
  }
  return [...ATUACAO_TIPOS];
}

/**
 * A fila da roleta, a partir das linhas do banco. PURA, de propósito: o
 * servidor e o simulador montam a fila pela MESMA função, senão a tela
 * mostraria uma ordem que a Lia não recebe.
 *
 * `membros` vem ordenado por data de entrada — a única ordem disponível que
 * não muda sozinha (ordenar por nome faria a fila inteira andar quando
 * alguém é renomeado).
 *
 * `curados` são os ids de `roleta_participantes` ativos, a lista que o admin
 * controla na tela de configuração. Vazia = ninguém curou ainda, e aí valem
 * todos os membros — mesmo fallback do motor antigo.
 */
/**
 * Um membro do banco vira um participante da regra.
 *
 * Mora fora de `montarFila` porque o CAPTADOR também precisa da derivação e
 * NÃO passa pela fila: ele pode estar fora do rodízio e ainda assim receber o
 * lead do imóvel que captou (15 dos 22 imóveis com captador da Lotus estão
 * nesse caso, medido em 20/09/2026). Duas derivações seriam duas verdades.
 */
export function comoParticipante(membro, agora = Date.now()) {
  const p = membro?.permissions || {};
  const ate = p.bolsao_blocked_until ? Date.parse(p.bolsao_blocked_until) : NaN;
  return {
    id: membro.user_id,
    nome: membro.name || membro.email || null,
    // Bloqueio temporário do bolsão = pausado: pula a vez e a mantém.
    pausado: Number.isFinite(ate) ? ate > agora : Boolean(p.bolsao_pausado),
    semPermissao: p.nao_recebe_leads === true,
    noLimite: false, // o limite de leads está desligado nesta base
    atuacoes: atuacoesDoMembro(p),
  };
}

export function montarFila(membros, curados = [], agora = Date.now()) {
  const naRoleta = new Set((curados || []).filter(Boolean));
  return (membros || [])
    .filter((m) => m.role === 'corretor' || m.role === 'team_leader')
    .filter((m) => naRoleta.size === 0 || naRoleta.has(m.user_id))
    .map((m) => comoParticipante(m, agora));
}

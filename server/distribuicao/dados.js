import { comoParticipante, montarFila } from './regra.js';

/**
 * As leituras que a regra precisa — separadas dela de propósito.
 *
 * `regra.js` e `janela.js` são puros e testáveis sem banco. Este arquivo é o
 * único que fala com o Postgres, e devolve exatamente o formato que a regra
 * espera. Assim o simulador (P1.2) pode alimentar a regra com dados
 * inventados, e o painel (P1.3) com dados reais, sem duplicar nada.
 *
 * NÃO reusa `server/leadAssignment.js`: aquele é o motor antigo, que continua
 * servindo as imobiliárias onde a distribuição do Octo está ligada. Mexer nele
 * para servir a consulta misturaria dois caminhos que hoje são independentes.
 */

/** Ordem da roleta: estável e explicável. */
const ORDEM = 'created_at';

export function criarLeituras({ supabase }) {
  /** Configuração de horário e prazo da imobiliária. */
  const configuracao = async (tenantId) => {
    const { data, error } = await supabase
      .from('tenant_bolsao_config')
      .select('horario_funcionamento, tempo_expiracao_exclusivo, tempo_expiracao_nao_exclusivo, roleta_enabled, destino_por_tipo')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  };

  /**
   * Os corretores da roleta, em ordem estável.
   *
   * A ordem é a de entrada na imobiliária. Não é arbitrária: é a única
   * disponível hoje que não muda sozinha — ordenar por nome faria a fila
   * inteira andar quando alguém é renomeado.
   */
  const participantes = async (tenantId) => {
    // FONTE PRIMÁRIA é a roleta curada pelo admin (`roleta_participantes`),
    // a mesma que o motor antigo usa e que a tela de configuração controla.
    // Sem ela, o simulador mostraria uma fila que o gestor não reconhece.
    // Vazia = ninguém curou ainda; aí valem todos os membros, igual ao
    // fallback de leadAssignment.js.
    const [{ data: membros, error }, { data: curados }] = await Promise.all([
      supabase
        .from('tenant_memberships')
        .select('user_id, role, permissions, created_at')
        .eq('tenant_id', tenantId)
        .order(ORDEM, { ascending: true }),
      supabase
        .from('roleta_participantes')
        .select('broker_id')
        .eq('tenant_id', tenantId)
        .eq('is_active', true),
    ]);
    if (error) throw error;

    // A MONTAGEM da fila mora em regra.js, pura: o simulador do navegador usa
    // a mesma função, senão a tela mostraria uma ordem que a Lia não recebe.
    return montarFila(membros, (curados || []).map((c) => c.broker_id));
  };

  /**
   * O captador do imóvel, quando há imóvel e quando ele tem captador.
   *
   * Devolve o captador COM as flags (pausado, sem permissão). Sem elas
   * `podeReceber` dizia sempre que sim, e a decisão de 19/09 — captador
   * indisponível manda o lead para a roleta — nunca chegava a valer.
   *
   * A busca é na EQUIPE, não na roleta: o captador pode estar fora do rodízio
   * e ainda assim receber o lead que captou. Quem não é mais membro devolve
   * nulo, e o lead vai para a roleta em vez de ficar com quem saiu.
   */
  const captadorDoImovel = async (tenantId, codigoImovel) => {
    const codigo = String(codigoImovel ?? '').trim();
    // CURINGA NÃO É CÓDIGO. O PostgREST lê `*` como `%`, então escapar a
    // barra não basta — `\*` vira `\%` e o curinga sobrevive. Recusar a
    // entrada resolve a classe inteira: nenhum código de imóvel real tem
    // `%`, `_`, `*` ou barra invertida.
    if (!codigo || /[%_*\\]/.test(codigo)) return null;

    const { data, error } = await supabase
      .from('imoveis_locais')
      .select('captador_id')
      .eq('tenant_id', tenantId)
      .ilike('codigo_imovel', codigo)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data?.captador_id) return null;

    const { data: membro, error: erroMembro } = await supabase
      .from('tenant_memberships')
      .select('user_id, role, permissions')
      .eq('tenant_id', tenantId)
      .eq('user_id', data.captador_id)
      .maybeSingle();
    if (erroMembro) throw erroMembro;
    return membro ? comoParticipante(membro) : null;
  };

  /**
   * Quem recebeu por último, pelo EXTRATO.
   *
   * O ponteiro mora no extrato em vez de numa coluna de estado: assim a fila é
   * reconstituível e auditável — dá para responder "por que foi a vez dele"
   * olhando o histórico, em vez de acreditar num número.
   */
  const ultimaPosicao = async (tenantId) => {
    const { data, error } = await supabase
      .from('distribuicao_eventos')
      .select('corretor_id, detalhes')
      .eq('tenant_id', tenantId)
      .eq('evento', 'consultado')
      // SETA DUPLA, de propósito. `detalhes->posicao` devolve jsonb, e o
      // jsonb `null` NÃO é SQL NULL: o filtro deixava passar as linhas de
      // captador, de lançamento e de "ninguém", que gravam posicao nula. A
      // leitura caía em -1 e a roleta VOLTAVA PARA O PRIMEIRO da fila a cada
      // lead de captador — que é o caso mais comum da Lotus (22 dos 29
      // imóveis têm captador). Medido em 19/09/2026:
      //   ('{"posicao": null}'::jsonb ->  'posicao') IS NULL  ->  false
      //   ('{"posicao": null}'::jsonb ->> 'posicao') IS NULL  ->  true
      .not('detalhes->>posicao', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    // A seta dupla vale para o FILTRO; a projeção continua trazendo `detalhes`
    // como objeto, então `posicao` chega como número. O parse é cinto de
    // segurança para o dia em que alguém gravar "2" como texto — não é o que
    // faz o filtro funcionar.
    const pos = Number.parseInt(data?.detalhes?.posicao, 10);
    return {
      posicao: Number.isInteger(pos) ? pos : -1,
      // A âncora de verdade é QUEM recebeu, não o índice: a fila muda de
      // tamanho quando alguém entra ou sai da equipe, e aí o índice antigo
      // aponta para outra pessoa.
      corretorId: data?.corretor_id ?? null,
    };
  };

  /** Grava um acontecimento. Devolve se conseguiu — nunca lança. */
  const registrar = async (evento) => {
    const { error } = await supabase.from('distribuicao_eventos').insert(evento);
    if (error) {
      console.error('[distribuicao] não gravou o extrato:', error.code, error.message);
      return false;
    }
    return true;
  };

  return { configuracao, participantes, captadorDoImovel, ultimaPosicao, registrar };
}

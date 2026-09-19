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
      .select('horario_funcionamento, tempo_expiracao_exclusivo, tempo_expiracao_nao_exclusivo')
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
    const { data, error } = await supabase
      .from('tenant_memberships')
      .select('user_id, role, permissions, created_at')
      .eq('tenant_id', tenantId)
      .order(ORDEM, { ascending: true });
    if (error) throw error;

    return (data || [])
      // Só quem atende lead entra no rodízio.
      .filter((m) => m.role === 'corretor' || m.role === 'team_leader')
      .map((m) => {
        const p = m.permissions || {};
        const ate = p.bolsao_blocked_until ? Date.parse(p.bolsao_blocked_until) : NaN;
        return {
          id: m.user_id,
          // Bloqueio temporário do bolsão = pausado: pula a vez e a mantém.
          pausado: Number.isFinite(ate) ? ate > Date.now() : Boolean(p.bolsao_pausado),
          semPermissao: p.nao_recebe_leads === true,
          noLimite: false, // o limite de leads está desligado nesta base
        };
      });
  };

  /** O captador do imóvel, quando há imóvel e quando ele tem captador. */
  const captadorDoImovel = async (tenantId, codigoImovel) => {
    const codigo = String(codigoImovel ?? '').trim();
    if (!codigo) return null;

    const { data, error } = await supabase
      .from('imoveis_locais')
      .select('captador_id')
      .eq('tenant_id', tenantId)
      .ilike('codigo_imovel', codigo.replace(/[\\%_]/g, (c) => `\\${c}`))
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.captador_id ? { id: data.captador_id } : null;
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
      .select('detalhes')
      .eq('tenant_id', tenantId)
      .eq('evento', 'consultado')
      .not('detalhes->posicao', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const pos = data?.detalhes?.posicao;
    return Number.isInteger(pos) ? pos : -1;
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

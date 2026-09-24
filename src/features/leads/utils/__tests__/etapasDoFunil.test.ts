/**
 * O funil não pode esconder uma etapa onde há lead.
 *
 * Esconder não parece bug: o funil continua desenhando, só que sem aqueles
 * leads. Foi assim que o chefe encontrou a contradição de 24/09 — "Proposta
 * Criada 0 e Proposta Assinada 2, não dá para assinar uma proposta que nunca
 * foi criada". A causa não era a conta: era a coluna "Proposta Enviada", que
 * segura as propostas de verdade e não estava na lista.
 *
 * Medido em produção no mesmo dia: "Proposta Criada" tem ZERO lead em todas as
 * 4 imobiliárias, e zero que passaram por ela desde que o registro começou;
 * "Proposta Enviada" tem 2 na Lotus (3 passaram) e 326 na base de teste — 326
 * leads que o funil simplesmente não desenhava.
 */
import { describe, it, expect } from 'vitest';
import { ETAPAS_DO_FUNIL_INTERESSADO, getFunnelStageOrder } from '../../utils/funnelStages';

/**
 * As etapas que o quadro de Propostas sabe gravar em `leads.status` entre
 * "Negociação" e "Proposta Assinada" (PROPOSAL_STAGES de PropostaPage.tsx).
 * Escritas aqui à mão, e não importadas: PropostaPage tem 5 mil linhas e
 * arrastaria meia aplicação para dentro do teste.
 */
const ETAPAS_DE_PROPOSTA = [
  'Proposta Criada',
  'Proposta Enviada',
  'Proposta Assinada',
];

describe('etapas do funil de Cliente Interessado', () => {
  it('desenha todas as etapas de proposta — a que faltava escondia os leads', () => {
    for (const etapa of ETAPAS_DE_PROPOSTA) {
      expect(ETAPAS_DO_FUNIL_INTERESSADO).toContain(etapa);
    }
  });

  it('não perde nenhuma etapa que o funil compartilhado já conhece', () => {
    // 'Em Atendimento' fica de fora de propósito: nenhuma imobiliária usa esse
    // status (medido em 24/09), e o funil desta tela nasceu sem ele.
    const compartilhadas = getFunnelStageOrder('geral').filter((e) => e !== 'Em Atendimento');
    for (const etapa of compartilhadas) {
      expect(ETAPAS_DO_FUNIL_INTERESSADO).toContain(etapa);
    }
  });

  it('vai da entrada ao fechamento, nesta ordem', () => {
    expect(ETAPAS_DO_FUNIL_INTERESSADO[0]).toBe('Novos Leads');
    expect(ETAPAS_DO_FUNIL_INTERESSADO[ETAPAS_DO_FUNIL_INTERESSADO.length - 1]).toBe('Proposta Assinada');

    // "Enviada" depois de "Criada", e as duas antes de "Assinada": a ordem é o
    // que faz a taxa de conversão de cada etapa querer dizer alguma coisa.
    const pos = (e: string) => ETAPAS_DO_FUNIL_INTERESSADO.indexOf(e as never);
    expect(pos('Proposta Criada')).toBeLessThan(pos('Proposta Enviada'));
    expect(pos('Proposta Enviada')).toBeLessThan(pos('Proposta Assinada'));
  });
});

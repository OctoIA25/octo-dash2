/**
 * 28/09/2026 — "Proposta Criada" e "Proposta Enviada" viraram a etapa
 * "Proposta". Nada mais pode GRAVAR 'Proposta Criada': seria um lead numa
 * etapa que nenhuma tela mostra como coluna própria.
 */
import { describe, it, expect } from 'vitest';
import { leadStatusToPropostaStage, propostaStageToLeadStatus } from './stageBridge';

describe('ponte proposta ↔ lead depois da junção', () => {
  it('nenhuma etapa do quadro vira o status "Proposta Criada"', () => {
    for (const stage of ['proposta-criada', 'proposta-enviada', 'etapa-desconhecida']) {
      expect(propostaStageToLeadStatus(stage, 1)).toBe('Proposta Enviada');
    }
  });

  it('lead antigo em "Proposta Criada" é lido como a etapa "Proposta"', () => {
    expect(leadStatusToPropostaStage('Proposta Criada')).toBe('proposta-enviada');
    expect(leadStatusToPropostaStage('Proposta Enviada')).toBe('proposta-enviada');
  });

  it('o resto não muda', () => {
    expect(propostaStageToLeadStatus('negociacao', 1)).toBe('Negociação');
    expect(propostaStageToLeadStatus('proposta-assinada', 1)).toBe('Proposta Assinada');
    expect(leadStatusToPropostaStage('Negociação')).toBe('negociacao');
  });
});

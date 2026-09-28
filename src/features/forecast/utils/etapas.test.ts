import { describe, it, expect } from 'vitest';
import { etapaDoForecast, FORECAST_ETAPAS } from './etapas';

describe('FORECAST_ETAPAS', () => {
  it('são as cinco etapas ativas, na ordem do funil', () => {
    expect(FORECAST_ETAPAS.map((c) => c.id)).toEqual([
      'negociacao',
      'proposta-enviada',
      'propostas-respondidas',
      'feitura-contrato',
      'proposta-assinada',
    ]);
  });

  it('não inclui arquivado — ele nem chega do banco', () => {
    expect(FORECAST_ETAPAS.some((c) => c.id === 'arquivado')).toBe(false);
  });
});

describe('etapaDoForecast', () => {
  // 28/09 — Criada e Enviada viraram a etapa "Proposta".
  it('proposta antiga em "proposta-criada" cai em "Proposta", não no id cru', () => {
    expect(etapaDoForecast('proposta-criada').title).toBe('Proposta');
    expect(etapaDoForecast('proposta-enviada').title).toBe('Proposta');
  });

  it('traduz o stage_id no rótulo da etapa', () => {
    expect(etapaDoForecast('feitura-contrato').title).toBe('Feitura de Contrato');
  });

  it('etapa desconhecida vira o id cru em vez de célula vazia', () => {
    expect(etapaDoForecast('etapa-que-nao-existe').title).toBe('etapa-que-nao-existe');
  });

  it('stage_id vazio vira travessão', () => {
    expect(etapaDoForecast('').title).toBe('—');
  });
});

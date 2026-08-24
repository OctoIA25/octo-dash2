import { describe, it, expect } from 'vitest';
import { etapaDoForecast, FORECAST_ETAPAS } from './etapas';

describe('FORECAST_ETAPAS', () => {
  it('são as seis etapas ativas, na ordem do funil', () => {
    expect(FORECAST_ETAPAS.map((c) => c.id)).toEqual([
      'negociacao',
      'proposta-criada',
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

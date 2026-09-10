import { describe, it, expect } from 'vitest';
import { canaisDosLeads, leadCasaCanal, SEM_CANAL, TODOS_CANAIS } from './canalLead';
import type { KanbanLead } from '../services/leadsService';

const lead = (portal: unknown) => ({ portal }) as unknown as KanbanLead;

describe('canaisDosLeads', () => {
  it('lista os canais presentes, deduplicados por caixa/espaço e em ordem', () => {
    const { opcoes, temSemCanal } = canaisDosLeads([
      lead('VivaReal'), lead('ZAP Imóveis'), lead(' zap imóveis '), lead('VivaReal'),
    ]);
    expect(opcoes).toEqual([['vivareal', 'VivaReal'], ['zap imóveis', 'ZAP Imóveis']]);
    expect(temSemCanal).toBe(false);
  });

  it('sinaliza leads sem canal sem criar opção vazia', () => {
    const { opcoes, temSemCanal } = canaisDosLeads([lead(null), lead('  '), lead('Site')]);
    expect(opcoes).toEqual([['site', 'Site']]);
    expect(temSemCanal).toBe(true);
  });
});

describe('leadCasaCanal', () => {
  it('"todos" não filtra nada', () => {
    expect(leadCasaCanal(lead(null), TODOS_CANAIS)).toBe(true);
  });

  it('casa pela chave normalizada, não pelo rótulo cru', () => {
    expect(leadCasaCanal(lead('ZAP Imóveis'), 'zap imóveis')).toBe(true);
    expect(leadCasaCanal(lead('VivaReal'), 'zap imóveis')).toBe(false);
  });

  it('SEM_CANAL pega só quem está sem origem', () => {
    expect(leadCasaCanal(lead(''), SEM_CANAL)).toBe(true);
    expect(leadCasaCanal(lead(undefined), SEM_CANAL)).toBe(true);
    expect(leadCasaCanal(lead('Site'), SEM_CANAL)).toBe(false);
  });
});

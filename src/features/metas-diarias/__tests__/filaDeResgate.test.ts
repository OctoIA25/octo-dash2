import { describe, expect, it } from 'vitest';
import { filaDeResgate, type LeadDoCorretor } from '../filaDeResgate';
import { PESOS_PADRAO } from '@/features/leads/utils/score';

const config = { pesos: PESOS_PADRAO, porOrigem: { zap: 10 } };
const lead = (id: string, o: Partial<LeadDoCorretor> = {}): LeadDoCorretor =>
  ({ id, nome: `Lead ${id}`, etapa: 'Interação', temperatura: null, origem: null, ...o });

describe('A.4 · fila "Dá para resgatar hoje"', () => {
  it('traz os três motivos do Manual, ordenados pelo score', () => {
    const fila = filaDeResgate(
      [lead('frio', { temperatura: 'Frio', origem: 'ZAP' }), lead('sumiu'), lead('simulou'), lead('quieto')],
      {
        frio: { respondeu: true, pediu_visita: true, conversou_recente: true },
        sumiu: { respondeu: true, sem_resposta_ha_dias: 5 },
        simulou: { respondeu: true, pediu_simulacao: true, sem_resposta_ha_dias: 2 },
        quieto: { respondeu: true, conversou_recente: true },
      },
      config,
    );
    expect(fila.map((i) => i.id)).toEqual(['frio', 'simulou', 'sumiu']);
    expect(fila[0].motivo).toMatch(/marcado como frio, mas o score é \d+/);
    expect(fila[1].motivo).toBe('pediu simulação e não voltou há 2 dias');
    expect(fila[2].motivo).toBe('respondeu e sumiu há 5 dias');
    expect(fila[0].score).toBeGreaterThan(fila[1].score);
  });

  it('lead sem sinal nenhum não entra: o 50 dele seria inventado', () => {
    expect(filaDeResgate([lead('x', { temperatura: 'Frio' })], {}, config)).toEqual([]);
  });

  it('frio com score baixo não é resgate — é frio mesmo', () => {
    const fila = filaDeResgate([lead('f', { temperatura: 'Frio' })], { f: { so_pesquisando: true, sem_resposta_ha_dias: 8 } }, config);
    expect(fila).toEqual([]);
  });

  it('respeita o limite da lista', () => {
    const leads = Array.from({ length: 15 }, (_, i) => lead(String(i)));
    const sinais = Object.fromEntries(leads.map((l) => [l.id, { respondeu: true, sem_resposta_ha_dias: 4 }]));
    expect(filaDeResgate(leads, sinais, config)).toHaveLength(10);
  });
});

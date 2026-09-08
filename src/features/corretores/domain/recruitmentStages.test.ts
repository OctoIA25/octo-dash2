import { describe, it, expect } from 'vitest';
import { contarEtapas, nivelAlcancado, ESTAGIO_POR_LABEL, EVENTO_PARA_ESTAGIO } from './recruitmentStages';

describe('estágios do recrutamento', () => {
  it('conta cumulativo: quem está no Onboard não some das etapas anteriores', () => {
    // O caso do print: uma pessoa operando e ninguém parado no meio.
    expect(contarEtapas([{ estagio: 'onboard' }])).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('mostra a queda entre as etapas', () => {
    const candidatos = [
      { estagio: 'lead' }, { estagio: 'lead' },
      { estagio: 'interacao' },
      { estagio: 'reuniao_realizada' },
      { estagio: 'onboard' },
    ];
    //            lead int qual reun matr onb
    expect(contarEtapas(candidatos)).toEqual([5, 3, 2, 2, 1, 1]);
  });

  it('perdido conta só como entrada — o estágio não guarda onde parou', () => {
    expect(contarEtapas([{ estagio: 'perdido' }])).toEqual([1, 0, 0, 0, 0, 0]);
  });

  it('estágio desconhecido ou ausente não quebra a contagem', () => {
    expect(nivelAlcancado(undefined)).toBe(0);
    expect(contarEtapas([{ estagio: 'vai_saber' }, {}])).toEqual([2, 0, 0, 0, 0, 0]);
  });

  it('label e id são reversíveis', () => {
    expect(ESTAGIO_POR_LABEL['Reunião realizada']).toBe('reuniao_realizada');
    expect(ESTAGIO_POR_LABEL['Perdido']).toBe('perdido');
  });

  it('não existe evento que devolva alguém para Lead', () => {
    expect(EVENTO_PARA_ESTAGIO.lead).toBeNull();
    expect(EVENTO_PARA_ESTAGIO.onboard).toEqual({ tipo: 'marco_ativacao', payload: { marco: 'primeiro_plantao' } });
  });
});

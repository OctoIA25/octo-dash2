/**
 * Pré-requisitos por etapa.
 *
 * Dois casos aqui valem mais que os outros:
 *
 * 1. Chave DESLIGADA não pode reprovar nada. É o estado de todas elas no dia
 *    em que sobem, e uma chave que agisse desligada avisaria em todo arrastar
 *    sem ninguém ter pedido.
 *
 * 2. A forma de pagamento "Compra e venda" NÃO conta. Ela é o que o sistema
 *    crava sozinho ao espelhar um lead em proposta — todas as 56 propostas
 *    ligadas a lead da Lotus têm exatamente esse valor. Aceitá-la faria a
 *    chave passar sempre, e requisito que nunca reprova é pior que nenhum:
 *    dá garantia falsa.
 */
import { describe, it, expect } from 'vitest';
import {
  pendenciasDaEtapa,
  deveCarimbarAssinatura,
  textoDoAviso,
  CHAVES_PADRAO,
  type ChavesDeEtapa,
} from '../preRequisitos';

const ligado = (extra: Partial<ChavesDeEtapa> = {}): ChavesDeEtapa => ({
  exigir_visita_agendada: true,
  exigir_dados_da_proposta: true,
  exigir_proposta_assinada: true,
  relato_minimo_caracteres: 20,
  registrar_hora_da_assinatura: true,
  ...extra,
});

const ids = (p: ReturnType<typeof pendenciasDaEtapa>) => p.map((x) => x.id).sort();

describe('chave desligada não reprova nada', () => {
  it.each([
    ['visita-agendada', {}],
    ['proposta-criada', {}],
    ['proposta-assinada', {}],
  ])('%s com o lead vazio e as chaves no padrão', (etapa, ctx) => {
    expect(pendenciasDaEtapa(etapa, ctx, CHAVES_PADRAO)).toEqual([]);
  });

  it('e o padrão do sistema é tudo desligado', () => {
    expect(CHAVES_PADRAO.exigir_visita_agendada).toBe(false);
    expect(CHAVES_PADRAO.exigir_dados_da_proposta).toBe(false);
    expect(CHAVES_PADRAO.exigir_proposta_assinada).toBe(false);
    expect(CHAVES_PADRAO.registrar_hora_da_assinatura).toBe(false);
  });
});

describe('Visita Agendada: data e imóvel', () => {
  it('sem visita nenhuma, cobra data e imóvel', () => {
    expect(ids(pendenciasDaEtapa('visita-agendada', {}, ligado())))
      .toEqual(['visita_sem_data', 'visita_sem_imovel']);
  });

  it('com data mas sem imóvel, cobra só o imóvel', () => {
    const p = pendenciasDaEtapa('visita-agendada', { visita: { data: '2026-09-25' } }, ligado());
    expect(ids(p)).toEqual(['visita_sem_imovel']);
  });

  it('com os dois, não cobra nada', () => {
    const ctx = { visita: { data: '2026-09-25', imovelRef: 'AP0961' } };
    expect(pendenciasDaEtapa('visita-agendada', ctx, ligado())).toEqual([]);
  });

  it('só vale para a etapa de visita — não atrapalha as outras', () => {
    expect(pendenciasDaEtapa('interacao', {}, ligado({
      exigir_dados_da_proposta: false, exigir_proposta_assinada: false,
    }))).toEqual([]);
  });
});

describe('Proposta: valor, código e forma de pagamento', () => {
  const boa = {
    proposta: { value: 500000, property_reference: 'AP0961', payment_method: 'Financiamento' },
  };

  it('sem proposta vinculada, é uma pendência só e clara', () => {
    expect(ids(pendenciasDaEtapa('proposta-criada', {}, ligado()))).toEqual(['sem_proposta']);
  });

  it('proposta completa passa', () => {
    expect(pendenciasDaEtapa('proposta-criada', boa, ligado())).toEqual([]);
  });

  it('valor zero NÃO é valor', () => {
    // As 56 propostas ligadas a lead da Lotus têm todas value = 0,00.
    const p = pendenciasDaEtapa('proposta-criada', { proposta: { ...boa.proposta, value: 0 } }, ligado());
    expect(ids(p)).toEqual(['proposta_sem_valor']);
  });

  it('"Compra e venda" NÃO conta como forma de pagamento', () => {
    // É o que o sistema crava ao espelhar o lead em proposta — e é tipo de
    // negócio, não forma de pagamento. Aceitá-lo faria a chave passar sempre.
    const p = pendenciasDaEtapa('proposta-criada', {
      proposta: { ...boa.proposta, payment_method: 'Compra e venda' },
    }, ligado());
    expect(ids(p)).toEqual(['proposta_sem_forma_de_pagamento']);
    expect(p[0].texto).toMatch(/o sistema preencheu sozinho/);
  });

  it('e nem com caixa diferente ou espaços', () => {
    for (const v of ['  compra e venda  ', 'COMPRA E VENDA']) {
      const p = pendenciasDaEtapa('proposta-criada', {
        proposta: { ...boa.proposta, payment_method: v },
      }, ligado());
      expect(ids(p), `"${v}" passou`).toEqual(['proposta_sem_forma_de_pagamento']);
    }
  });

  it('vale nas três etapas de proposta', () => {
    for (const etapa of ['proposta-criada', 'proposta-enviada', 'proposta-assinada']) {
      const p = pendenciasDaEtapa(etapa, {}, ligado({ exigir_proposta_assinada: false }));
      expect(p.some((x) => x.id === 'sem_proposta'), etapa).toBe(true);
    }
  });
});

describe('Proposta Assinada: documento e relato', () => {
  const completa = {
    proposta: { value: 1, property_reference: 'X', payment_method: 'Financiamento' },
    documentos: 1,
    relato: 'Cliente assinou na sede, com testemunhas.',
  };

  it('completa passa', () => {
    expect(pendenciasDaEtapa('proposta-assinada', completa, ligado())).toEqual([]);
  });

  it('sem documento anexado, cobra', () => {
    const p = pendenciasDaEtapa('proposta-assinada', { ...completa, documentos: 0 }, ligado());
    expect(ids(p)).toEqual(['sem_documento_anexado']);
  });

  it('relato curto demais cobra, e diz o número exigido', () => {
    const p = pendenciasDaEtapa('proposta-assinada', { ...completa, relato: 'ok' }, ligado());
    expect(ids(p)).toEqual(['relato_curto']);
    expect(p[0].texto).toContain('20');
  });

  it('relato de espaços não conta como relato', () => {
    const p = pendenciasDaEtapa('proposta-assinada', { ...completa, relato: '                          ' }, ligado());
    expect(ids(p)).toEqual(['relato_curto']);
  });

  it('mínimo zero desliga só a exigência de relato', () => {
    const p = pendenciasDaEtapa('proposta-assinada',
      { ...completa, relato: '' }, ligado({ relato_minimo_caracteres: 0 }));
    expect(p).toEqual([]);
  });
});

describe('carimbo da hora da assinatura', () => {
  it('carimba ao chegar em Proposta Assinada sem hora gravada', () => {
    expect(deveCarimbarAssinatura('proposta-assinada', { proposta: { signed_at: null } }, ligado())).toBe(true);
  });

  it('NÃO regrava quando já existe hora — apagaria quando de fato assinou', () => {
    expect(deveCarimbarAssinatura('proposta-assinada',
      { proposta: { signed_at: '2026-09-01T10:00:00Z' } }, ligado())).toBe(false);
  });

  it('não carimba em outra etapa, nem com a chave desligada', () => {
    expect(deveCarimbarAssinatura('proposta-enviada', {}, ligado())).toBe(false);
    expect(deveCarimbarAssinatura('proposta-assinada', {}, CHAVES_PADRAO)).toBe(false);
  });
});

describe('o aviso que o corretor lê', () => {
  it('sem pendência, não há aviso', () => {
    expect(textoDoAviso([])).toBe('');
  });

  it('diz que a etapa MUDOU — porque ela muda mesmo', () => {
    const p = pendenciasDaEtapa('visita-agendada', { visita: { imovelRef: 'X' } }, ligado());
    expect(textoDoAviso(p)).toMatch(/^Etapa mudada/);
  });

  it('com várias, conta quantas em vez de despejar uma parede de texto', () => {
    const p = pendenciasDaEtapa('proposta-assinada', {}, ligado());
    expect(p.length).toBeGreaterThan(1);
    expect(textoDoAviso(p)).toMatch(new RegExp(`${p.length} pendências`));
  });

  it('toda pendência diz ONDE resolver', () => {
    const todas = [
      ...pendenciasDaEtapa('visita-agendada', {}, ligado()),
      ...pendenciasDaEtapa('proposta-assinada', {}, ligado()),
    ];
    expect(todas.length).toBeGreaterThan(3);
    for (const p of todas) {
      expect(p.onde.length, p.id).toBeGreaterThan(10);
    }
  });
});

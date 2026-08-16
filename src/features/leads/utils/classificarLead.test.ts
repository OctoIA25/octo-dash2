import { describe, expect, it } from 'vitest';
import {
  agruparPorSecao,
  atuacoesDe,
  filtrarPorAtuacao,
  ocultarImovelDoBolsao,
  opcoesFiltroBolsao,
  podeVerImovelBolsao,
  SECOES_BOLSAO,
  type LinhaClassificavel,
} from './classificarLead';

describe('filtrarPorAtuacao — lê a coluna, não recalcula nada', () => {
  const LINHAS: LinhaClassificavel[] = [
    { classification: 'lancamento' },
    { classification: 'pronto' },
    { classification: 'locacao' },
    { classification: 'indefinido' },
    { classification: null },        // não classificado ainda: fail-open
  ];

  it('corretor só de lançamentos vê lancamento + indefinido + null', () => {
    const r = filtrarPorAtuacao(LINHAS, { ativo: true, atuacoes: ['lancamentos'] });
    expect(r.map((l) => l.classification)).toEqual(['lancamento', 'indefinido', null]);
  });

  it('corretor de prontos não vê lancamento nem locacao', () => {
    const r = filtrarPorAtuacao(LINHAS, { ativo: true, atuacoes: ['prontos'] });
    expect(r.map((l) => l.classification)).toEqual(['pronto', 'indefinido', null]);
  });

  it('alugados agora vê LOCACAO de verdade — não mais o mesmo que prontos', () => {
    const alugados = filtrarPorAtuacao(LINHAS, { ativo: true, atuacoes: ['alugados'] });
    expect(alugados.map((l) => l.classification)).toEqual(['locacao', 'indefinido', null]);
    const prontos = filtrarPorAtuacao(LINHAS, { ativo: true, atuacoes: ['prontos'] });
    expect(alugados).not.toEqual(prontos);
  });

  it('prontos + alugados vê os dois lados', () => {
    const r = filtrarPorAtuacao(LINHAS, { ativo: true, atuacoes: ['prontos', 'alugados'] });
    expect(r).toHaveLength(4);
  });

  it('todas as atuações não filtra nada', () => {
    expect(filtrarPorAtuacao(LINHAS, {
      ativo: true, atuacoes: ['lancamentos', 'prontos', 'alugados'],
    })).toHaveLength(LINHAS.length);
  });

  it('inativo (admin/owner/team_leader) não filtra nada', () => {
    expect(filtrarPorAtuacao(LINHAS, { ativo: false, atuacoes: ['lancamentos'] }))
      .toHaveLength(LINHAS.length);
  });

  it('null e indefinido aparecem para todos — fail-open', () => {
    for (const atuacao of ['lancamentos', 'prontos', 'alugados'] as const) {
      const r = filtrarPorAtuacao(LINHAS, { ativo: true, atuacoes: [atuacao] });
      expect(r.some((l) => l.classification === null)).toBe(true);
      expect(r.some((l) => l.classification === 'indefinido')).toBe(true);
    }
  });

  it('valor desconhecido no banco não some da lista — fail-open', () => {
    const r = filtrarPorAtuacao([{ classification: 'valor_novo' }], {
      ativo: true, atuacoes: ['lancamentos'],
    });
    expect(r).toHaveLength(1);
  });

  it('não muta a lista recebida', () => {
    const original = [...LINHAS];
    filtrarPorAtuacao(LINHAS, { ativo: true, atuacoes: ['lancamentos'] });
    expect(LINHAS).toEqual(original);
  });
});

describe('atuacoesDe', () => {
  it('aceita o formato novo (array), na ordem canônica e sem lixo', () => {
    expect(atuacoesDe({ atuacao: ['alugados'] })).toEqual(['alugados']);
    expect(atuacoesDe({ atuacao: ['prontos', 'lancamentos'] })).toEqual(['lancamentos', 'prontos']);
    expect(atuacoesDe({ atuacao: ['lancamentos', 'zzz'] })).toEqual(['lancamentos']);
  });

  it('legado string: lancamentos restringe; prontos era "tudo menos lançamento"', () => {
    expect(atuacoesDe({ atuacao: 'lancamentos' })).toEqual(['lancamentos']);
    expect(atuacoesDe({ atuacao: 'prontos' })).toEqual(['prontos', 'alugados']);
  });

  it('ausente, vazio ou lixo devolve todos — fail-open', () => {
    expect(atuacoesDe(null)).toEqual(['lancamentos', 'prontos', 'alugados']);
    expect(atuacoesDe({})).toEqual(['lancamentos', 'prontos', 'alugados']);
    expect(atuacoesDe({ atuacao: [] })).toEqual(['lancamentos', 'prontos', 'alugados']);
  });
});

describe('opcoesFiltroBolsao', () => {
  it('só corretor com atuação restritiva é filtrado', () => {
    expect(opcoesFiltroBolsao({ isCorretor: true, permissions: { atuacao: ['lancamentos'] } }).ativo).toBe(true);
    expect(opcoesFiltroBolsao({ isCorretor: true, permissions: null }).ativo).toBe(false);
    expect(opcoesFiltroBolsao({ isCorretor: false, permissions: { atuacao: ['lancamentos'] } }).ativo).toBe(false);
  });
});

describe('agruparPorSecao', () => {
  it('separa nas três seções comerciais + a sobra', () => {
    const grupos = agruparPorSecao([
      { classification: 'lancamento' },
      { classification: 'pronto' },
      { classification: 'locacao' },
      { classification: 'indefinido' },
    ]);
    expect(grupos.lancamento).toHaveLength(1);
    expect(grupos.pronto).toHaveLength(1);
    expect(grupos.locacao).toHaveLength(1);
    expect(grupos.indefinido).toHaveLength(1);
  });

  it('null e valor desconhecido caem em indefinido — nada some', () => {
    const grupos = agruparPorSecao([{ classification: null }, { classification: 'valor_novo' }]);
    expect(grupos.indefinido).toHaveLength(2);
  });

  it('corretor de prontos fica sem grupo de lançamento — a seção não é renderizada', () => {
    const visiveis = filtrarPorAtuacao(
      [{ classification: 'lancamento' }, { classification: 'pronto' }],
      { ativo: true, atuacoes: ['prontos'] },
    );
    const grupos = agruparPorSecao(visiveis);
    expect(grupos.lancamento).toHaveLength(0);
    expect(grupos.pronto).toHaveLength(1);
  });

  it('SECOES_BOLSAO cobre todas as chaves do agrupamento', () => {
    const chaves = Object.keys(agruparPorSecao([])).sort();
    expect(SECOES_BOLSAO.map((s) => s.tipo).sort()).toEqual(chaves);
  });
});

describe('sigilo do imóvel no Bolsão', () => {
  it('gestão vê o imóvel; corretor não', () => {
    expect(podeVerImovelBolsao({ isAdmin: true, systemRole: 'admin' })).toBe(true);
    expect(podeVerImovelBolsao({ isAdmin: false, systemRole: 'team_leader' })).toBe(true);
    expect(podeVerImovelBolsao({ isAdmin: false, systemRole: 'corretor' })).toBe(false);
    expect(podeVerImovelBolsao({ isAdmin: false, systemRole: null })).toBe(false);
  });

  it('apaga o código quando não pode ver, sem mexer no resto da linha', () => {
    const linhas = [{ id: 1, codigo: 'RESIDENCIAL VISTA LUXO', classification: 'pronto' }];
    expect(ocultarImovelDoBolsao(linhas, false)).toEqual([
      { id: 1, codigo: null, classification: 'pronto' },
    ]);
    expect(ocultarImovelDoBolsao(linhas, true)).toEqual(linhas);
    expect(linhas[0].codigo).toBe('RESIDENCIAL VISTA LUXO'); // não muta a origem
  });
});

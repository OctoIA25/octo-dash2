import { describe, it, expect } from 'vitest';
import {
  avisoValorLancamento, formatDiaMes, mapLancamentoFromDB, CAMPOS_DO_LANCAMENTO_PARA_A_LIA,
  avisoValorDasTipologias, mapTipologiaParaLia, diasDesde, CAMPOS_DA_TIPOLOGIA_PARA_A_LIA,
} from './lancamentoValor.js';

describe('formatDiaMes', () => {
  it('formata em DD/MM no fuso de Brasília', () => {
    expect(formatDiaMes('2026-08-16T12:00:00Z')).toBe('16/08');
  });

  it('usa o dia de Brasília, não o UTC, na virada da meia-noite', () => {
    // 2026-08-17T02:00Z = 16/08 23:00 em Brasília.
    expect(formatDiaMes('2026-08-17T02:00:00Z')).toBe('16/08');
  });

  it('devolve null para data ausente ou inválida', () => {
    expect(formatDiaMes(null)).toBeNull();
    expect(formatDiaMes('')).toBeNull();
    expect(formatDiaMes('não é data')).toBeNull();
  });
});

describe('avisoValorLancamento', () => {
  it('ressalva a variação e informa a data', () => {
    expect(avisoValorLancamento('a partir de R$ 500 mil', '2026-08-16T12:00:00Z')).toBe(
      'Este é o valor mínimo do empreendimento e pode variar conforme o imóvel escolhido. Dados atualizados em 16/08.',
    );
  });

  it('mantém a ressalva quando não há data válida', () => {
    expect(avisoValorLancamento('Consultar valor', null)).toBe(
      'Este é o valor mínimo do empreendimento e pode variar conforme o imóvel escolhido.',
    );
  });

  it('devolve null quando não há valor cadastrado', () => {
    expect(avisoValorLancamento(null, '2026-08-16T12:00:00Z')).toBeNull();
    expect(avisoValorLancamento('   ', '2026-08-16T12:00:00Z')).toBeNull();
  });
});

// ============================================================
// O que a Lia recebe de um lançamento.
//
// Terceiro critério de pronto do item "construtora como cadastro": o payload
// que vai para a Lia NÃO contém a comissão. A rota de detalhe consulta a linha
// inteira (`select('*')`), então quem decide o que sai é o mapper — e até
// 18/09/2026 ele estava duplicado nos dois entrypoints, sem um único teste.
// Uma coluna nova no banco não pode escorregar para o agente por descuido.
// ============================================================
describe('mapLancamentoFromDB — a lista do que vai para a Lia é fechada', () => {
  /** Uma linha do banco com TUDO, inclusive o que não pode sair. */
  const linhaCompleta = {
    id: 'l1',
    nome: 'Residencial Teste',
    descricao: 'Dois dormitórios',
    endereco_plantao: 'Rua A, 100',
    preco_texto: 'R$ 350.000',
    site_url: 'https://exemplo.com.br',
    book_pdf: 'https://exemplo.com.br/book.pdf',
    book_pdf_filename: 'book.pdf',
    fotos: [{ url: 'u', legenda: 'sala', isCapa: true }],
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-10T10:00:00Z',
    // O que NUNCA pode sair:
    comissao_padrao_pct: 6,
    construtora_id: 'c1',
    construtora: 'Santa Ângela',
    tenant_id: 't1',
    // E um campo que ainda nem existe — o mapper não pode deixar passar nada
    // só por estar na linha.
    campo_que_alguem_vai_criar_amanha: 'segredo',
  };

  it('devolve exatamente os campos da lista, e nenhum a mais', () => {
    const saida = mapLancamentoFromDB(linhaCompleta);
    expect(Object.keys(saida).sort()).toEqual([...CAMPOS_DO_LANCAMENTO_PARA_A_LIA].sort());
  });

  it('NÃO devolve comissão, nem por outro nome', () => {
    const saida = JSON.stringify(mapLancamentoFromDB(linhaCompleta)).toLowerCase();
    for (const proibido of ['comissao', 'comissão', 'commission', 'pct']) {
      expect(saida.includes(proibido), `vazou "${proibido}"`).toBe(false);
    }
  });

  it('NÃO devolve o tenant nem o vínculo de construtora', () => {
    const saida = mapLancamentoFromDB(linhaCompleta);
    expect(saida).not.toHaveProperty('tenant_id');
    expect(saida).not.toHaveProperty('construtora_id');
    expect(saida).not.toHaveProperty('construtora');
  });

  it('coluna nova na linha do banco não entra sozinha no payload', () => {
    const saida = mapLancamentoFromDB(linhaCompleta);
    expect(saida).not.toHaveProperty('campo_que_alguem_vai_criar_amanha');
  });

  it('o valor sempre vem acompanhado do aviso', () => {
    const saida = mapLancamentoFromDB(linhaCompleta);
    expect(saida.valor_minimo).toBe('R$ 350.000');
    expect(saida.aviso_valor).toBeTruthy();
  });

  it('sem valor cadastrado, nem valor nem aviso são inventados', () => {
    const saida = mapLancamentoFromDB({ ...linhaCompleta, preco_texto: null });
    expect(saida.valor_minimo).toBeNull();
    expect(saida.aviso_valor).toBeNull();
  });

  it('a foto sai só com url, legenda e capa — não com o resto do objeto', () => {
    const saida = mapLancamentoFromDB({
      ...linhaCompleta,
      fotos: [{ url: 'u', legenda: 'l', isCapa: false, caminhoInterno: '/var/segredo' }],
    });
    expect(Object.keys(saida.fotos[0]).sort()).toEqual(['is_capa', 'legenda', 'url']);
  });

  it('fotos ausente ou malformada vira lista vazia, não quebra', () => {
    expect(mapLancamentoFromDB({ ...linhaCompleta, fotos: null }).fotos).toEqual([]);
    expect(mapLancamentoFromDB({ ...linhaCompleta, fotos: 'nao é lista' }).fotos).toEqual([]);
  });
});

/**
 * As tipologias no payload da Lia (P2.1).
 *
 * Antes disto ela NÃO recebia dormitório, metragem nem tipologia de lugar
 * nenhum: os campos não estavam no payload, e ela respondia a partir do texto
 * livre da descrição.
 */
const tip = (over = {}) => ({
  nome: '2 dorms c/ suíte', dormitorios: 2, suites: 1, banheiros: 2, vagas: 1,
  area_privativa_m2: 64, preco_a_partir: 389000, preco_atualizado_em: '2026-09-20',
  disponivel: true, planta_url: null, observacao: null, ...over,
});
const HOJE = new Date('2026-09-23T12:00:00Z').getTime();

describe('formatDiaMes — data pura não pode andar um dia para trás', () => {
  it('DATA PURA não passa pelo fuso', () => {
    // `new Date('2026-09-20')` é meia-noite UTC = 21h do dia 19 em Brasília.
    // Convertendo, o preço de 20/09 saía como "valores de 19/09" na boca da Lia.
    expect(formatDiaMes('2026-09-20')).toBe('20/09');
    expect(formatDiaMes('2026-01-01')).toBe('01/01');
    expect(formatDiaMes('2026-03-01')).toBe('01/03');
  });

  it('o instante COMPLETO continua convertido, que é o certo', () => {
    // 21/09 às 02:00 UTC ainda é dia 20 às 23h em Brasília.
    expect(formatDiaMes('2026-09-21T02:00:00Z')).toBe('20/09');
  });
});

describe('diasDesde', () => {
  it('conta dias corridos', () => {
    expect(diasDesde('2026-09-20', new Date('2026-09-23T12:00:00Z').getTime())).toBe(3);
    expect(diasDesde('2026-09-23', new Date('2026-09-23T12:00:00Z').getTime())).toBe(0);
  });

  it('data ausente ou inválida devolve null, não zero', () => {
    // Zero significaria "atualizado hoje" — o oposto de "não se sabe".
    expect(diasDesde(null)).toBeNull();
    expect(diasDesde('nada')).toBeNull();
  });
});

describe('avisoValorDasTipologias — a regra de preço do plano', () => {
  it('sem tipologia com preço, não há aviso', () => {
    expect(avisoValorDasTipologias([])).toBeNull();
    expect(avisoValorDasTipologias([tip({ preco_a_partir: null })])).toBeNull();
    expect(avisoValorDasTipologias([tip({ disponivel: false })])).toBeNull();
  });

  it('preço recente: cita a data e NÃO pede confirmação', () => {
    const a = avisoValorDasTipologias([tip()], HOJE);
    expect(a).toContain('Valores de 20/09');
    expect(a).not.toContain('confirmação');
  });

  it('PASSOU DE 30 DIAS: acrescenta a ressalva — é o que o plano manda', () => {
    const a = avisoValorDasTipologias([tip({ preco_atualizado_em: '2026-06-01' })], HOJE);
    expect(a).toContain('Sujeito a confirmação com o corretor');
  });

  it('exatamente 30 dias ainda não pede confirmação; 31 pede', () => {
    const trinta = avisoValorDasTipologias([tip({ preco_atualizado_em: '2026-08-24' })], HOJE);
    const trintaEUm = avisoValorDasTipologias([tip({ preco_atualizado_em: '2026-08-23' })], HOJE);
    expect(trinta).not.toContain('confirmação');
    expect(trintaEUm).toContain('confirmação');
  });

  it('usa a data MAIS ANTIGA entre as tipologias, não a mais nova', () => {
    // Uma reajustada ontem e outra há seis meses: o conjunto tem seis meses.
    // Pegar a mais nova faria a ressalva sumir quando ela é mais necessária.
    const a = avisoValorDasTipologias([
      tip({ preco_atualizado_em: '2026-09-22' }),
      tip({ nome: '3 dorms', preco_atualizado_em: '2026-03-10' }),
    ], HOJE);
    expect(a).toContain('Valores de 10/03');
    expect(a).toContain('Sujeito a confirmação com o corretor');
  });

  it('SEM data em alguma delas, ressalva sempre', () => {
    // "Não sabemos de quando é" é pior que "é de seis meses atrás".
    const a = avisoValorDasTipologias([tip({ preco_atualizado_em: null })], HOJE);
    expect(a).toContain('Sujeito a confirmação com o corretor');
    expect(a).not.toContain('Valores de');
  });

  it('a indisponível não entra na conta da data', () => {
    const a = avisoValorDasTipologias([
      tip({ preco_atualizado_em: '2026-09-22' }),
      tip({ nome: 'esgotada', preco_atualizado_em: '2020-01-01', disponivel: false }),
    ], HOJE);
    expect(a).toContain('Valores de 22/09');
    expect(a).not.toContain('confirmação');
  });
});

describe('a tipologia que vai para a Lia é lista fechada', () => {
  it('devolve exatamente os campos da lista', () => {
    expect(Object.keys(mapTipologiaParaLia(tip())).sort())
      .toEqual([...CAMPOS_DA_TIPOLOGIA_PARA_A_LIA].sort());
  });

  it('NÃO devolve unidades disponíveis, nem id, nem tenant', () => {
    // Estoque envelhece em horas: a Lia dizendo "restam 2 unidades" cria uma
    // promessa que a corretora não controla.
    const t = mapTipologiaParaLia({ ...tip(), unidades_disponiveis: 2, id: 'x', tenant_id: 'y' });
    expect(t).not.toHaveProperty('unidades_disponiveis');
    expect(t).not.toHaveProperty('id');
    expect(t).not.toHaveProperty('tenant_id');
  });
});

describe('mapLancamentoFromDB com tipologias', () => {
  const row = { id: '1', nome: 'X', preco_texto: 'a partir de R$ 389.000',
                updated_at: '2026-09-01T10:00:00Z', fotos: [] };

  it('NULO e VAZIO são coisas diferentes', () => {
    // `null` = ninguém buscou; `[]` = buscou e não há. Com `null` a Lia não
    // pode afirmar que o empreendimento não tem tipologia.
    expect(mapLancamentoFromDB(row).tipologias).toBeNull();
    expect(mapLancamentoFromDB(row, []).tipologias).toEqual([]);
    expect(mapLancamentoFromDB(row, []).aviso_valor_tipologias).toBeNull();
  });

  it('a lista fechada do lançamento inclui os dois campos novos', () => {
    expect(Object.keys(mapLancamentoFromDB(row, [tip()])).sort())
      .toEqual([...CAMPOS_DO_LANCAMENTO_PARA_A_LIA].sort());
  });

  it('com tipologia, a Lia ganha dormitório e metragem — que antes não existiam', () => {
    const d = mapLancamentoFromDB(row, [tip()]);
    expect(d.tipologias[0].dormitorios).toBe(2);
    expect(d.tipologias[0].area_privativa_m2).toBe(64);
    expect(d.aviso_valor_tipologias).toContain('Valores de');
  });

  it('a comissão continua fora, com tipologia ou sem', () => {
    // Valor distintivo de propósito: asserir que "5" não aparece quebraria
    // com qualquer preço ou metragem que contenha 5.
    const d = mapLancamentoFromDB(
      { ...row, comissao_padrao_pct: 7.77 },
      [{ ...tip(), comissao: 7.77, comissao_padrao_pct: 7.77 }],
    );
    expect(JSON.stringify(d)).not.toContain('comissao');
    expect(JSON.stringify(d)).not.toContain('7.77');
  });
});

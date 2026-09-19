import { describe, it, expect } from 'vitest';
import { avisoValorLancamento, formatDiaMes, mapLancamentoFromDB, CAMPOS_DO_LANCAMENTO_PARA_A_LIA } from './lancamentoValor.js';

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

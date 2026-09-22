import { describe, expect, it } from 'vitest';
import {
  avisoDeDescartadas, codificacaoDoOfx, dataDoOfx, lerOfx, resumoDoExtrato, valorDoOfx,
} from './ofx';

const extrato = (transacoes: string) => `OFXHEADER:100
DATA:OFXSGML
VERSION:102
CHARSET:1252

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>341<ACCTID>12345-6</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260901<DTEND>20260930
${transacoes}
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const mov = (o: Record<string, string>) =>
  `<STMTTRN>${Object.entries(o).map(([k, v]) => `<${k}>${v}`).join('\n')}</STMTTRN>`;

describe('a data do OFX', () => {
  it('lê a forma curta', () => {
    expect(dataDoOfx('20260921')).toBe('2026-09-21');
  });

  // Armadilha real: a data vem com o fuso colado, e o dia escorrega.
  it('ignora hora e fuso colados — senão o movimento cai no dia anterior', () => {
    expect(dataDoOfx('20260921120000[-3:BRT]')).toBe('2026-09-21');
    expect(dataDoOfx('20260921000000[-3:BRT]')).toBe('2026-09-21');
  });

  it('recusa o que não é data', () => {
    expect(dataDoOfx('')).toBeNull();
    expect(dataDoOfx('2026')).toBeNull();
    expect(dataDoOfx('20261301')).toBeNull();
    expect(dataDoOfx('20260932')).toBeNull();
  });
});

describe('o valor do OFX', () => {
  it('lê o formato do padrão, com ponto decimal', () => {
    expect(valorDoOfx('-1234.56')).toBe(-1234.56);
    expect(valorDoOfx('1234.56')).toBe(1234.56);
  });

  // Armadilha real: exportador brasileiro escreve no formato local, e
  // "1.234,56" lido como número dá 1,234 — mil vezes menos.
  it('lê o formato brasileiro sem perder mil vezes o valor', () => {
    expect(valorDoOfx('1.234,56')).toBe(1234.56);
    expect(valorDoOfx('-1.234,56')).toBe(-1234.56);
    expect(valorDoOfx('1234,56')).toBe(1234.56);
  });

  it('recusa o ilegível', () => {
    expect(valorDoOfx('')).toBeNull();
    expect(valorDoOfx('abc')).toBeNull();
  });
});

describe('a codificação', () => {
  it('reconhece o Latin-1 declarado, que é o comum no Brasil', () => {
    expect(codificacaoDoOfx('OFXHEADER:100\nCHARSET:1252')).toBe('windows-1252');
    expect(codificacaoDoOfx('CHARSET:ISO-8859-1')).toBe('windows-1252');
    expect(codificacaoDoOfx('ENCODING:USASCII')).toBe('windows-1252');
  });

  it('respeita UTF-8 quando o arquivo o declara', () => {
    expect(codificacaoDoOfx('ENCODING:UTF-8')).toBe('utf-8');
  });

  it('sem declaração, assume Latin-1 — é o mais provável num extrato daqui', () => {
    expect(codificacaoDoOfx('OFXHEADER:100')).toBe('windows-1252');
  });
});

describe('a leitura do extrato', () => {
  it('lê etiqueta que não fecha, que é como o OFX é de verdade', () => {
    const e = lerOfx(extrato(mov({
      TRNTYPE: 'CREDIT', DTPOSTED: '20260910120000[-3:BRT]',
      TRNAMT: '30000.00', FITID: 'A1', MEMO: 'TED RECEBIDA SANTA ANGELA',
    })));
    expect(e.transacoes).toHaveLength(1);
    expect(e.transacoes[0]).toMatchObject({
      fitid: 'A1', data: '2026-09-10', valor: 30000, tipo: 'credito',
      descricao: 'TED RECEBIDA SANTA ANGELA',
    });
  });

  // O TRNTYPE não é confiável: há banco que escreve "OTHER" em tudo.
  it('tira o sentido do SINAL, e não do tipo declarado', () => {
    const e = lerOfx(extrato([
      mov({ TRNTYPE: 'OTHER', DTPOSTED: '20260910', TRNAMT: '-500.00', FITID: 'S1', MEMO: 'saída' }),
      mov({ TRNTYPE: 'OTHER', DTPOSTED: '20260911', TRNAMT: '500.00', FITID: 'E1', MEMO: 'entrada' }),
    ].join('\n')));
    expect(e.transacoes.find((t) => t.fitid === 'S1')!.tipo).toBe('debito');
    expect(e.transacoes.find((t) => t.fitid === 'E1')!.tipo).toBe('credito');
    // O valor sai sempre positivo; o sentido mora no tipo.
    expect(e.transacoes.every((t) => t.valor > 0)).toBe(true);
  });

  it('usa NAME quando não há MEMO', () => {
    const e = lerOfx(extrato(mov({
      DTPOSTED: '20260910', TRNAMT: '10', FITID: 'N1', NAME: 'PIX RECEBIDO',
    })));
    expect(e.transacoes[0].descricao).toBe('PIX RECEBIDO');
  });

  it('lê o período e a conta do cabeçalho', () => {
    const e = lerOfx(extrato(mov({ DTPOSTED: '20260910', TRNAMT: '10', FITID: 'X' })));
    expect(e.periodo).toEqual({ de: '2026-09-01', ate: '2026-09-30' });
    expect(e.conta).toEqual({ banco: '341', numero: '12345-6' });
  });

  it('sem período declarado, usa a primeira e a última data', () => {
    const e = lerOfx(`<OFX>${[
      mov({ DTPOSTED: '20260915', TRNAMT: '10', FITID: 'B' }),
      mov({ DTPOSTED: '20260903', TRNAMT: '10', FITID: 'A' }),
    ].join('')}</OFX>`);
    expect(e.periodo).toEqual({ de: '2026-09-03', ate: '2026-09-15' });
  });

  // O que não dá para ler NÃO some em silêncio: um extrato incompleto fecharia
  // com o banco por acaso, e a diferença só apareceria no fim do mês.
  it('separa o que não deu para ler, com o motivo', () => {
    const e = lerOfx(extrato([
      mov({ DTPOSTED: '20260910', TRNAMT: '100', FITID: 'OK' }),
      mov({ DTPOSTED: '20260910', TRNAMT: '100' }),                    // sem FITID
      mov({ DTPOSTED: 'xxx', TRNAMT: '100', FITID: 'D1' }),            // data ruim
      mov({ DTPOSTED: '20260910', TRNAMT: 'abc', FITID: 'V1' }),       // valor ruim
      mov({ DTPOSTED: '20260910', TRNAMT: '0.00', FITID: 'Z1' }),      // zero
    ].join('\n')));

    expect(e.transacoes).toHaveLength(1);
    expect(e.descartadas).toHaveLength(4);
    expect(e.descartadas.map((d) => d.motivo)).toEqual([
      'sem identificador do banco (FITID)', 'data ilegível', 'valor ilegível', 'valor zero',
    ]);
  });

  it('não quebra com arquivo vazio ou que não é OFX', () => {
    expect(lerOfx('').transacoes).toEqual([]);
    expect(lerOfx('isto não é um extrato').transacoes).toEqual([]);
    expect(lerOfx(null as never).transacoes).toEqual([]);
  });
});

describe('o resumo e o aviso', () => {
  const e = lerOfx(extrato([
    mov({ DTPOSTED: '20260910', TRNAMT: '100', FITID: 'A' }),
    mov({ DTPOSTED: '20260911', TRNAMT: '-50', FITID: 'B' }),
  ].join('\n')));

  it('conta entradas e saídas, com o período', () => {
    expect(resumoDoExtrato(e)).toContain('2 movimentos');
    expect(resumoDoExtrato(e)).toContain('01/09/2026 a 30/09/2026');
    expect(resumoDoExtrato(e)).toContain('1 entrada(s) e 1 saída(s)');
  });

  it('diz claramente quando o arquivo não tem movimento', () => {
    expect(resumoDoExtrato(lerOfx(''))).toBe('Nenhum movimento encontrado neste arquivo.');
  });

  it('cala o aviso quando tudo foi lido', () => {
    expect(avisoDeDescartadas(e)).toBeNull();
  });

  it('agrupa os motivos do que ficou de fora e manda conferir no banco', () => {
    const comErro = lerOfx(extrato([
      mov({ DTPOSTED: '20260910', TRNAMT: '100' }),
      mov({ DTPOSTED: '20260910', TRNAMT: '100' }),
    ].join('\n')));
    const t = avisoDeDescartadas(comErro)!;
    expect(t).toContain('2 movimentos');
    expect(t).toContain('2 sem identificador do banco');
    expect(t).toContain('antes de fechar o mês');
  });
});

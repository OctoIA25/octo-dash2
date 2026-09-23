import { describe, expect, it } from 'vitest';
import { conferirLayout, isLink, parseCatalogoCsv } from './useConstrutorasCatalogo';

/**
 * O cabeçalho REAL do espelho — texto fixo, escrito uma vez, e que HOJE NÃO
 * DESCREVE os dados que vêm embaixo dele. Está aqui exatamente como está lá,
 * de propósito: é ele que o parser precisa ignorar.
 */
const CABECALHO_DO_ESPELHO =
  'construtora,empreendimento,tipo,endereco,bairro,cidade,previsao_entrega,cadastrado_octodash,descricao,unidades,garden,valor,vagas,dormitorios,suites,comissao,condominio,iptu,book,decorado,fotos,landing_page,youtube,folhetos,atualizado_em';

/**
 * Uma linha como ela REALMENTE vem, copiada da planilha em 23/09/2026.
 *
 *   0 construtora   1 empreendimento  2 CÓDIGO   3 tipo     4 endereço
 *   5 bairro        6 cidade          7 entrega  8 na Dash  9 descrição
 *  10 unidades     11 garden         12 VALOR   13 data    14 vagas
 *  15 dormitórios  16 suítes         …          20 book    24 atualizado
 */
const LINHA_REAL =
  'AUTEN,Terrace Serra do Japi,L005,APARTAMENTO,"Av. Adilson Rodrigues, 121",Jardim das Samambaias,Jundiaí,abril 2027,sim,"Vista da serra;\npiscina 25m",104,,R$ 974.653,16/09/2026,3 - 4 cobertas,3-4,até 4 suítes,,,,Book - Terrace.pdf,Decorados,https://drive.google.com/x,https://lotusbrokers.com.br/terrace,20/09/2026';

const csvCom = (...linhas: string[]) => [CABECALHO_DO_ESPELHO, ...linhas].join('\n');

/** Várias linhas plausíveis, para a checagem de layout ter amostra. */
const muitasLinhas = (n = 6) =>
  Array.from({ length: n }, (_, i) =>
    `CONSTR ${i},Empreendimento ${i},L0${10 + i},APARTAMENTO,Rua ${i},Centro,Jundiaí,2027,sim,desc,10,,R$ 100.000,,2,2,1,,,,,,,,01/09/2026`);

describe('parseCatalogoCsv — lê por POSIÇÃO, não pelo cabeçalho', () => {
  it('O CASO QUE ESTAVA ERRADO: cada campo cai no lugar certo', async () => {
    // Antes de 23/09 o parser lia pelo nome da coluna e devolvia, nesta mesma
    // linha: tipo="L005", endereco="APARTAMENTO", cidade="Jardim das
    // Samambaias", valor="". A tela mostrou isso por meses.
    const [r] = await parseCatalogoCsv(csvCom(LINHA_REAL, ...muitasLinhas()));

    expect(r.construtora).toBe('AUTEN');
    expect(r.empreendimento).toBe('Terrace Serra do Japi');
    expect(r.codigo).toBe('L005');
    expect(r.tipo).toBe('APARTAMENTO');
    expect(r.endereco).toBe('Av. Adilson Rodrigues, 121');
    expect(r.bairro).toBe('Jardim das Samambaias');
    expect(r.cidade).toBe('Jundiaí');
    expect(r.previsao_entrega).toBe('abril 2027');
    expect(r.valor).toBe('R$ 974.653');
    expect(r.vagas).toBe('3 - 4 cobertas');
    expect(r.dormitorios).toBe('3-4');
    expect(r.suites).toBe('até 4 suítes');
    expect(r.atualizado_em).toBe('20/09/2026');
  });

  it('o CÓDIGO chega à tela — antes ele era lido como se fosse o tipo', async () => {
    const [r] = await parseCatalogoCsv(csvCom(LINHA_REAL, ...muitasLinhas()));
    expect(r.codigo).toMatch(/^L\d{3}$/);
    expect(r.tipo).not.toMatch(/^L\d{3}$/);
  });

  it('célula multiline entre aspas e acentos continuam inteiros', async () => {
    const [r] = await parseCatalogoCsv(csvCom(LINHA_REAL, ...muitasLinhas()));
    expect(r.descricao).toContain('piscina 25m');
    expect(r.cidade).toBe('Jundiaí');
  });

  it('descarta linha sem empreendimento e faz trim', async () => {
    const rows = await parseCatalogoCsv(csvCom(
      ' SANTA ANGELA , Allegratto ,L012,APARTAMENTO,,Medeiros,Jundiaí,,,,,,,,,,,,,,,,,,',
      ',,,,,,,,,,,,,,,,,,,,,,,,',
      ...muitasLinhas(),
    ));
    const a = rows.find((r) => r.empreendimento === 'Allegratto');
    expect(a).toBeDefined();
    expect(a!.construtora).toBe('SANTA ANGELA');
    expect(rows.every((r) => r.empreendimento !== '')).toBe(true);
  });

  it('O PARSER recusa a planilha deslocada — não basta a função existir', async () => {
    // Sem este caso, tirar a chamada de `conferirLayout` de dentro do parser
    // passa despercebido: os testes da função continuam verdes e o parser
    // volta a entregar dado errado em silêncio. Foi o que a sabotagem mostrou.
    const deslocadas = Array.from({ length: 8 }, (_, i) =>
      `CONSTR ${i},Empreendimento ${i},APARTAMENTO,"Rua ${i}, 10",Centro,Jundiaí,2027,sim,desc,10,,,,,,,,,,,,,,,`);
    await expect(parseCatalogoCsv(csvCom(...deslocadas)))
      .rejects.toThrow(/layout da planilha de catálogo mudou/);
  });

  it('coluna a mais no fim não quebra nada', async () => {
    // A equipe acrescenta colunas ao fim com frequência; só as inserções NO
    // MEIO deslocam o que interessa.
    const [r] = await parseCatalogoCsv(csvCom(`${LINHA_REAL},extra,mais uma`, ...muitasLinhas()));
    expect(r.codigo).toBe('L005');
    expect(r.valor).toBe('R$ 974.653');
  });
});

describe('conferirLayout — olha o DADO, não o nome da coluna', () => {
  const linha = (codigo: string, tipo: string) => {
    const l = new Array(25).fill('');
    l[1] = 'Empreendimento X'; l[2] = codigo; l[3] = tipo;
    return l as string[];
  };

  it('passa quando os dados estão onde deviam', () => {
    expect(() => conferirLayout(Array.from({ length: 8 }, () => linha('L005', 'APARTAMENTO')))).not.toThrow();
  });

  it('ACUSA quando alguém insere uma coluna e tudo anda uma casa', () => {
    // O deslocamento real: o código some da coluna 2 e o tipo vai para a 4.
    const deslocada = () => {
      const l = new Array(25).fill('');
      l[1] = 'Empreendimento X'; l[2] = 'APARTAMENTO'; l[3] = 'Av. Qualquer, 10';
      return l as string[];
    };
    expect(() => conferirLayout(Array.from({ length: 8 }, deslocada)))
      .toThrow(/layout da planilha de catálogo mudou/);
  });

  it('as DUAS âncoras valem: o código sozinho já acusa', () => {
    // Cenário real: alguém troca o conteúdo da coluna do código (renomeia o
    // padrão, cola outra coisa) e o tipo continua certo. Sem a âncora do
    // código, isso passaria — e o `L0xx` é o que liga a planilha ao cadastro.
    const soTipoCerto = () => {
      const l = new Array(25).fill('');
      l[1] = 'Empreendimento X'; l[2] = 'a definir'; l[3] = 'APARTAMENTO';
      return l as string[];
    };
    expect(() => conferirLayout(Array.from({ length: 8 }, soTipoCerto)))
      .toThrow(/layout da planilha de catálogo mudou/);
  });

  it('tolera linha incompleta — o código está em 61 das 84 na planilha real', () => {
    const linhas = [
      ...Array.from({ length: 5 }, () => linha('L005', 'APARTAMENTO')),
      ...Array.from({ length: 4 }, () => linha('', 'APARTAMENTO')),
    ];
    expect(() => conferirLayout(linhas)).not.toThrow();
  });

  it('planilha vazia não acusa nada — não há o que conferir', () => {
    expect(() => conferirLayout([])).not.toThrow();
    expect(() => conferirLayout([new Array(25).fill('')])).not.toThrow();
  });

  it('a mensagem diz o que fazer, não só que deu erro', () => {
    const ruim = () => {
      const l = new Array(25).fill('');
      l[1] = 'X'; l[2] = 'seja lá o que for'; l[3] = 'outra coisa';
      return l as string[];
    };
    try {
      conferirLayout(Array.from({ length: 6 }, ruim));
      throw new Error('devia ter acusado');
    } catch (e) {
      const m = (e as Error).message;
      expect(m).toMatch(/inseriu ou removeu uma coluna/);
      expect(m).toMatch(/de 6/);
    }
  });
});

describe('isLink', () => {
  it('aceita apenas URLs http(s) — não textos como "Book.pdf", "Não" ou "Antigo"', () => {
    expect(isLink('https://drive.google.com/x')).toBe(true);
    expect(isLink('http://x.com')).toBe(true);
    expect(isLink('Book.pdf')).toBe(false);
    expect(isLink('Não')).toBe(false);
    expect(isLink('  ')).toBe(false);
  });
});

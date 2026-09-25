/**
 * A matriz de cargos — permissão nas linhas, cargo nas colunas.
 *
 * Pedido do chefe em 25/09, com a print do CORE ao lado: "assim dá pra ver
 * melhor quem pode fazer o que, sem necessariamente abrir elas".
 *
 * O que se protege aqui é o ALINHAMENTO. Uma coluna fora de ordem põe o check
 * do Corretor na coluna da Diretoria, e a tela continua bonita — ninguém
 * desconfia de uma matriz. Num quadro de permissão, o erro não para na tela:
 * alguém conclui que o corretor aprova desconto, ou que a diretoria não.
 */
import { describe, it, expect } from 'vitest';
import { matrizDeCargos, permissoesSemNinguem, type Cargo, type PermissaoDoCatalogo } from '../cargos';

const perm = (codigo: string, modulo: string, em_uso = true, ordem = 1): PermissaoDoCatalogo =>
  ({ codigo, modulo, descricao: codigo, ordem, em_uso });

const cargo = (nome: string, permissoes: string[]): Cargo => ({
  id: nome, nome, descricao: '', nivel_acesso: 1, role: 'corretor',
  ativo: true, pessoas: 0, permissoes,
});

const CATALOGO = [
  perm('leads', 'Comercial', true, 1),
  perm('imoveis', 'Comercial', true, 2),
  perm('financeiro', 'Financeiro', true, 1),
  perm('roleta', 'Comercial', false, 3),   // gravada e nunca lida
];

const CARGOS = [
  cargo('Diretoria', ['leads', 'imoveis', 'financeiro']),
  cargo('Gerente',   ['leads', 'imoveis']),
  cargo('Corretor',  ['leads']),
];

describe('a matriz', () => {
  /*
   * O CASO QUE SUSTENTA O ARQUIVO. A tela casa check com cargo pelo ÍNDICE:
   * `tem[0]` é a primeira coluna. Se a ordem escorregar, o quadro mente com
   * cara de certo.
   */
  it('cada linha traz os checks na mesma ordem dos cargos', () => {
    const blocos = matrizDeCargos(CATALOGO, CARGOS);
    const linha = (c: string) =>
      blocos.flatMap((b) => b.linhas).find((l) => l.permissao.codigo === c)!;

    expect(linha('leads').tem).toEqual([true, true, true]);
    expect(linha('imoveis').tem).toEqual([true, true, false]);
    expect(linha('financeiro').tem).toEqual([true, false, false]);
  });

  it('agrupa por módulo, e o módulo sem uso não se mistura', () => {
    const blocos = matrizDeCargos(CATALOGO, CARGOS);
    expect(blocos.map((b) => b.modulo)).toContain('Comercial');
    expect(blocos.map((b) => b.modulo)).toContain('Financeiro');
  });

  /*
   * A linha que ninguém tem é a que mais importa, e é a mais fácil de não
   * ver: ela some no meio de trinta linhas cheias de verde. É o sinal de um
   * cargo esquecido no meio de uma migração.
   */
  it('marca a permissão que nenhum cargo tem', () => {
    const blocos = matrizDeCargos([...CATALOGO, perm('juridico', 'Jurídico')], CARGOS);
    const orfa = blocos.flatMap((b) => b.linhas).find((l) => l.permissao.codigo === 'juridico')!;
    expect(orfa.ninguem).toBe(true);
    // 'juridico' e 'roleta' são órfãs, mas só 'juridico' faria diferença:
    // 'roleta' está no catálogo e nenhuma tela a lê.
    expect(permissoesSemNinguem(blocos)).toEqual({ total: 2, com_efeito: 1 });
  });

  it('a permissão que alguém tem não conta como órfã', () => {
    const blocos = matrizDeCargos(CATALOGO, CARGOS);
    const linha = (c: string) =>
      blocos.flatMap((b) => b.linhas).find((l) => l.permissao.codigo === c)!;
    expect(linha('leads').ninguem).toBe(false);
    expect(linha('financeiro').ninguem).toBe(false); // só a Diretoria tem, e basta
  });

  /*
   * Sem cargo nenhum, `every` numa lista vazia devolve `true` — e a tela
   * pintaria a matriz INTEIRA de âmbar, gritando "33 permissões ninguém tem"
   * numa imobiliária que só ainda não criou o primeiro cargo. Sem cargos não
   * há afirmação a fazer.
   */
  it('sem cargo nenhum, não afirma que ninguém tem', () => {
    const blocos = matrizDeCargos(CATALOGO, []);
    const linhas = blocos.flatMap((b) => b.linhas);
    expect(linhas.every((l) => l.ninguem === false)).toBe(true);
    expect(permissoesSemNinguem(blocos)).toEqual({ total: 0, com_efeito: 0 });
  });

  it('catálogo vazio devolve nada, e não quebra', () => {
    expect(matrizDeCargos([], CARGOS)).toEqual([]);
    expect(permissoesSemNinguem([])).toEqual({ total: 0, com_efeito: 0 });
  });

  /*
   * A permissão inerte continua na matriz. Escondê-la deixaria o quadro mais
   * limpo e mentiria por omissão: ela ESTÁ marcada no cargo de alguém, e quem
   * a marcou acredita ter dado um acesso. O bloco carrega `em_uso` para a tela
   * dizer isso em letra.
   */
  /*
   * O MÓDULO INTEIRO que o app não lê. Filtrá-lo deixaria o quadro mais curto
   * e sumiria com permissões que ESTÃO marcadas em cargos: quem as marcou
   * acredita ter dado acesso, e não acharia mais onde desmarcar. Ele fica, com
   * `em_uso: false` para a tela dizer isso em letra.
   */
  it('o módulo em que nada tem efeito continua na matriz', () => {
    const blocos = matrizDeCargos(
      [...CATALOGO, perm('auditoria', 'Auditoria', false), perm('exportar', 'Auditoria', false, 2)],
      CARGOS,
    );
    const bloco = blocos.find((b) => b.modulo === 'Auditoria');
    expect(bloco).toBeDefined();
    expect(bloco!.em_uso).toBe(false);
    expect(bloco!.linhas).toHaveLength(2);
  });

  it('a permissão que o app não lê continua na matriz, marcada', () => {
    const blocos = matrizDeCargos(CATALOGO, CARGOS);
    const bloco = blocos.find((b) => b.linhas.some((l) => l.permissao.codigo === 'roleta'))!;
    expect(bloco.linhas.some((l) => l.permissao.codigo === 'roleta')).toBe(true);
    expect(bloco.linhas.find((l) => l.permissao.codigo === 'roleta')!.permissao.em_uso).toBe(false);
  });
});

/**
 * Variação exibida como se fosse medida, mas escrita à mão no código.
 *
 * Em 18/09 o card "Conversão do Mês" da tela Início mostrava
 * `trend={{ value: '3,1%', positive: false, caption: 'vs. mês anterior' }}`
 * — um número cravado, que aparecia igual para qualquer imobiliária, com
 * qualquer dado, em qualquer mês. Ninguém percebeu porque 3,1% é plausível.
 *
 * É a mesma família dos outros defeitos desta leva: um número que ninguém
 * confere vira verdade por repetição. A diferença é que este nem vem de conta
 * errada — ele não vem de conta nenhuma.
 *
 * O teto está VAZIO de propósito. Se alguém precisar de um valor fixo ali (um
 * placeholder de tela de demonstração, por exemplo), acrescente o arquivo com
 * o motivo escrito ao lado — como no teto de `colunaDeVisita.guard.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Arquivo → quantas variações cravadas são toleradas. Vazio = nenhuma. */
const TETO: Record<string, number> = {};

/**
 * `trend={{ ... value: '<algo com dígito>' ... }}`. Só pega o valor LITERAL:
 * `trend={{ value: pct }}` ou `trend={variacao}` passam, porque aí o número
 * vem de uma conta.
 */
const VARIACAO_LITERAL = /(trend|variacao|variation)\s*=\s*\{\{[^}]*?value:\s*['"][^'"]*\d/gis;

function arquivosDeCodigo(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome === '__tests__') continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivosDeCodigo(caminho, acc);
    else if (/\.tsx?$/.test(nome) && !nome.includes('.test.')) acc.push(caminho.split('\\').join('/'));
  }
  return acc;
}

function ocorrencias(conteudo: string): number {
  return (conteudo.match(VARIACAO_LITERAL) || []).length;
}

describe('variação de indicador não pode ser escrita à mão', () => {
  const medido = new Map<string, number>();
  for (const f of arquivosDeCodigo('src')) {
    const n = ocorrencias(readFileSync(f, 'utf8'));
    if (n > 0) medido.set(f, n);
  }

  it('nenhum arquivo exibe variação com número cravado', () => {
    const fora = [...medido.entries()]
      .filter(([f, n]) => n > (TETO[f] ?? 0))
      .map(([f, n]) => `${f}: ${n}`);
    expect(
      fora,
      'Variação com valor literal. Se o número vem de uma conta, passe a ' +
        'variável; se não há comparação possível, omita o `trend` — o card ' +
        'já não mostra nada. Inventar "0%" lê como "ficou igual".',
    ).toEqual([]);
  });

  it('o teto acompanha a realidade: nada listado a mais', () => {
    const sumiram = Object.keys(TETO).filter((f) => !medido.has(f));
    expect(sumiram, 'Estes arquivos não têm mais variação cravada: remova-os do TETO.').toEqual([]);
  });

  // O portão só vale se acusar. Este caso prova que a expressão pega o
  // formato exato que estava na tela Início até 18/09.
  it('acusa o formato que existia de verdade', () => {
    const comoEstava = `trend={{ value: '3,1%', positive: false, caption: 'vs. mês anterior' }}`;
    expect(ocorrencias(comoEstava)).toBe(1);
  });

  it('nao acusa variacao que vem de conta', () => {
    expect(ocorrencias('trend={leadsNoFunilTrend}')).toBe(0);
    expect(ocorrencias('trend={{ value: pct, positive: subiu, caption: legenda }}')).toBe(0);
  });
});

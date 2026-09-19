/**
 * A comissão da construtora não volta para a tela enquanto vier da planilha.
 *
 * POR QUE ESTA TRAVA EXISTE. Medido em 18/09/2026: a aba Construtoras se
 * alimenta de uma planilha do Google numa URL ABERTA — sem login, sem token —
 * e essa planilha tem uma coluna `comissao` com valores como "2-3" e "3-4". A
 * aba exibia isso como uma coluna da tabela, para qualquer pessoa que abrisse
 * /imoveis, inclusive corretor.
 *
 * O chefe mandou tirar a coluna da tela em 18/09. Tirar não fecha a planilha
 * (quem tem o link continua lendo), mas encerra a exposição pela tela, que é o
 * alcance que o código tem.
 *
 * A comissão volta quando a aba ler o cadastro `construtoras`, onde ela é
 * protegida pelo BANCO: fora do SELECT do navegador, só pela RPC
 * `construtoras_comissao`. Por isso esta trava aponta para a fonte: se a aba
 * deixar de ler a planilha, ela pode ser removida.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raiz = process.cwd();
const aba = readFileSync(join(raiz, 'src/components/imoveis/ConstrutorasTab.tsx'), 'utf8');
const hook = readFileSync(join(raiz, 'src/features/imoveis/hooks/useConstrutorasCatalogo.ts'), 'utf8');

/** Linhas de código, sem comentário — o motivo da trava cita "comissão". */
const semComentario = (fonte: string) =>
  fonte
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
    .join('\n');

describe('a comissão não aparece na aba Construtoras', () => {
  it('não há coluna de comissão na tabela da aba', () => {
    const colunas = [...semComentario(aba).matchAll(/key:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(colunas).not.toContain('comissao');
  });

  it('nenhum rótulo de Comissão é renderizado', () => {
    expect(semComentario(aba)).not.toMatch(/Comiss[ãa]o/);
  });

  it('a trava continua necessária: a aba ainda se alimenta da planilha aberta', () => {
    // Quando isto falhar, é porque a aba passou a ler o cadastro do banco —
    // e aí a comissão pode voltar, protegida. Apague este arquivo então.
    expect(hook).toContain('CATALOGO_CSV_URL');
    expect(hook).toMatch(/docs\.google\.com/);
  });
});

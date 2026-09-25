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
const servico = readFileSync(join(raiz, 'src/features/imoveis/services/construtorasService.ts'), 'utf8');

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

  /*
   * ESTE CASO MUDOU EM 25/09, e o motivo importa.
   *
   * Ele proibia a PALAVRA "Comissão" em qualquer lugar do arquivo. Em 24/09 a
   * aba ganhou a gaveta de perfil da construtora, que mostra a comissão vinda
   * do CADASTRO — e o caso passou a falhar sobre uma tela que está certa.
   *
   * Proibir a palavra nunca foi a regra. A regra é DE ONDE O VALOR VEM: a
   * planilha do Google está numa URL aberta, sem login; o cadastro está atrás
   * da RPC `construtoras_comissao`, que confere o cargo no próprio banco.
   * Então é a origem que se trava, não o texto.
   */
  it('a planilha aberta não entrega comissão para a tela', () => {
    expect(semComentario(hook)).not.toMatch(/comiss/i);
  });

  it('a comissão que a tela mostra vem da RPC que confere cargo', () => {
    expect(servico).toContain("rpc('construtoras_comissao'");
    // E ela NÃO pode entrar junto do SELECT comum: se a coluna voltar para a
    // leitura aberta do cadastro, a RPC vira enfeite e o dado vaza pelo lado.
    const selects = [...semComentario(servico).matchAll(/\.select\('([^']+)'\)/g)].map((m) => m[1]);
    expect(selects.some((c) => /comissao/i.test(c))).toBe(false);
  });

  it('a trava continua necessária: a aba ainda se alimenta da planilha aberta', () => {
    // Quando isto falhar, é porque a aba passou a ler o cadastro do banco —
    // e aí a comissão pode voltar, protegida. Apague este arquivo então.
    expect(hook).toContain('CATALOGO_CSV_URL');
    expect(hook).toMatch(/docs\.google\.com/);
  });
});

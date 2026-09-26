/**
 * Os dois entrypoints precisam registrar a rota da distribuição.
 *
 * POR QUE ESTE TESTE EXISTE. Neste repositório o mesmo código já viveu
 * duplicado nos dois servidores e divergiu: o mapper que decide o que vai para
 * a Lia estava escrito duas vezes, sem teste, apesar de um comentário avisando
 * que isso "já custou caro". Uma rota registrada só num dos dois some quando o
 * outro entra no ar — e some em silêncio, porque 404 de rota não acorda
 * ninguém.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SERVIDOR = join(AQUI, '..');
const ENTRYPOINTS = ['api-server.js', 'proxy-production.js'];

describe('paridade de entrypoints — distribuição', () => {
  for (const arquivo of ENTRYPOINTS) {
    const src = readFileSync(join(SERVIDOR, arquivo), 'utf8');

    it(`${arquivo} importa registerDistribuicaoRoutes`, () => {
      expect(src).toMatch(/import\s*\{[^}]*\bregisterDistribuicaoRoutes\b/);
    });

    it(`${arquivo} registra a rota passando o validador de API key`, () => {
      // Sem o validador, a rota responderia a qualquer um — e ela diz de quem
      // é cada lead da imobiliária.
      expect(src).toMatch(/registerDistribuicaoRoutes\s*\(\s*app\s*,\s*supabase\s*,\s*validateApiKey\s*\)/);
    });
  }

  it('nenhum dos dois declara a regra por conta própria', () => {
    // A regra mora em server/distribuicao/regra.js. Uma cópia local num
    // entrypoint é exatamente o defeito que este módulo veio evitar.
    for (const arquivo of ENTRYPOINTS) {
      const src = readFileSync(join(SERVIDOR, arquivo), 'utf8');
      expect(src).not.toMatch(/function\s+decidirDestino/);
      expect(src).not.toMatch(/const\s+decidirDestino\s*=/);
    }
  });
});

/*
 * A ROTA E O SIMULADOR PRECISAM PERGUNTAR A MESMA COISA — 26/09.
 *
 * O simulador da tela passava `destinoPorTipo` para `decidirDestino`; a rota
 * que a Lia consulta NÃO passava. As duas rodam a mesma função — foi para
 * isso que ela foi extraída — e mesmo assim davam respostas diferentes para
 * lead de recrutamento e de vendedores: a tela mandava para o dono
 * configurado, a rota respondia `tipo_sem_dono_configurado`.
 *
 * A equipe da Lia viu o sintoma de fora ("recrutamento/vendedores não existem
 * no fluxo") sem poder ver a causa.
 *
 * Rodar a mesma função não basta: o que decide a resposta é o que cada
 * chamador ENTREGA a ela. Este teste trava os argumentos, não o resultado.
 */
describe('a rota entrega à regra tudo que a decisão precisa', () => {
  const rota = readFileSync(join(AQUI, 'routes.js'), 'utf8');

  it.each([
    ['destinoPorTipo', /destinoPorTipo:/, 'recrutamento e vendedores cairiam em "sem dono configurado"'],
    ['roletaLigada', /roletaLigada:/, 'a rota responderia "roleta_em_ordem" com a roleta desligada'],
  ])('a rota passa %s', (_nome, padrao, consequencia) => {
    expect(rota, consequencia).toMatch(padrao);
  });

  it('e lê do banco as colunas de onde esses dois saem', () => {
    const dados = readFileSync(join(AQUI, 'dados.js'), 'utf8');
    // Sem elas no SELECT, os dois chegam indefinidos e o padrão silencioso
    // volta a valer — sem erro nenhum.
    expect(dados).toMatch(/roleta_enabled/);
    expect(dados).toMatch(/destino_por_tipo/);
  });
});

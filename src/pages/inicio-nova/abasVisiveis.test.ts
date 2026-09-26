/**
 * Quais abas do cabeçalho cada cargo enxerga.
 *
 * O caso que motivou o arquivo: o corretor via a aba "Configurações" do Bolsão,
 * clicava e batia em "Apenas administradores podem editar as configurações do
 * bolsão" — um beco sem saída. A trava de verdade está no banco (só admin,
 * líder e dono escrevem em `tenant_bolsao_config`); esconder a aba é só não
 * oferecer a porta que não abre.
 */
import { describe, expect, it } from 'vitest';
import { abasVisiveis, podeVerAba, ROTAS_GOVERNADAS_POR_PERMISSAO } from './abasVisiveis';
import { TAB_CONFIGS } from './PageTabs';

const aba = (id: string) => ({ id });
const corretor = { teamQueueEnabled: true, isGestao: false, isOwner: false };
const gestao = { teamQueueEnabled: true, isGestao: true, isOwner: false };
const dono = { teamQueueEnabled: true, isGestao: false, isOwner: true };

const ids = (lista: { id: string }[]) => lista.map((t) => t.id);

describe('abasVisiveis — Bolsão', () => {
  const abas = [aba('disponiveis'), aba('geral'), aba('equipes'), aba('configuracoes')];

  it('corretor não vê as abas de configuração — nelas ele só encontraria um aviso de bloqueio', () => {
    expect(ids(abasVisiveis('/bolsao', abas, corretor))).toEqual(['disponiveis', 'geral']);
  });

  it('gestão vê tudo', () => {
    expect(ids(abasVisiveis('/bolsao', abas, gestao))).toEqual(['disponiveis', 'geral', 'equipes', 'configuracoes']);
  });

  it('dono da plataforma vê tudo', () => {
    expect(ids(abasVisiveis('/bolsao', abas, dono))).toEqual(['disponiveis', 'geral', 'equipes', 'configuracoes']);
  });

  it('sem fila por equipe, nem a gestão vê a aba Equipes', () => {
    const r = abasVisiveis('/bolsao', abas, { ...gestao, teamQueueEnabled: false });

    expect(ids(r)).toEqual(['disponiveis', 'geral', 'configuracoes']);
  });
});

describe('abasVisiveis — regras que já existiam', () => {
  it('Telemetria dos agentes é só de gestão: corretor não vê custo da empresa', () => {
    const abas = [aba('agentes'), aba('telemetria')];

    expect(ids(abasVisiveis('/agentes-ia', abas, corretor))).toEqual(['agentes']);
    expect(ids(abasVisiveis('/agentes-ia', abas, gestao))).toEqual(['agentes', 'telemetria']);
  });

  it('Amarrar anúncio sem imóvel vale para o lead de todo mundo: só gestão', () => {
    const abas = [aba('catalogo'), aba('anuncios-sem-imovel')];

    expect(ids(abasVisiveis('/imoveis', abas, corretor))).toEqual(['catalogo']);
    expect(ids(abasVisiveis('/imoveis', abas, dono))).toEqual(['catalogo', 'anuncios-sem-imovel']);
  });

  it('sem regra de cargo, as abas vêm como estão', () => {
    const abas = [aba('tarefas'), aba('okrs')];

    expect(ids(abasVisiveis('/gestao-equipe', abas, corretor))).toEqual(['tarefas', 'okrs']);
  });
});

/**
 * As sub-abas passaram a ler a permissão — 26/09.
 *
 * Até aqui `abasVisiveis` filtrava só por CARGO, e as caixas "Sub-abas de
 * Início" do modal de Equipe gravavam em `permissions.sub_permissions`, uma
 * chave que nenhum arquivo lia. Medido em produção: 45 pessoas com uma
 * sub-aba desmarcada, e as 45 viam a aba do mesmo jeito.
 */
describe('sub-abas: a caixa do modal passa a valer', () => {
  const abasDaInicio = [
    aba('funil'), aba('okrs'), aba('painel-comercial'), aba('kpis'),
    aba('pdi'), aba('tarefas-semana'), aba('agenda'),
  ];

  /*
   * O CASO QUE SUSTENTA O ARQUIVO. É a forma exata da pessoa da Lotus que
   * desmarcou as seis abas de Início e continuava vendo as seis.
   */
  it('desmarcada some — era o defeito que ninguém via', () => {
    const r = abasVisiveis('/leads', abasDaInicio, {
      ...corretor,
      subPermissoes: { 'leads-kpis': false, 'leads-agenda': false },
    });

    expect(ids(r)).toEqual(['funil', 'okrs', 'painel-comercial', 'pdi', 'tarefas-semana']);
  });

  /*
   * 78 dos 127 membros não têm `sub_permissions` gravado. Se ausência valesse
   * como negada, o primeiro deploy apagaria a barra de abas da maioria da casa.
   */
  it('sem nada gravado, vê tudo — ausente é liberado, só `false` esconde', () => {
    expect(ids(abasVisiveis('/leads', abasDaInicio, corretor))).toHaveLength(7);
    expect(ids(abasVisiveis('/leads', abasDaInicio, { ...corretor, subPermissoes: {} }))).toHaveLength(7);
    expect(
      ids(abasVisiveis('/leads', abasDaInicio, { ...corretor, subPermissoes: { 'leads-kpis': true } })),
    ).toHaveLength(7);
  });

  /*
   * Isto NÃO é regra de cargo: quem desmarca a caixa de um admin está dizendo
   * algo sobre aquela pessoa. Se a gestão passasse por cima, a caixa não teria
   * efeito justo para quem mais tem aba na tela.
   */
  it('gestão também obedece à própria caixa', () => {
    const r = abasVisiveis('/leads', abasDaInicio, { ...gestao, subPermissoes: { 'leads-funil': false } });

    expect(ids(r)).not.toContain('funil');
  });

  it('o dono da plataforma passa por cima, como em toda a barra lateral', () => {
    const r = abasVisiveis('/leads', abasDaInicio, { ...dono, subPermissoes: { 'leads-funil': false } });

    expect(ids(r)).toContain('funil');
  });

  /*
   * O código do catálogo é `leads-tarefas` e a aba se chama `tarefas-semana`.
   * Um `includes(aba.id)` ingênuo — que é como a regra de cargo ao lado
   * funciona — deixaria esta passar calada. Daí o mapa existir.
   */
  it('o código do catálogo não é o id da aba, e mesmo assim bate', () => {
    const r = abasVisiveis('/leads', abasDaInicio, {
      ...corretor,
      subPermissoes: { 'leads-tarefas': false },
    });

    expect(ids(r)).not.toContain('tarefas-semana');
  });

  it('Gestão de Equipe usa as próprias caixas', () => {
    expect(
      podeVerAba('/gestao-equipe', 'acessos-permissoes', { subPermissoes: { 'gestao-acessos': false } }),
    ).toBe(false);
    expect(podeVerAba('/gestao-equipe', 'acessos-permissoes', { subPermissoes: {} })).toBe(true);
  });

  it('rota fora do mapa não é governada por permissão', () => {
    expect(podeVerAba('/imoveis', 'catalogo', { subPermissoes: { catalogo: false } })).toBe(true);
  });
});

/**
 * A totalidade é o que impede o defeito de voltar.
 *
 * O buraco original era assim: "Painel comercial" era aba de verdade e não
 * tinha código nenhum. Ficava visível ao lado das que sumiam, e quem
 * configurou concluiu que a tela ignorava a marcação. Meia lista mente.
 */
describe('toda aba de rota governada tem permissão', () => {
  it.each(Object.keys(ROTAS_GOVERNADAS_POR_PERMISSAO))('%s', (basePath) => {
    const cfg = TAB_CONFIGS.find((c) => c.basePath === basePath);
    // /gestao-equipe navega por `?tab=` sem barra de abas: nada a cobrar aqui.
    if (!cfg || cfg.tabs.length === 0) return;

    const semCodigo = cfg.tabs
      .map((t) => t.id)
      .filter((id) => !ROTAS_GOVERNADAS_POR_PERMISSAO[basePath][id]);

    expect(semCodigo).toEqual([]);
  });
});

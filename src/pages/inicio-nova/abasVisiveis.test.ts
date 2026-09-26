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
import { abasVisiveis } from './abasVisiveis';

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

  it('rota sem regra devolve as abas como estão', () => {
    const abas = [aba('tarefas'), aba('okrs')];

    expect(ids(abasVisiveis('/gestao-equipe', abas, corretor))).toEqual(['tarefas', 'okrs']);
  });
});

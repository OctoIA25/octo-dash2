import { describe, expect, it } from 'vitest';
import {
  agruparPorModulo, encaixamExato, resumoDoCargo, semEfeito, sugerirCargos,
  totalDeExcecoes,
  type Cargo, type MembroParaMigrar, type PermissaoDoCatalogo,
} from './cargos';
import type { SidebarPermission } from '@/types/permissions';

const catalogo: PermissaoDoCatalogo[] = [
  { codigo: 'leads', modulo: 'Abas do menu', descricao: 'Início', ordem: 10, em_uso: true },
  { codigo: 'imoveis', modulo: 'Abas do menu', descricao: 'Imóveis', ordem: 80, em_uso: true },
  { codigo: 'octo-chat', modulo: 'Abas do menu', descricao: 'Octo Chat', ordem: 170, em_uso: false },
  { codigo: 'leads-funil', modulo: 'Sub-abas de Início', descricao: 'Funil', ordem: 210, em_uso: false },
  { codigo: 'can_manage_roleta', modulo: 'Permissões especiais', descricao: 'Roleta', ordem: 510, em_uso: false },
];

describe('o catálogo agrupado', () => {
  it('põe os módulos que funcionam antes dos que não funcionam', () => {
    const g = agruparPorModulo(catalogo);
    expect(g[0].modulo).toBe('Abas do menu');
    expect(g[0].em_uso).toBe(true);
    expect(g.slice(1).every((x) => !x.em_uso)).toBe(true);
  });

  it('um módulo conta como em uso se ao menos uma permissão dele funciona', () => {
    // "Abas do menu" tem octo-chat inerte, mas leads e imoveis funcionam.
    expect(agruparPorModulo(catalogo).find((g) => g.modulo === 'Abas do menu')?.em_uso).toBe(true);
    expect(agruparPorModulo(catalogo).find((g) => g.modulo === 'Permissões especiais')?.em_uso).toBe(false);
  });

  it('ordena as permissões dentro do módulo', () => {
    const abas = agruparPorModulo(catalogo)[0].permissoes.map((p) => p.codigo);
    expect(abas).toEqual(['leads', 'imoveis', 'octo-chat']);
  });
});

describe('quantas permissões do cargo não fazem nada', () => {
  it('conta só as inertes', () => {
    expect(semEfeito({ permissoes: ['leads', 'imoveis'] }, catalogo)).toBe(0);
    expect(semEfeito({ permissoes: ['leads', 'octo-chat', 'can_manage_roleta'] }, catalogo)).toBe(2);
  });
});

describe('o resumo da linha', () => {
  const cargo = (over: Partial<Cargo> = {}): Cargo => ({
    id: 'c1', nome: 'Corretor', descricao: '', nivel_acesso: 10, role: 'corretor',
    ativo: true, pessoas: 2, permissoes: ['leads', 'imoveis'], ...over,
  });

  it('concorda em número', () => {
    expect(resumoDoCargo(cargo())).toBe('2 permissões · 2 pessoas');
    expect(resumoDoCargo(cargo({ permissoes: ['leads'], pessoas: 1 }))).toBe('1 permissão · 1 pessoa');
    expect(resumoDoCargo(cargo({ permissoes: [], pessoas: 0 }))).toBe('0 permissões · 0 pessoas');
  });
});

describe('o planejador da migração', () => {
  const m = (
    id: string, nome: string, role: string, abas: string[]
  ): MembroParaMigrar => ({ user_id: id, nome, role, abasHoje: abas as SidebarPermission[] });

  it('escolhe o conjunto MAIS COMUM do papel como o cargo', () => {
    const [corretor] = sugerirCargos([
      m('1', 'Ana', 'corretor', ['leads', 'imoveis']),
      m('2', 'Bia', 'corretor', ['leads', 'imoveis']),
      m('3', 'Caio', 'corretor', ['leads', 'imoveis']),
      m('4', 'Dan', 'corretor', ['leads']),
    ]);
    expect(corretor.permissoes).toEqual(['imoveis', 'leads']);
    expect(corretor.nome).toBe('Corretor');
    expect(corretor.role).toBe('corretor');
  });

  it('a diferença de cada pessoa vira exceção — e ninguém perde nem ganha', () => {
    const [corretor] = sugerirCargos([
      m('1', 'Ana', 'corretor', ['leads', 'imoveis']),
      m('2', 'Bia', 'corretor', ['leads', 'imoveis']),
      m('3', 'Caio', 'corretor', ['leads', 'imoveis', 'juridico']),
      m('4', 'Dan', 'corretor', ['leads']),
    ]);
    const porNome = Object.fromEntries(corretor.membros.map((x) => [x.nome, x]));

    expect(porNome.Ana.da).toEqual([]);
    expect(porNome.Ana.tira).toEqual([]);
    // Caio tem uma aba a mais: ganha exceção que DÁ.
    expect(porNome.Caio.da).toEqual(['juridico']);
    expect(porNome.Caio.tira).toEqual([]);
    // Dan tem uma a menos: ganha exceção que TIRA.
    expect(porNome.Dan.da).toEqual([]);
    expect(porNome.Dan.tira).toEqual(['imoveis']);
  });

  it('cada papel vira um cargo, e só os papéis que existem', () => {
    const c = sugerirCargos([
      m('1', 'Ana', 'corretor', ['leads']),
      m('2', 'Bia', 'admin', ['leads', 'gestao-equipe']),
    ]);
    expect(c.map((x) => x.role)).toEqual(['admin', 'corretor']);
    expect(c.find((x) => x.role === 'admin')?.nivel_acesso).toBe(30);
  });

  it('no empate fica com o conjunto maior — exceção que tira é mais fácil de conferir', () => {
    const [corretor] = sugerirCargos([
      m('1', 'Ana', 'corretor', ['leads', 'imoveis']),
      m('2', 'Bia', 'corretor', ['leads']),
    ]);
    expect(corretor.permissoes).toEqual(['imoveis', 'leads']);
  });

  it('aguenta pessoa sem aba nenhuma', () => {
    const [corretor] = sugerirCargos([m('1', 'Ana', 'corretor', [])]);
    expect(corretor.permissoes).toEqual([]);
    expect(corretor.membros[0].da).toEqual([]);
    expect(corretor.membros[0].tira).toEqual([]);
  });

  it('não inventa cargo quando não há ninguém', () => {
    expect(sugerirCargos([])).toEqual([]);
  });
});

describe('as medidas do plano de migração', () => {
  const plano = sugerirCargos([
    { user_id: '1', nome: 'Ana', role: 'corretor', abasHoje: ['leads', 'imoveis'] as SidebarPermission[] },
    { user_id: '2', nome: 'Bia', role: 'corretor', abasHoje: ['leads', 'imoveis'] as SidebarPermission[] },
    { user_id: '3', nome: 'Caio', role: 'corretor', abasHoje: ['leads', 'imoveis', 'juridico'] as SidebarPermission[] },
  ]);

  it('conta as exceções que serão criadas', () => {
    expect(totalDeExcecoes(plano)).toBe(1);
  });

  it('diz quantos encaixam sem exceção nenhuma — a medida do cargo bem escolhido', () => {
    expect(encaixamExato(plano)).toEqual({ encaixam: 2, total: 3 });
  });
});

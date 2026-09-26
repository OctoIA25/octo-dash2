/**
 * Passar as 127 pessoas para cargo sem mudar o que nenhuma delas vê — 26/09.
 *
 * O chefe pediu que promover alguém fosse UMA ação, num lugar só. Para o cargo
 * virar esse campo único, todo mundo precisa sair de "sem cargo" — e aí esbarra
 * na regra que está escrita em `permissoesDeSidebar`: COM CARGO, O CARGO MANDA.
 *
 * Hoje são 127 pessoas no arranjo individual, com 12 combinações diferentes só
 * na Lotus. Sem o que este arquivo protege, o gestor promoveria alguém e
 * reescreveria o menu dela de quebra.
 *
 * A PROVA É DE PONTA A PONTA, e é o que dá valor ao arquivo: não comparo a
 * minha conta com uma cópia da minha conta. Rodo a função que está no ar
 * (`permissoesDeSidebar`) nos DOIS estados — sem cargo e com cargo+exceções —
 * e exijo o mesmo resultado. Os arranjos abaixo são os de produção, medidos em
 * 26/09.
 */
import { describe, expect, it } from 'vitest';
import { permissoesDeSidebar, comPermissoesNaoEditaveis } from '@/types/permissions';
import type { SidebarPermission } from '@/types/permissions';
import { excecoesQuePreservam, aplicarExcecoes, cargoDoMesmoNivel } from '../converterParaCargo';

/** O que cada imobiliária contratou — `tenants.allowed_features` em 26/09. */
const CONTRATADO: Record<string, SidebarPermission[]> = {
  japi: ['agentes-ia', 'metas', 'metricas', 'relatorios', 'chat', 'financeiro'],
  lotus: ['leads', 'notificacoes', 'metricas', 'estudo-mercado', 'recrutamento', 'imoveis',
          'gestao-equipe', 'agentes-ia', 'integracoes', 'central-leads',
          'relatorios', 'excel', 'juridico', 'metas', 'comunicacao', 'chat', 'financeiro'],
  imob9: ['leads', 'notificacoes', 'metricas', 'estudo-mercado', 'imoveis', 'gestao-equipe',
          'integracoes', 'agentes-ia', 'juridico', 'metas'],
} as Record<string, SidebarPermission[]>;

/** Os pacotes dos cargos — `cargo_permissoes` em 26/09. */
const PACOTE: Record<string, Record<string, string[]>> = {
  japi: {
    Diretoria: ['metricas', 'agentes-ia', 'chat', 'relatorios', 'metas', 'financeiro'],
    Gerente: ['metricas', 'chat', 'relatorios', 'metas'],
    Corretor: ['metricas', 'chat'],
  },
  lotus: {
    Diretoria: ['leads', 'notificacoes', 'metricas', 'juridico', 'estudo-mercado', 'recrutamento',
                'gestao-equipe', 'imoveis', 'agentes-ia', 'comunicacao', 'chat', 'integracoes',
                'central-leads', 'relatorios', 'metas', 'excel', 'financeiro'],
    Gerente: ['leads', 'notificacoes', 'metricas', 'juridico', 'estudo-mercado', 'gestao-equipe',
              'imoveis', 'chat', 'central-leads', 'relatorios', 'metas', 'excel'],
    Corretor: ['leads', 'notificacoes', 'metricas', 'juridico', 'estudo-mercado', 'imoveis', 'chat'],
  },
  imob9: {
    Diretoria: ['leads', 'notificacoes', 'metricas', 'juridico', 'estudo-mercado', 'gestao-equipe',
                'imoveis', 'agentes-ia', 'integracoes', 'metas'],
    Gerente: ['leads', 'notificacoes', 'metricas', 'juridico', 'estudo-mercado', 'gestao-equipe',
              'imoveis', 'metas'],
    Corretor: ['leads', 'notificacoes', 'metricas', 'juridico', 'estudo-mercado', 'imoveis'],
  },
};

const CARGO_DO_PAPEL: Record<string, string> = {
  admin: 'Diretoria', team_leader: 'Gerente', corretor: 'Corretor',
};

/** Como a pessoa é hoje: sem cargo, com a lista individual dela. */
const hoje = (casa: string, role: string, salvas: string[] | null) =>
  permissoesDeSidebar({
    isOwner: false,
    isTenantUser: true,
    systemRole: role as 'admin' | 'team_leader' | 'corretor',
    tenantAllowedFeatures: CONTRATADO[casa],
    sidebarPermissions: salvas
      ? comPermissoesNaoEditaveis(salvas as SidebarPermission[], role)
      : undefined,
    permissoesDoCargo: null,
  });

/** Como ela fica depois da carga: com cargo, e com as exceções aplicadas. */
const depois = (casa: string, role: string, excecoes: ReturnType<typeof excecoesQuePreservam>) =>
  permissoesDeSidebar({
    isOwner: false,
    isTenantUser: true,
    systemRole: role as 'admin' | 'team_leader' | 'corretor',
    tenantAllowedFeatures: CONTRATADO[casa],
    // O banco (`permissoes_efetivas`) entrega o pacote JÁ com as exceções:
    // pacote ∪ concede EXCEPT ¬concede. `aplicarExcecoes` é essa conta.
    permissoesDoCargo: aplicarExcecoes(
      PACOTE[casa][CARGO_DO_PAPEL[role]], excecoes,
    ) as SidebarPermission[],
  });

/**
 * Os 33 arranjos que existem em produção, agrupados por casa. Cada linha é
 * "role + o que está gravado", que é tudo de que a regra precisa.
 */
const ARRANJOS: Array<[string, string, string[] | null, number]> = [
  // Imobiliaria Japi — 40 pessoas
  ['japi', 'admin', ['agentes-ia', 'chat'], 1],
  ['japi', 'corretor', null, 6],
  ['japi', 'corretor', ['agentes-ia', 'chat'], 28],
  ['japi', 'corretor', ['chat', 'gestao-equipe'], 3],
  ['japi', 'corretor', ['agentes-ia', 'chat', 'octo-chat'], 1],
  ['japi', 'corretor', ['chat', 'estudo-mercado', 'imoveis', 'leads', 'metricas', 'notificacoes', 'octo-chat'], 1],
  // Lotus Brokers — 20 pessoas, 12 arranjos: a casa que sustenta o arquivo
  ['lotus', 'admin', ['leads'], 1],
  ['lotus', 'admin', ['chat', 'comunicacao'], 1],
  ['lotus', 'admin', ['agentes-ia', 'atividades', 'central-leads', 'chat', 'comunicacao', 'estudo-mercado',
    'excel', 'gestao-equipe', 'imoveis', 'integracoes', 'juridico', 'leads', 'metas', 'metricas',
    'notificacoes', 'octo-chat', 'recrutamento', 'relatorios'], 2],
  ['lotus', 'corretor', ['leads'], 1],
  ['lotus', 'corretor', ['octo-chat'], 1],
  ['lotus', 'corretor', ['imoveis', 'leads', 'octo-chat'], 1],
  ['lotus', 'corretor', ['agentes-ia', 'imoveis', 'leads', 'octo-chat'], 1],
  ['lotus', 'corretor', ['agentes-ia', 'chat', 'estudo-mercado', 'imoveis', 'leads', 'metricas', 'notificacoes', 'octo-chat'], 5],
  ['lotus', 'corretor', ['chat', 'estudo-mercado', 'imoveis', 'juridico', 'leads', 'metricas', 'notificacoes', 'octo-chat'], 2],
  ['lotus', 'corretor', ['agentes-ia', 'chat', 'estudo-mercado', 'imoveis', 'juridico', 'leads', 'metricas', 'notificacoes', 'octo-chat'], 2],
  ['lotus', 'corretor', ['agentes-ia', 'central-leads', 'chat', 'estudo-mercado', 'excel', 'gestao-equipe',
    'imoveis', 'integracoes', 'juridico', 'leads', 'metricas', 'notificacoes', 'octo-chat', 'recrutamento', 'relatorios'], 1],
  ['lotus', 'team_leader', ['agentes-ia', 'central-leads', 'chat', 'estudo-mercado', 'excel', 'gestao-equipe',
    'imoveis', 'juridico', 'leads', 'metas', 'metricas', 'notificacoes', 'octo-chat', 'recrutamento', 'relatorios'], 1],
  ['lotus', 'team_leader', ['agentes-ia', 'central-leads', 'chat', 'estudo-mercado', 'excel', 'gestao-equipe',
    'imoveis', 'integracoes', 'juridico', 'leads', 'metas', 'metricas', 'notificacoes', 'octo-chat', 'recrutamento', 'relatorios'], 1],
  // imobiliaria 9 — 43 pessoas
  ['imob9', 'admin', ['agentes-ia', 'atividades', 'central-leads', 'chat', 'estudo-mercado', 'gestao-equipe',
    'imoveis', 'integracoes', 'leads', 'metricas', 'notificacoes', 'octo-chat', 'recrutamento', 'relatorios'], 1],
  ['imob9', 'corretor', null, 11],
  ['imob9', 'corretor', ['chat', 'estudo-mercado', 'imoveis', 'leads', 'metricas', 'notificacoes', 'octo-chat'], 28],
  ['imob9', 'corretor', ['agentes-ia', 'central-leads', 'chat', 'estudo-mercado', 'gestao-equipe', 'imoveis',
    'integracoes', 'leads', 'metricas', 'notificacoes', 'octo-chat', 'recrutamento', 'relatorios'], 1],
  ['imob9', 'team_leader', ['chat', 'estudo-mercado', 'imoveis', 'leads', 'metricas', 'notificacoes', 'octo-chat'], 2],
];

describe('a carga inicial não muda a tela de ninguém', () => {
  it.each(ARRANJOS)('%s · %s · %i pessoa(s)', (casa, role, salvas, _pessoas) => {
    const atual = hoje(casa, role, salvas);
    const excecoes = excecoesQuePreservam(atual, PACOTE[casa][CARGO_DO_PAPEL[role]]);

    expect(depois(casa, role, excecoes)).toEqual(atual);
  });

  /*
   * O total, para a conta bater com o banco. Se um arranjo sumir daqui porque
   * alguém editou a lista sem recontar, este caso acusa.
   */
  it('os arranjos somados são as 103 pessoas das três casas medidas', () => {
    expect(ARRANJOS.reduce((s, [, , , n]) => s + n, 0)).toBe(103);
  });
});

describe('a conversão é honesta sobre o que ela faz', () => {
  it('quem já bate com o pacote do cargo não ganha exceção nenhuma', () => {
    const pacote = ['leads', 'imoveis'];
    expect(excecoesQuePreservam(['leads', 'imoveis'] as SidebarPermission[], pacote)).toEqual([]);
  });

  /*
   * As duas direções importam. Só `concede: true` seria a metade fácil — e
   * deixaria a pessoa GANHANDO tudo o que o cargo dá a mais, calada. É o
   * acidente mais provável desta fatia: o gestor promove alguém para Corretor
   * e a pessoa ganha abas que ninguém lhe deu.
   */
  it('tira o que o cargo dá a mais, não só acrescenta o que falta', () => {
    const r = excecoesQuePreservam(['leads'] as SidebarPermission[], ['leads', 'imoveis', 'metas']);

    expect(r).toEqual([
      { codigo: 'imoveis', concede: false, motivo: 'Mantido do acesso individual anterior' },
      { codigo: 'metas', concede: false, motivo: 'Mantido do acesso individual anterior' },
    ]);
    expect(aplicarExcecoes(['leads', 'imoveis', 'metas'], r)).toEqual(['leads']);
  });

  it('o cargo do mesmo nível é o mais básico do papel — promover é ato de alguém', () => {
    const cargos = [
      { id: 'a', role: 'corretor', nivel_acesso: 50 },   // Financeiro
      { id: 'b', role: 'corretor', nivel_acesso: 10 },   // Corretor
      { id: 'c', role: 'admin', nivel_acesso: 100 },
    ];
    expect(cargoDoMesmoNivel(cargos, 'corretor')?.id).toBe('b');
    expect(cargoDoMesmoNivel(cargos, 'admin')?.id).toBe('c');
    expect(cargoDoMesmoNivel(cargos, 'team_leader')).toBeNull();
  });
});

/**
 * O defeito que o ensaio da carga pegou, e que eu tinha cometido nos DOIS
 * lugares (no script e no modal) — 26/09.
 *
 * Nem toda permissão tem caixa na tela de Acessos: 'metas', 'financeiro' e
 * 'comunicacao' não têm. Eu calculava as exceções só sobre as que têm,
 * raciocinando "no resto, o cargo manda". Errado: quando a pessoa TEM uma
 * dessas e o cargo NÃO dá, ela se perde — sem erro, sem aviso, sem caixa que
 * o gestor pudesse ter desmarcado.
 *
 * A caixa diz o que o gestor pode MEXER. Não diz o que a pessoa TEM.
 */
describe('permissão sem caixa na tela também é preservada', () => {
  const TEM_CAIXA = ['leads', 'imoveis', 'metricas'];
  const semCaixa = (c: string) => !TEM_CAIXA.includes(c);

  it('o que a pessoa tem e o cargo não dá sobrevive, mesmo sem caixa', () => {
    const atual = ['leads', 'metas', 'financeiro'];   // 'metas' e 'financeiro' sem caixa
    const pacote = ['leads', 'imoveis'];

    const extras = excecoesQuePreservam(atual as SidebarPermission[], pacote);

    expect(aplicarExcecoes(pacote, extras).sort()).toEqual(['financeiro', 'leads', 'metas']);
    expect(extras.filter((e) => semCaixa(e.codigo) && e.concede).map((e) => e.codigo))
      .toEqual(['financeiro', 'metas']);
  });

  /*
   * A forma exata do erro: filtrar as duas listas pelas que têm caixa antes
   * de comparar. Fica sem exceção nenhuma para 'metas', e ela some.
   */
  it('filtrar pelas que têm caixa é o que fazia a permissão sumir', () => {
    const atual = ['leads', 'metas'];
    const pacote = ['leads'];

    const errado = excecoesQuePreservam(
      atual.filter((c) => !semCaixa(c)) as SidebarPermission[],
      pacote.filter((c) => !semCaixa(c)),
    );

    expect(errado).toEqual([]);                                   // nenhuma exceção...
    expect(aplicarExcecoes(pacote, errado)).toEqual(['leads']);   // ...e 'metas' sumiu
  });
});

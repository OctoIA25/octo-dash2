/**
 * `permissoesDeSidebar` — fonte única de "quais áreas este usuário alcança".
 *
 * POR QUE EXISTE. A mesma pergunta era respondida em dois lugares com regras
 * diferentes: `DashboardLayout` (que libera a rota) abria exceção para admin
 * e team_leader, ignorando as permissões salvas do membro; `NovaSidebar` (que
 * desenha o menu) não abria. Medido em produção em 18/09/2026: dois admins
 * reais com a rota /imoveis liberada e nenhum link no menu para ela.
 */
import { describe, it, expect } from 'vitest';
import {
  permissoesDeSidebar,
  SIDEBAR_PERMISSION_ORDER,
  ADMIN_SIDEBAR_PERMISSIONS,
  CORRETOR_SIDEBAR_PERMISSIONS,
  TEAM_LEADER_SIDEBAR_PERMISSIONS,
  type SidebarPermission,
} from '../permissions';

const base = {
  isOwner: false,
  isTenantUser: true,
  systemRole: 'corretor' as string | null,
  tenantAllowedFeatures: undefined as SidebarPermission[] | null | undefined,
  sidebarPermissions: undefined as SidebarPermission[] | null | undefined,
};

describe('permissoesDeSidebar', () => {
  it('o dono da plataforma alcança tudo', () => {
    expect(permissoesDeSidebar({ ...base, isOwner: true })).toEqual(SIDEBAR_PERMISSION_ORDER);
  });

  it('o resultado sai sempre na ordem do menu, não na ordem de quem pediu', () => {
    const r = permissoesDeSidebar({
      ...base,
      tenantAllowedFeatures: ['metas', 'leads', 'imoveis'],
    });
    expect(r).toEqual(['leads', 'imoveis', 'metas']);
  });

  it('corretor: vale a interseção entre o que a imobiliária tem e o que foi salvo para ele', () => {
    const r = permissoesDeSidebar({
      ...base,
      systemRole: 'corretor',
      tenantAllowedFeatures: ['leads', 'imoveis', 'metas'],
      sidebarPermissions: ['leads', 'metas', 'juridico'],
    });
    expect(r).toEqual(['leads', 'metas']);
  });

  it('corretor sem nada salvo recebe tudo o que a imobiliária tem', () => {
    const r = permissoesDeSidebar({
      ...base,
      tenantAllowedFeatures: ['leads', 'imoveis'],
      sidebarPermissions: [],
    });
    expect(r).toEqual(['leads', 'imoveis']);
  });

  describe('o caso que estava divergindo entre a rota e o menu', () => {
    const adminSemImoveisSalvo = {
      ...base,
      systemRole: 'admin',
      tenantAllowedFeatures: ['leads', 'imoveis', 'metas'] as SidebarPermission[],
      sidebarPermissions: ['leads', 'metas'] as SidebarPermission[],
    };

    it('admin NÃO é limitado pelas permissões salvas — alcança imoveis', () => {
      expect(permissoesDeSidebar(adminSemImoveisSalvo)).toContain('imoveis');
    });

    it('team_leader segue a mesma regra do admin', () => {
      const r = permissoesDeSidebar({ ...adminSemImoveisSalvo, systemRole: 'team_leader' });
      expect(r).toContain('imoveis');
    });

    it('o MESMO contexto num corretor perde imoveis — a exceção é só dos dois cargos', () => {
      const r = permissoesDeSidebar({ ...adminSemImoveisSalvo, systemRole: 'corretor' });
      expect(r).not.toContain('imoveis');
    });
  });

  describe('sem o que a imobiliária contratou, vale o padrão do cargo', () => {
    it('admin cai no padrão de admin', () => {
      const r = permissoesDeSidebar({ ...base, systemRole: 'admin', tenantAllowedFeatures: undefined });
      expect(r).toEqual(SIDEBAR_PERMISSION_ORDER.filter((p) => ADMIN_SIDEBAR_PERMISSIONS.includes(p)));
      expect(r).toContain('imoveis');
    });

    it('corretor sem nada salvo cai no padrão de corretor', () => {
      const r = permissoesDeSidebar({ ...base, systemRole: 'corretor', tenantAllowedFeatures: undefined });
      expect(r).toEqual(SIDEBAR_PERMISSION_ORDER.filter((p) => CORRETOR_SIDEBAR_PERMISSIONS.includes(p)));
    });

    it('corretor COM permissões salvas usa as dele, não o padrão', () => {
      const r = permissoesDeSidebar({
        ...base,
        systemRole: 'corretor',
        tenantAllowedFeatures: undefined,
        sidebarPermissions: ['leads'],
      });
      expect(r).toEqual(['leads']);
    });
  });

  it('a visão de dono sem imobiliária escolhida não usa as features de tenant', () => {
    const r = permissoesDeSidebar({
      ...base,
      isTenantUser: false,
      systemRole: 'admin',
      tenantAllowedFeatures: ['leads'],
    });
    // Fora de um tenant, o que vale é o padrão do cargo.
    expect(r).toContain('imoveis');
  });

  it('allowed_features que não é lista não derruba nada — cai no padrão do cargo', () => {
    const r = permissoesDeSidebar({
      ...base,
      systemRole: 'admin',
      tenantAllowedFeatures: null,
    });
    expect(r.length).toBeGreaterThan(0);
  });
});

// ============================================================
// P4.1 — o pacote do cargo
// ============================================================
describe('permissoesDeSidebar com cargo (P4.1)', () => {
  const tenantComTudo: SidebarPermission[] = [
    'leads', 'notificacoes', 'metricas', 'juridico', 'estudo-mercado', 'recrutamento',
    'gestao-equipe', 'imoveis', 'agentes-ia', 'chat', 'integracoes', 'central-leads', 'relatorios',
  ];

  it('sem cargo, nada muda: a regra antiga continua valendo', () => {
    const semCargo = permissoesDeSidebar({
      isOwner: false, isTenantUser: true, systemRole: 'corretor',
      tenantAllowedFeatures: tenantComTudo,
      sidebarPermissions: ['leads', 'imoveis'],
    });
    const comCargoNulo = permissoesDeSidebar({
      isOwner: false, isTenantUser: true, systemRole: 'corretor',
      tenantAllowedFeatures: tenantComTudo,
      sidebarPermissions: ['leads', 'imoveis'],
      permissoesDoCargo: null,
    });
    expect(comCargoNulo).toEqual(semCargo);
    expect(semCargo).toEqual(['leads', 'imoveis']);
  });

  it('com cargo, o cargo manda e as permissões salvas são ignoradas', () => {
    expect(permissoesDeSidebar({
      isOwner: false, isTenantUser: true, systemRole: 'corretor',
      tenantAllowedFeatures: tenantComTudo,
      sidebarPermissions: ['leads', 'imoveis'],
      permissoesDoCargo: ['leads', 'metricas', 'chat'],
    })).toEqual(['leads', 'metricas', 'chat']);
  });

  // Este é o caso que responde a pergunta aberta de 18/09: hoje tirar uma aba
  // de um admin não restringe nada, porque a rota ignora a escolha.
  it('o cargo LIMITA o admin — que hoje ignora o que foi salvo', () => {
    const semCargo = permissoesDeSidebar({
      isOwner: false, isTenantUser: true, systemRole: 'admin',
      tenantAllowedFeatures: tenantComTudo,
      sidebarPermissions: ['leads'],
    });
    expect(semCargo.length).toBe(tenantComTudo.length); // salvas ignoradas

    const comCargo = permissoesDeSidebar({
      isOwner: false, isTenantUser: true, systemRole: 'admin',
      tenantAllowedFeatures: tenantComTudo,
      sidebarPermissions: ['leads'],
      permissoesDoCargo: ['leads', 'gestao-equipe'],
    });
    expect(comCargo).toEqual(['leads', 'gestao-equipe']);
  });

  it('o que a imobiliária não contratou continua fora, mesmo estando no cargo', () => {
    expect(permissoesDeSidebar({
      isOwner: false, isTenantUser: true, systemRole: 'corretor',
      tenantAllowedFeatures: ['leads', 'imoveis'],
      permissoesDoCargo: ['leads', 'imoveis', 'relatorios'],
    })).toEqual(['leads', 'imoveis']);
  });

  it('cargo vazio tira o menu inteiro — e não vira fail-open como a lista vazia', () => {
    expect(permissoesDeSidebar({
      isOwner: false, isTenantUser: true, systemRole: 'corretor',
      tenantAllowedFeatures: tenantComTudo,
      permissoesDoCargo: [],
    })).toEqual([]);
    // Contraste: a lista salva vazia libera tudo (regra antiga, fail-open).
    expect(permissoesDeSidebar({
      isOwner: false, isTenantUser: true, systemRole: 'corretor',
      tenantAllowedFeatures: tenantComTudo,
      sidebarPermissions: [],
    }).length).toBe(tenantComTudo.length);
  });

  it('o dono da plataforma continua vendo tudo, com cargo ou sem', () => {
    expect(permissoesDeSidebar({
      isOwner: true, isTenantUser: false, permissoesDoCargo: ['leads'],
    }).length).toBeGreaterThan(1);
  });
});

/**
 * A seção Financeiro tem chave própria desde 23/09/2026.
 *
 * Antes ela pegava carona em 'relatorios' — que o team_leader tem. O chefe
 * pediu "só Admin e Diretor". O banco já era assim (`financeiro_pode_ver`
 * sempre exigiu admin); quem não era admin via o MENU e abria uma tela VAZIA.
 *
 * Estes testes prendem as duas metades: o team_leader perde o link, o admin
 * mantém, e 'relatorios' deixa de arrastar o Financeiro junto.
 */
describe('permissão financeiro', () => {
  const tenantComOsDois: SidebarPermission[] = ['leads', 'relatorios', 'financeiro'];

  it('admin alcança o Financeiro', () => {
    expect(permissoesDeSidebar({
      isOwner: false, isTenantUser: true, systemRole: 'admin',
      tenantAllowedFeatures: tenantComOsDois,
    })).toContain('financeiro');
  });

  /**
   * ESTE É O CASO QUE A PRIMEIRA VERSÃO NÃO TINHA, E QUE O NAVEGADOR PEGOU.
   *
   * Eu tinha testado só o caminho do CARGO, e ele passava. Mas cargo não
   * existe em produção: o caminho real é team_leader SEM cargo, e nesse ramo
   * admin e team_leader recebem tudo o que a imobiliária contratou — de modo
   * que o team_leader herdava a chave nova junto. Logado de verdade como
   * team_leader, o menu FINANCEIRO continuava na tela.
   *
   * Regra para quem escrever o próximo: teste o caminho que está NO AR, não o
   * que está no repositório.
   */
  it('team_leader SEM cargo não alcança o Financeiro — é o caminho que está em produção', () => {
    const semCargo = permissoesDeSidebar({
      isOwner: false, isTenantUser: true, systemRole: 'team_leader',
      tenantAllowedFeatures: tenantComOsDois,
    });
    expect(semCargo).not.toContain('financeiro');
    expect(semCargo).toContain('relatorios');
  });

  it('corretor sem nada salvo também não alcança, mesmo com a imobiliária tendo contratado', () => {
    // A lista salva vazia é fail-open: devolve tudo do tenant. Sem o corte por
    // papel, o Financeiro entraria aí também.
    expect(permissoesDeSidebar({
      isOwner: false, isTenantUser: true, systemRole: 'corretor',
      tenantAllowedFeatures: tenantComOsDois,
      sidebarPermissions: [],
    })).not.toContain('financeiro');
  });

  it('team_leader com cargo de líder também não alcança', () => {
    const comCargoDeLider = permissoesDeSidebar({
      isOwner: false, isTenantUser: true, systemRole: 'team_leader',
      tenantAllowedFeatures: tenantComOsDois,
      permissoesDoCargo: TEAM_LEADER_SIDEBAR_PERMISSIONS,
    });
    expect(comCargoDeLider).not.toContain('financeiro');
    expect(comCargoDeLider).toContain('relatorios');
  });

  it('o padrão do papel separa os dois: admin tem, team_leader e corretor não', () => {
    expect(ADMIN_SIDEBAR_PERMISSIONS).toContain('financeiro');
    expect(TEAM_LEADER_SIDEBAR_PERMISSIONS).not.toContain('financeiro');
    expect(CORRETOR_SIDEBAR_PERMISSIONS).not.toContain('financeiro');
  });

  it('um cargo pode conceder o Financeiro a quem não é admin — é assim que "Diretor" existe', () => {
    expect(permissoesDeSidebar({
      isOwner: false, isTenantUser: true, systemRole: 'corretor',
      tenantAllowedFeatures: tenantComOsDois,
      permissoesDoCargo: ['leads', 'financeiro'],
    })).toEqual(['leads', 'financeiro']);
  });

  it('a imobiliária que não contratou Financeiro não o vê, nem para o admin', () => {
    expect(permissoesDeSidebar({
      isOwner: false, isTenantUser: true, systemRole: 'admin',
      tenantAllowedFeatures: ['leads', 'relatorios'],
    })).not.toContain('financeiro');
  });

  it('a chave está na ordem do menu — fora dela, seria filtrada e sumiria de todos', () => {
    expect(SIDEBAR_PERMISSION_ORDER).toContain('financeiro');
  });
});

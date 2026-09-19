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

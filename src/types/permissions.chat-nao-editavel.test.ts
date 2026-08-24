import { describe, it, expect } from 'vitest';
import {
  comPermissoesNaoEditaveis,
  SIDEBAR_PERMISSIONS_EDITAVEIS,
  CORRETOR_SIDEBAR_PERMISSIONS,
  type SidebarPermission,
} from './permissions';

// O modal de Equipe reconstrói sidebar_permissions a partir dos seus checkboxes.
// Toda aba sem checkbox era apagada a cada salvamento — foi assim que 'chat'
// (WhatsApp) sumiu de 88 membros. Hoje 'chat' TEM checkbox (editável); as abas
// sem checkbox (metas, comunicacao, octo-chat) seguem o padrão do cargo.
describe('comPermissoesNaoEditaveis', () => {
  const salvasSemMetas = CORRETOR_SIDEBAR_PERMISSIONS.filter((p) => p !== 'octo-chat');

  it('devolve as abas sem checkbox que o cargo tem (octo-chat; metas só a partir de team_leader)', () => {
    expect(SIDEBAR_PERMISSIONS_EDITAVEIS).not.toContain('metas');
    expect(comPermissoesNaoEditaveis(salvasSemMetas, 'corretor')).toContain('octo-chat');
    expect(comPermissoesNaoEditaveis(salvasSemMetas, 'corretor')).not.toContain('metas');
    expect(comPermissoesNaoEditaveis(salvasSemMetas, 'team_leader')).toContain('metas');
  });

  it('não inventa aba que o cargo não tem (comunicacao é só admin/owner)', () => {
    expect(comPermissoesNaoEditaveis(salvasSemMetas, 'corretor')).not.toContain('comunicacao');
    expect(comPermissoesNaoEditaveis([], 'admin')).toContain('comunicacao');
  });

  it('chat é editável: o admin consegue revogar o WhatsApp de um membro', () => {
    expect(SIDEBAR_PERMISSIONS_EDITAVEIS).toContain('chat');
    const semChat = CORRETOR_SIDEBAR_PERMISSIONS.filter((p) => p !== 'chat');
    expect(comPermissoesNaoEditaveis(semChat, 'corretor')).not.toContain('chat');
  });

  it('respeita a revogação das abas que TÊM checkbox', () => {
    const semJuridico = salvasSemMetas.filter((p) => p !== 'juridico');
    expect(SIDEBAR_PERMISSIONS_EDITAVEIS).toContain('juridico');
    expect(comPermissoesNaoEditaveis(semJuridico, 'corretor')).not.toContain('juridico');
  });

  it('não duplica', () => {
    const r = comPermissoesNaoEditaveis(['metas', 'metas'] as SidebarPermission[], 'corretor');
    expect(r.filter((p) => p === 'metas')).toHaveLength(1);
  });
});

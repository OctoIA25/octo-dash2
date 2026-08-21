import { describe, it, expect } from 'vitest';
import {
  comPermissoesNaoEditaveis,
  SIDEBAR_PERMISSIONS_EDITAVEIS,
  CORRETOR_SIDEBAR_PERMISSIONS,
  type SidebarPermission,
} from './permissions';

// O modal de Equipe reconstrói sidebar_permissions a partir dos seus checkboxes.
// 'chat' (WhatsApp) nunca teve checkbox, então todo salvamento o apagava — foi
// assim que 88 membros ficaram sem a aba.
describe('comPermissoesNaoEditaveis', () => {
  const salvasSemChat = CORRETOR_SIDEBAR_PERMISSIONS.filter((p) => p !== 'chat');

  it('devolve chat ao corretor cuja lista salva veio sem ele', () => {
    expect(comPermissoesNaoEditaveis(salvasSemChat, 'corretor')).toContain('chat');
  });

  it('não inventa aba que o cargo não tem (comunicacao é só admin/owner)', () => {
    expect(comPermissoesNaoEditaveis(salvasSemChat, 'corretor')).not.toContain('comunicacao');
    expect(comPermissoesNaoEditaveis([], 'admin')).toContain('comunicacao');
  });

  it('respeita a revogação das abas que TÊM checkbox', () => {
    const semJuridico = salvasSemChat.filter((p) => p !== 'juridico');
    expect(SIDEBAR_PERMISSIONS_EDITAVEIS).toContain('juridico');
    expect(comPermissoesNaoEditaveis(semJuridico, 'corretor')).not.toContain('juridico');
  });

  it('não duplica', () => {
    const r = comPermissoesNaoEditaveis(['chat', 'chat'] as SidebarPermission[], 'corretor');
    expect(r.filter((p) => p === 'chat')).toHaveLength(1);
  });
});

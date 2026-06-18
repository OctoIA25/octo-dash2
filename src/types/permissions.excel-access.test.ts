import { describe, it, expect } from 'vitest';
import {
  CORRETOR_SIDEBAR_PERMISSIONS,
  TEAM_LEADER_SIDEBAR_PERMISSIONS,
  ADMIN_SIDEBAR_PERMISSIONS,
  OWNER_SIDEBAR_PERMISSIONS,
} from './permissions';

// C4: excel_imports expõe receita de TODOS os corretores (dado financeiro). O acesso
// é restrito a admin/team_leader/owner — tanto no RLS quanto no menu (sidebar).
describe('permissão de sidebar: excel (dado financeiro)', () => {
  it('corretor NÃO tem acesso ao menu excel por padrão', () => {
    expect(CORRETOR_SIDEBAR_PERMISSIONS).not.toContain('excel');
  });

  it('admin, team_leader e owner mantêm acesso ao menu excel', () => {
    expect(TEAM_LEADER_SIDEBAR_PERMISSIONS).toContain('excel');
    expect(ADMIN_SIDEBAR_PERMISSIONS).toContain('excel');
    expect(OWNER_SIDEBAR_PERMISSIONS).toContain('excel');
  });
});

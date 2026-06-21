import { describe, expect, it } from 'vitest';
import { computeCanManageKpis } from '../useKpiAdmin';

// `canManage` usa os sinais derivados do AuthContext: isGestao (gestor do tenant,
// = admin/team_leader mapeados p/ 'gestao') e isOwner (owner da plataforma).
// O corretor NÃO é gestão. (O user.role do AuthContext é colapsado em
// 'gestao'|'corretor', por isso usamos isGestao, não o papel granular.)
describe('computeCanManageKpis', () => {
  it('gestor do tenant (isGestao) pode', () => {
    expect(computeCanManageKpis({ isGestao: true, isOwner: false })).toBe(true);
  });
  it('owner da plataforma (isOwner) pode, mesmo sem isGestao', () => {
    expect(computeCanManageKpis({ isGestao: false, isOwner: true })).toBe(true);
  });
  it('corretor (nem gestão nem owner) NÃO pode', () => {
    expect(computeCanManageKpis({ isGestao: false, isOwner: false })).toBe(false);
  });
  it('sem sinais → não pode', () => {
    expect(computeCanManageKpis({})).toBe(false);
  });
});

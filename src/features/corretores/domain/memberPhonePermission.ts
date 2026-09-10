/**
 * Quem pode alterar o número de WhatsApp de um membro (tenant_memberships →
 * permissions.whatsapp_phones):
 *
 *   - o próprio membro;
 *   - admin/owner do tenant;
 *   - o gestor da equipe do membro — líder primário (leader_user_id) ou um dos
 *     gestores da equipe (teams.leader_user_ids).
 *
 * Espelho da RPC set_member_whatsapp_phones (20260910_set_member_whatsapp_phones.sql),
 * que é quem de fato autoriza. Aqui é só UX: não oferecer um campo que o banco
 * vai recusar.
 */

export interface MembroAlvo {
  user_id: string;
  leader_user_id?: string | null;
  team_id?: string | null;
}

export interface EquipeGerida {
  id: string;
  leader_user_ids: string[];
}

export function podeAlterarTelefoneDe(params: {
  alvo: MembroAlvo | null | undefined;
  usuarioId: string | null | undefined;
  isTenantAdmin: boolean;
  minhaRole: string | null | undefined;
  equipes: EquipeGerida[];
}): boolean {
  const { alvo, usuarioId, isTenantAdmin, minhaRole, equipes } = params;
  if (!alvo || !usuarioId) return false;
  if (isTenantAdmin) return true;
  if (alvo.user_id === usuarioId) return true;
  if (minhaRole !== 'team_leader') return false;
  return (
    alvo.leader_user_id === usuarioId ||
    equipes.some((t) => t.id === alvo.team_id && t.leader_user_ids.includes(usuarioId))
  );
}

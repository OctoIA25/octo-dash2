/**
 * Quem pode editar o cadastro de um imóvel.
 *
 * A RLS de `imoveis_locais` é FOR ALL para qualquer membro do tenant — este
 * gate é de UI. Regras:
 *   - diretoria (owner) e administrador: qualquer imóvel;
 *   - gestor (team_leader): imóveis da própria equipe — captados/criados por
 *     ele ou por um corretor cujo `leader_user_id` aponta pra ele. O elo de
 *     equipe (`equipeUserIds`/`equipeEmails`) é montado pelo chamador e já
 *     inclui o próprio gestor;
 *   - corretor: só os próprios (captador por e-mail, `captador_id` ou
 *     `criado_por`).
 *
 * O captador é comparado por e-mail (elo vindo do catálogo XML) e por
 * `captador_id` (atribuição manual, só owner/admin define); `criado_por` é o
 * corretor que cadastrou o registro local.
 */

const ROLES_EDIT_TOTAL = ['owner', 'admin'];

export interface PodeEditarImovelParams {
  /** O imóvel tem registro em `imoveis_locais` (só esses são editáveis). */
  temRegistroLocal: boolean;
  isPlatformOwner?: boolean;
  systemRole?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  /** `corretor_email` do imóvel — captador resolvido pelo catálogo. */
  captadorEmail?: string | null;
  /** `imoveis_locais.captador_id` — atribuição manual (owner/admin). */
  captadorId?: string | null;
  /** `imoveis_locais.criado_por` */
  criadoPor?: string | null;
  /** user_ids da equipe do gestor, incluindo ele mesmo. Só usado p/ team_leader. */
  equipeUserIds?: string[] | null;
  /** e-mails da equipe do gestor, incluindo ele mesmo. Só usado p/ team_leader. */
  equipeEmails?: string[] | null;
}

const norm = (s?: string | null): string => String(s || '').toLowerCase();

export function podeEditarImovel({
  temRegistroLocal,
  isPlatformOwner,
  systemRole,
  userId,
  userEmail,
  captadorEmail,
  captadorId,
  criadoPor,
  equipeUserIds,
  equipeEmails,
}: PodeEditarImovelParams): boolean {
  if (!temRegistroLocal) return false;
  if (isPlatformOwner) return true;

  const role = norm(systemRole);
  if (ROLES_EDIT_TOTAL.includes(role)) return true;

  // Conjunto de "donos" cujos imóveis este usuário pode editar. Gestor com
  // equipe carregada usa a equipe; qualquer outro caso cai no próprio usuário.
  const usaEquipe = role === 'team_leader';
  const emailsPermitidos = usaEquipe && equipeEmails?.length ? equipeEmails : userEmail ? [userEmail] : [];
  const idsPermitidos = usaEquipe && equipeUserIds?.length ? equipeUserIds : userId ? [userId] : [];

  const emailsSet = new Set(emailsPermitidos.map(norm).filter(Boolean));
  const idsSet = new Set(idsPermitidos.filter(Boolean));

  // Comparações só valem com os dois lados preenchidos: '' nunca casa no Set.
  if (captadorEmail && emailsSet.has(norm(captadorEmail))) return true;
  if (captadorId && idsSet.has(captadorId)) return true;
  if (criadoPor && idsSet.has(criadoPor)) return true;
  return false;
}

/**
 * Quem pode editar o cadastro de um imóvel.
 *
 * A RLS de `imoveis_locais` é FOR ALL para qualquer membro do tenant — este
 * gate é de UI. Regra: diretoria (owner), administrador, o captador
 * (comparado por e-mail, único elo disponível no catálogo) ou o corretor que
 * cadastrou o imóvel (`criado_por`).
 */

const ROLES_EDIT = ['owner', 'admin'];

export interface PodeEditarImovelParams {
  /** O imóvel tem registro em `imoveis_locais` (só esses são editáveis). */
  temRegistroLocal: boolean;
  isPlatformOwner?: boolean;
  systemRole?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  /** `corretor_email` do imóvel — captador resolvido pelo catálogo. */
  captadorEmail?: string | null;
  /** `imoveis_locais.criado_por` */
  criadoPor?: string | null;
}

export function podeEditarImovel({
  temRegistroLocal,
  isPlatformOwner,
  systemRole,
  userId,
  userEmail,
  captadorEmail,
  criadoPor,
}: PodeEditarImovelParams): boolean {
  if (!temRegistroLocal) return false;
  if (isPlatformOwner) return true;
  if (ROLES_EDIT.includes(String(systemRole || '').toLowerCase())) return true;

  // Comparações só valem com os dois lados preenchidos: null === null casaria.
  if (userEmail && captadorEmail && userEmail.toLowerCase() === captadorEmail.toLowerCase()) {
    return true;
  }
  return Boolean(userId && criadoPor && userId === criadoPor);
}

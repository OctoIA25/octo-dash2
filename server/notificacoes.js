/**
 * Notificação in-app do sininho, uma vez só por chave.
 *
 * POR QUE EXISTE
 * O par "quem avisar" + "não avisar de novo" nasceu em server/recrutamento/jobs.js
 * e passou a ser preciso também na entrada de lead de portal (anúncio que não bate
 * com imóvel nenhum). Duas cópias de uma regra de destinatário divergem — foi o
 * que já custou caro neste repo com os dois normalizadores do ZAP. Uma casa só.
 *
 * LANÇA em erro de banco, de propósito: quem chama decide o que isso significa.
 * Job de recrutamento deixa subir (o agendador registra a falha); entrada de lead
 * engole, porque aviso não pode custar um lead.
 */

/** Admin/owner do tenant — quem resolve pendência de cadastro e de integração. */
export async function destinatariosAdmin(supabase, tenantId) {
  const { data, error } = await supabase
    .from('tenant_memberships')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .in('role', ['admin', 'owner']);
  if (error) throw error;
  return (data || []).map((m) => m.user_id).filter(Boolean);
}

/**
 * Avisa os admins do tenant, no máximo uma vez por `chave`.
 *
 * A chave vive em `metadata` e é o que impede um job de 5 minutos (ou 28 leads do
 * mesmo anúncio) de virarem 28 sinos. Devolve `true` se notificou agora.
 */
export async function notificarUmaVez(supabase, {
  tenantId, chave, titulo, corpo, tipo = 'warning', linkType = null, linkId = null, extras = {},
}) {
  if (!tenantId || !chave) return false;

  const { data: jaExiste, error: erroBusca } = await supabase
    .from('notifications')
    .select('id')
    .eq('tenant_id', tenantId)
    .contains('metadata', { chave })
    .limit(1);
  if (erroBusca) throw erroBusca;
  if (jaExiste && jaExiste.length > 0) return false;

  const destinos = await destinatariosAdmin(supabase, tenantId);
  if (destinos.length === 0) return false;

  const { error } = await supabase.from('notifications').insert(
    destinos.map((userId) => ({
      tenant_id: tenantId,
      user_id: userId,
      title: titulo,
      body: corpo,
      type: tipo,
      link_type: linkType,
      link_id: linkId,
      metadata: { chave, ...extras },
    })),
  );
  if (error) throw error;
  return true;
}

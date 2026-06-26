/**
 * Guards de template compartilhados entre a rota HTTP do Disparador e o worker
 * de campanhas agendadas. Extraídos de routes.js para que a MESMA implementação
 * seja importável por ambos os caminhos (HTTP e scheduler), sem duplicação.
 */

/**
 * Valida que o template existe, é do tenant e está approved.
 * Retorna {ok, body, name, variables}|{ok:false,error}. O `name` é o nome do
 * template aprovado na Meta — usado no dispatch para enviar via ESSE template.
 * `variables` é a lista de variáveis posicionais do template (p/ validação do
 * mapeamento por lead); ausente → [].
 */
export async function assertTemplateUsable(supabase, tenantId, templateId) {
  if (!templateId) return { ok: false, error: 'template_required' };
  const { data, error } = await supabase
    .from('communication_templates').select('approval_status, body, name, variables').eq('id', templateId).eq('tenant_id', tenantId).maybeSingle();
  if (error) return { ok: false, error: 'lookup_failed' };
  if (!data) return { ok: false, error: 'template_not_found' };
  if (data.approval_status !== 'approved') return { ok: false, error: 'template_not_approved' };
  return { ok: true, body: data.body, name: data.name, variables: data.variables || [] };
}

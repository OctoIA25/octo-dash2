/**
 * A configuração POR FORMULÁRIO (P2.7).
 *
 * Até aqui a captação da Meta era toda-ou-nada por imobiliária: ou a
 * integração estava ligada e TODO formulário entrava, ou estava desligada e
 * nenhum entrava. Em produção, um único formulário responde por 119 dos 125
 * leads — desligar a integração para conter os outros dois custaria os 119.
 *
 * O QUE "DESLIGAR A CAPTAÇÃO" FAZ, E O QUE NÃO FAZ
 * Não descarta o lead: ele entra, marcado como NÃO CAPTADO, e não é
 * distribuído. Jogar fora um lead que já foi pago seria transformar desperdício
 * de mídia em desperdício de lead — e ninguém perceberia até o fim do mês.
 *
 * Puro de propósito: a leitura do banco fica em quem chama.
 */

/** O que vale para um formulário que ninguém configurou ainda. */
export const PADRAO = { captacao_ativa: true, lia_atende: true };

/**
 * A configuração efetiva de um formulário.
 *
 * FALHA ABERTA: linha ausente, leitura com erro ou valor estranho caem no
 * padrão "capta e a LIA atende". O contrário — falhar fechado — faria uma
 * consulta com erro parar de captar lead pago em silêncio, que é exatamente o
 * problema que este item existe para acabar.
 */
export function configDoFormulario(linha) {
  if (!linha || typeof linha !== 'object') return { ...PADRAO };
  return {
    captacao_ativa: linha.captacao_ativa !== false,
    lia_atende: linha.lia_atende !== false,
  };
}

/**
 * Carimba o payload do lead com o que a configuração dizia AGORA.
 *
 * Vai dentro de `raw_data.meta` porque é de lá que o gatilho do banco promove
 * para coluna — um lugar só, e todo escritor de lead da Meta ganha isso de
 * graça. Gravado no LEAD, e não lido do formulário depois: a configuração muda,
 * e ler depois reescreveria o passado.
 */
export function carimbarConfig(payload, config) {
  const cfg = configDoFormulario(config);
  const meta = { ...(payload?.raw_data?.meta ?? {}), ...cfg };
  return { ...payload, raw_data: { ...(payload?.raw_data ?? {}), meta } };
}

/** Lê a linha do formulário. Erro devolve null, e o chamador cai no padrão. */
export async function lerConfigDoFormulario(supabase, tenantId, formId, logger = null) {
  if (!tenantId || !formId) return null;
  try {
    const { data, error } = await supabase
      .from('meta_formularios')
      .select('captacao_ativa, lia_atende')
      .eq('tenant_id', tenantId)
      .eq('form_id', formId)
      .maybeSingle();
    if (error) {
      logger?.warn?.(`[meta-leadgen] config do formulário ${formId} não lida: ${error.message}`);
      return null;
    }
    return data ?? null;
  } catch (e) {
    logger?.warn?.(`[meta-leadgen] config do formulário ${formId} não lida: ${e?.message ?? e}`);
    return null;
  }
}

/**
 * Garante que o formulário exista na tabela.
 *
 * O webhook é a primeira notícia que a Dash tem de um formulário novo — a
 * sincronização com a Meta pode não ter rodado ainda. Sem isto, o formulário só
 * apareceria na tela depois da próxima sincronização, e o gestor não teria como
 * desligá-lo no dia em que ele começou a gastar.
 */
export async function garantirFormulario(supabase, tenantId, formId, pageId, logger = null) {
  if (!tenantId || !formId) return;
  // Envolvido em try/catch, e não só checando `error`: registrar o formulário é
  // conveniência de tela. Falhar aqui — banco fora do ar, coluna faltando num
  // deploy pela metade — NÃO pode derrubar o processamento de um lead que já
  // foi pago. Mesma "falha aberta" do enriquecimento por código.
  try {
    const { error } = await supabase
      .from('meta_formularios')
      .upsert(
        { tenant_id: tenantId, form_id: formId, page_id: pageId ?? null, updated_at: new Date().toISOString() },
        { onConflict: 'tenant_id,form_id', ignoreDuplicates: true },
      );
    if (error) logger?.warn?.(`[meta-leadgen] formulário ${formId} não registrado: ${error.message}`);
  } catch (e) {
    logger?.warn?.(`[meta-leadgen] formulário ${formId} não registrado: ${e?.message ?? e}`);
  }
}

/**
 * Foto do membro no Storage, não dentro de `tenant_memberships.permissions`.
 *
 * POR QUE
 * A foto era gravada como data-URI em `permissions.photo`. Medido em 14/set/2026
 * na Lótus: 17 membros, 6,2 MB de `permissions` — 13 KB de dados e o resto foto.
 * Toda tela que lista membros (get_tenant_members, 11 chamadores, 3 usam foto)
 * baixava os 6 MB, e sob carga a leitura estourava o statement timeout (57014).
 *
 * Agora `permissions.photo` guarda o LINK público. Quem lê não muda: o valor já
 * era usado como `src` de <img>, e link funciona igual a data-URI.
 *
 * Bucket `membros-fotos` (público, como `condominios-fotos`); escrita só na pasta
 * do tenant, por admin/gestão ou owner — a mesma regra do UPDATE em
 * tenant_memberships (migration 20260914_fotos_membros_no_storage).
 */
import { supabase } from '@/lib/supabaseClient';
import { isDataUrl, parseDataUrl } from '@/lib/uploadImoveisFotos';

export const MEMBROS_FOTOS_BUCKET = 'membros-fotos';

const novoId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Devolve o valor a gravar em `permissions.photo`:
 * - vazio → null;
 * - link (já migrado) → o mesmo link, sem reenviar;
 * - data-URI (foto recém-escolhida, ou antiga ainda não migrada) → envia e devolve o link.
 *
 * Erro no envio LANÇA: gravar o data-URI de volta em silêncio traria o problema
 * de volta. Quem chama avisa o usuário e não salva.
 */
export async function garantirFotoNoStorage(tenantId: string, foto: string | null | undefined): Promise<string | null> {
  const valor = String(foto ?? '').trim();
  if (!valor) return null;
  if (!isDataUrl(valor)) return valor;

  const imagem = parseDataUrl(valor);
  if (!imagem) throw new Error('A foto escolhida não é uma imagem válida');

  const path = `${tenantId}/${novoId()}.${imagem.ext}`;
  const { error } = await supabase.storage
    .from(MEMBROS_FOTOS_BUCKET)
    .upload(path, imagem.blob, { contentType: imagem.blob.type, upsert: false });
  if (error) {
    console.error('[memberPhotoService] envio da foto falhou:', error.message);
    throw new Error(`Não foi possível enviar a foto: ${error.message}`);
  }

  return supabase.storage.from(MEMBROS_FOTOS_BUCKET).getPublicUrl(path).data.publicUrl;
}

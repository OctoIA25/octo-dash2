/**
 * Regra do imóvel desatualizado: passou de 3 meses sem nenhum ajuste no cadastro.
 *
 * Derivada na leitura, não persistida — é função pura do relógio, então não
 * precisa de coluna, cron ou job noturno para "virar" desatualizada sozinha.
 *
 * A fonte do timestamp é `imoveis_locais.updated_at`, mantido pelo trigger
 * `update_imoveis_locais_updated_at` (migration 20260817). Imóvel que só existe
 * no XML do Kenlo não tem registro local e, portanto, não tem como ser avaliado.
 */

/** 3 meses ≈ 90 dias. Valor único lido pelo badge e pelo filtro do catálogo. */
export const DIAS_SEM_AJUSTE_DESATUALIZADO = 90;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export function isDesatualizado(
  updatedAt: string | null | undefined,
  agora: Date = new Date(),
): boolean {
  if (!updatedAt) return false;
  const ts = new Date(updatedAt).getTime();
  if (Number.isNaN(ts)) return false;
  return agora.getTime() - ts > DIAS_SEM_AJUSTE_DESATUALIZADO * MS_POR_DIA;
}

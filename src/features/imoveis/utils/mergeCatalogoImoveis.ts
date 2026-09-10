/**
 * União das duas fontes do catálogo: XML do tenant + cadastro em `imoveis_locais`.
 *
 * A regra vivia dentro do useMemo da ImoveisPage, então só a aba Imóveis
 * enxergava o catálogo completo. As telas de lead liam o `kenloService`
 * (snapshot estático de outra base) e um imóvel cadastrado localmente aparecia
 * como "não encontrado no catálogo". Extraído para ser a fonte única das duas.
 *
 * Precedência (a mesma de sempre):
 * - o XML é a base do registro que existe nas duas fontes;
 * - fotos do cadastro local vencem as do XML quando o corretor subiu as suas;
 * - `captador_id` e `updated_at` são do cadastro local — o XML não os tem;
 * - imóvel só local entra no fim da lista.
 */

import type { Imovel } from '@/features/imoveis/services/kenloService';
import { convertLocalToImovel, type ImovelLocalConvertivel } from './convertLocalToImovel';

/**
 * Códigos chegam com caixa e espaços variados (lead digitado, portal, XML), daí
 * a normalização. A versão anterior comparava sem `trim` de um dos lados, o que
 * deixava passar duplicata com espaço sobrando.
 */
const normalizarCodigo = (referencia?: string | null): string =>
  (referencia ?? '').trim().toUpperCase();

export const mergeCatalogoImoveis = (
  imoveisXml: Imovel[],
  imoveisLocais: ImovelLocalConvertivel[],
): Imovel[] => {
  const locaisConvertidos = imoveisLocais.map(convertLocalToImovel);

  const localPorCodigo = new Map<string, Imovel>();
  for (const local of locaisConvertidos) {
    const codigo = normalizarCodigo(local.referencia);
    if (codigo) localPorCodigo.set(codigo, local);
  }

  const codigosXml = new Set<string>();
  for (const imovel of imoveisXml) {
    const codigo = normalizarCodigo(imovel.referencia);
    if (codigo) codigosXml.add(codigo);
  }

  const baseComDadosLocais = imoveisXml.map((imovel) => {
    const local = localPorCodigo.get(normalizarCodigo(imovel.referencia));
    if (!local) return imovel;
    return {
      ...imovel,
      ...(local.fotos.length > 0 ? { fotos: local.fotos } : {}),
      captador_id: local.captador_id,
      // O ajuste acontece no cadastro local, mesmo quando o imóvel também vem
      // do XML — sem isso o duplicado nunca seria avaliado como desatualizado.
      updated_at: local.updated_at,
    };
  });

  const locaisSemDuplicata = locaisConvertidos.filter(
    (local) => !codigosXml.has(normalizarCodigo(local.referencia)),
  );

  return [...baseComDadosLocais, ...locaisSemDuplicata];
};

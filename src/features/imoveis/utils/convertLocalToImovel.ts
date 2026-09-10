/**
 * Conversão do registro de `imoveis_locais` para o formato `Imovel` do catálogo.
 *
 * Vivia duplicada em ImoveisPage e MeusImoveisTab. As duas cópias divergiram:
 * a do MeusImoveisTab não propagava `captador_id` (só não virou bug visível
 * porque a lista de lá recebe `allImoveis` já resolvido pela página). Qualquer
 * campo novo repetiria a divergência — daí a fonte única.
 */

import type { Imovel } from '@/features/imoveis/services/kenloService';
import { normalizeFotos, type FotoInput } from '@/components/imoveis/fotos-helpers';

/**
 * Só os campos lidos na conversão. As duas telas declaram seu próprio
 * `ImovelLocal` com colunas a mais (created_at, aprovado_por, ...) — tipagem
 * estrutural aceita ambos sem obrigá-las a compartilhar a interface inteira.
 */
/**
 * Colunas `numeric` do Postgres chegam como string pelo PostgREST
 * ("790000", "250"). Quem consome espera número — daí o tipo aceitar os dois e
 * a conversão normalizar.
 */
type Numerico = number | string | null | undefined;

export interface ImovelLocalConvertivel {
  codigo_imovel: string;
  titulo: string | null;
  tipo: string | null;
  tipo_simplificado: string | null;
  finalidade: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  valor_venda: Numerico;
  valor_locacao: Numerico;
  valor_iptu: Numerico;
  valor_condominio: Numerico;
  area_total: Numerico;
  area_util: Numerico;
  quartos: Numerico;
  suites: Numerico;
  vagas: Numerico;
  banheiros: Numerico;
  /** Existe no cadastro local; o conversor antigo fixava 0 e jogava fora. */
  salas?: Numerico;
  descricao: string | null;
  fotos: FotoInput[];
  captador_id?: string | null;
  /** Último ajuste no cadastro — base da regra de imóvel desatualizado. */
  updated_at?: string | null;
}

/** "790.000" nunca aparece se o valor seguir string: toLocaleString não formata texto. */
const paraNumero = (valor: Numerico): number => {
  const n = typeof valor === 'string' ? Number(valor) : valor;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};

export const convertLocalToImovel = (local: ImovelLocalConvertivel): Imovel => ({
  referencia: local.codigo_imovel,
  titulo: local.titulo || `${local.tipo || 'Imóvel'} - ${local.bairro || 'Sem bairro'}`,
  tipo: local.tipo || 'Outro',
  tipoSimplificado: (local.tipo_simplificado as Imovel['tipoSimplificado']) || 'outro',
  bairro: local.bairro || 'Sem bairro',
  cidade: local.cidade || 'Sem cidade',
  estado: local.estado || 'SP',
  valor_venda: paraNumero(local.valor_venda),
  valor_locacao: paraNumero(local.valor_locacao),
  finalidade: (local.finalidade as Imovel['finalidade']) || 'venda',
  valor_iptu: paraNumero(local.valor_iptu),
  valor_condominio: paraNumero(local.valor_condominio),
  area_total: paraNumero(local.area_total),
  area_util: paraNumero(local.area_util),
  quartos: paraNumero(local.quartos),
  suites: paraNumero(local.suites),
  garagem: paraNumero(local.vagas),
  banheiro: paraNumero(local.banheiros),
  salas: paraNumero(local.salas),
  descricao: local.descricao || '',
  captador_id: local.captador_id ?? null,
  updated_at: local.updated_at ?? null,
  fotos: Array.isArray(local.fotos) ? normalizeFotos(local.fotos).map((foto) => foto.url) : [],
  videos: [],
  area_comum: [],
  area_privativa: [],
});

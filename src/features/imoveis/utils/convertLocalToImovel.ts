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
export interface ImovelLocalConvertivel {
  codigo_imovel: string;
  titulo: string | null;
  tipo: string | null;
  tipo_simplificado: string | null;
  finalidade: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  valor_venda: number;
  valor_locacao: number;
  valor_iptu: number;
  valor_condominio: number;
  area_total: number;
  area_util: number;
  quartos: number;
  suites: number;
  vagas: number;
  banheiros: number;
  descricao: string | null;
  fotos: FotoInput[];
  captador_id?: string | null;
}

export const convertLocalToImovel = (local: ImovelLocalConvertivel): Imovel => ({
  referencia: local.codigo_imovel,
  titulo: local.titulo || `${local.tipo || 'Imóvel'} - ${local.bairro || 'Sem bairro'}`,
  tipo: local.tipo || 'Outro',
  tipoSimplificado: (local.tipo_simplificado as Imovel['tipoSimplificado']) || 'outro',
  bairro: local.bairro || 'Sem bairro',
  cidade: local.cidade || 'Sem cidade',
  estado: local.estado || 'SP',
  valor_venda: local.valor_venda || 0,
  valor_locacao: local.valor_locacao || 0,
  finalidade: (local.finalidade as Imovel['finalidade']) || 'venda',
  valor_iptu: local.valor_iptu || 0,
  valor_condominio: local.valor_condominio || 0,
  area_total: local.area_total || 0,
  area_util: local.area_util || 0,
  quartos: local.quartos || 0,
  suites: local.suites || 0,
  garagem: local.vagas || 0,
  banheiro: local.banheiros || 0,
  salas: 0,
  descricao: local.descricao || '',
  captador_id: local.captador_id ?? null,
  fotos: Array.isArray(local.fotos) ? normalizeFotos(local.fotos).map((foto) => foto.url) : [],
  videos: [],
  area_comum: [],
  area_privativa: [],
});

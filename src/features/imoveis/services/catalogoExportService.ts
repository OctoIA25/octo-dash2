/**
 * Exportação do catálogo filtrado para planilha (.xlsx).
 *
 * A planilha é gerada no SERVIDOR (`POST /api/v1/imoveis/exportar`) porque é lá
 * que o papel é conferido: esconder o botão do corretor não basta, a RLS de
 * `imoveis_locais` deixa qualquer membro ler o tenant. O navegador manda só a
 * lista já filtrada (mesma da tela) com os campos da whitelist abaixo — nada de
 * proprietário, fotos ou descrição.
 */
import { authedFetch } from '@/features/comunicacao/services/authedFetch';
import { downloadBlob } from '@/features/relatorios/export/generators/excelReportGenerator';
import type { Imovel } from './kenloService';

const CAMPOS_EXPORTAVEIS = [
  'referencia', 'titulo', 'tipo', 'finalidade', 'cidade', 'bairro', 'estado', 'endereco', 'numero', 'cep',
  'nome_condominio', 'valor_venda', 'valor_locacao', 'valor_condominio', 'valor_iptu', 'area_util',
  'area_total', 'quartos', 'suites', 'banheiro', 'garagem', 'corretor_nome', 'destaque', 'super_destaque',
  'status_aprovacao', 'updated_at',
] as const;

export type ImovelExportavel = Pick<Imovel, (typeof CAMPOS_EXPORTAVEIS)[number]>;

export const paraExportavel = (imovel: Imovel): ImovelExportavel =>
  Object.fromEntries(CAMPOS_EXPORTAVEIS.map((campo) => [campo, imovel[campo]])) as ImovelExportavel;

const MENSAGEM_POR_STATUS: Record<number, string> = {
  401: 'Sessão expirada. Entre novamente para exportar.',
  403: 'Sem permissão para exportar',
  413: 'Imóveis demais para uma planilha. Refine os filtros e tente de novo.',
};

const nomePadrao = () => `imoveis-${new Date().toISOString().slice(0, 10)}.xlsx`;

/** Gera a planilha no servidor e baixa. Lança Error com mensagem pronta para o toast. */
export const exportarCatalogo = async (tenantId: string, imoveis: Imovel[]): Promise<void> => {
  const res = await authedFetch('/api/v1/imoveis/exportar', {
    method: 'POST',
    body: JSON.stringify({ tenantId, imoveis: imoveis.map(paraExportavel) }),
  });

  if (!res.ok) {
    throw new Error(MENSAGEM_POR_STATUS[res.status] ?? 'Não foi possível exportar os imóveis.');
  }

  // O servidor dá o nome (data dele); o fallback cobre proxy que tire o header.
  const nome = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? nomePadrao();
  downloadBlob(await res.arrayBuffer(), nome);
};

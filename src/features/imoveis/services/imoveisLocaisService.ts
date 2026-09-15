/**
 * Leitura de `imoveis_locais` pelo navegador e o que o usuário pode fazer com ela.
 *
 * Desde 20260915_imovel_captador_edita_proprietario_protegido.sql o papel
 * `authenticated` não tem SELECT em `proprietario_*`: `select('*')` e qualquer
 * filtro por essas colunas dão 42501. O proprietário só chega pela RPC
 * `imoveis_proprietarios` (proprietarioService), que devolve apenas as linhas
 * autorizadas. Quem edita também é decidido no banco (`imovel_autoriza`); a UI
 * só reflete a resposta de `imoveis_editaveis`.
 */
import { supabase } from '@/lib/supabaseClient';

/**
 * Todas as colunas de `imoveis_locais` que o navegador pode ler — ou seja, todas
 * menos as do proprietário. Coluna nova na tabela entra aqui E ganha
 * `GRANT SELECT (coluna) ... TO authenticated` na migration, senão a lista dá 42501.
 */
export const COLUNAS_IMOVEL_LOCAL = [
  'id', 'tenant_id', 'codigo_imovel', 'titulo', 'tipo', 'tipo_simplificado', 'finalidade',
  'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado', 'cep',
  'area_total', 'area_util', 'quartos', 'suites', 'banheiros', 'vagas', 'salas',
  'valor_venda', 'valor_locacao', 'valor_condominio', 'valor_iptu', 'descricao', 'fotos',
  'criado_por', 'created_at', 'updated_at', 'status_aprovacao', 'aprovado_por', 'aprovado_em',
  'motivo_aprovacao', 'metragem_m2', 'condominio_id', 'exclusivo', 'area_comum', 'area_privativa',
  'aceita_troca', 'link_video', 'tour_virtual', 'publicar_site', 'destaque', 'super_destaque',
  'captador_id', 'obs_interna', 'chave_status', 'chave_local', 'chave_com', 'chave_retirada_em',
  'captador_2_id', 'sem_marca_dagua', 'midia_origem', 'envio_atividades', 'pais', 'area_terreno',
  'placa_local', 'tipo_comissao', 'captou_pretensao', 'condicao_comercial', 'codigo_iptu',
  'numero_matricula', 'codigo_eletricidade', 'codigo_agua', 'titulos_direitos',
  'aprovado_ambiental', 'projeto_aprovado', 'obs_documentacao', 'atualizado_por',
].join(', ');

/**
 * Códigos dos imóveis locais que o usuário logado pode editar (e excluir) no
 * tenant. Em erro devolve vazio: a UI esconde "Editar" em vez de oferecer uma
 * ação que o banco recusaria.
 */
export const buscarCodigosEditaveis = async (tenantId: string): Promise<Set<string>> => {
  if (!tenantId || tenantId === 'owner') return new Set();

  const { data, error } = await supabase.rpc('imoveis_editaveis', { p_tenant_id: tenantId });
  if (error) {
    console.error('[imoveisLocais] erro ao buscar imóveis editáveis:', error.code, error.message);
    return new Set();
  }
  return new Set(((data as string[] | null) ?? []).map((codigo) => codigo.toUpperCase()));
};

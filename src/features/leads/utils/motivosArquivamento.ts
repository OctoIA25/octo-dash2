/**
 * Motivos de arquivamento do lead — uma lista só, usada pelo seletor e pela
 * gravação. Antes os motivos estavam escritos duas vezes no mesmo arquivo (a
 * lista da tela e o mapa de rótulos), o que só sobrevive enquanto ninguém mexe
 * em um dos dois.
 *
 * O que vai para o banco (`leads.archive_reason`) é o RÓTULO, não o código:
 * "Lead duplicado — cliente já tem ficha". Os relatórios agrupam por esse
 * texto, então renomear um rótulo já usado separa o histórico em dois grupos.
 *
 * Lista definida com o usuário em 21/09/2026. Os motivos antigos "Fora do
 * perfil" e "Erro / cadastro incorreto" continuam no fim porque já existem
 * leads arquivados com eles; os outros quatro antigos saíram porque a lista
 * nova diz a mesma coisa com outras palavras (ver README da mudança no commit).
 */

export interface MotivoArquivamento {
  value: string;
  label: string;
}

/** Código do motivo livre: o texto do corretor vira o motivo. */
export const MOTIVO_OUTROS = 'outros';

export const MOTIVOS_ARQUIVAMENTO: MotivoArquivamento[] = [
  { value: 'preco_alto', label: 'Preço alto' },
  { value: 'avaliacao_baixa_na_troca', label: 'Avaliação baixa na troca' },
  { value: 'problema_no_atendimento', label: 'Problema no atendimento' },
  { value: 'cliente_nao_respondeu', label: 'Cliente não respondeu' },
  { value: MOTIVO_OUTROS, label: 'Outros' },
  { value: 'nao_consegui_contatar', label: 'Não consegui contatar' },
  { value: 'falta_de_produto', label: 'Falta de produto' },
  { value: 'ficha_recusada', label: 'Ficha recusada' },
  { value: 'lead_duplicado', label: 'Lead duplicado' },
  { value: 'fechou_negocio_em_outro_lugar', label: 'Fechou negócio em outro lugar' },
  { value: 'compra_adiada', label: 'Compra adiada' },
  { value: 'falta_de_interacao_do_usuario', label: 'Falta de interação do usuário' },
  { value: 'produto_nao_agradou', label: 'Produto não agradou' },
  { value: 'apenas_pesquisando', label: 'Apenas pesquisando' },
  { value: 'ddd_distante', label: 'DDD distante' },
  { value: 'ja_foi_vendido', label: 'Já foi vendido' },
  { value: 'proposta_do_cliente_com_valor_baixo', label: 'Proposta do cliente com valor baixo' },
  { value: 'produto_na_troca_nao_interessa', label: 'Produto na troca não interessa para a loja' },
  { value: 'contato_invalido', label: 'Contato inválido' },
  { value: 'proposta_inviavel', label: 'Proposta inviável' },
  { value: 'faturado', label: 'Faturado' },
  { value: 'alugado', label: 'Alugado' },
  { value: 'localizacao_nao_agradou', label: 'Localização não agradou' },
  { value: 'nao_possui_renda', label: 'Não possui renda' },
  { value: 'prazo_de_entrega', label: 'Prazo de entrega' },
  { value: 'vendedor_pesquisando_produto', label: 'Vendedor pesquisando produto' },
  { value: 'tratada_sem_qualificacao', label: 'Tratada sem qualificação' },
  { value: 'tratada_com_qualificacao', label: 'Tratada com qualificação' },
  { value: 'de_planilha', label: 'De planilha' },
  { value: 'corretor_parceiro', label: 'Corretor Parceiro' },
  // Antigos, mantidos porque já há leads arquivados com estes rótulos.
  { value: 'fora_perfil', label: 'Fora do perfil' },
  { value: 'erro_cadastro', label: 'Erro / cadastro incorreto' },
];

export const rotuloMotivo = (value: string): string | null =>
  MOTIVOS_ARQUIVAMENTO.find((m) => m.value === value)?.label ?? null;

/** Texto gravado em archive_reason: "Motivo" ou "Motivo — observação". */
export function montarMotivoFinal(value: string, observacao: string): string {
  const texto = (observacao || '').trim();
  if (value === MOTIVO_OUTROS) return texto || 'Outros';
  const rotulo = rotuloMotivo(value) ?? 'Arquivado';
  return texto ? `${rotulo} — ${texto}` : rotulo;
}

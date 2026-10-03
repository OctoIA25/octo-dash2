/**
 * As abas do Financeiro — uma lista só, lida pela tela e pela lateral.
 *
 * 29/09, pedido do chefe: a lateral deve mostrar as mesmas abas do topo da
 * tela, e só mostrava "A receber". Duas listas escritas à mão divergiriam na
 * primeira aba nova; por isso a lateral monta os atalhos DAQUI.
 */
export type AbaDoFinanceiro = 'receber' | 'pagar' | 'fluxo' | 'projecao' | 'dre' | 'conciliacao' | 'notas';

export const ABAS_DO_FINANCEIRO: ReadonlyArray<{ id: AbaDoFinanceiro; rotulo: string }> = [
  { id: 'receber', rotulo: 'A receber' },
  { id: 'pagar', rotulo: 'A pagar' },
  { id: 'fluxo', rotulo: 'Fluxo de caixa' },
  { id: 'projecao', rotulo: 'Projeção' },
  { id: 'dre', rotulo: 'DRE gerencial' },
  { id: 'conciliacao', rotulo: 'Conciliação' },
  { id: 'notas', rotulo: 'Notas a emitir' },
];

/** O endereço de cada aba: `?tab=` é o que a lateral usa para marcar a ativa. */
export const rotaDaAba = (id: AbaDoFinanceiro) => `/financeiro?tab=${id}`;

/** A aba pedida no endereço; qualquer outra coisa (ou nada) abre "A receber". */
export const abaDoEndereco = (tab: string | null): AbaDoFinanceiro =>
  ABAS_DO_FINANCEIRO.find((a) => a.id === tab)?.id ?? 'receber';

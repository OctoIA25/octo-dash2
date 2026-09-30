/**
 * As abas do Marketing — uma lista só, lida pelo cabeçalho e pela lateral.
 *
 * 29/09, pedido do chefe: "tudo que for de marketing tem que tá na aba de
 * marketing e pronto". Até aqui só Demandas morava em /marketing. Campanhas,
 * Anúncios e Formulários da Meta abriam DENTRO de Relatórios — o cabeçalho
 * dizia "Relatórios", a lateral acendia Marketing e Relatórios juntos, e
 * clicar em Relatórios caía na visão de Marketing, que era a aba padrão.
 *
 * As telas continuam as mesmas; o que muda é o endereço e quem as lista.
 */
export type AbaDoMarketing = 'demandas' | 'geral' | 'campanhas' | 'anuncios' | 'site' | 'formularios';

export const ABAS_DO_MARKETING: ReadonlyArray<{ id: AbaDoMarketing; rotulo: string }> = [
  { id: 'demandas', rotulo: 'Demandas' },
  { id: 'geral', rotulo: 'Visão geral' },
  { id: 'campanhas', rotulo: 'Campanhas e ROI' },
  { id: 'anuncios', rotulo: 'Anúncios' },
  { id: 'site', rotulo: 'Site' },
  { id: 'formularios', rotulo: 'Formulários da Meta' },
];

export const rotaDoMarketing = (id: AbaDoMarketing) => `/marketing/${id}`;

/**
 * Para onde vai um endereço antigo de Relatórios que era de marketing —
 * `?tab=marketing&view=…` e `?tab=formularios-meta`. `null` quando o endereço
 * não é de marketing e Relatórios deve abrir normalmente.
 *
 * Existe porque link salvo e favorito não se atualizam sozinhos: sem isto,
 * quem tinha "Campanhas" nos favoritos cairia na aba Leads sem entender por quê.
 */
export function destinoDoEnderecoAntigo(search: string): string | null {
  const params = new URLSearchParams(search);
  const tab = params.get('tab');
  if (tab === 'formularios-meta') return rotaDoMarketing('formularios');
  if (tab !== 'marketing') return null;
  const view = params.get('view');
  // As visões que moravam em ?view=; sem view (ou uma desconhecida) era a Geral.
  const visao = (['campanhas', 'anuncios', 'site'] as const).find((v) => v === view);
  return rotaDoMarketing(visao ?? 'geral');
}

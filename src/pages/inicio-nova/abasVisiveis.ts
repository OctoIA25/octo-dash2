/**
 * Quais abas do cabeçalho aparecem para quem está olhando.
 *
 * ISTO É SÓ UX. A trava de verdade está no banco: quem escreve em
 * `tenant_bolsao_config` são admin, líder e dono da plataforma (RLS), e as
 * rotas de servidor têm as suas próprias checagens. Esconder a aba não protege
 * nada — evita oferecer uma porta que não abre, que é como o corretor chegava
 * em "Apenas administradores podem editar as configurações do bolsão".
 *
 * Por isso a regra mora aqui, fora do componente: é uma decisão de permissão,
 * e permissão que ninguém consegue testar é permissão que volta a furar.
 */

export interface QuemOlha {
  /** Fila por equipe ligada no tenant — sem ela a aba "Equipes" não existe para ninguém. */
  teamQueueEnabled: boolean;
  /** Admin ou líder de equipe (ver AuthContext: quem não é corretor vira 'gestao'). */
  isGestao: boolean;
  /** Dono da plataforma. */
  isOwner: boolean;
  /**
   * `permissions.sub_permissions` da pessoa — as caixas de sub-aba do modal de
   * Equipe. Até 25/09/2026 NINGUÉM lia esta chave: o modal gravava, e as abas
   * apareciam do mesmo jeito. Em produção eram 45 pessoas com uma sub-aba
   * desmarcada vendo a aba assim mesmo.
   */
  subPermissoes?: Record<string, boolean> | null;
}

/**
 * O código do catálogo (tabela `permissoes`) que governa cada aba, por rota.
 *
 * SÓ AS ROTAS LISTADAS AQUI são governadas por permissão — e, nelas, TODA aba
 * tem código. Meia lista é pior que lista nenhuma: a aba sem código fica
 * visível ao lado das que somem, e quem configurou jura que a tela ignorou a
 * marcação. O teste deste arquivo cobra essa totalidade.
 *
 * Os nomes não batem por acaso: o catálogo diz `leads-tarefas` e a aba se
 * chama `tarefas-semana`. É por isso que um `includes(aba.id)` ingênuo nunca
 * funcionaria, e é a razão de o mapa existir em vez de um prefixo.
 */
const PERMISSAO_DA_ABA: Record<string, Readonly<Record<string, string>>> = {
  '/leads': {
    funil: 'leads-funil',
    okrs: 'leads-okrs',
    kpis: 'leads-kpis',
    pdi: 'leads-pdi',
    'tarefas-semana': 'leads-tarefas',
    agenda: 'leads-agenda',
    'painel-comercial': 'leads-painel',
  },
  /*
   * Gestão de Equipe não tem barra de abas (PageTabs traz `tabs: []`): quem
   * navega são os atalhos do card de cada membro, por `?tab=`. O mapa vale
   * mesmo assim — `AdminDashboard` chama `podeVerAba` antes de montar a aba.
   *
   * `okrs` e `pdi` NÃO estão aqui de propósito: as duas só redirecionam para
   * /okrs e /pdi, que já são governadas por `leads-okrs` e `leads-pdi`. Dois
   * códigos para uma tela é a duplicata que a casa combinou não ter.
   */
  '/gestao-equipe': {
    tarefas: 'gestao-tarefas',
    equipes: 'gestao-equipes',
    'acessos-permissoes': 'gestao-acessos',
  },
};

/**
 * A pessoa pode ver esta aba?
 *
 * AUSENTE É LIBERADO, e só `false` esconde. Em produção 78 dos 127 membros não
 * têm `sub_permissions` gravado — tratar ausência como negada apagaria a barra
 * de abas da maioria da casa no primeiro deploy. É também o que a caixa do
 * modal promete: ela nasce marcada (`?? true`), então `false` só existe onde
 * alguém desmarcou de propósito.
 */
export function podeVerAba(
  basePath: string,
  abaId: string,
  quem: { isOwner?: boolean; subPermissoes?: Record<string, boolean> | null },
): boolean {
  if (quem.isOwner) return true;
  const codigo = PERMISSAO_DA_ABA[basePath]?.[abaId];
  if (!codigo) return true;
  return quem.subPermissoes?.[codigo] !== false;
}

/** Só para o teste cobrar que toda aba de rota governada tem código. */
export const ROTAS_GOVERNADAS_POR_PERMISSAO = PERMISSAO_DA_ABA;

/**
 * Abas que só a gestão enxerga, por rota. O painel por trás de cada uma já
 * recusa quem não é da gestão — a lista aqui evita o clique que termina em aviso.
 */
const SO_GESTAO: Record<string, readonly string[]> = {
  // O simulador responde "de quem seria este lead" para a equipe inteira, e a
  // Distribuição mostra o que a roleta fez com o lead de todo mundo: são
  // ferramentas de gestão, como as Configurações ao lado.
  '/bolsao': ['configuracoes', 'equipes', 'simulador', 'distribuicao'],
  // Plantão e Agenda junto da Telemetria: a fila mostra o nome de cada lead e
  // a resposta de cada colega da imobiliária, e aprovar para a base é ato de
  // gestão. Abrir para o corretor depois é uma linha; vazar não tem volta.
  '/agentes-ia': ['telemetria', 'plantao', 'agenda'],
  '/imoveis': ['anuncios-sem-imovel'],
  // Arquivados: decidido pelo chefe em 25/09 — "só gestor, diretor e adm podem
  // ver". Esconder a aba é só metade: `MeusLeadsPage` também recusa o
  // `?sub=arquivados` digitado à mão, porque menu que esconde uma tela que a
  // rota entrega é o defeito que o P0.1 veio desfazer.
  '/meus-leads': ['arquivados'],
};

export function abasVisiveis<T extends { id: string }>(
  basePath: string,
  abas: T[],
  quem: QuemOlha,
): T[] {
  const ehGestao = quem.isGestao || quem.isOwner;
  const restritas = SO_GESTAO[basePath] ?? [];

  return abas.filter((aba) => {
    if (restritas.includes(aba.id) && !ehGestao) return false;
    if (basePath === '/bolsao' && aba.id === 'equipes' && !quem.teamQueueEnabled) return false;
    if (!podeVerAba(basePath, aba.id, quem)) return false;
    return true;
  });
}

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
}

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
    return true;
  });
}

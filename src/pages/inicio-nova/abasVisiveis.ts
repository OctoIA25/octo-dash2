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
  '/bolsao': ['configuracoes', 'equipes'],
  '/agentes-ia': ['telemetria'],
  '/imoveis': ['anuncios-sem-imovel'],
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

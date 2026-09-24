/**
 * Quem está atendendo os leads agora — e o que os cronômetros desta tela
 * realmente fazem.
 *
 * NASCEU DE UMA PERGUNTA DO CHEFE (23/09), que é a melhor prova de que a tela
 * não contava a história inteira:
 *
 *   "se eu colocar 120 min para imóveis exclusivos, ela daria mais tempo para
 *    estes imóveis? a verificação não é em tempo real?"
 *
 * Medido em produção em 24/09, na Lotus: o interruptor diz **Bolsão ativado**,
 * e mesmo assim nenhum cronômetro corre. O motivo está em OUTRO campo —
 * `auto_distribution_enabled = false` —, que é a decisão de que **a Lia
 * distribui**. Enquanto ele estiver desligado, a rotina que expira lead PULA a
 * imobiliária inteira, e os minutos configurados aqui não fazem nada.
 *
 * Duas chaves, três estados possíveis, e a tela mostrava um só. É a mesma
 * doença das permissões que ninguém lê: um botão que promete e não cumpre é
 * pior que um botão ausente, porque quem o ajusta vai embora achando que
 * resolveu.
 */

export type QuemAtende = 'lia' | 'octo' | 'ninguem';

export interface EstadoDaDistribuicao {
  quem: QuemAtende;
  titulo: string;
  explicacao: string;
  /** Os minutos desta tela estão valendo agora? */
  cronometrosValem: boolean;
}

export function quemAtendeAgora(config: {
  autoDistributionEnabled?: boolean;
  bolsaoEnabled?: boolean;
} | null | undefined): EstadoDaDistribuicao {
  // `?? true` nos dois: é o padrão do banco, e uma config que ainda não
  // carregou não pode desenhar "a Lia está atendendo" por engano.
  const automatica = config?.autoDistributionEnabled ?? true;
  const bolsao = config?.bolsaoEnabled ?? true;

  // A DISTRIBUIÇÃO EXTERNA MANDA, e por isso vem primeiro.
  //
  // Com ela desligada não importa o que o interruptor do bolsão diz: a rotina
  // do Octo nem olha para esta imobiliária. Checar o bolsão antes faria a tela
  // dizer "bolsão ativado, leads expiram conforme a regra" — que é exatamente
  // o que a Lotus mostra hoje, e é falso.
  if (!automatica) {
    return {
      quem: 'lia',
      titulo: 'A Lia está atendendo os leads',
      explicacao:
        'A distribuição automática está desligada: quem recebe e encaminha cada lead é a Lia, não o Octo. ' +
        'Os tempos configurados abaixo NÃO estão valendo — nenhum cronômetro corre e nenhum lead é movido para o bolsão por tempo. ' +
        'Para que estes minutos voltem a ter efeito, é preciso religar a distribuição automática.',
      cronometrosValem: false,
    };
  }

  if (!bolsao) {
    return {
      quem: 'ninguem',
      titulo: 'Bolsão desativado',
      explicacao:
        'Nenhum lead vai para o bolsão. Os cronômetros estão pausados e ninguém é substituído por falta de resposta — ' +
        'o lead fica com quem recebeu, pelo tempo que for.',
      cronometrosValem: false,
    };
  }

  return {
    quem: 'octo',
    titulo: 'O Octo está redistribuindo',
    explicacao:
      'O lead sem resposta dentro do tempo configurado abaixo é passado adiante, e a verificação roda a cada minuto. ' +
      'Esgotada a fila, ele cai no bolsão para quem quiser pegar.',
    cronometrosValem: true,
  };
}

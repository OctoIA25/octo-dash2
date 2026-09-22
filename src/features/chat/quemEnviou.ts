/**
 * Quem falou nesta mensagem (F.1).
 *
 * Módulo puro: a bolha desenha, isto decide. Sem React e sem rede, porque a
 * mesma pergunta aparece na bolha, no contador do cabeçalho e em qualquer
 * relatório que venha depois.
 *
 * O QUE FOI MEDIDO, e por que existe o estado "não registrado"
 * Em produção, em 22/09/2026, das 16.401 mensagens enviadas: 14 têm autor,
 * 14.242 têm a marca antiga da LIA em `metadata.role`, e 2.159 não têm nada.
 * A marca da LIA **parou em 27/08** — as 2.107 enviadas depois disso são
 * anônimas.
 *
 * A tentação é dizer "enviada e sem autor é a LIA, na prática é sempre ela".
 * Não faço isso: é conversa com cliente, e a tela passaria a afirmar autoria
 * que ninguém registrou. "Não registrado" é feio e é verdade.
 */

export type Autor = 'lia' | 'corretor' | 'disparo' | 'nao_registrado';

/** Só o que veio de fora; o resto de `WhatsappMessage` não interessa aqui. */
export interface MensagemParaAutoria {
  direction: string;
  enviado_por?: string | null;
  sent_by_user_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function quemEnviou(m: MensagemParaAutoria): Autor | null {
  // Recebida é do cliente, e `direction` já diz isso. Etiquetar seria repetir
  // a informação que a própria posição da bolha dá.
  if (m.direction !== 'outbound') return null;

  if (m.enviado_por === 'lia' || m.enviado_por === 'corretor' || m.enviado_por === 'disparo') {
    return m.enviado_por;
  }

  // Reserva para a marca antiga. A migration preenche a coluna no histórico,
  // mas entre o deploy e a LIA passar a gravar `enviado_por` ainda chegam
  // mensagens novas só com `metadata.role` — e essas são dela.
  if (m.metadata && (m.metadata as Record<string, unknown>).role === 'assistant') return 'lia';

  // `sent_by_user_id` sozinho basta: só a rota de envio da Dash o preenche.
  if (m.sent_by_user_id) return 'corretor';

  return 'nao_registrado';
}

export const ROTULO_DO_AUTOR: Record<Autor, string> = {
  lia: 'LIA',
  corretor: 'Corretor',
  disparo: 'Disparo',
  nao_registrado: 'Autor não registrado',
};

/** Quantas mensagens desta conversa cada um mandou. Para o cabeçalho. */
export function contarPorAutor(mensagens: MensagemParaAutoria[]): Record<Autor, number> {
  const conta: Record<Autor, number> = { lia: 0, corretor: 0, disparo: 0, nao_registrado: 0 };
  for (const m of mensagens) {
    const autor = quemEnviou(m);
    if (autor) conta[autor] += 1;
  }
  return conta;
}

/**
 * A LIA está atendendo esta conversa?
 *
 * Não existe interruptor da LIA por número — conferido em 22/09: a tabela
 * `whatsapp_config`, que teria `is_active`, está VAZIA em produção. Então este
 * chip não afirma "a LIA está ligada": afirma o que dá para saber, que é se
 * ela falou aqui e se alguém assumiu a conversa.
 */
export function liaEstaAtendendo(
  mensagens: MensagemParaAutoria[],
  conversaAssumida: boolean,
): boolean {
  if (conversaAssumida) return false;
  return mensagens.some((m) => quemEnviou(m) === 'lia');
}

/**
 * Qualidade de respostas (Fatia C). NÃO é taxa de alucinação automática — é a
 * consolidação de AVALIAÇÕES humanas em três estados:
 *   confirmed_correct / confirmed_wrong / not_evaluated.
 *
 * Regra de ouro: não-avaliado NUNCA conta como correto. A taxa de incorretas é
 * sobre as AVALIADAS (não sobre o total), senão o não-avaliado dilui a taxa e
 * finge qualidade que não foi medida. Sem avaliações → wrong_rate null.
 *
 * Função pura: o endpoint conta execuções elegíveis e avaliações (correct/incorrect).
 */
export function computeQualityMetrics({ evaluable, correct, incorrect }) {
  const evaluated = correct + incorrect;
  const notEvaluated = Math.max(0, evaluable - evaluated); // clamp: dado inconsistente não vira negativo
  return {
    confirmed_correct: correct,
    confirmed_wrong: incorrect,
    not_evaluated: notEvaluated,
    evaluated,
    wrong_rate: evaluated > 0 ? incorrect / evaluated : null,
  };
}

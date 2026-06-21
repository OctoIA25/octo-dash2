/**
 * Lógica PURA de navegação do wizard (sem React) — testável isoladamente.
 *
 * A "análise" (ler planilha → metadados → sugestão) NÃO é um passo de tela: roda
 * no upload e seu resultado aparece no `preview`. Por isso os passos visíveis são
 * 4 (upload → preview → mapeamento → importacao), sem um passo "analise" fantasma.
 */
export const WIZARD_STEPS = ['upload', 'preview', 'mapeamento', 'importacao'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export const nextStep = (s: WizardStep): WizardStep =>
  WIZARD_STEPS[Math.min(WIZARD_STEPS.indexOf(s) + 1, WIZARD_STEPS.length - 1)];
export const prevStep = (s: WizardStep): WizardStep =>
  WIZARD_STEPS[Math.max(WIZARD_STEPS.indexOf(s) - 1, 0)];

/** Pode avançar a partir de `s`? Gate de segurança do fluxo. */
export function canAdvance(s: WizardStep, ctx: { hasTable: boolean; hasPlan: boolean }): boolean {
  if (s === 'upload') return ctx.hasTable;          // precisa ter lido a planilha
  if (s === 'mapeamento') return ctx.hasPlan;       // só vai p/ importação com plano (pós-preview)
  return true;
}

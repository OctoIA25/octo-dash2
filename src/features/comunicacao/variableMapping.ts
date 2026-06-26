/** Mapeamento de variáveis posicionais por lead (front). */
export type VarEntry = { type: 'lead_field' | 'fixed'; value: string };
export type VarMapping = Record<string, VarEntry>;

export const LEAD_FIELD_OPTIONS = [
  { value: 'name', label: 'Nome do lead' },
  { value: 'phone', label: 'Telefone' },
  { value: 'assignedAgent', label: 'Corretor' },
];
const LEAD_FIELD_SET = new Set(LEAD_FIELD_OPTIONS.map((o) => o.value));
const LABEL_BY_FIELD: Record<string, string> = Object.fromEntries(LEAD_FIELD_OPTIONS.map((o) => [o.value, o.label]));

function entryValid(e: VarEntry | undefined): boolean {
  if (!e) return false;
  if (e.type === 'fixed') return e.value.trim() !== '';
  return e.type === 'lead_field' && LEAD_FIELD_SET.has(e.value);
}

/** Toda variável do template tem entrada válida? Vazio → true. */
export function isMappingComplete(variables: string[], mapping: VarMapping): boolean {
  return variables.every((v) => entryValid(mapping[v]));
}

/** Rótulo de exemplo de uma variável (para o preview). */
function exampleFor(e: VarEntry | undefined): string {
  if (!e) return '';
  if (e.type === 'fixed') return e.value;
  return `(${LABEL_BY_FIELD[e.value] || e.value})`;
}

/** Params de exemplo na ordem (para o preview). */
export function buildExampleParams(variables: string[], mapping: VarMapping): string[] {
  return variables.map((v) => exampleFor(mapping[v]));
}

/** Substitui {{N}} no body pelos rótulos de exemplo. */
export function renderWithExample(body: string, variables: string[], mapping: VarMapping): string {
  let out = body;
  for (const v of variables) {
    out = out.split(`{{${v}}}`).join(exampleFor(mapping[v]) || `{{${v}}}`);
  }
  return out;
}

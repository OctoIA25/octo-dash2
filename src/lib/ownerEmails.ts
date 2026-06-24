/**
 * 🔐 Fonte única de verdade para os emails de OWNER.
 *
 * IMPORTANTE — fronteira de segurança:
 * Esta verificação roda no FRONTEND e controla apenas o que a UI mostra
 * (navegação, sidebar, impersonation). Ela NÃO é uma fronteira de segurança:
 * o bundle Vite é público e os emails abaixo são visíveis a quem inspecionar
 * o JavaScript. A segurança real dos dados precisa morar no RLS do Supabase.
 * Ver docs/security/SEGURANCA-OWNER-IMPERSONATION.md.
 *
 * Antes deste módulo, o email de owner estava duplicado e hardcoded em 5
 * arquivos, cada um com sua própria comparação. Centralizamos aqui para evitar
 * comportamento inconsistente entre telas ao adicionar/remover um owner.
 */

/** Lista padrão, usada quando VITE_OWNER_EMAILS não está configurada. */
const DEFAULT_OWNER_EMAILS = [
  'octo.inteligenciaimobiliaria@gmail.com',
  'yasminroque@dinamoaceleradora.com.br',
] as const;

/**
 * Normaliza um email para comparação: remove espaços e baixa a caixa.
 * Retorna null se a entrada não for um email minimamente válido (precisa
 * conter "@" e ter conteúdo dos dois lados). Entradas inválidas são
 * descartadas em vez de aceitas — nunca queremos uma string vazia ou lixo
 * entrando na lista de owners.
 */
function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  const atIndex = normalized.indexOf('@');
  // Precisa ter "@" com pelo menos 1 char antes e depois.
  if (atIndex <= 0 || atIndex >= normalized.length - 1) return null;
  return normalized;
}

/**
 * Lê e valida a lista de emails owner.
 *
 * Política de fallback (deliberadamente sem fallback inseguro):
 * - VITE_OWNER_EMAILS ausente/vazia  → usa DEFAULT_OWNER_EMAILS.
 * - VITE_OWNER_EMAILS com itens válidos → SUBSTITUI a default por esses itens.
 * - VITE_OWNER_EMAILS presente mas sem NENHUM item válido após normalização
 *   → cai na default e emite warning. Nunca resultamos em lista vazia
 *     (deixaria o sistema sem owner) nem em "qualquer um é owner".
 */
function resolveOwnerEmails(): ReadonlySet<string> {
  const raw = import.meta.env.VITE_OWNER_EMAILS as string | undefined;

  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = raw
      .split(',')
      .map(normalizeEmail)
      .filter((email): email is string => email !== null);

    if (parsed.length > 0) {
      return Object.freeze(new Set(parsed));
    }

    // Configurada mas inválida: não confiamos no input, voltamos à default.
    console.warn(
      '[ownerEmails] VITE_OWNER_EMAILS definida mas sem emails válidos; ' +
        'usando a lista padrão.'
    );
  }

  return Object.freeze(new Set(DEFAULT_OWNER_EMAILS.map((e) => e.toLowerCase())));
}

const OWNER_EMAILS = resolveOwnerEmails();

/**
 * Retorna true somente se o email informado for um owner conhecido.
 * Seguro contra null/undefined/"" — todos resultam em false.
 */
export function isOwnerEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  if (normalized === null) return false;
  return OWNER_EMAILS.has(normalized);
}

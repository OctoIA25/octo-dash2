/**
 * Normaliza um link digitado por um usuário: apara espaços, assume https quando
 * o protocolo foi omitido e rejeita o que não for um http(s) válido.
 *
 * O link é enviado ao cliente final pela Lia, então só http(s) passa —
 * `javascript:`, `data:` e afins são recusados.
 *
 * Retorna a URL normalizada, `null` para entrada vazia e `undefined` quando é inválida.
 */
export const normalizeSiteUrl = (raw: string): string | null | undefined => {
  const value = raw.trim();
  if (!value) return null;

  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;

  try {
    const url = new URL(withProtocol);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    if (!url.hostname.includes('.')) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
};

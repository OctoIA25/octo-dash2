/**
 * "Tem alteração não salva?" — compara o formulário atual com a base (o que foi
 * carregado ou o último salvamento), campo a campo.
 *
 * Listas (fotos, características) comparam pelo conteúdo: depois de salvar, o
 * formulário recebe um array novo com as URLs das fotos enviadas, e comparar
 * por referência marcaria tudo como alterado de novo. Strings grandes (foto em
 * base64) continuam baratas: o mesmo valor costuma ser a mesma referência.
 */
const iguais = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => iguais(item, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const x = a as Record<string, unknown>;
    const y = b as Record<string, unknown>;
    // União das chaves: `{ id: undefined }` e `{}` contam como iguais.
    return [...new Set([...Object.keys(x), ...Object.keys(y)])].every((k) => iguais(x[k], y[k]));
  }
  return false;
};

export const formularioAlterado = <T extends object>(atual: T, base: T): boolean => !iguais(atual, base);

import type { Imovel } from '../services/kenloService';

/** Minúsculas sem acento: 'São José' e 'sao jose' têm que se encontrar. */
const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Campo de busca do catálogo ("Código, título, bairro ou descrição"): o termo
 * inteiro, como substring, dentro de algum desses campos.
 *
 * A referência é o código que o card exibe — sem ela só o Ctrl+F do navegador
 * achava o imóvel pelo código. Sem acento pelo mesmo motivo: o Ctrl+F ignora.
 *
 * ponytail: normaliza a cada tecla (~4 ms com 650 imóveis de descrição média);
 * pré-computar o texto normalizado junto do merge do catálogo se passar de
 * alguns milhares.
 */
export function imovelCasaBusca(
  imovel: Pick<Imovel, 'referencia' | 'titulo' | 'bairro' | 'descricao'>,
  termo: string,
): boolean {
  const busca = normalizar(termo.trim());
  if (!busca) return true;
  return [imovel.referencia, imovel.titulo, imovel.bairro, imovel.descricao].some(
    (campo) => Boolean(campo) && normalizar(campo).includes(busca),
  );
}

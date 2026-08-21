import type { KanbanLead } from '../services/leadsService';
import { classificacoesDe } from './classificarLead';

/**
 * Termos de BUSCA de cada classificação — não são os rótulos de exibição
 * (`CLASSIFICACAO_ESTILOS`). Quem digita procura "casa pronta" ou "aluguel",
 * não "Pronto"/"Locação", e o rótulo sozinho não casaria com nenhum dos dois.
 *
 * `indefinido` mapeia para vazio DE PROPÓSITO: é a ausência de classificação e
 * vale para a maioria dos leads — jogá-lo no palheiro faria "sem" e "classi..."
 * casarem com quase tudo. Valor desconhecido por este build cai no `?? c` e
 * continua buscável pelo próprio nome (mesma direção fail-open do filtro).
 */
const TERMOS_CLASSIFICACAO: Record<string, string> = {
  lancamento: 'lancamento lancamentos planta',
  pronto: 'pronto pronta prontos imovel pronto usado',
  locacao: 'locacao aluguel alugar alugado',
  indefinido: '',
};

/** Minúsculas sem acento: 'Lançamento' e 'lancamento' têm que se encontrar. */
const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Plural simples só do lado de quem digita ('apartamentos' → 'apartamento').
 * O outro lado sai de graça: a badge 'Apartamentos' contém 'apartamento'.
 * ponytail: nada de stemmer — 'pronta' casa por sinônimo na tabela acima.
 */
const semPlural = (t: string) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t);

/**
 * Casa o termo de busca contra nome, telefone, e-mail, tags e as BADGES do
 * lead — preferências ("Apartamento", "3 quartos", "financiamento") e
 * classificação ("lançamento", "casa pronta", "aluguel") — sem controle novo
 * na barra.
 *
 * Cada palavra digitada é exigida (AND), em qualquer ordem: "apartamento
 * financiamento" acha quem tem as duas badges. Substring dentro de cada
 * palavra, então "apart" ainda acha "Apartamento".
 *
 * `extras` são campos que só existem em uma tela (motivo de arquivamento,
 * corretor responsável) — entram no mesmo palheiro em vez de virar um segundo
 * `includes` solto no chamador.
 *
 * ponytail: sem normalização de máscara de telefone; adicionar se aparecer
 * reclamação de "busquei (11) 98888 e não achou".
 */
export function leadCasaBusca(
  lead: KanbanLead,
  termo: string,
  extras: (string | null | undefined)[] = [],
): boolean {
  const tokens = normalizar(termo).split(/\s+/).filter(Boolean).map(semPlural);
  if (tokens.length === 0) return true;

  const palheiro = normalizar(
    [
      lead.nomedolead,
      lead.lead,
      lead.email,
      ...(lead.tags ?? []),
      ...(lead.preferences ?? []),
      ...classificacoesDe(lead.classification).map((c) => TERMOS_CLASSIFICACAO[c] ?? c),
      ...extras,
    ]
      .filter(Boolean)
      .join(' '),
  );

  return tokens.every((t) => palheiro.includes(t));
}

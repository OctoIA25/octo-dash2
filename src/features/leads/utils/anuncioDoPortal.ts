/**
 * "Este lead veio de um anúncio que ninguém identificou."
 *
 * POR QUE EXISTE
 * O portal devolve o id do anúncio de quem o publicou. Anúncio que saiu do nosso
 * feed VRSync devolve o `codigo_imovel` (AP679); anúncio publicado por fora
 * devolve um id do portal ('I7V1GD') que não é imóvel nenhum. Até 12/set esse id
 * ia para `property_code` e aparecia no card como se fosse código de imóvel — o
 * corretor clicava e caía numa página em branco.
 *
 * Agora o servidor (`semCodigoDoCatalogo`, em server/lancamentoAnuncios.js) não
 * grava o que não é do catálogo, e o lead chega sem código. Daí esta regra: lead
 * de portal SEM código é lead de anúncio não identificado — não é "lead sem
 * imóvel", é "não sabemos qual imóvel é". A diferença importa na tela.
 *
 * NÃO depende da rota de pendências, que é de admin/líder: o corretor precisa
 * ver a mesma verdade que o gestor. Quem tem a rota ganha, além do aviso, o
 * botão de identificar.
 *
 * NÃO USE NO BOLSÃO. Lá o `codigo` é apagado de propósito para o corretor
 * (`ocultarImovelDoBolsao`, senão a fila vira garimpo por empreendimento), e
 * "sem código" deixa de significar "anúncio desconhecido" — acusaria todo lead
 * de portal. O aviso do Bolsão vem da lista do servidor, que sabe a diferença.
 */

/** Espelha FONTES_COM_ANUNCIO de server/zap/anunciosPendentes.js — as origens que carregam id de anúncio. */
const PORTAIS_COM_ANUNCIO = /zap|olx|instagram|facebook/i;

export interface LeadComAnuncio {
  /** `codigo` no Bolsão/Kanban, `property_code`/`codigo_imovel` nas telas do CRM. */
  codigo?: string | null;
  property_code?: string | null;
  codigo_imovel?: string | null;
  /**
   * `portal` no espelho do Bolsão, `source` na tabela `leads`, `origem_lead` no
   * ProcessedLead das telas de gestão. Os três nomes são o mesmo dado — este
   * repo tem três mapeadores de lead, e é aqui que a bagunça para de vazar.
   */
  portal?: string | null;
  source?: string | null;
  origem_lead?: string | null;
}

export function anuncioNaoIdentificado(lead: LeadComAnuncio | null | undefined): boolean {
  if (!lead) return false;
  const codigo = String(lead.codigo ?? lead.property_code ?? lead.codigo_imovel ?? '').trim();
  if (codigo) return false;
  return PORTAIS_COM_ANUNCIO.test(String(lead.portal ?? lead.source ?? lead.origem_lead ?? ''));
}

/**
 * Link público do anúncio no ZAP, para quem vai identificar abrir e ver o imóvel.
 *
 * ZAP e Grupo OLX usam o mesmo `originListingId`, e o site abre o anúncio só
 * pelo id: /imovel/id-{id}/ (conferido no navegador em 14/set/2026 — o slug da
 * URL completa não é obrigatório). O formulário do Meta também tem id numérico,
 * mas não tem página pública, por isso a origem é conferida.
 *
 * O id vem do payload do portal: só dígitos viram URL.
 */
export function linkDoAnuncioNoPortal(portal: string | null | undefined, originListingId: string): string | null {
  if (!/zap|olx/i.test(String(portal ?? ''))) return null;
  const id = String(originListingId ?? '').trim();
  return /^\d+$/.test(id) ? `https://www.zapimoveis.com.br/imovel/id-${id}/` : null;
}

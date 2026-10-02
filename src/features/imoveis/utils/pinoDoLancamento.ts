/**
 * O pino do lançamento sai do endereço do empreendimento, ou do plantão quando
 * ele falta (20261019), mais bairro e cidade. Se esse endereço muda, o pino
 * AUTOMÁTICO ficou velho e volta para a fila de "Localizar"; o posto à mão
 * fica — alguém apontou o lugar.
 */
export interface EnderecoDoLancamento {
  endereco_empreendimento?: string | null;
  endereco_plantao?: string | null;
  bairro?: string | null;
  cidade?: string | null;
}

const chave = (e: EnderecoDoLancamento) =>
  [
    (e.endereco_empreendimento ?? '').trim() || (e.endereco_plantao ?? '').trim(),
    (e.bairro ?? '').trim(),
    (e.cidade ?? '').trim(),
  ].join('|');

export function pinoVoltaParaFila(
  salvo: (EnderecoDoLancamento & { geo_origem?: string | null }) | null | undefined,
  novo: EnderecoDoLancamento,
): boolean {
  if (!salvo || salvo.geo_origem === 'manual') return false;
  return chave(salvo) !== chave(novo);
}

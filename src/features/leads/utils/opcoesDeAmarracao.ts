/**
 * Opções da aba "Anúncios sem imóvel": o que pode ser amarrado a um anúncio.
 *
 * Só lista o que EXISTE — imóveis do cadastro e lançamentos —, porque o servidor
 * recusa qualquer outra coisa (`codigoExisteNoCadastro`). Lançamento aparece pelo
 * nome, que é como a equipe o conhece; o L0NN vai junto. Lançamento ainda sem
 * código é amarrado pelo NOME em maiúsculas, o mesmo formato do de-para do Meta
 * ('ALLEGRATO') e o que o card do lead já sabe casar (lancamentosLookup).
 */

export interface ImovelParaAmarrar {
  codigo_imovel: string | null;
  titulo: string | null;
  bairro: string | null;
}

export interface LancamentoParaAmarrar {
  nome: string | null;
  codigos: string[] | null;
}

export interface OpcaoDeAmarracao {
  value: string;
  label: string;
  sublabel: string;
}

const limpo = (v: string | null | undefined) => String(v ?? '').trim();

export function montarOpcoesDeAmarracao(
  imoveis: ImovelParaAmarrar[],
  lancamentos: LancamentoParaAmarrar[],
): OpcaoDeAmarracao[] {
  const opcoesImoveis = imoveis
    .filter((i) => limpo(i.codigo_imovel))
    .map((i) => {
      const codigo = limpo(i.codigo_imovel).toUpperCase();
      const descricao = limpo(i.titulo) || limpo(i.bairro);
      return {
        value: codigo,
        label: descricao ? `${codigo} — ${descricao}` : codigo,
        sublabel: 'Imóvel do cadastro',
      };
    });

  const opcoesLancamentos = lancamentos
    .filter((l) => limpo(l.nome))
    .flatMap((l) => {
      const nome = limpo(l.nome);
      const codigos = (l.codigos ?? []).map((c) => limpo(c).toUpperCase()).filter(Boolean);
      if (!codigos.length) {
        return [{ value: nome.toUpperCase(), label: nome, sublabel: 'Lançamento sem código' }];
      }
      return codigos.map((codigo) => ({ value: codigo, label: `${nome} — ${codigo}`, sublabel: 'Lançamento' }));
    });

  return [...opcoesImoveis, ...opcoesLancamentos];
}

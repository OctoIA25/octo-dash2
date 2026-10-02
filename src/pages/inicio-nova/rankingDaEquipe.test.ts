import { describe, expect, it } from 'vitest';
import { rankingDaEquipe } from './rankingDaEquipe';

const pessoas = new Map([['fer', 'Fernanda Souza'], ['fab', 'Fábio Gonçalves']]);
const lead = (assigned_agent_id: string | null, etapa_atual = 'Interação', valor_final_venda = 0) =>
  ({ assigned_agent_id, etapa_atual, valor_final_venda, valor_imovel: 0 });

describe('Ranking da Equipe do Início', () => {
  it('a Lia e o lead sem dono não entram', () => {
    const r = rankingDaEquipe([lead('lia'), lead(null), lead('fer')], pessoas);
    expect(r.map((x) => x.name)).toEqual(['Fernanda Souza']);
  });

  it('a mesma pessoa é uma linha só, com o nome do cadastro', () => {
    const r = rankingDaEquipe([
      lead('fer', 'Proposta Assinada', 100), lead('fer', 'Proposta Assinada', 50), lead('fab'),
    ], pessoas);
    expect(r).toEqual([
      { name: 'Fernanda Souza', closings: 2, volume: 150 },
      { name: 'Fábio Gonçalves', closings: 0, volume: 0 },
    ]);
  });
});

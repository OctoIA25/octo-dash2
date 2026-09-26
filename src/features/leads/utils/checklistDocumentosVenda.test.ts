import { describe, expect, it } from 'vitest';
import { CHECKLIST_DOCUMENTOS_VENDA, chaveDocumento } from './checklistDocumentosVenda';

const SNAKE_CASE = /^[a-z0-9]+(_[a-z0-9]+)*$/;

describe('CHECKLIST_DOCUMENTOS_VENDA', () => {
  // O tipo vira a chave do arquivo de cada documento (documentos_cliente.tipo, P4.7).
  it.each(CHECKLIST_DOCUMENTOS_VENDA.map((bloco) => [bloco.titulo, bloco] as const))(
    '%s: todo tipo é snake_case e aparece uma vez só no bloco',
    (_titulo, bloco) => {
      const tipos = bloco.grupos.flatMap((grupo) => grupo.itens.map((item) => item.tipo));

      for (const tipo of tipos) expect(tipo).toMatch(SNAKE_CASE);
      expect(new Set(tipos).size).toBe(tipos.length);
    },
  );

  // O id do bloco entra na chave salva no negócio: repetido, dois blocos marcariam juntos.
  it('id de bloco é snake_case e único', () => {
    const ids = CHECKLIST_DOCUMENTOS_VENDA.map((bloco) => bloco.id);

    for (const id of ids) expect(id).toMatch(SNAKE_CASE);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('o mesmo documento para pessoa física e empresa usa o mesmo tipo', () => {
    const tipoDe = (id: string, label: string) =>
      CHECKLIST_DOCUMENTOS_VENDA.find((bloco) => bloco.id === id)
        ?.grupos.flatMap((grupo) => grupo.itens)
        .find((item) => item.label === label)?.tipo;

    expect(tipoDe('vendedor_pf', 'Certidão da Justiça Federal')).toBe(
      tipoDe('vendedor_pj', 'Certidão da Justiça Federal'),
    );
    expect(tipoDe('vendedor_pf', 'Certidão Negativa de Débitos Federais (Receita Federal)')).toBe(
      tipoDe('vendedor_pj', 'Certidão Negativa de Débitos Federais'),
    );
  });
});

describe('chaveDocumento', () => {
  it('junta bloco e tipo: o mesmo documento de PF e PJ tem chaves diferentes', () => {
    expect(chaveDocumento('vendedor_pf', 'certidao_justica_federal')).toBe('doc:vendedor_pf:certidao_justica_federal');
    expect(chaveDocumento('vendedor_pj', 'certidao_justica_federal')).not.toBe(
      chaveDocumento('vendedor_pf', 'certidao_justica_federal'),
    );
  });
});

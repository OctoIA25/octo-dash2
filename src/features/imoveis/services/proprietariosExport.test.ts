import { describe, expect, it } from 'vitest';
import { blocoImoveis, blocoProprietarios } from './proprietariosExport';
import type { ProprietarioRow } from './proprietarioService';

const imovel = (over: Record<string, unknown> = {}) => ({
  codigo_imovel: 'AP1', titulo: null, tipo: 'Apartamento', finalidade: 'venda',
  bairro: 'Centro', cidade: 'Jundiaí', logradouro: 'Rua A', numero: '10', cep: '13200-000',
  area_total: 80, area_util: 70, quartos: 3, banheiros: 2, vagas: 1,
  valor_venda: 498200, valor_locacao: 0, exclusivo: true, status_aprovacao: 'aprovado',
  created_at: '2026-08-31T00:00:00Z',
  ...over,
});

const dona: ProprietarioRow = {
  chave: 'tel:11999999999',
  nome: 'Debora Brisola',
  telefone: '(11) 99999-9999',
  tel_residencial: null,
  tel_comercial: null,
  email: null,
  total_imoveis: 2,
  imoveis_venda: 2,
  imoveis_locacao: 0,
  exclusivos: 1,
  valor_venda_total: 498200,
  valor_locacao_total: 0,
  bairros: ['Centro'],
  cidades: ['Jundiaí'],
  ultimo_cadastro: '2026-08-31T00:00:00Z',
  imoveis: [imovel(), imovel({ codigo_imovel: 'AP2' })],
};

describe('blocos da exportação de proprietários', () => {
  it('uma linha por pessoa, com as colunas alinhadas ao cabeçalho', () => {
    const b = blocoProprietarios([dona]);
    expect(b.rows).toHaveLength(1);
    expect(b.rows[0]).toHaveLength(b.columns.length);
    expect(b.rows[0][0]).toBe('Debora Brisola');
  });

  it('uma linha por imóvel, repetindo o dono', () => {
    const b = blocoImoveis([dona]);
    expect(b.rows).toHaveLength(2);
    expect(b.rows.every((r) => r.length === b.columns.length)).toBe(true);
    expect(b.rows.map((r) => r[2])).toEqual(['AP1', 'AP2']);
    expect(b.rows[0][0]).toBe('Debora Brisola');
  });

  it('formata moeda no padrão que o gerador converte em número', () => {
    // "R$ 498.200" é o formato que parseCell reconhece: vira 498200 com numFmt
    // de moeda. Um valor cru viraria texto na planilha.
    const b = blocoProprietarios([dona]);
    const valorVenda = b.rows[0][b.columns.indexOf('Valor em venda')];
    expect(valorVenda).toBe('R$ 498.200');
    expect(b.rows[0][b.columns.indexOf('Valor em locação')]).toBe('');
  });
});

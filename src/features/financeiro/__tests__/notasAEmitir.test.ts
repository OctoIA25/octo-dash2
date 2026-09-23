import { describe, it, expect } from 'vitest';
import { mascararCnpj, textoDoPedido, type NotaAEmitir } from '../NotasAEmitir';

/**
 * O `toLocaleString('pt-BR')` separa "R$" do número com espaço NÃO SEPARÁVEL
 * (U+00A0). Comparar com espaço comum falha por um caractere invisível — e a
 * mensagem de erro mostra duas strings idênticas na tela.
 */
const semNbsp = (t: string) => t.replace(/\u00a0/g, ' ');

const nota = (over: Partial<NotaAEmitir> = {}): NotaAEmitir => ({
  venda_id: 'v1',
  data_venda: '2026-09-01',
  empreendimento: 'Residencial A',
  tomador: 'Construtora Com Ltda',
  cnpj: '11222333000181',
  valor: 50000,
  descricao_servico: 'Comissão de intermediação imobiliária — Residencial A — venda de 01/09/2026',
  recebimento_previsto_em: '2026-10-01',
  avisado_em: null,
  pendencias: [],
  ...over,
});

describe('mascararCnpj', () => {
  it('põe a máscara nos 14 dígitos', () => {
    expect(mascararCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });

  it('sem CNPJ não inventa máscara', () => {
    // O banco guarda só dígitos; a máscara é da tela. Mascarar coisa de tamanho
    // errado produziria um CNPJ com cara de válido — e alguém o copiaria.
    expect(mascararCnpj(null)).toBe('—');
    expect(mascararCnpj('')).toBe('—');
    expect(mascararCnpj('112223330001')).toBe('112223330001');
    expect(mascararCnpj('112223330001812')).toBe('112223330001812');
  });
});

describe('textoDoPedido', () => {
  it('leva tomador, CNPJ, valor e serviço', () => {
    const t = semNbsp(textoDoPedido(nota()));
    expect(t).toContain('Tomador: Construtora Com Ltda');
    expect(t).toContain('CNPJ: 11.222.333/0001-81');
    expect(t).toContain('R$ 50.000,00');
    expect(t).toContain('Comissão de intermediação imobiliária');
    expect(t).toContain('Recebimento previsto: 01/10/2026');
  });

  it('sem previsão de recebimento, a linha não aparece vazia', () => {
    const t = textoDoPedido(nota({ recebimento_previsto_em: null }));
    expect(t).not.toContain('Recebimento previsto');
    expect(t).not.toContain('—\n');
  });

  it('a data não escorrega um dia por causa de fuso', () => {
    // `new Date('2026-10-01')` é meia-noite UTC, que em Brasília é dia 30 às
    // 21h. Somar o meio-dia evita o clássico "a data aparece um dia antes".
    expect(textoDoPedido(nota({ recebimento_previsto_em: '2026-10-01' })))
      .toContain('01/10/2026');
    expect(textoDoPedido(nota({ recebimento_previsto_em: '2026-01-01' })))
      .toContain('01/01/2026');
  });

  it('valor nulo vira zero em reais, e não "NaN"', () => {
    expect(semNbsp(textoDoPedido(nota({ valor: null })))).toContain('R$ 0,00');
  });

  it('sem tomador, diz que não tem — não deixa em branco', () => {
    expect(textoDoPedido(nota({ tomador: null }))).toContain('Tomador: —');
  });
});

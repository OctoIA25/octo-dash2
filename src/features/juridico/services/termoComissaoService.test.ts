import { describe, it, expect } from 'vitest';
import { fillTemplate, numeroPorExtenso, valorPorExtenso } from './termoComissaoService';

describe('fillTemplate', () => {
  it('substitui placeholders por valores com escape de XML', () => {
    const xml = '<w:t>{{comprador1_nome}}, CPF {{comprador1_cpf}}</w:t>';
    const result = fillTemplate(xml, { comprador1_nome: 'João & Maria <Ltda>', comprador1_cpf: '123.456.789-00' });
    expect(result).toBe('<w:t>João &amp; Maria &lt;Ltda&gt;, CPF 123.456.789-00</w:t>');
  });

  it('vira lacuna quando o campo está vazio ou ausente', () => {
    const xml = '<w:t>{{corretor2_nome}} – CRECI {{corretor2_creci}}</w:t>';
    const result = fillTemplate(xml, { corretor2_nome: '   ' });
    expect(result).toBe('<w:t>______ – CRECI ______</w:t>');
    expect(result).not.toContain('{{');
  });
});

describe('numeroPorExtenso', () => {
  it.each([
    [0, 'zero'],
    [7, 'sete'],
    [15, 'quinze'],
    [21, 'vinte e um'],
    [100, 'cem'],
    [101, 'cento e um'],
    [350, 'trezentos e cinquenta'],
    [1000, 'mil'],
    [1500, 'mil e quinhentos'],
    [2024, 'dois mil e vinte e quatro'],
    [850000, 'oitocentos e cinquenta mil'],
    [1000000, 'um milhão'],
    [2500000, 'dois milhões e quinhentos mil'],
  ])('%d → %s', (n, esperado) => {
    expect(numeroPorExtenso(n)).toBe(esperado);
  });
});

describe('valorPorExtenso', () => {
  it.each([
    [850000, 'oitocentos e cinquenta mil reais'],
    [1500.5, 'mil e quinhentos reais e cinquenta centavos'],
    [0.01, 'um centavo'],
    [1, 'um real'],
    [0, 'zero reais'],
  ])('%d → %s', (valor, esperado) => {
    expect(valorPorExtenso(valor)).toBe(esperado);
  });
});

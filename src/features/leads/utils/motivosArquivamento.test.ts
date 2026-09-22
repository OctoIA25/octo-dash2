/**
 * Motivos de arquivamento do lead.
 *
 * O que é gravado em `leads.archive_reason` é o RÓTULO, não o código: o
 * histórico da base tem "Lead duplicado — cliente já está em outro lead", e os
 * relatórios agrupam por esse texto. Trocar o rótulo de um motivo já usado
 * quebra esse agrupamento, então o teste fixa os rótulos que já existem na base.
 */
import { describe, expect, it } from 'vitest';
import { MOTIVOS_ARQUIVAMENTO, MOTIVO_OUTROS, montarMotivoFinal } from './motivosArquivamento';

const rotulos = MOTIVOS_ARQUIVAMENTO.map((m) => m.label);

describe('MOTIVOS_ARQUIVAMENTO', () => {
  it('traz a lista pedida pelo jurídico/comercial, na ordem', () => {
    expect(rotulos.slice(0, 6)).toEqual([
      'Preço alto',
      'Avaliação baixa na troca',
      'Problema no atendimento',
      'Cliente não respondeu',
      'Outros',
      'Não consegui contatar',
    ]);
    expect(rotulos).toContain('Corretor Parceiro');
    expect(rotulos).toContain('Tratada com qualificação');
  });

  it('mantém os motivos antigos que já estão gravados na base', () => {
    expect(rotulos).toContain('Fora do perfil');
    expect(rotulos).toContain('Erro / cadastro incorreto');
    expect(rotulos).toContain('Lead duplicado');
  });

  it('cada código aparece uma vez só, e cada rótulo também', () => {
    const codigos = MOTIVOS_ARQUIVAMENTO.map((m) => m.value);
    expect(new Set(codigos).size).toBe(codigos.length);
    expect(new Set(rotulos).size).toBe(rotulos.length);
    for (const codigo of codigos) expect(codigo).toMatch(/^[a-z0-9]+(_[a-z0-9]+)*$/);
  });
});

describe('montarMotivoFinal', () => {
  it('sem observação, grava só o motivo', () => {
    expect(montarMotivoFinal('preco_alto', '')).toBe('Preço alto');
  });

  it('com observação, junta as duas partes — formato que já existe na base', () => {
    expect(montarMotivoFinal('lead_duplicado', 'cliente já tem ficha')).toBe('Lead duplicado — cliente já tem ficha');
  });

  it('em "Outros", o texto do corretor vira o motivo', () => {
    expect(montarMotivoFinal(MOTIVO_OUTROS, 'mudou de cidade')).toBe('mudou de cidade');
  });

  it('"Outros" sem texto não grava rótulo vazio', () => {
    expect(montarMotivoFinal(MOTIVO_OUTROS, '   ')).toBe('Outros');
  });

  it('código desconhecido não inventa motivo', () => {
    expect(montarMotivoFinal('nao_existe', 'algo')).toBe('Arquivado — algo');
  });
});

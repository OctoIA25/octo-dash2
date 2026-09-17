import { describe, it, expect } from 'vitest';
import { normalizePhone, phonesMatch, classificarTelefone, chaveTelefone, telefoneWhatsapp } from './phone.js';

describe('normalizePhone', () => {
  it('remove não-dígitos', () => {
    expect(normalizePhone('(11) 98888-7777')).toBe('11988887777');
  });
  it('remove DDI 55 quando presente', () => {
    expect(normalizePhone('5511988887777')).toBe('11988887777');
  });
  it('trata vazio/undefined sem quebrar', () => {
    expect(normalizePhone(undefined)).toBe('');
    expect(normalizePhone('')).toBe('');
  });
});

describe('phonesMatch', () => {
  it('casa com e sem DDI/máscara', () => {
    expect(phonesMatch('5511988887777', '(11) 98888-7777')).toBe(true);
  });
  it('não casa números diferentes', () => {
    expect(phonesMatch('11988887777', '11999990000')).toBe(false);
  });
});

/**
 * Casos vindos dos leads reais de produção (13-17/09/2026), com os MESMOS
 * formatos e dígitos trocados — número de lead não entra em teste versionado.
 */
describe('classificarTelefone — mesmo número, formatos diferentes', () => {
  const mesmoNumero = ['(19) 99999-9999', '19999999999', '+5519999999999', '+55 19 99999-9999', '55 19 99999-9999'];

  it('todos os formatos dão a mesma chave (CA-01)', () => {
    const chaves = new Set(mesmoNumero.map((v) => chaveTelefone(v)));
    expect(chaves).toEqual(new Set(['5519999999999']));
  });

  it('celular sem o 9º dígito é o mesmo número (wa_id da Lia)', () => {
    expect(chaveTelefone('+559184643261')).toBe(chaveTelefone('+5591984643261'));
  });

  it('DDD sem o DDI 55 é o mesmo número (ZAP grava assim)', () => {
    expect(chaveTelefone('11987654321')).toBe(chaveTelefone('+5511987654321'));
  });

  it("'+' colado no DDD é o mesmo número (Santa Angela grava assim)", () => {
    expect(chaveTelefone('+19987654321')).toBe(chaveTelefone('+5519987654321'));
  });
});

describe('classificarTelefone — o que não pode virar chave', () => {
  it("telefone incompleto do formulário ('+5519') é incompleto, sem chave (CA-03/CA-10)", () => {
    expect(classificarTelefone('+5519')).toEqual({ status: 'incompleto', chave: null, whatsapp: null });
  });

  it('dois leads com telefone incompleto NÃO se agrupam', () => {
    expect(chaveTelefone('+5519')).toBeNull();
    expect(chaveTelefone('+5511')).toBeNull();
  });

  it('dígito a mais é inválido — não tenta adivinhar qual sobra', () => {
    expect(classificarTelefone('+55129999999999').status).toBe('invalido');
  });

  it('DDD que não existe é inválido', () => {
    expect(classificarTelefone('+5520987654321').status).toBe('invalido');
  });

  it('não gera WhatsApp para número inválido ou incompleto (CA-04)', () => {
    expect(telefoneWhatsapp('+5519')).toBeNull();
    expect(telefoneWhatsapp('+55129999999999')).toBeNull();
  });
});

describe('classificarTelefone — o que é válido', () => {
  it('celular de 8 dígitos sem o 9 ganha o 9 (faixa de celular da Anatel)', () => {
    expect(classificarTelefone('+556298765432')).toMatchObject({ status: 'valido', chave: '5562998765432' });
  });

  it('fixo NÃO ganha o 9º dígito — seria inventar número', () => {
    expect(classificarTelefone('1133334444')).toMatchObject({ status: 'valido', chave: '551133334444' });
  });

  it('número de outro país vale como identificador (wa_id da Lia traz)', () => {
    expect(classificarTelefone('351912345678')).toMatchObject({ status: 'internacional', chave: '351912345678' });
  });

  it('vazio não é erro, é ausência', () => {
    expect(classificarTelefone(null).status).toBe('vazio');
    expect(classificarTelefone('').status).toBe('vazio');
  });
});

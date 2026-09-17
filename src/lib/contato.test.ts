/**
 * Paridade com server/utils/phone.js e com a função SQL lead_phone_key: são os
 * MESMOS casos. Se um dos três divergir, o lead que a dashboard mostra como
 * válido é o que o servidor recusa — foi assim que o problema apareceu.
 */
import { describe, it, expect } from 'vitest';
import { classificarTelefone, chaveTelefone, classificarEmail, linkWhatsapp, avisoTelefone, avisoEmail } from './contato';

describe('classificarTelefone', () => {
  it('formatos diferentes do mesmo número dão a mesma chave (CA-01)', () => {
    const chaves = new Set(['(19) 99999-9999', '19999999999', '+5519999999999', '+55 19 99999-9999', '55 19 99999-9999']
      .map(chaveTelefone));
    expect(chaves).toEqual(new Set(['5519999999999']));
  });

  it('celular sem o 9º dígito é o mesmo número', () => {
    expect(chaveTelefone('+559184643261')).toBe(chaveTelefone('+5591984643261'));
  });

  it("'+5519' é incompleto e não identifica ninguém (CA-03)", () => {
    expect(classificarTelefone('+5519')).toEqual({ status: 'incompleto', chave: null, whatsapp: null });
  });

  it('dígito a mais é inválido', () => {
    expect(classificarTelefone('+55129999999999').status).toBe('invalido');
  });

  it('fixo não ganha o 9º dígito', () => {
    expect(chaveTelefone('1133334444')).toBe('551133334444');
  });

  it('número de outro país continua utilizável', () => {
    expect(classificarTelefone('351912345678')).toMatchObject({ status: 'internacional', chave: '351912345678' });
  });
});

describe('linkWhatsapp', () => {
  it('não gera link para telefone incompleto ou inválido (CA-04)', () => {
    expect(linkWhatsapp('+5519')).toBeNull();
    expect(linkWhatsapp('+55129999999999')).toBeNull();
    expect(linkWhatsapp(null)).toBeNull();
  });

  it('gera o link com DDI, sem duplicar o 55 de quem já tinha', () => {
    expect(linkWhatsapp('(19) 99999-9999')).toBe('https://wa.me/5519999999999');
    expect(linkWhatsapp('+5519999999999')).toBe('https://wa.me/5519999999999');
  });
});

describe('avisos da tela (CA-11)', () => {
  it('telefone ruim nunca aparece como bom', () => {
    expect(avisoTelefone('+5519')).toBe('Telefone incompleto');
    expect(avisoTelefone('+55129999999999')).toBe('Telefone inválido');
    expect(avisoTelefone('(19) 99999-9999')).toBeNull();
  });

  it("'@gmail.co' aparece como possivelmente incompleto (CA-05)", () => {
    expect(avisoEmail('cliente@gmail.co')).toBe('E-mail possivelmente incompleto');
    expect(avisoEmail('cliente@gmail.com')).toBeNull();
  });

  it('e-mail sem sintaxe de endereço é inválido', () => {
    expect(classificarEmail('cliente@gmail').status).toBe('invalido');
  });
});

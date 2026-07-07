/**
 * normalizePhone / phoneVariants / chatPathForPhone — a ponte entre o card do
 * Kanban e o módulo de chat. A normalização espelha server/utils/phone.js
 * (withCountryCode) e o trigger ensure_whatsapp_conversation_for_lead: as
 * três implementações precisam produzir a MESMA chave para o mesmo número.
 */
import { describe, it, expect } from 'vitest';
import { chatPathForPhone, normalizePhone, phoneVariants } from './chatService';

describe('normalizePhone (canônico: DDI 55 + DDD + 9 dígitos)', () => {
  it('remove formatação e prefixa DDI em número BR de 11 dígitos', () => {
    expect(normalizePhone('(11) 98888-7777')).toBe('5511988887777');
  });

  it('não duplica DDI quando já presente', () => {
    expect(normalizePhone('+55 (11) 98888-7777')).toBe('5511988887777');
  });

  it('insere o 9º dígito em celular BR de 10 dígitos (com ou sem DDI)', () => {
    expect(normalizePhone('11 8888-7777')).toBe('5511988887777');
    expect(normalizePhone('55 11 8888-7777')).toBe('5511988887777');
  });

  it('todas as variações do mesmo número convergem para a MESMA chave', () => {
    const canonico = '5511988887777';
    for (const v of ['5511988887777', '11988887777', '551188887777', '1188887777', '(11) 98888-7777']) {
      expect(normalizePhone(v)).toBe(canonico);
    }
  });

  it('vazio, null e undefined viram string vazia', () => {
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone(null)).toBe('');
    expect(normalizePhone(undefined)).toBe('');
  });
});

describe('phoneVariants (reutilizar conversa existente, nunca duplicar)', () => {
  it('cobre wa_id sem o 9º dígito, formas sem DDI e E.164 com "+"', () => {
    expect(phoneVariants('(11) 98888-7777')).toEqual([
      '5511988887777',
      '551188887777',
      '11988887777',
      '1188887777',
      '+5511988887777',
      '+551188887777',
      '+11988887777',
      '+1188887777',
    ]);
  });

  it('número não-BR fica na forma normalizada (com e sem "+")', () => {
    expect(phoneVariants('123456789012345')).toEqual(['123456789012345', '+123456789012345']);
  });
});

describe('chatPathForPhone', () => {
  it('gera a rota do chat com o telefone canônico', () => {
    expect(chatPathForPhone('(11) 98888-7777')).toBe('/chat?phone=5511988887777');
  });

  it('inclui o nome do contato quando informado (URL-encoded)', () => {
    expect(chatPathForPhone('(11) 98888-7777', 'João Comprador')).toBe(
      '/chat?phone=5511988887777&name=Jo%C3%A3o%20Comprador',
    );
  });

  it('mesmo telefone em formatos distintos gera o MESMO link', () => {
    expect(chatPathForPhone('(11) 98888-7777')).toBe(chatPathForPhone('55 11 98888 7777'));
  });

  it('telefone inválido (curto), vazio ou ausente não gera link', () => {
    expect(chatPathForPhone('1234')).toBeNull();
    expect(chatPathForPhone('')).toBeNull();
    expect(chatPathForPhone(null)).toBeNull();
    expect(chatPathForPhone(undefined)).toBeNull();
  });
});

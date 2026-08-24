/**
 * normalizePhone / phoneVariants / chatPathForPhone — a ponte entre o card do
 * Kanban e o módulo de chat. A normalização espelha server/utils/phone.js
 * (withCountryCode) e o trigger ensure_whatsapp_conversation_for_lead: as
 * três implementações precisam produzir a MESMA chave para o mesmo número.
 */
import { describe, it, expect } from 'vitest';
import {
  categoriaEfetiva,
  chatPathForPhone,
  comCategoriaEfetiva,
  normalizePhone,
  phoneVariants,
} from './chatService';
import type { WhatsappConversation } from '../types';

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

describe('categoriaEfetiva (corretor cadastrado x marcação manual)', () => {
  const conversa = (over: Partial<WhatsappConversation>) =>
    ({ category: null, contact_phone: '5511911112222', ...over }) as WhatsappConversation;
  const corretores = new Set(['5511988887777']);

  it('telefone de corretor cadastrado vira corretor sem ninguém marcar', () => {
    expect(categoriaEfetiva(conversa({ contact_phone: '5511988887777' }), corretores)).toBe('corretor');
  });

  it('reconhece o corretor mesmo com o telefone gravado em outro formato', () => {
    // Conversa antiga sem o 9º dígito / sem DDI — mesma pessoa.
    expect(categoriaEfetiva(conversa({ contact_phone: '551188887777' }), corretores)).toBe('corretor');
    expect(categoriaEfetiva(conversa({ contact_phone: '1188887777' }), corretores)).toBe('corretor');
  });

  it('marcação manual vence a automática (parceiro de fora, contato reclassificado)', () => {
    expect(
      categoriaEfetiva(conversa({ contact_phone: '5511988887777', category: 'comprador' }), corretores),
    ).toBe('comprador');
    expect(categoriaEfetiva(conversa({ category: 'corretor' }), new Set())).toBe('corretor');
  });

  it('número que não é de corretor e não foi marcado fica sem categoria', () => {
    expect(categoriaEfetiva(conversa({}), corretores)).toBeNull();
  });

  it('comCategoriaEfetiva não altera os originais', () => {
    const lista = [conversa({ id: 'c1', contact_phone: '5511988887777' } as Partial<WhatsappConversation>)];
    const resultado = comCategoriaEfetiva(lista, corretores);
    expect(resultado[0].category).toBe('corretor');
    expect(lista[0].category).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { classificarEmail, chaveEmail } from './email.js';

describe('classificarEmail', () => {
  it('normaliza o que é inequívoco: espaço nas pontas e caixa', () => {
    expect(classificarEmail('  Cliente@Gmail.COM ')).toEqual({ status: 'valido', normalizado: 'cliente@gmail.com' });
  });

  it("'@gmail.co' é suspeito, NÃO é corrigido para '.com' (CA-05/CA-07)", () => {
    expect(classificarEmail('cliente@gmail.co')).toEqual({ status: 'suspeito', normalizado: 'cliente@gmail.co' });
  });

  it('provedor truncado em outras formas também é sinalizado', () => {
    for (const e of ['a@hotmail.co', 'a@outlook.cm', 'a@yahoo.con', 'a@gmail.vom']) {
      expect(classificarEmail(e).status).toBe('suspeito');
    }
  });

  it('domínio de empresa com final incomum NÃO vira suspeito por palpite', () => {
    expect(classificarEmail('contato@imobiliaria.co').status).toBe('valido');
    expect(classificarEmail('contato@empresa.com.br').status).toBe('valido');
  });

  it('o que não é endereço é inválido', () => {
    for (const e of ['cliente@gmail.com.b', 'cliente@gmail', 'cliente', '@gmail.com', 'a b@gmail.com', 'a@uol.c']) {
      expect(classificarEmail(e).status).toBe('invalido');
    }
  });

  it('vazio é ausência, não erro', () => {
    expect(classificarEmail(null)).toEqual({ status: 'vazio', normalizado: null });
  });
});

describe('chaveEmail', () => {
  it('a mesma caixa/espaçamento dá a mesma chave (caso Lourdes: duas fichas, um e-mail)', () => {
    expect(chaveEmail(' Lourdes@Email.com ')).toBe(chaveEmail('lourdes@email.com'));
  });

  it('e-mail suspeito ainda identifica a pessoa — o endereço é único, só não é confiável para escrever', () => {
    expect(chaveEmail('cliente@gmail.co')).toBe('cliente@gmail.co');
  });

  it('e-mail inválido não vira chave', () => {
    expect(chaveEmail('cliente@gmail')).toBeNull();
  });

  it('endereços parecidos NÃO são a mesma chave', () => {
    expect(chaveEmail('joao@gmail.com')).not.toBe(chaveEmail('joao.silva@gmail.com'));
  });
});

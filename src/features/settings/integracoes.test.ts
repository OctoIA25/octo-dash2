/**
 * Integrações honestas (P4.10) — a parte que decide o que a tela diz.
 *
 * O que estes testes protegem: a tela nunca chamar de "conectada" uma
 * integração que não está, nunca dizer "sem erros" onde o erro não é
 * registrado, e nunca mostrar zero para o que não traz lead nenhum.
 */
import { describe, expect, it } from 'vitest';
import { comProblema, conectada, faz, rotuloDoStatus } from './integracoes';
import type { EstadoDaIntegracao } from './integracoes';

const e = (o: Partial<EstadoDaIntegracao> = {}): EstadoDaIntegracao => ({
  codigo: 'x', nome: 'X', configurada: true, status: 'active',
  ultima_sincronizacao: null, ultimo_erro: null, leads: 0, leads_de_onde: 'x', ...o,
});

describe('como o status é chamado na tela', () => {
  // As seis integrações usam palavras diferentes para a mesma coisa.
  it('traduz os dialetos das seis para a mesma língua', () => {
    expect(rotuloDoStatus(e({ status: 'ativo' }))).toBe('Conectada');
    expect(rotuloDoStatus(e({ status: 'active' }))).toBe('Conectada');
    expect(rotuloDoStatus(e({ status: 'error' }))).toBe('Com erro');
    expect(rotuloDoStatus(e({ status: 'inactive' }))).toBe('Desligada');
  });

  it('não configurada vence qualquer status guardado', () => {
    expect(rotuloDoStatus(e({ configurada: false, status: 'active' }))).toBe('Não configurada');
  });

  it('status desconhecido aparece como veio, em vez de virar "Conectada"', () => {
    expect(rotuloDoStatus(e({ status: 'degradado' }))).toBe('degradado');
  });
});

describe('quando a integração está de fato conectada', () => {
  it('ativa e sem erro', () => {
    expect(conectada(e({ status: 'ativo' }))).toBe(true);
  });

  // O caso perigoso: status diz 'active' e há um erro guardado. Chamar isso de
  // conectada esconde a única informação que importa.
  it('ativa COM erro não é conectada', () => {
    expect(conectada(e({ status: 'active', ultimo_erro: 'token expirado' }))).toBe(false);
    expect(comProblema(e({ status: 'active', ultimo_erro: 'token expirado' }))).toBe(true);
  });

  it('não configurada nunca é conectada nem problema', () => {
    const x = e({ configurada: false, status: 'nao_configurada' });
    expect(conectada(x)).toBe(false);
    expect(comProblema(x)).toBe(false);
  });
});

describe('há quanto tempo sincronizou', () => {
  const atras = (ms: number) => new Date(Date.now() - ms).toISOString();

  it('diz o tempo, não a data — quem lê quer saber se está parado', () => {
    expect(faz(atras(30 * 60_000))).toBe('há 30 min');
    expect(faz(atras(3 * 3600_000))).toBe('há 3 h');
    expect(faz(atras(2 * 86400_000))).toBe('há 2 dias');
    expect(faz(atras(86400_000))).toBe('há 1 dia');
  });

  it('agora há pouco, em vez de "há 0 min"', () => {
    expect(faz(atras(10_000))).toBe('agora há pouco');
  });

  it('cala quando não há data, e não inventa "agora"', () => {
    expect(faz(null)).toBeNull();
    expect(faz(undefined)).toBeNull();
    expect(faz('não é data')).toBeNull();
  });

  // Relógio do servidor adiantado daria "há -5 min", que não quer dizer nada.
  it('cala quando a data está no futuro', () => {
    expect(faz(new Date(Date.now() + 600_000).toISOString())).toBeNull();
  });
});

/**
 * Migração do PDI que ficou no navegador (P3.4).
 *
 * O caso que mais importa é o do navegador COMPARTILHADO: apagar a chave
 * inteira depois de subir o meu plano levaria junto o plano do colega que usou
 * a mesma máquina — e não haveria como recuperar.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CHAVE_ANTIGA, lerDoNavegador, limparDoNavegador, paraOBanco, type PdiGuardado,
} from './pdiDoNavegador';

const pdi = (email: string, over: Partial<PdiGuardado> = {}): PdiGuardado => ({
  id: Date.now(),
  corretor_email: email,
  tipo: 'individual',
  competencia: 'Negociação',
  nivel_atual: 'iniciante',
  nivel_desejado: 'avancado',
  progresso: 40,
  acoes: [{ id: 'a1', descricao: 'Ler o livro', concluida: false }],
  status: 'em_andamento',
  ordem: 0,
  ...over,
});

beforeEach(() => localStorage.clear());

describe('lerDoNavegador', () => {
  it('traz só o que é da pessoa', () => {
    localStorage.setItem(CHAVE_ANTIGA, JSON.stringify([pdi('ana@x.dev'), pdi('bruno@x.dev')]));
    const r = lerDoNavegador('ana@x.dev');
    expect(r).toHaveLength(1);
    expect(r[0].corretor_email).toBe('ana@x.dev');
  });

  it('não se importa com maiúscula no e-mail', () => {
    localStorage.setItem(CHAVE_ANTIGA, JSON.stringify([pdi('Ana@X.dev')]));
    expect(lerDoNavegador('ana@x.dev')).toHaveLength(1);
  });

  it('nada guardado é lista vazia, não erro', () => {
    expect(lerDoNavegador('ana@x.dev')).toEqual([]);
  });

  /** Conteúdo estragado não pode derrubar a tela de PDI inteira. */
  it('aguenta lixo no lugar do JSON', () => {
    localStorage.setItem(CHAVE_ANTIGA, 'isto não é json');
    expect(lerDoNavegador('ana@x.dev')).toEqual([]);
    localStorage.setItem(CHAVE_ANTIGA, JSON.stringify({ nao: 'e uma lista' }));
    expect(lerDoNavegador('ana@x.dev')).toEqual([]);
    localStorage.setItem(CHAVE_ANTIGA, JSON.stringify([null, 'texto solto', pdi('ana@x.dev')]));
    expect(lerDoNavegador('ana@x.dev')).toHaveLength(1);
  });

  /** Janela anônima e "bloquear dados de sites" fazem o acesso lançar. */
  it('navegador que recusa o acesso não quebra a tela', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(lerDoNavegador('ana@x.dev')).toEqual([]);
    spy.mockRestore();
  });

  it('sem e-mail não devolve nada — não é para trazer o de todo mundo', () => {
    localStorage.setItem(CHAVE_ANTIGA, JSON.stringify([pdi('ana@x.dev')]));
    expect(lerDoNavegador('')).toEqual([]);
  });
});

describe('paraOBanco', () => {
  it('leva o conteúdo e marca de onde veio', () => {
    const r = paraOBanco(pdi('ana@x.dev'), 'tenant-1', 'ana@x.dev');
    expect(r).toMatchObject({
      tenant_id: 'tenant-1',
      corretor_email: 'ana@x.dev',
      competencia: 'Negociação',
      progresso: 40,
      origem: 'navegador',
    });
    expect(r.acoes).toHaveLength(1);
  });

  /**
   * O id antigo era `Date.now()`, único só naquele navegador. Levá-lo junto
   * faria dois PDIs criados no mesmo milissegundo colidirem no banco.
   */
  it('NÃO leva o id antigo', () => {
    expect('id' in paraOBanco(pdi('ana@x.dev'), 't', 'ana@x.dev')).toBe(false);
  });

  /** A coluna é `date`: string vazia não é data e o insert quebraria. */
  it('prazo vazio vira nulo', () => {
    expect(paraOBanco(pdi('ana@x.dev', { prazo: '' }), 't', 'a@x.dev').prazo).toBeNull();
    expect(paraOBanco(pdi('ana@x.dev', { prazo: '2026-10-01' }), 't', 'a@x.dev').prazo).toBe('2026-10-01');
  });

  it('campo faltando não vira undefined no banco', () => {
    const torto = { corretor_email: 'ana@x.dev' } as unknown as PdiGuardado;
    const r = paraOBanco(torto, 't', 'ana@x.dev');
    expect(r.tipo).toBe('individual');
    expect(r.progresso).toBe(0);
    expect(r.acoes).toEqual([]);
    expect(r.sections).toEqual([]);
    expect(r.observacoes).toBe('');
  });
});

describe('limparDoNavegador', () => {
  /**
   * O caso do computador compartilhado. Apagar a chave inteira levaria o
   * plano do colega, que nunca pediu migração nenhuma.
   */
  it('tira só o da pessoa e deixa o do colega', () => {
    localStorage.setItem(CHAVE_ANTIGA, JSON.stringify([pdi('ana@x.dev'), pdi('bruno@x.dev')]));
    limparDoNavegador('ana@x.dev');
    const resto = JSON.parse(localStorage.getItem(CHAVE_ANTIGA)!);
    expect(resto).toHaveLength(1);
    expect(resto[0].corretor_email).toBe('bruno@x.dev');
  });

  it('sem ninguém sobrando, tira a chave de vez', () => {
    localStorage.setItem(CHAVE_ANTIGA, JSON.stringify([pdi('ana@x.dev')]));
    limparDoNavegador('ana@x.dev');
    expect(localStorage.getItem(CHAVE_ANTIGA)).toBeNull();
  });

  it('não quebra quando não há nada para limpar', () => {
    expect(() => limparDoNavegador('ana@x.dev')).not.toThrow();
    localStorage.setItem(CHAVE_ANTIGA, 'lixo');
    expect(() => limparDoNavegador('ana@x.dev')).not.toThrow();
    expect(localStorage.getItem(CHAVE_ANTIGA)).toBe('lixo');
  });
});

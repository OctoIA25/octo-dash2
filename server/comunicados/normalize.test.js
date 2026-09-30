/**
 * O corpo que a LIA manda para POST /api/v1/comunicados.
 *
 * Protege duas coisas: (1) a LIA recebe 422 com o CAMPO certo em vez de um 500
 * do CHECK do banco; (2) e-mail em maiúscula, com espaço ou repetido vira UMA
 * pessoa — senão o corretor recebe o mesmo alerta duas vezes.
 */
import { describe, it, expect } from 'vitest';
import { normalizarComunicado } from './normalize.js';

const VALIDO = {
  idempotency_key: 'lia:lead-atrasado:1',
  categoria: 'alerta',
  titulo: '  Lead sem resposta há 2h  ',
  mensagem: 'Maria espera retorno.',
  publico: { tipo: 'pessoas', emails: [' Joao@Lotus.com.br', 'joao@lotus.com.br'], copiar_gestor: true },
  link: { tipo: 'lead', id: '8F0C2B1E-1111-4222-8333-444455556666' },
};

const campos = (r) => r.details.map((d) => `${d.campo}:${d.motivo}`);

describe('normalizarComunicado', () => {
  it('aceita o corpo válido e normaliza', () => {
    const r = normalizarComunicado(VALIDO);
    expect(r.ok).toBe(true);
    expect(r.row).toEqual({
      idempotencyKey: 'lia:lead-atrasado:1',
      categoria: 'alerta',
      titulo: 'Lead sem resposta há 2h',
      mensagem: 'Maria espera retorno.',
      prioridade: 'normal',
      publico: { tipo: 'pessoas', emails: ['joao@lotus.com.br'], copiarGestor: true },
      link: { tipo: 'lead', id: '8f0c2b1e-1111-4222-8333-444455556666' },
    });
  });

  it('"todos" ignora e-mails e copiar_gestor', () => {
    const r = normalizarComunicado({ ...VALIDO, publico: { tipo: 'todos', emails: ['x@y.z'], copiar_gestor: true } });
    expect(r.row.publico).toEqual({ tipo: 'todos', emails: [], copiarGestor: false });
  });

  it('link é opcional', () => {
    const { link, ...semLink } = VALIDO;
    expect(normalizarComunicado(semLink).row.link).toBeNull();
    expect(normalizarComunicado({ ...semLink, link: null }).row.link).toBeNull();
  });

  it('reprova tudo de uma vez, dizendo cada campo', () => {
    const r = normalizarComunicado({ categoria: 'fofoca', prioridade: 'urgente', publico: { tipo: 'equipes' }, link: { tipo: 'imovel', id: '1' } });
    expect(r.ok).toBe(false);
    expect(campos(r)).toEqual([
      'idempotency_key:obrigatorio',
      'categoria:use_comunicado_ou_alerta',
      'titulo:obrigatorio',
      'mensagem:obrigatorio',
      'prioridade:use_normal_ou_importante',
      'publico.tipo:use_todos_ou_pessoas',
      'link:use_tipo_lead_e_id_uuid',
    ]);
  });

  it('título e mensagem acima do limite', () => {
    const r = normalizarComunicado({ ...VALIDO, titulo: 'x'.repeat(121), mensagem: 'y'.repeat(2001) });
    expect(campos(r)).toEqual(['titulo:maximo_120_caracteres', 'mensagem:maximo_2000_caracteres']);
  });

  it('só espaços conta como vazio', () => {
    expect(campos(normalizarComunicado({ ...VALIDO, titulo: '   ' }))).toEqual(['titulo:obrigatorio']);
  });

  it('pessoas sem e-mail, com e-mail inválido ou com mais de 50', () => {
    expect(campos(normalizarComunicado({ ...VALIDO, publico: { tipo: 'pessoas', emails: [] } })))
      .toEqual(['publico.emails:obrigatorio']);
    const invalido = normalizarComunicado({ ...VALIDO, publico: { tipo: 'pessoas', emails: ['ok@x.dev', 'sem-arroba'] } });
    expect(invalido.details).toEqual([{ campo: 'publico.emails', motivo: 'email_invalido', valores: ['sem-arroba'] }]);
    const muitos = Array.from({ length: 51 }, (_, i) => `p${i}@x.dev`);
    expect(campos(normalizarComunicado({ ...VALIDO, publico: { tipo: 'pessoas', emails: muitos } })))
      .toEqual(['publico.emails:maximo_50']);
  });

  it('não confia em tipo: título número, e-mails string, publico ausente', () => {
    const r = normalizarComunicado({ ...VALIDO, titulo: 42, publico: undefined });
    expect(campos(r)).toEqual(['titulo:obrigatorio', 'publico.tipo:use_todos_ou_pessoas']);
    const r2 = normalizarComunicado({ ...VALIDO, publico: { tipo: 'pessoas', emails: 'a@b.c' } });
    expect(campos(r2)).toEqual(['publico.emails:obrigatorio']);
  });

  it('campos desconhecidos (inclusive tenant_id) são ignorados', () => {
    const r = normalizarComunicado({ ...VALIDO, tenant_id: 'outra-casa', autor: 'x' });
    expect(r.ok).toBe(true);
    expect(JSON.stringify(r.row)).not.toContain('outra-casa');
  });
});

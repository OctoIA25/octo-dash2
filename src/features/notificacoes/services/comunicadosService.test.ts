import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import { enviarComunicado, mensagemDoErro, podeEnviar } from './comunicadosService';

const RASCUNHO = { titulo: 'Reunião', mensagem: 'Amanhã às 9h', publico: 'equipes' as const, equipeIds: ['e-1'] };

describe('podeEnviar', () => {
  it('pede título, mensagem e destino', () => {
    expect(podeEnviar(RASCUNHO)).toBe(true);
    expect(podeEnviar({ ...RASCUNHO, titulo: '   ' })).toBe(false);
    expect(podeEnviar({ ...RASCUNHO, mensagem: '' })).toBe(false);
    expect(podeEnviar({ ...RASCUNHO, equipeIds: [] })).toBe(false);
    expect(podeEnviar({ ...RASCUNHO, publico: 'todos', equipeIds: [] })).toBe(true);
  });

  it('respeita os limites do banco', () => {
    expect(podeEnviar({ ...RASCUNHO, titulo: 'x'.repeat(120) })).toBe(true);
    expect(podeEnviar({ ...RASCUNHO, titulo: 'x'.repeat(121) })).toBe(false);
    expect(podeEnviar({ ...RASCUNHO, mensagem: 'y'.repeat(2001) })).toBe(false);
  });
});

describe('mensagemDoErro', () => {
  it('traduz os códigos do banco', () => {
    expect(mensagemDoErro('sem_permissao')).toBe('Você só pode enviar para as equipes que lidera.');
    expect(mensagemDoErro('sem_destinatarios')).toBe('Essas equipes ainda não têm ninguém.');
    expect(mensagemDoErro('equipe_invalida')).toBe('Escolha ao menos uma equipe.');
    expect(mensagemDoErro('qualquer coisa')).toBe('Não deu para enviar. Tente de novo.');
    expect(mensagemDoErro(undefined)).toBe('Não deu para enviar. Tente de novo.');
  });
});

describe('enviarComunicado', () => {
  beforeEach(() => rpc.mockReset());

  it('chama a RPC com o texto sem espaços nas pontas e devolve quantos receberam', async () => {
    rpc.mockResolvedValueOnce({ data: [{ comunicado_id: 'c-1', destinatarios: 12, criado: true }], error: null });
    const n = await enviarComunicado({ tenantId: 't-1', ...RASCUNHO, titulo: ' Reunião ', importante: true, idempotencyKey: 'k-1' });
    expect(n).toBe(12);
    expect(rpc).toHaveBeenCalledWith('enviar_comunicado', {
      p_tenant_id: 't-1', p_titulo: 'Reunião', p_mensagem: 'Amanhã às 9h', p_prioridade: 'importante',
      p_publico_tipo: 'equipes', p_equipe_ids: ['e-1'], p_idempotency_key: 'k-1',
    });
  });

  it('"todos" não manda equipes', async () => {
    rpc.mockResolvedValueOnce({ data: [{ destinatarios: 30 }], error: null });
    await enviarComunicado({ tenantId: 't-1', ...RASCUNHO, publico: 'todos', importante: false, idempotencyKey: 'k' });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_publico_tipo: 'todos', p_equipe_ids: [], p_prioridade: 'normal' });
  });

  it('erro do banco vira mensagem legível', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'sem_permissao' } });
    await expect(enviarComunicado({ tenantId: 't-1', ...RASCUNHO, importante: false, idempotencyKey: 'k' }))
      .rejects.toThrow('Você só pode enviar para as equipes que lidera.');
  });
});

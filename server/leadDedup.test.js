/**
 * Dedup da entrada de lead: casos de produção (17/09/2026), com os mesmos
 * formatos e dígitos trocados.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  buscarLeadPeloTelefone, divergenciasDeContato, eventoDeReentrada,
} from './leadDedup.js';

/** Fake do supabase-js: guarda os filtros usados e devolve `linhas`. */
const fakeSupabase = (linhas, { error = null } = {}) => {
  const filtros = {};
  const chain = {
    select: () => chain,
    eq: (col, val) => { filtros[col] = val; return chain; },
    order: () => chain,
    limit: () => Promise.resolve({ data: linhas, error }),
  };
  return { cliente: { from: (t) => { filtros._tabela = t; return chain; } }, filtros };
};

describe('buscarLeadPeloTelefone', () => {
  it('procura pela chave canônica, não pela string recebida (CA-01)', async () => {
    const { cliente, filtros } = fakeSupabase([{ id: 'lead-1' }]);
    const achado = await buscarLeadPeloTelefone(cliente, 'tenant-1', '(19) 99999-9999');

    expect(achado).toEqual({ id: 'lead-1' });
    expect(filtros._tabela).toBe('leads');
    expect(filtros.tenant_id).toBe('tenant-1');
    expect(filtros.phone_key).toBe('5519999999999');
  });

  it('o wa_id sem o 9º dígito procura o mesmo lead', async () => {
    const { cliente, filtros } = fakeSupabase([]);
    await buscarLeadPeloTelefone(cliente, 'tenant-1', '559184643261');
    expect(filtros.phone_key).toBe('5591984643261');
  });

  it('telefone incompleto NÃO vira busca — não pode agrupar leads (CA-10)', async () => {
    const { cliente, filtros } = fakeSupabase([{ id: 'lead-errado' }]);
    expect(await buscarLeadPeloTelefone(cliente, 'tenant-1', '+5519')).toBeNull();
    expect(filtros.phone_key).toBeUndefined();
  });

  it('telefone com dígito a mais também não busca', async () => {
    const { cliente } = fakeSupabase([{ id: 'lead-errado' }]);
    expect(await buscarLeadPeloTelefone(cliente, 'tenant-1', '+55129999999999')).toBeNull();
  });

  it('sem tenant não busca — isolamento (CA-10)', async () => {
    const { cliente, filtros } = fakeSupabase([{ id: 'x' }]);
    expect(await buscarLeadPeloTelefone(cliente, null, '19999999999')).toBeNull();
    expect(filtros.tenant_id).toBeUndefined();
  });

  it('erro de banco não derruba a entrada do lead, só loga', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { cliente } = fakeSupabase(null, { error: { message: 'column phone_key does not exist' } });

    expect(await buscarLeadPeloTelefone(cliente, 'tenant-1', '19999999999')).toBeNull();
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });
});

describe('divergenciasDeContato', () => {
  it('aponta e-mail diferente no mesmo telefone (investigar antes de mesclar)', () => {
    expect(divergenciasDeContato(
      { email: 'pessoal@gmail.com', name: 'Reinaldo Dantas' },
      { email: 'corporativo@empresa.com.br', name: 'REINALDO DANTAS' },
    )).toEqual(['email']);
  });

  it('caixa e espaço não são divergência', () => {
    expect(divergenciasDeContato(
      { email: 'Lourdes@Email.com ', name: 'Lourdes Ferreira' },
      { email: 'lourdes@email.com', name: 'LOURDES FERREIRA' },
    )).toEqual([]);
  });

  it('dado que faltava não é divergência, é complemento', () => {
    expect(divergenciasDeContato({ email: null, name: null }, { email: 'a@b.com', name: 'Ana' }))
      .toEqual([]);
  });
});

describe('eventoDeReentrada', () => {
  const evento = eventoDeReentrada({
    existente: { id: 'lead-1', email: 'pessoal@gmail.com' },
    novo: {
      source: 'Instagram', source_lead_id: 'api_123', phone: '(19) 99999-9999',
      email: 'corporativo@empresa.com.br', name: 'Maria', property_code: 'L014',
    },
    divergencias: ['email'],
  });

  it('é um evento de sistema no vocabulário lead.*', () => {
    expect(evento).toMatchObject({ event_type: 'lead.nova_entrada', ator_tipo: 'sistema', para: 'Instagram' });
  });

  it('guarda o telefone COMO CHEGOU — é o rastro que o lead não guarda', () => {
    expect(evento.metadata.telefone_recebido).toBe('(19) 99999-9999');
    expect(evento.metadata.property_code).toBe('L014');
    expect(evento.metadata.divergencias).toEqual(['email']);
  });

  it('reprocessar o mesmo webhook não duplica o aviso', () => {
    const outro = eventoDeReentrada({
      existente: { id: 'lead-1' }, novo: { source: 'Instagram', source_lead_id: 'api_123' },
    });
    expect(outro.idempotency_key).toBe(evento.idempotency_key);
  });

  it('sem divergência, a chave nem aparece no metadata', () => {
    const limpo = eventoDeReentrada({ existente: { id: 'l' }, novo: { source: 'ZAP Imóveis', source_lead_id: 'z1' } });
    expect(limpo.metadata).toEqual({ origem: 'ZAP Imóveis' });
  });
});

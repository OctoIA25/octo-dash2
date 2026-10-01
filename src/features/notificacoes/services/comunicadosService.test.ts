import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import {
  enviarComunicado, filtrarPessoas, mensagemDoErro, podeEnviar, previaDoComunicado, rotuloDaEscolha, separarLeitura,
  type LeituraDaPessoa, type OpcoesDoComunicado,
} from './comunicadosService';

const RASCUNHO = { titulo: 'Reunião', mensagem: 'Amanhã às 9h', publico: 'equipes' as const, equipeIds: ['e-1'] };

describe('podeEnviar', () => {
  it('pede título, mensagem e destino', () => {
    expect(podeEnviar(RASCUNHO)).toBe(true);
    expect(podeEnviar({ ...RASCUNHO, titulo: '   ' })).toBe(false);
    expect(podeEnviar({ ...RASCUNHO, mensagem: '' })).toBe(false);
    expect(podeEnviar({ ...RASCUNHO, equipeIds: [] })).toBe(false);
    expect(podeEnviar({ ...RASCUNHO, publico: 'todos', equipeIds: [] })).toBe(true);
  });

  it('cargo e pessoa pedem ao menos um escolhido; o que vale é o do público atual', () => {
    expect(podeEnviar({ ...RASCUNHO, publico: 'cargos', cargoIds: ['c-1'] })).toBe(true);
    expect(podeEnviar({ ...RASCUNHO, publico: 'cargos', cargoIds: [] })).toBe(false);
    expect(podeEnviar({ ...RASCUNHO, publico: 'pessoas', pessoaIds: ['u-1'] })).toBe(true);
    // Equipes marcadas antes não contam quando o público passou a ser pessoas.
    expect(podeEnviar({ ...RASCUNHO, publico: 'pessoas', pessoaIds: [] })).toBe(false);
  });

  it('lançamento e material pedem qual; Metas e Bolsão não', () => {
    expect(podeEnviar({ ...RASCUNHO, destino: { tipo: 'lancamento' } })).toBe(false);
    expect(podeEnviar({ ...RASCUNHO, destino: { tipo: 'lancamento', id: 'l-1' } })).toBe(true);
    expect(podeEnviar({ ...RASCUNHO, destino: { tipo: 'material' } })).toBe(false);
    expect(podeEnviar({ ...RASCUNHO, destino: { tipo: 'metas' } })).toBe(true);
    expect(podeEnviar({ ...RASCUNHO, destino: { tipo: 'bolsao' } })).toBe(true);
    expect(podeEnviar({ ...RASCUNHO, destino: null })).toBe(true);
  });

  it('respeita os limites do banco', () => {
    expect(podeEnviar({ ...RASCUNHO, titulo: 'x'.repeat(120) })).toBe(true);
    expect(podeEnviar({ ...RASCUNHO, titulo: 'x'.repeat(121) })).toBe(false);
    expect(podeEnviar({ ...RASCUNHO, mensagem: 'y'.repeat(2001) })).toBe(false);
  });
});

describe('mensagemDoErro', () => {
  it('traduz os códigos do banco', () => {
    expect(mensagemDoErro('sem_permissao')).toBe('Você só pode enviar para as suas equipes e para quem responde a você.');
    expect(mensagemDoErro('sem_destinatarios')).toBe('Ninguém recebe esse comunicado. Escolha outro público.');
    expect(mensagemDoErro('equipe_invalida')).toBe('Escolha ao menos uma equipe.');
    expect(mensagemDoErro('cargo_invalido')).toBe('Escolha ao menos um cargo.');
    expect(mensagemDoErro('material_nao_encontrado')).toBe('Esse material não está publicado. Escolha outro.');
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
      .rejects.toThrow('Você só pode enviar para as suas equipes e para quem responde a você.');
  });

  it('cargo manda os cargos; pessoas, os ids; e nenhum dos dois leva as equipes marcadas antes', async () => {
    rpc.mockResolvedValue({ data: [{ destinatarios: 3 }], error: null });
    await enviarComunicado({ tenantId: 't-1', ...RASCUNHO, publico: 'cargos', cargoIds: ['c-1'], importante: false, idempotencyKey: 'k' });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_publico_tipo: 'cargos', p_cargo_ids: ['c-1'], p_equipe_ids: [] });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('p_user_ids');
    await enviarComunicado({ tenantId: 't-1', ...RASCUNHO, publico: 'pessoas', pessoaIds: ['u-1', 'u-2'], importante: false, idempotencyKey: 'k' });
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_publico_tipo: 'pessoas', p_user_ids: ['u-1', 'u-2'], p_equipe_ids: [] });
  });

  it('destino e ciente só vão quando escolhidos; Metas vai sem id', async () => {
    rpc.mockResolvedValue({ data: [{ destinatarios: 3 }], error: null });
    await enviarComunicado({ tenantId: 't-1', ...RASCUNHO, destino: { tipo: 'lancamento', id: 'l-1' }, exigeCiente: true, importante: false, idempotencyKey: 'k' });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_link_type: 'lancamento', p_link_id: 'l-1', p_exige_ciente: true });
    await enviarComunicado({ tenantId: 't-1', ...RASCUNHO, destino: { tipo: 'metas', id: 'lixo' }, importante: false, idempotencyKey: 'k' });
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_link_type: 'metas', p_link_id: null });
    expect(rpc.mock.calls[1][1]).not.toHaveProperty('p_exige_ciente');
  });
});

describe('previaDoComunicado', () => {
  beforeEach(() => rpc.mockReset());

  it('pergunta ao banco e devolve nome, cargo e equipe', async () => {
    rpc.mockResolvedValueOnce({ data: [{ user_id: 'u-1', nome: 'João', cargo: 'Corretor', equipe: 'Equipe A' }], error: null });
    const pessoas = await previaDoComunicado('t-1', { publico: 'cargos', equipeIds: ['e-velha'], cargoIds: ['c-1'] });
    expect(pessoas).toEqual([{ id: 'u-1', nome: 'João', cargo: 'Corretor', equipe: 'Equipe A' }]);
    expect(rpc).toHaveBeenCalledWith('previa_comunicado', {
      p_tenant_id: 't-1', p_publico_tipo: 'cargos', p_equipe_ids: [], p_cargo_ids: ['c-1'], p_user_ids: [],
    });
  });
});

const OPCOES: OpcoesDoComunicado = {
  equipes: [{ id: 'e-1', nome: 'Equipe A' }, { id: 'e-2', nome: 'Equipe B' }],
  cargos: [{ id: 'c-1', nome: 'Corretor', pessoas: 11 }],
  pessoas: [
    { id: 'u-1', nome: 'João Álvares', cargo: 'Corretor', equipe: 'Equipe A' },
    { id: 'u-2', nome: 'Rui', cargo: 'Gerente', equipe: 'Equipe B' },
  ],
  lancamentos: [],
  materiais: [],
};

describe('rotuloDaEscolha', () => {
  it('diz o público em uma linha', () => {
    expect(rotuloDaEscolha({ publico: 'todos', equipeIds: [] }, OPCOES)).toBe('Toda a imobiliária');
    expect(rotuloDaEscolha({ publico: 'equipes', equipeIds: ['e-2', 'e-1'] }, OPCOES)).toBe('Equipe A, Equipe B');
    expect(rotuloDaEscolha({ publico: 'cargos', equipeIds: [], cargoIds: ['c-1'] }, OPCOES)).toBe('Corretor');
    expect(rotuloDaEscolha({ publico: 'pessoas', equipeIds: [], pessoaIds: ['u-2'] }, OPCOES)).toBe('Rui');
    expect(rotuloDaEscolha({ publico: 'pessoas', equipeIds: [], pessoaIds: ['u-1', 'u-2'] }, OPCOES)).toBe('2 pessoas');
    expect(rotuloDaEscolha({ publico: 'equipes', equipeIds: [] }, OPCOES)).toBe('');
  });
});

describe('filtrarPessoas', () => {
  it('acha por nome, cargo ou equipe, sem acento nem caixa', () => {
    expect(filtrarPessoas(OPCOES.pessoas, 'alvares').map((p) => p.id)).toEqual(['u-1']);
    expect(filtrarPessoas(OPCOES.pessoas, 'GERENTE').map((p) => p.id)).toEqual(['u-2']);
    expect(filtrarPessoas(OPCOES.pessoas, 'equipe').map((p) => p.id)).toEqual(['u-1', 'u-2']);
    expect(filtrarPessoas(OPCOES.pessoas, '  ')).toHaveLength(2);
  });
});

describe('separarLeitura', () => {
  const p = (id: string, lidoEm: string | null, cienteEm: string | null): LeituraDaPessoa =>
    ({ id, nome: id, lidoEm, cienteEm, copiaGestor: false });
  const pessoas = [p('nao-leu', null, null), p('leu', '2026-10-01T10:00:00Z', null), p('ciente', '2026-10-01T10:00:00Z', '2026-10-01T10:05:00Z')];

  it('aviso comum: fez = leu', () => {
    const { faltam, fizeram } = separarLeitura(pessoas, false);
    expect(faltam.map((x) => x.id)).toEqual(['nao-leu']);
    expect(fizeram.map((x) => x.id)).toEqual(['leu', 'ciente']);
  });

  it('aviso que pede ciente: ler sem clicar em Ciente não conta', () => {
    const { faltam, fizeram } = separarLeitura(pessoas, true);
    expect(faltam.map((x) => x.id)).toEqual(['nao-leu', 'leu']);
    expect(fizeram.map((x) => x.id)).toEqual(['ciente']);
  });
});

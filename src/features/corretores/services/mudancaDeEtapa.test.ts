import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpc, createTenantMember, changeCandidateStatus, retrocederEtapa, toast } = vi.hoisted(() => ({
  rpc: vi.fn(),
  createTenantMember: vi.fn(),
  changeCandidateStatus: vi.fn(),
  retrocederEtapa: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/lib/supabaseClient', () => ({ supabase: { rpc } }));
vi.mock('./tenantMembersService', () => ({ createTenantMember }));
vi.mock('./recruitmentService', () => ({ recruitmentService: { changeCandidateStatus, retrocederEtapa } }));
vi.mock('sonner', () => ({ toast }));

import { efeitoDaEtapa, aplicarMudancaDeEtapa, type MudancaDeEtapa } from './mudancaDeEtapa';

describe('efeitoDaEtapa — qual efeito colateral cada passagem dispara', () => {
  it('chegar a Onboard cria a conta de corretor', () => {
    expect(efeitoDaEtapa('matricula', 'Onboard')).toBe('criar_conta');
    expect(efeitoDaEtapa('lead', 'Onboard')).toBe('criar_conta');
  });
  it('só onboard → perdido desvincula da equipe', () => {
    expect(efeitoDaEtapa('onboard', 'Perdido')).toBe('desvincular');
  });
  it('qualquer outra passagem não mexe em conta nenhuma — mesmo que o e-mail tenha conta', () => {
    expect(efeitoDaEtapa('lead', 'Interação')).toBe('nenhum');
    expect(efeitoDaEtapa('qualificado', 'Perdido')).toBe('nenhum');
    expect(efeitoDaEtapa('matricula', 'Perdido')).toBe('nenhum');
    expect(efeitoDaEtapa(undefined, 'Matrícula')).toBe('nenhum');
  });
});

const candidato: MudancaDeEtapa['candidato'] = {
  id: 'c1', tenant_id: 't1', nome: 'Ana', email: ' Ana@X.com ', telefone: '5511988887777', estagio: 'lead',
};

describe('aplicarMudancaDeEtapa — os efeitos em um lugar só', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    changeCandidateStatus.mockResolvedValue({ ...candidato, estagio: 'interacao', status: 'Interação' });
  });

  it('etapa comum: só grava o evento, com o e-mail de quem moveu; NÃO consulta conta', async () => {
    const r = await aplicarMudancaDeEtapa({ candidato, novoLabel: 'Interação', usuarioEmail: 'erick@lotus.com', tenantId: 't1' });
    expect(rpc).not.toHaveBeenCalled();
    expect(createTenantMember).not.toHaveBeenCalled();
    expect(changeCandidateStatus).toHaveBeenCalledWith('c1', 'Interação', 'erick@lotus.com');
    expect(r.status).toBe('Interação');
  });

  it('para Perdido vindo de Qualificado: nada de desvincular, mesmo com conta no e-mail', async () => {
    await aplicarMudancaDeEtapa({ candidato: { ...candidato, estagio: 'qualificado' }, novoLabel: 'Perdido', tenantId: 't1' });
    expect(rpc).not.toHaveBeenCalled();
    expect(changeCandidateStatus).toHaveBeenCalledWith('c1', 'Perdido', undefined);
  });

  it('Onboard: grava o EVENTO primeiro e só depois cria a conta, com origem recrutamento', async () => {
    const ordem: string[] = [];
    changeCandidateStatus.mockImplementation(async () => { ordem.push('evento'); return { ...candidato, estagio: 'onboard' }; });
    createTenantMember.mockImplementation(async () => { ordem.push('conta'); return { success: true }; });

    await aplicarMudancaDeEtapa({ candidato: { ...candidato, estagio: 'matricula' }, novoLabel: 'Onboard', usuarioEmail: 'erick@lotus.com', tenantId: 't1' });

    expect(ordem).toEqual(['evento', 'conta']);
    expect(createTenantMember).toHaveBeenCalledWith('t1', expect.objectContaining({
      email: 'ana@x.com', password: 'ana@x.com', name: 'Ana', phone: '5511988887777', role: 'corretor',
      permissions: { origem: 'recrutamento', candidato_id: 'c1' },
    }));
    expect(toast.success).toHaveBeenCalledWith('Candidato aprovado e adicionado à equipe!');
  });

  it('Onboard: evento falha (ex. sem coordenador) → nada de conta, erro sobe com a mensagem real', async () => {
    changeCandidateStatus.mockRejectedValue(new Error('Defina o Coordenador do candidato antes de ativá-lo (regra D062).'));
    await expect(aplicarMudancaDeEtapa({ candidato, novoLabel: 'Onboard', tenantId: 't1' }))
      .rejects.toThrow('Defina o Coordenador');
    expect(createTenantMember).not.toHaveBeenCalled();
  });

  it('Onboard: conta já existia → sucesso idempotente, não erro', async () => {
    createTenantMember.mockResolvedValue({ success: false, error: 'Este usuário já é membro desta imobiliária' });
    await expect(aplicarMudancaDeEtapa({ candidato, novoLabel: 'Onboard', tenantId: 't1' })).resolves.toBeTruthy();
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/já existia/));
  });

  it('Onboard: conta falha depois do evento → etapa fica gravada, toast pede criar à mão com a mensagem real', async () => {
    createTenantMember.mockResolvedValue({ success: false, error: 'senha fraca' });
    await expect(aplicarMudancaDeEtapa({ candidato, novoLabel: 'Onboard', tenantId: 't1' })).resolves.toBeTruthy();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Onboard gravado.*senha fraca.*à mão/));
  });

  it('Onboard sem tenant nenhum: para ANTES de gravar', async () => {
    await expect(aplicarMudancaDeEtapa({ candidato: { ...candidato, tenant_id: undefined }, novoLabel: 'Onboard' }))
      .rejects.toThrow(/Tenant ID/);
    expect(changeCandidateStatus).not.toHaveBeenCalled();
  });

  it('tenant do candidato vence o da sessão', async () => {
    createTenantMember.mockResolvedValue({ success: true });
    await aplicarMudancaDeEtapa({ candidato: { ...candidato, tenant_id: 'do-candidato' }, novoLabel: 'Onboard', tenantId: 'da-sessao' });
    expect(createTenantMember.mock.calls[0][0]).toBe('do-candidato');
  });

  it('onboard → perdido com conta: desvincula da equipe pelo RPC (e-mail sem espaços) e grava o evento', async () => {
    rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: { desvinculado: true }, error: null });
    await aplicarMudancaDeEtapa({ candidato: { ...candidato, estagio: 'onboard' }, novoLabel: 'Perdido', tenantId: 't1' });
    expect(rpc).toHaveBeenNthCalledWith(1, 'usuario_ja_tem_conta', { p_email: 'Ana@X.com' });
    expect(rpc).toHaveBeenNthCalledWith(2, 'recrutamento_desvincular', { p_tenant_id: 't1', p_email: 'Ana@X.com' });
    expect(toast.success).toHaveBeenCalledWith('Usuário removido da equipe');
    expect(changeCandidateStatus).toHaveBeenCalledWith('c1', 'Perdido', undefined);
  });

  it('onboard → perdido sem conta: só grava o evento', async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    await aplicarMudancaDeEtapa({ candidato: { ...candidato, estagio: 'onboard' }, novoLabel: 'Perdido', tenantId: 't1' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(changeCandidateStatus).toHaveBeenCalledWith('c1', 'Perdido', undefined);
  });

  it('desvincular devolve null = sem permissão: para aqui, sem gravar', async () => {
    rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    await expect(aplicarMudancaDeEtapa({ candidato: { ...candidato, estagio: 'onboard' }, novoLabel: 'Perdido', tenantId: 't1' }))
      .rejects.toThrow('Você não tem permissão para remover este usuário da equipe');
    expect(changeCandidateStatus).not.toHaveBeenCalled();
  });

  it('erro ao verificar a conta em onboard → perdido: não move', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(aplicarMudancaDeEtapa({ candidato: { ...candidato, estagio: 'onboard' }, novoLabel: 'Perdido', tenantId: 't1' }))
      .rejects.toThrow('Erro ao verificar usuário existente');
    expect(changeCandidateStatus).not.toHaveBeenCalled();
  });

  it('candidato sem e-mail: onboard → perdido não consulta conta; Onboard não derruba (conta fica para a mão)', async () => {
    await aplicarMudancaDeEtapa({ candidato: { ...candidato, email: null, estagio: 'onboard' }, novoLabel: 'Perdido', tenantId: 't1' });
    expect(rpc).not.toHaveBeenCalled();

    createTenantMember.mockResolvedValue({ success: false, error: 'Formato de email inválido' });
    await expect(aplicarMudancaDeEtapa({ candidato: { ...candidato, email: null }, novoLabel: 'Onboard', tenantId: 't1' })).resolves.toBeTruthy();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Formato de email inválido/));
  });
});

describe('aplicarMudancaDeEtapa — voltar de etapa e reabrir (29/09)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    retrocederEtapa.mockResolvedValue({ ...candidato, estagio: 'interacao', status: 'Interação' });
  });

  it('para trás grava o evento de retrocesso, com quem moveu, e NÃO passa pelo caminho de avançar', async () => {
    const r = await aplicarMudancaDeEtapa({ candidato: { ...candidato, estagio: 'qualificado' }, novoLabel: 'Interação', usuarioEmail: 'erick@lotus.com', tenantId: 't1' });
    expect(retrocederEtapa).toHaveBeenCalledWith('c1', 'interacao', 'erick@lotus.com');
    expect(changeCandidateStatus).not.toHaveBeenCalled();
    expect(r.status).toBe('Interação');
  });

  it('voltar de Onboard NÃO mexe na conta do corretor: nem cria, nem desvincula', async () => {
    await aplicarMudancaDeEtapa({ candidato: { ...candidato, estagio: 'onboard' }, novoLabel: 'Matrícula', tenantId: 't1' });
    expect(retrocederEtapa).toHaveBeenCalledWith('c1', 'matricula', undefined);
    expect(rpc).not.toHaveBeenCalled();
    expect(createTenantMember).not.toHaveBeenCalled();
  });

  it('reabrir um perdido é retroceder — mesmo para Onboard, sem criar conta', async () => {
    await aplicarMudancaDeEtapa({ candidato: { ...candidato, estagio: 'perdido' }, novoLabel: 'Onboard', tenantId: 't1' });
    expect(retrocederEtapa).toHaveBeenCalledWith('c1', 'onboard', undefined);
    expect(createTenantMember).not.toHaveBeenCalled();
    expect(changeCandidateStatus).not.toHaveBeenCalled();
  });

  it('mesma etapa: recusa antes de gravar qualquer coisa', async () => {
    await expect(aplicarMudancaDeEtapa({ candidato: { ...candidato, estagio: 'lead' }, novoLabel: 'Lead', tenantId: 't1' }))
      .rejects.toThrow(/já está/);
    expect(retrocederEtapa).not.toHaveBeenCalled();
    expect(changeCandidateStatus).not.toHaveBeenCalled();
  });
});

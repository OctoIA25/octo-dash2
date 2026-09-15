import { describe, it, expect } from 'vitest';
import { podeEditarImovel } from './podeEditarImovel';

const corretor = {
  temRegistroLocal: true,
  systemRole: 'corretor',
  userId: 'user-1',
  userEmail: 'corretor@octo.com',
};

describe('podeEditarImovel', () => {
  it('bloqueia imóvel sem registro local, mesmo para owner', () => {
    expect(podeEditarImovel({ ...corretor, temRegistroLocal: false, systemRole: 'owner' })).toBe(false);
  });

  it('libera owner e admin independentemente do caixa alta do role', () => {
    expect(podeEditarImovel({ ...corretor, systemRole: 'Owner' })).toBe(true);
    expect(podeEditarImovel({ ...corretor, systemRole: 'ADMIN' })).toBe(true);
  });

  it('libera o captador pelo e-mail', () => {
    expect(podeEditarImovel({ ...corretor, captadorEmail: 'Corretor@Octo.com' })).toBe(true);
  });

  it('libera quem cadastrou o imóvel', () => {
    expect(podeEditarImovel({ ...corretor, criadoPor: 'user-1' })).toBe(true);
  });

  it('bloqueia corretor que não é captador nem criador', () => {
    expect(
      podeEditarImovel({ ...corretor, captadorEmail: 'outro@octo.com', criadoPor: 'user-2' })
    ).toBe(false);
  });

  it('não confunde campos vazios dos dois lados', () => {
    expect(podeEditarImovel({ temRegistroLocal: true, systemRole: 'corretor' })).toBe(false);
    expect(
      podeEditarImovel({ temRegistroLocal: true, systemRole: 'corretor', criadoPor: null, userId: null })
    ).toBe(false);
  });

  it('libera o corretor pelo captador_id (atribuição manual)', () => {
    expect(podeEditarImovel({ ...corretor, captadorId: 'user-1' })).toBe(true);
    expect(podeEditarImovel({ ...corretor, captadorId: 'user-2' })).toBe(false);
  });

  it('libera o corretor pelo captador_2_id (2º captador)', () => {
    expect(podeEditarImovel({ ...corretor, captadorId: 'user-2', captador2Id: 'user-1' })).toBe(true);
    expect(podeEditarImovel({ ...corretor, captadorId: 'user-2', captador2Id: 'user-3' })).toBe(false);
  });

  describe('gestor (team_leader) — escopo da equipe', () => {
    const gestor = {
      temRegistroLocal: true,
      systemRole: 'team_leader',
      userId: 'gestor-1',
      userEmail: 'gestor@octo.com',
      equipeUserIds: ['gestor-1', 'membro-1'],
      equipeEmails: ['gestor@octo.com', 'membro1@octo.com'],
    };

    it('libera imóvel captado por um membro da equipe (por e-mail)', () => {
      expect(podeEditarImovel({ ...gestor, captadorEmail: 'Membro1@Octo.com' })).toBe(true);
    });

    it('libera imóvel criado por um membro da equipe (por id)', () => {
      expect(podeEditarImovel({ ...gestor, criadoPor: 'membro-1' })).toBe(true);
    });

    it('libera o próprio imóvel do gestor', () => {
      expect(podeEditarImovel({ ...gestor, captadorEmail: 'gestor@octo.com' })).toBe(true);
    });

    it('bloqueia imóvel de corretor de outra equipe', () => {
      expect(
        podeEditarImovel({ ...gestor, captadorEmail: 'fora@octo.com', criadoPor: 'membro-9' })
      ).toBe(false);
    });

    it('libera imóvel da própria atuação mesmo criado por outra equipe', () => {
      expect(
        podeEditarImovel({
          ...gestor,
          criadoPor: 'membro-9',
          finalidade: 'venda',
          permissions: { atuacao: ['prontos'] },
        })
      ).toBe(true);
      expect(
        podeEditarImovel({
          ...gestor,
          criadoPor: 'membro-9',
          finalidade: 'locacao',
          permissions: { atuacao: ['alugados'] },
        })
      ).toBe(true);
    });

    it('venda_locacao casa com qualquer uma das duas atuações', () => {
      expect(
        podeEditarImovel({
          ...gestor,
          criadoPor: 'membro-9',
          finalidade: 'venda_locacao',
          permissions: { atuacao: ['alugados'] },
        })
      ).toBe(true);
    });

    it('bloqueia imóvel fora da atuação do gestor (e de fora da equipe)', () => {
      expect(
        podeEditarImovel({
          ...gestor,
          criadoPor: 'membro-9',
          finalidade: 'venda',
          permissions: { atuacao: ['alugados'] },
        })
      ).toBe(false);
      expect(
        podeEditarImovel({
          ...gestor,
          criadoPor: 'membro-9',
          finalidade: 'locacao',
          permissions: { atuacao: ['lancamentos'] },
        })
      ).toBe(false);
    });

    it('gestor sem atuação marcada cobre tudo (fail-open, como atuacoesDe)', () => {
      expect(
        podeEditarImovel({ ...gestor, criadoPor: 'membro-9', finalidade: 'venda' })
      ).toBe(true);
    });

    it('atuação não vaza para corretor', () => {
      expect(
        podeEditarImovel({
          ...corretor,
          criadoPor: 'user-2',
          finalidade: 'venda',
          permissions: { atuacao: ['prontos'] },
        })
      ).toBe(false);
    });

    it('sem equipe carregada, cai no próprio usuário (não bloqueia o dele)', () => {
      expect(
        podeEditarImovel({
          temRegistroLocal: true,
          systemRole: 'team_leader',
          userId: 'gestor-1',
          userEmail: 'gestor@octo.com',
          captadorEmail: 'gestor@octo.com',
        })
      ).toBe(true);
    });
  });
});

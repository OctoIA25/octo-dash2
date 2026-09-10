import { describe, it, expect } from 'vitest';
import { montarUniverso, type MembroTenant } from '../montarUniverso';
import type { CorretorRoster } from '@/services/testesEstatisticasService';

const linhas: CorretorRoster[] = [
  { id: 1, nome: 'Ana',     email: 'ana@imob.com' },      // membro, sem teste
  { id: 2, nome: 'Bia',     email: 'BIA@imob.com' },      // membro, com teste (email em caixa alta)
  { id: 3, nome: 'Ex',      email: 'ex@imob.com' },       // NÃO é membro, mas tem teste
  { id: 4, nome: 'Fantasma', email: 'morto@imob.com' },   // NÃO é membro e não tem teste
];

const membros: MembroTenant[] = [
  { email: 'ana@imob.com', role: 'corretor' },
  { email: 'bia@imob.com', role: 'corretor' },
  { email: 'novo@imob.com', role: 'corretor' },  // membro sem linha em Corretores
  { email: 'dono@plataforma.com', role: 'owner' },
  { email: 'chefe@imob.com', role: 'admin' },
];

const comTeste = new Set([2, 3]);

describe('montarUniverso', () => {
  it('descarta cadastro morto: não é membro e não tem resultado', () => {
    const nomes = montarUniverso(linhas, comTeste, membros).map((p) => p.nome);
    expect(nomes).not.toContain('Fantasma');
  });

  it('mantém quem tem resultado mesmo sem vínculo, marcado como fora da equipe', () => {
    const ex = montarUniverso(linhas, comTeste, membros).find((p) => p.id === 3)!;
    expect(ex.foraDaEquipe).toBe(true);
  });

  it('casa email ignorando caixa', () => {
    const bia = montarUniverso(linhas, comTeste, membros).find((p) => p.id === 2)!;
    expect(bia.foraDaEquipe).toBe(false);
  });

  it('inclui membro sem linha em Corretores, sem id e marcado', () => {
    const novo = montarUniverso(linhas, comTeste, membros).find((p) => p.email === 'novo@imob.com')!;
    expect(novo.id).toBeNull();
    expect(novo.semCadastro).toBe(true);
  });

  it('ignora o owner da plataforma', () => {
    const emails = montarUniverso(linhas, comTeste, membros).map((p) => p.email);
    expect(emails).not.toContain('dono@plataforma.com');
  });

  it('ignora admin: não faz os testes, então não pode travar a adesão', () => {
    // com admin no denominador a adesão nunca fecharia 100%
    const emails = montarUniverso(linhas, comTeste, membros).map((p) => p.email);
    expect(emails).not.toContain('chefe@imob.com');
  });

  it('não conta duas vezes a mesma pessoa em linhas duplicadas', () => {
    const comDuplicata = [...linhas, { id: 99, nome: 'Ana (duplicada)', email: 'ana@imob.com' }];
    const u = montarUniverso(comDuplicata, comTeste, membros);
    expect(u.filter((p) => p.email.toLowerCase() === 'ana@imob.com')).toHaveLength(1);
  });

  it('entre duplicatas, mantém a linha que tem o resultado', () => {
    // Ana (id 1) não tem teste; a duplicata (id 99) tem. Manter a vazia faria a
    // pessoa aparecer como pendente e o perfil dela não abrir, enquanto a barra
    // de distribuição ainda a contava.
    const comDuplicata = [...linhas, { id: 99, nome: 'Ana', email: 'ana@imob.com' }];
    const u = montarUniverso(comDuplicata, new Set([...comTeste, 99]), membros);
    const ana = u.find((p) => p.email.toLowerCase() === 'ana@imob.com')!;
    expect(ana.id).toBe(99);
  });

  it('o denominador passa a ser o universo, não a tabela crua', () => {
    // Ana + Bia + Ex + novo = 4; a linha morta saiu. Antes seriam as 4 linhas cruas.
    expect(montarUniverso(linhas, comTeste, membros)).toHaveLength(4);
  });

  it('fail-open quando o tenant não tem nenhum corretor entre os membros', () => {
    const soAdmins: MembroTenant[] = [{ email: 'chefe@imob.com', role: 'admin' }];
    expect(montarUniverso(linhas, comTeste, soAdmins)).toHaveLength(linhas.length);
  });

  it('ignora membro cujo "email" é na verdade um UUID', () => {
    // mapTenantMemberRow cai para user_id quando o email falta; sem o guard de
    // '@', esse UUID virava pessoa fantasma no denominador
    const comUuid: MembroTenant[] = [
      ...membros,
      { email: '9f1c2d3e-0000-4a5b-8c9d-1e2f3a4b5c6d', role: 'corretor' },
    ];
    const u = montarUniverso(linhas, comTeste, comUuid);
    expect(u.some((p) => p.email.includes('-') && !p.email.includes('@'))).toBe(false);
  });

  it('admin com resultado antigo aparece, mas não é rotulado "fora da equipe"', () => {
    const linhasComAdmin = [...linhas, { id: 50, nome: 'Chefe', email: 'chefe@imob.com' }];
    const u = montarUniverso(linhasComAdmin, new Set([...comTeste, 50]), membros);
    const chefe = u.find((p) => p.id === 50)!;
    expect(chefe).toBeDefined();
    expect(chefe.foraDaEquipe).toBe(false);
  });

  it('fail-open: sem membros (RPC fora), devolve as linhas como antes', () => {
    expect(montarUniverso(linhas, comTeste, null)).toHaveLength(4);
    expect(montarUniverso(linhas, comTeste, []).map((p) => p.nome)).toContain('Fantasma');
  });
});

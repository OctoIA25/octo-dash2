import { describe, it, expect } from 'vitest';
import {
  resolveTeamColor,
  resolverEquipeDoLead,
  type TeamResolver,
  type TeamMetricInfo,
} from './teamMetricsService';

const prontos: TeamMetricInfo = { id: 't1', name: 'Prontos', color: '#3b82f6' };
const lancamentos: TeamMetricInfo = { id: 't2', name: 'Lançamentos', color: '#22c55e' };

const resolver: TeamResolver = {
  teams: [prontos, lancamentos],
  teamById: new Map([[prontos.id, prontos], [lancamentos.id, lancamentos]]),
  userIdToTeam: new Map([['user-1', prontos]]),
  // chaves já normalizadas por normalizeMetricKey (sem acento, minúsculas, espaço simples)
  nameToTeam: new Map([['samir said', lancamentos]]),
  emailToTeam: new Map(),
  teamMembers: new Map(),
};

describe('resolverEquipeDoLead', () => {
  it('resolve pelo id do corretor', () => {
    expect(resolverEquipeDoLead(resolver, { assigned_agent_id: 'user-1' })?.id).toBe('t1');
  });

  it('cai no nome quando o lead não tem id (caso dos leads vindos do Kenlo)', () => {
    // nome real do banco vem com espaço duplo e acento
    expect(resolverEquipeDoLead(resolver, { assigned_agent_name: 'Samir  Said' })?.id).toBe('t2');
  });

  it('prefere o id ao nome quando os dois existem', () => {
    expect(
      resolverEquipeDoLead(resolver, { assigned_agent_id: 'user-1', assigned_agent_name: 'Samir  Said' })?.id
    ).toBe('t1');
  });

  it('devolve null para corretor sem equipe — o lead fica fora do recorte', () => {
    expect(resolverEquipeDoLead(resolver, { assigned_agent_name: 'Fulano' })).toBeNull();
    expect(resolverEquipeDoLead(resolver, {})).toBeNull();
  });
});

describe('resolveTeamColor', () => {
  it('traduz o slug gravado pela tela de Equipes para hex', () => {
    expect(resolveTeamColor('verde')).toBe('#22c55e');
    expect(resolveTeamColor('Azul')).toBe('#3b82f6');
  });

  it('mantém hex já pronto e cai no cinza quando não há cor', () => {
    expect(resolveTeamColor('#ff0000')).toBe('#ff0000');
    expect(resolveTeamColor(null)).toBe('#6b7280');
  });
});

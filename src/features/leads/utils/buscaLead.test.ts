import { describe, it, expect } from 'vitest';
import { leadCasaBusca } from './buscaLead';
import type { KanbanLead } from '../services/leadsService';

const lead = {
  nomedolead: 'Maria Souza',
  lead: '11988887777',
  email: 'maria@ex.com',
  tags: ['Santa Angela', 'Site'],
} as KanbanLead;

describe('leadCasaBusca', () => {
  it('termo vazio não filtra nada', () => {
    expect(leadCasaBusca(lead, '')).toBe(true);
  });

  it('casa por nome, telefone e e-mail (case-insensitive)', () => {
    expect(leadCasaBusca(lead, 'souza')).toBe(true);
    expect(leadCasaBusca(lead, '98888')).toBe(true);
    expect(leadCasaBusca(lead, 'MARIA@EX'.toLowerCase())).toBe(true);
  });

  it('casa por tag', () => {
    expect(leadCasaBusca(lead, 'santa angela')).toBe(true);
    expect(leadCasaBusca(lead, 'site')).toBe(true);
  });

  it('não casa termo ausente', () => {
    expect(leadCasaBusca(lead, 'kenlo')).toBe(false);
  });

  it('sobrevive a campos nulos (lead Kenlo não tem tags)', () => {
    const semNada = { nomedolead: null, lead: null, email: null, tags: null } as unknown as KanbanLead;
    expect(leadCasaBusca(semNada, 'x')).toBe(false);
    expect(leadCasaBusca(semNada, '')).toBe(true);
  });
});

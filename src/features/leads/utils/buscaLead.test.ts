import { describe, it, expect } from 'vitest';
import { leadCasaBusca } from './buscaLead';
import type { KanbanLead } from '../services/leadsService';

const lead = {
  nomedolead: 'Maria Souza',
  lead: '11988887777',
  email: 'maria@ex.com',
  tags: ['Santa Angela', 'Site'],
  preferences: ['Apartamento', '3 quartos', 'Financiamento'],
  classification: ['lancamento'],
} as unknown as KanbanLead;

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

  it('casa por badge de preferência, inclusive no plural', () => {
    expect(leadCasaBusca(lead, 'apartamento')).toBe(true);
    expect(leadCasaBusca(lead, 'apartamentos')).toBe(true);
    expect(leadCasaBusca(lead, '3 quartos')).toBe(true);
    expect(leadCasaBusca(lead, 'financiamento')).toBe(true);
  });

  it('casa por badge de classificação, com ou sem acento', () => {
    expect(leadCasaBusca(lead, 'lancamento')).toBe(true);
    expect(leadCasaBusca(lead, 'lançamentos')).toBe(true);
    expect(leadCasaBusca({ ...lead, classification: ['pronto'] }, 'casa pronta')).toBe(false);
    expect(leadCasaBusca({ ...lead, preferences: ['Casa'], classification: ['pronto'] } as KanbanLead, 'casa pronta')).toBe(true);
    expect(leadCasaBusca({ ...lead, classification: ['locacao'] } as KanbanLead, 'aluguel')).toBe(true);
  });

  it('exige todas as palavras (AND), em qualquer ordem', () => {
    expect(leadCasaBusca(lead, 'apartamento financiamento')).toBe(true);
    expect(leadCasaBusca(lead, 'financiamento apartamento')).toBe(true);
    expect(leadCasaBusca(lead, 'apartamento galpao')).toBe(false);
  });

  it('lead sem classificação não vira palheiro de "sem classificação"', () => {
    const semClass = { ...lead, preferences: null, classification: null } as unknown as KanbanLead;
    expect(leadCasaBusca(semClass, 'sem')).toBe(false);
    expect(leadCasaBusca(semClass, 'indefinido')).toBe(false);
  });

  it('busca nos campos extras da tela (motivo de arquivamento)', () => {
    expect(leadCasaBusca(lead, 'duplicado')).toBe(false);
    expect(leadCasaBusca(lead, 'duplicado', ['Lead duplicado'])).toBe(true);
  });

  it('não casa termo ausente', () => {
    expect(leadCasaBusca(lead, 'kenlo')).toBe(false);
  });

  it('sobrevive a campos nulos (lead Kenlo não tem tags)', () => {
    const semNada = {
      nomedolead: null, lead: null, email: null, tags: null, preferences: null, classification: null,
    } as unknown as KanbanLead;
    expect(leadCasaBusca(semNada, 'x')).toBe(false);
    expect(leadCasaBusca(semNada, '')).toBe(true);
  });
});

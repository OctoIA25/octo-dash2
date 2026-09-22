/**
 * Leads sem atividade agendada, para a faixa nova da Central de Leads.
 *
 * Só entram na faixa os atribuídos nas últimas 24h: medido em 22/09/2026, a
 * Lotus tem 1.619 leads ativos sem nenhuma atividade agendada e só 19 caem
 * nessa janela. Mostrar os 1.619 não seria painel, seria relatório — o resto
 * vira um contador ao lado, que é o tamanho do passivo sem entupir a tela.
 *
 * Nenhum bloqueio aqui: a penalidade de 24h ficou para a reunião.
 */
import { describe, expect, it } from 'vitest';
import { separarLeadsSemAtividade } from './leadsSemAtividade';

const AGORA = new Date('2026-09-22T18:00:00Z');
const horasAtras = (h: number) => new Date(AGORA.getTime() - h * 3600 * 1000).toISOString();

const lead = (over: Partial<Parameters<typeof separarLeadsSemAtividade>[0][number]> = {}) => ({
  id: 'l1',
  nome: 'Ana',
  telefone: '11999990000',
  corretor: 'Fernanda',
  assigned_at: horasAtras(2),
  status: 'Novos Leads',
  ...over,
});

describe('separarLeadsSemAtividade', () => {
  it('lead atribuído nas últimas 24h e sem atividade entra na faixa', () => {
    const r = separarLeadsSemAtividade([lead()], new Set(), AGORA);

    expect(r.recentes.map((l) => l.id)).toEqual(['l1']);
    expect(r.totalSemAtividade).toBe(1);
    expect(r.antigos).toBe(0);
  });

  it('lead que já tem atividade agendada não aparece', () => {
    const r = separarLeadsSemAtividade([lead()], new Set(['l1']), AGORA);

    expect(r.recentes).toEqual([]);
    expect(r.totalSemAtividade).toBe(0);
  });

  it('passou de 24h: sai dos cards e vira contagem', () => {
    const r = separarLeadsSemAtividade([lead({ assigned_at: horasAtras(30) })], new Set(), AGORA);

    expect(r.recentes).toEqual([]);
    expect(r.antigos).toBe(1);
    expect(r.totalSemAtividade).toBe(1);
  });

  it('os cards vêm do mais antigo para o mais novo: quem espera há mais tempo primeiro', () => {
    const leads = [
      lead({ id: 'novo', assigned_at: horasAtras(1) }),
      lead({ id: 'quase', assigned_at: horasAtras(23) }),
      lead({ id: 'meio', assigned_at: horasAtras(10) }),
    ];

    expect(separarLeadsSemAtividade(leads, new Set(), AGORA).recentes.map((l) => l.id))
      .toEqual(['quase', 'meio', 'novo']);
  });

  it('lead sem data de atribuição não entra na faixa nem some da contagem', () => {
    const r = separarLeadsSemAtividade([lead({ assigned_at: null })], new Set(), AGORA);

    expect(r.recentes).toEqual([]);
    expect(r.totalSemAtividade).toBe(1);
    expect(r.antigos).toBe(1);
  });
});

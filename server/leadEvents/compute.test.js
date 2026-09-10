import { describe, it, expect } from 'vitest';
import { montarHistorico } from './compute.js';

const leadBase = {
  id: 'lead-1',
  tabela: 'leads',
  nome: 'Fulano',
  origem: 'ZAP',
  etapa: 'Novos Leads',
  corretor_nome: 'João',
  assigned_at: '2026-09-01T10:05:00Z',
  archived_at: null,
  archive_reason: null,
  created_at: '2026-09-01T10:00:00Z',
  event_at: '2026-09-01T10:00:00Z',
};

const linha = (over = {}) => ({
  id: 'ev-1',
  event_type: 'lead.stage_changed',
  descricao: null,
  de: 'Novos Leads',
  para: 'Interação',
  ator_tipo: 'usuario',
  ator_user_id: 'u-1',
  ator_nome: null,
  metadata: {},
  created_at: '2026-09-02T09:00:00Z',
  ...over,
});

const tipos = (h) => h.eventos.map((e) => e.tipo);

describe('montarHistorico', () => {
  it('lead antigo sem evento nenhum ainda conta a própria história', () => {
    // É o caso da base inteira no dia do deploy.
    const h = montarHistorico({ lead: leadBase, eventos: [] });
    expect(tipos(h)).toEqual(['lead.created', 'lead.assigned']);
    expect(h.eventos.every((e) => e.derivado)).toBe(true);
    expect(h.eventos[0].para).toBe('ZAP');
    expect(h.eventos[1].para).toBe('João');
    expect(h.resumo).toMatchObject({ reais: 0, derivados: 2 });
  });

  it('evento real substitui o derivado do mesmo tipo, não duplica', () => {
    const h = montarHistorico({
      lead: leadBase,
      eventos: [linha({ id: 'ev-a', event_type: 'lead.assigned', de: 'Maria', para: 'João' })],
    });
    expect(tipos(h)).toEqual(['lead.created', 'lead.assigned']);
    const atribuicao = h.eventos.find((e) => e.tipo === 'lead.assigned');
    // O real vence porque sabe o de/para; o derivado só saberia o estado final.
    expect(atribuicao).toMatchObject({ id: 'ev-a', de: 'Maria', derivado: false });
  });

  it('ordena por instante e desempata pela ordem natural do funil', () => {
    // A roleta atribui no MESMO INSERT que cria o lead (tr_leads_assign_roleta),
    // então os dois nascem com timestamp idêntico.
    const mesmoInstante = { ...leadBase, assigned_at: leadBase.created_at };
    const h = montarHistorico({
      lead: mesmoInstante,
      eventos: [linha({ created_at: '2026-09-05T08:00:00Z' })],
    });
    expect(tipos(h)).toEqual(['lead.created', 'lead.assigned', 'lead.stage_changed']);
  });

  it('intercala evento da LIA na ordem cronológica certa', () => {
    const h = montarHistorico({
      lead: leadBase,
      eventos: [
        linha({ id: 'ev-lia', event_type: 'lia.contato_realizado', created_at: '2026-09-01T11:00:00Z', ator_tipo: 'lia' }),
        linha({ id: 'ev-etapa', created_at: '2026-09-03T08:00:00Z' }),
      ],
    });
    expect(tipos(h)).toEqual([
      'lead.created',
      'lead.assigned',
      'lia.contato_realizado',
      'lead.stage_changed',
    ]);
    expect(h.eventos[2].ator.tipo).toBe('lia');
  });

  it('atendimento e atribuição de lead Kenlo saem do espelho do bolsão', () => {
    // kenlo_leads não tem assigned_at: sem o bolsão não haveria data.
    const kenlo = { ...leadBase, tabela: 'kenlo_leads', assigned_at: null, corretor_nome: null };
    const h = montarHistorico({
      lead: kenlo,
      eventos: [],
      bolsao: {
        data_atribuicao: '2026-09-01T10:30:00Z',
        data_atendimento: '2026-09-01T14:00:00Z',
        corretor_responsavel: 'Maria',
      },
    });
    expect(tipos(h)).toEqual(['lead.created', 'lead.assigned', 'lead.attended']);
    expect(h.eventos[1].para).toBe('Maria');
  });

  it('não inventa atribuição quando não há corretor', () => {
    // `leads.assigned_at` tem DEFAULT now(): existe até em lead de ninguém.
    const semDono = { ...leadBase, corretor_nome: null };
    const h = montarHistorico({ lead: semDono, eventos: [] });
    expect(tipos(h)).toEqual(['lead.created']);
  });

  it('arquivamento derivado carrega o motivo', () => {
    const arquivado = { ...leadBase, archived_at: '2026-09-09T18:00:00Z', archive_reason: 'sem_resposta' };
    const h = montarHistorico({ lead: arquivado, eventos: [] });
    expect(h.eventos.at(-1)).toMatchObject({ tipo: 'lead.archived', para: 'sem_resposta' });
  });

  it('descarta evento sem data válida em vez de embaralhar a linha do tempo', () => {
    const h = montarHistorico({
      lead: { ...leadBase, created_at: null, event_at: null, assigned_at: null },
      eventos: [linha({ id: 'ok' }), linha({ id: 'sem-data', created_at: null })],
    });
    expect(h.eventos.map((e) => e.id)).toEqual(['ok']);
  });

  it('propaga truncated para a tela poder dizer que é um recorte', () => {
    const h = montarHistorico({ lead: leadBase, eventos: [], truncated: true });
    expect(h.resumo.truncated).toBe(true);
  });
});

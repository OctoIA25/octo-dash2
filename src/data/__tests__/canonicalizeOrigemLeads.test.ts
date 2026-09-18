import { describe, it, expect } from 'vitest';
import { canonicalizeOrigemLeads } from '../realLeadsProcessor';
import { resolverOrigem, type OrigemCadastrada } from '@/features/relatorios/utils/origemRegistry';

// Este é o ÚNICO ponto por onde a origem dos leads passa antes de virar
// gráfico (RelatoriosPage, leadsMetricsService e a tela de Configurações
// chamam todos ele). Por isso o cadastro de origem plugou aqui, e não em
// cada gráfico — e por isso ele precisa de teste.

const lead = (origem_lead: string) => ({ origem_lead, id: origem_lead });

describe('canonicalizeOrigemLeads', () => {
  describe('sem cadastro (comportamento de sempre)', () => {
    it('unifica variantes de capitalização na mais frequente', () => {
      const r = canonicalizeOrigemLeads([
        lead('ZAP Imoveis'), lead('ZAP Imoveis'), lead('zap imoveis'),
      ]);
      expect(r.map((l) => l.origem_lead)).toEqual(['ZAP Imoveis', 'ZAP Imoveis', 'ZAP Imoveis']);
    });

    it('empate resolve pela ordem alfabética — não pela ordem do array', () => {
      const a = canonicalizeOrigemLeads([lead('Site'), lead('site')]);
      const b = canonicalizeOrigemLeads([lead('site'), lead('Site')]);
      expect(a[0].origem_lead).toBe(b[0].origem_lead);
    });

    it('NÃO junta as cinco variantes da LIA — é disso que o cadastro trata', () => {
      const r = canonicalizeOrigemLeads([
        lead('Lia (Japi Terceiros)'), lead('Lia (Lotus Brokers)'), lead('Lia · teste'),
      ]);
      expect(new Set(r.map((l) => l.origem_lead)).size).toBe(3);
    });

    it('origem vazia passa intacta (não vira "" agrupado)', () => {
      const r = canonicalizeOrigemLeads([lead(''), lead('  '), lead('Site')]);
      expect(r[0].origem_lead).toBe('');
      expect(r[1].origem_lead).toBe('  ');
      expect(r[2].origem_lead).toBe('Site');
    });

    it('não clona o objeto quando nada muda', () => {
      const original = lead('Site');
      const r = canonicalizeOrigemLeads([original]);
      expect(r[0]).toBe(original);
    });
  });

  describe('com o cadastro do tenant', () => {
    const cadastro: OrigemCadastrada[] = [
      { id: '1', codigo: 'lia', nome: 'LIA', cor: '#0F6B54', ordem: 1, midiaPaga: false, organica: false, ativo: true },
      { id: '2', codigo: 'parceria', nome: 'Parceria construtora', cor: '#F59E0B', ordem: 2, midiaPaga: false, organica: false, ativo: true },
    ];
    const conversoes = { 'santa angela': 'parceria' };
    const resolver = (t: string) => resolverOrigem(t, conversoes, cadastro);

    it('as cinco variantes da LIA viram UMA — o defeito que o P0.4 relata', () => {
      const r = canonicalizeOrigemLeads(
        [
          lead('Lia (Japi Terceiros)'), lead('Lia (Lotus Brokers)'),
          lead('Lia (Japi Lançamentos)'), lead('Lia · teste'),
          lead('Lia · cadastro de Octo (teste estudo)'),
        ],
        resolver
      );
      expect(new Set(r.map((l) => l.origem_lead))).toEqual(new Set(['LIA']));
    });

    it('a conversão salva vence a sugestão e o texto cru', () => {
      const r = canonicalizeOrigemLeads([lead('Santa Angela'), lead('santa angela')], resolver);
      expect(r.map((l) => l.origem_lead)).toEqual(['Parceria construtora', 'Parceria construtora']);
    });

    it('origem sem cadastro e sem sugestão mantém o texto — nada some do relatório', () => {
      const r = canonicalizeOrigemLeads([lead('ZAP Imóveis')], resolver);
      expect(r[0].origem_lead).toBe('ZAP Imóveis');
    });

    it('o cadastro ganha da heurística de frequência', () => {
      // "Lia (Japi Terceiros)" é 10x mais frequente; sem cadastro ela venceria.
      const leads = [...Array(10)].map(() => lead('Lia (Japi Terceiros)')).concat(lead('Lia · teste'));
      expect(canonicalizeOrigemLeads(leads)[10].origem_lead).toBe('Lia · teste');
      expect(canonicalizeOrigemLeads(leads, resolver)[10].origem_lead).toBe('LIA');
    });

    it('origem vazia continua vazia mesmo com cadastro', () => {
      expect(canonicalizeOrigemLeads([lead('')], resolver)[0].origem_lead).toBe('');
    });
  });
});

// Regressão encontrada NO NAVEGADOR em 18/09/2026, não pelo teste unitário:
// com o cadastro ligado, "Santa Angela" e "santa angela" voltaram a virar duas
// barras no gráfico de Relatórios. O resolvedor substituía a unificação de
// capitalização em vez de rodar depois dela.
describe('cadastro e capitalização são etapas somadas, não alternativas', () => {
  const resolver = (t: string) =>
    resolverOrigem(t, {}, [
      { id: '1', codigo: 'lia', nome: 'LIA', cor: '#000', ordem: 1, midiaPaga: false, organica: false, ativo: true },
    ]);

  it('origem SEM cadastro continua tendo a capitalização unificada', () => {
    const r = canonicalizeOrigemLeads(
      [lead('Santa Angela'), lead('Santa Angela'), lead('santa angela')],
      resolver
    );
    expect(new Set(r.map((l) => l.origem_lead))).toEqual(new Set(['Santa Angela']));
  });

  it('a unificação acontece ANTES do cadastro, então o cadastro vê o rótulo limpo', () => {
    const conversoes = { 'zap imoveis': 'portal' };
    const cadastro = [
      { id: '1', codigo: 'portal', nome: 'ZAP', cor: '#000', ordem: 1, midiaPaga: true, organica: false, ativo: true },
    ];
    const r = canonicalizeOrigemLeads(
      [lead('ZAP Imoveis'), lead('zap imoveis')],
      (t) => resolverOrigem(t, conversoes, cadastro)
    );
    expect(r.map((l) => l.origem_lead)).toEqual(['ZAP', 'ZAP']);
  });
});

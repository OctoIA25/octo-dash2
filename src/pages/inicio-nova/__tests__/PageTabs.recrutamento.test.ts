/**
 * As abas de Recrutamento (29/09): "Visão geral" e "Kanban", por segmento de
 * rota como Estudo de Mercado. A ordem importa: com `pathSegment`, em
 * `/recrutamento` (sem segmento) o PageTabs cai em `tabs[0]` — e é a Visão
 * geral que tem de acender, não o Kanban.
 */
import { describe, it, expect } from 'vitest';
import { TAB_CONFIGS } from '../PageTabs';

describe('abas de /recrutamento', () => {
  const cfg = TAB_CONFIGS.find((c) => c.basePath === '/recrutamento');

  it('existe, por segmento de rota, com Visão geral primeiro e Kanban depois', () => {
    expect(cfg?.matchStrategy).toBe('pathSegment');
    expect(cfg?.tabs.map((t) => [t.id, t.label, t.href])).toEqual([
      ['geral', 'Visão geral', '/recrutamento/geral'],
      ['kanban', 'Kanban', '/recrutamento/kanban'],
    ]);
  });

  it('o id de cada aba é o segmento da rota — é assim que o PageTabs resolve a ativa', () => {
    for (const t of cfg?.tabs ?? []) {
      expect(t.href.slice('/recrutamento/'.length)).toBe(t.id);
    }
  });
});

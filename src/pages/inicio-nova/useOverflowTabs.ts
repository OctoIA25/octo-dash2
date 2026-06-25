/**
 * useOverflowTabs - Decide quais abas cabem na largura disponível e quais vão
 * para o menu "Mais". Mede a largura real de cada aba uma única vez por
 * configuração e reparte com base na largura observada do container.
 *
 * A aba ativa nunca cai no overflow: se não couber, é promovida para a área
 * visível trocando de lugar com a última aba visível.
 */

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

/** Largura reservada para o botão "Mais" (px). Inclui ícone, label e gap. */
const MORE_BUTTON_WIDTH = 96;

/** Gap horizontal entre abas, em px (equivale ao gap-1.5 do container). */
const TAB_GAP = 6;

export interface OverflowTab {
  id: string;
}

interface UseOverflowTabsResult<T extends OverflowTab> {
  visibleTabs: T[];
  overflowTabs: T[];
  /** Aplicar ao container que delimita o espaço disponível. */
  containerRef: (node: HTMLElement | null) => void;
  /** Aplicar a cada aba para medir sua largura individual. */
  registerTab: (id: string) => (node: HTMLElement | null) => void;
}

/**
 * Reparte as abas em visíveis/overflow a partir das larguras medidas.
 * Lógica pura — sem DOM — para ser testável isoladamente.
 */
export function partitionTabs<T extends OverflowTab>(
  tabs: T[],
  widths: Map<string, number>,
  containerWidth: number,
  activeId: string | null,
): { visibleTabs: T[]; overflowTabs: T[] } {
  // Sem medições ainda, ou espaço não calculado: mostra tudo (estado inicial).
  if (containerWidth <= 0 || widths.size < tabs.length) {
    return { visibleTabs: tabs, overflowTabs: [] };
  }

  const totalWidth = tabs.reduce((acc, tab, idx) => {
    const w = widths.get(tab.id) ?? 0;
    return acc + w + (idx > 0 ? TAB_GAP : 0);
  }, 0);

  // Tudo cabe: nenhum overflow, sem reservar espaço para o "Mais".
  if (totalWidth <= containerWidth) {
    return { visibleTabs: tabs, overflowTabs: [] };
  }

  // Não cabe tudo: reserva espaço para o botão "Mais" e acumula até estourar.
  const budget = containerWidth - MORE_BUTTON_WIDTH;
  const visible: T[] = [];
  const overflow: T[] = [];
  let used = 0;

  for (const tab of tabs) {
    const w = widths.get(tab.id) ?? 0;
    const next = used + (visible.length > 0 ? TAB_GAP : 0) + w;
    if (next <= budget) {
      visible.push(tab);
      used = next;
    } else {
      overflow.push(tab);
    }
  }

  // Garante a aba ativa visível: se caiu no overflow, promove para o trilho.
  // Mesmo num trilho tão estreito que nada coube (visible vazio), a aba ativa
  // precisa aparecer — é o caso mobile/tablet "aba ativa + Mais".
  if (activeId && overflow.some((t) => t.id === activeId)) {
    const activeTab = overflow.find((t) => t.id === activeId)!;
    // Mantém as visíveis exceto a última (que cede lugar à ativa). Se não houver
    // nenhuma visível, a ativa passa a ser a única.
    const kept = visible.slice(0, Math.max(0, visible.length - 1));
    const newVisibleIds = new Set([...kept, activeTab].map((t) => t.id));
    // Reparticiona preservando a ordem original das abas.
    const newVisible = tabs.filter((t) => newVisibleIds.has(t.id));
    const newOverflow = tabs.filter((t) => !newVisibleIds.has(t.id));
    return { visibleTabs: newVisible, overflowTabs: newOverflow };
  }

  return { visibleTabs: visible, overflowTabs: overflow };
}

export function useOverflowTabs<T extends OverflowTab>(
  tabs: T[],
  activeId: string | null,
): UseOverflowTabsResult<T> {
  const [containerWidth, setContainerWidth] = useState(0);
  const tabWidths = useRef(new Map<string, number>());
  const [widthsVersion, setWidthsVersion] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  const containerRef = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setContainerWidth(width);
    });
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  const registerTab = useCallback(
    (id: string) => (node: HTMLElement | null) => {
      if (!node) return;
      const width = node.getBoundingClientRect().width;
      if (width > 0 && tabWidths.current.get(id) !== width) {
        tabWidths.current.set(id, width);
        // Sinaliza nova medição para refazer a partição.
        setWidthsVersion((v) => v + 1);
      }
    },
    [],
  );

  // Reseta as larguras quando o conjunto de abas muda (troca de seção/rota).
  const tabsKey = tabs.map((t) => t.id).join('|');
  useLayoutEffect(() => {
    tabWidths.current = new Map();
    setWidthsVersion((v) => v + 1);
  }, [tabsKey]);

  return useMemo(() => {
    const { visibleTabs, overflowTabs } = partitionTabs(
      tabs,
      tabWidths.current,
      containerWidth,
      activeId,
    );
    return { visibleTabs, overflowTabs, containerRef, registerTab };
    // widthsVersion entra como dependência para recalcular após medir as abas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabsKey, containerWidth, activeId, widthsVersion, containerRef, registerTab]);
}

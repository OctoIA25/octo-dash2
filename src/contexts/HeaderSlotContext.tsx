import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface HeaderSlotContextValue {
  slot: ReactNode;
  setSlot: (node: ReactNode) => void;
  clearSlot: () => void;
}

const HeaderSlotContext = createContext<HeaderSlotContextValue>({
  slot: null,
  setSlot: () => {},
  clearSlot: () => {},
});

export function HeaderSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlotState] = useState<ReactNode>(null);
  const setSlot = useCallback((node: ReactNode) => setSlotState(node), []);
  const clearSlot = useCallback(() => setSlotState(null), []);
  return (
    <HeaderSlotContext.Provider value={{ slot, setSlot, clearSlot }}>
      {children}
    </HeaderSlotContext.Provider>
  );
}

export function useHeaderSlot() {
  return useContext(HeaderSlotContext);
}

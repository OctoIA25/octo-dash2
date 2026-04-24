/**
 * NovoActionsContext - Ações contextuais do botão "Novo" no header
 *
 * Cada página registra o que o botão "Novo" deve fazer quando o usuário
 * estiver nela. Se houver 0 ações registradas, o botão some. Se houver 1,
 * o clique executa direto. Se houver 2+, abre um dropdown com as opções.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ElementType,
  type ReactNode,
} from 'react';

export interface NovoAction {
  id: string;
  label: string;
  /** Componente de ícone (lucide-react ou qualquer outro). */
  icon?: ElementType;
  onClick: () => void;
}

interface NovoActionsContextValue {
  actions: NovoAction[];
  /** Registra ações para o botão "Novo". Retorna função de cleanup. */
  registerActions: (ownerId: string, actions: NovoAction[]) => void;
  clearActions: (ownerId: string) => void;
}

const NovoActionsContext = createContext<NovoActionsContextValue | undefined>(undefined);

export function NovoActionsProvider({ children }: { children: ReactNode }) {
  // Usar ref para evitar re-renderizações em cascata; consumimos via state quando mudar.
  const ownersRef = useRef<Map<string, NovoAction[]>>(new Map());
  const [actions, setActions] = useState<NovoAction[]>([]);

  const recompute = useCallback(() => {
    // Combina as ações de todos os owners registrados na ordem de inserção.
    const merged: NovoAction[] = [];
    ownersRef.current.forEach((list) => merged.push(...list));
    setActions(merged);
  }, []);

  const registerActions = useCallback(
    (ownerId: string, next: NovoAction[]) => {
      ownersRef.current.set(ownerId, next);
      recompute();
    },
    [recompute]
  );

  const clearActions = useCallback(
    (ownerId: string) => {
      if (ownersRef.current.delete(ownerId)) {
        recompute();
      }
    },
    [recompute]
  );

  const value = useMemo(
    () => ({ actions, registerActions, clearActions }),
    [actions, registerActions, clearActions]
  );

  return <NovoActionsContext.Provider value={value}>{children}</NovoActionsContext.Provider>;
}

export function useNovoActions(): NovoActionsContextValue {
  const ctx = useContext(NovoActionsContext);
  if (!ctx) {
    throw new Error('useNovoActions precisa estar dentro de <NovoActionsProvider>');
  }
  return ctx;
}

/**
 * Hook para registrar ações do botão "Novo" enquanto a página estiver montada.
 *
 * @param ownerId Identificador estável da página (ex: "meus-leads:kanban").
 * @param actions Lista de ações disponíveis. Passe [] para desregistrar.
 */
export function useRegisterNovoActions(ownerId: string, actions: NovoAction[]): void {
  const { registerActions, clearActions } = useNovoActions();

  // Serializa as ações para detectar mudanças sem exigir useMemo do consumidor.
  const serialized = actions.map((a) => `${a.id}::${a.label}`).join('|');

  useEffect(() => {
    registerActions(ownerId, actions);
    return () => clearActions(ownerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, serialized, registerActions, clearActions]);
}

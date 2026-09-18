/**
 * Hook do cadastro de origem de lead (P0.4).
 *
 * Carrega as origens da imobiliária e as conversões salvas, e expõe UM
 * resolvedor para quem desenha relatório. A precedência é a mesma de
 * useLeadSourceChannels: escolha salva > sugestão mecânica > texto cru.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  fetchOrigens,
  fetchConversoes,
  saveOrigem,
  deleteOrigem,
  saveConversao,
  deleteConversao,
  type EntradaDeOrigem,
} from '../services/origemRegistryService';
import {
  resolverOrigem,
  aparenciaDaOrigem,
  type OrigemCadastrada,
  type TabelaDeConversao,
} from '../utils/origemRegistry';

export interface UseOrigemRegistryResult {
  origens: OrigemCadastrada[];
  conversoes: TabelaDeConversao;
  loading: boolean;
  saving: boolean;
  /** O rótulo final de um texto cru de origem. */
  resolver: (textoBruto: string | null | undefined) => string;
  /** Cor e posição de uma origem cadastrada; `null` quando não está no cadastro. */
  aparencia: (nome: string) => { cor: string; ordem: number } | null;
  salvarOrigem: (origem: EntradaDeOrigem) => Promise<boolean>;
  removerOrigem: (codigo: string) => Promise<boolean>;
  salvarConversao: (textoBruto: string, origemCodigo: string) => Promise<boolean>;
  removerConversao: (textoBruto: string) => Promise<boolean>;
  reload: () => void;
}

export function useOrigemRegistry(): UseOrigemRegistryResult {
  const { tenantId } = useAuthContext();
  const [origens, setOrigens] = useState<OrigemCadastrada[]>([]);
  const [conversoes, setConversoes] = useState<TabelaDeConversao>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!tenantId) {
      setOrigens([]);
      setConversoes({});
      return;
    }
    setLoading(true);
    Promise.all([fetchOrigens(tenantId), fetchConversoes(tenantId)])
      .then(([o, c]) => {
        if (cancelled) return;
        setOrigens(o);
        setConversoes(c);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Só as ativas resolvem: desativar uma origem devolve os leads dela para a
  // sugestão mecânica, sem apagar o cadastro nem perder lead do relatório.
  const ativas = useMemo(() => origens.filter((o) => o.ativo), [origens]);

  const resolver = useCallback(
    (textoBruto: string | null | undefined) => resolverOrigem(textoBruto, conversoes, ativas),
    [conversoes, ativas]
  );

  const aparencia = useCallback((nome: string) => aparenciaDaOrigem(nome, ativas), [ativas]);

  // Escrita: sem atualização otimista. O cadastro é a fonte dos rótulos de
  // todo relatório — mostrar um estado que o banco recusou faria os gráficos
  // mudarem e voltarem sozinhos.
  const comRecarga = useCallback(
    async (acao: () => Promise<{ success: boolean }>) => {
      if (!tenantId) return false;
      setSaving(true);
      const { success } = await acao();
      setSaving(false);
      if (success) reload();
      return success;
    },
    [tenantId, reload]
  );

  const salvarOrigem = useCallback(
    (origem: EntradaDeOrigem) => comRecarga(() => saveOrigem(tenantId!, origem)),
    [comRecarga, tenantId]
  );
  const removerOrigem = useCallback(
    (codigo: string) => comRecarga(() => deleteOrigem(tenantId!, codigo)),
    [comRecarga, tenantId]
  );
  const salvarConversao = useCallback(
    (textoBruto: string, origemCodigo: string) =>
      comRecarga(() => saveConversao(tenantId!, textoBruto, origemCodigo)),
    [comRecarga, tenantId]
  );
  const removerConversao = useCallback(
    (textoBruto: string) => comRecarga(() => deleteConversao(tenantId!, textoBruto)),
    [comRecarga, tenantId]
  );

  return {
    origens,
    conversoes,
    loading,
    saving,
    resolver,
    aparencia,
    salvarOrigem,
    removerOrigem,
    salvarConversao,
    removerConversao,
    reload,
  };
}

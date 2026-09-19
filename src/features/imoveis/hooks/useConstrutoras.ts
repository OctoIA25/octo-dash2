/**
 * O cadastro de construtoras da imobiliária (P0.3).
 *
 * A comissão vem por um caminho separado, e de propósito: o banco não concede
 * essa coluna a quem está logado. A lista chega vazia para quem não tem cargo,
 * e a tela simplesmente não mostra a coluna — sem `if` de papel no front.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  fetchConstrutoras,
  fetchComissoes,
  criarConstrutora,
  atualizarConstrutora,
  removerConstrutora,
  type Construtora,
  type ComissaoDaConstrutora,
  type EntradaDeConstrutora,
} from '../services/construtorasService';

export interface UseConstrutorasResult {
  construtoras: Construtora[];
  /** Vazio para quem o banco não autoriza — não é erro, é a regra. */
  comissoes: Map<string, ComissaoDaConstrutora>;
  podeVerComissao: boolean;
  carregando: boolean;
  salvando: boolean;
  /** Mensagem de falha de LEITURA. Lista vazia com erro não é "nada cadastrado". */
  erro: string | null;
  porNome: (nome: string | null | undefined) => Construtora | undefined;
  /** Cadastrar UMA NOVA. Nunca sobrescreve uma existente — ver criarConstrutora. */
  criar: (entrada: EntradaDeConstrutora) => Promise<{ success: boolean; error?: string }>;
  /** Editar uma existente, pelo id. O código não muda. */
  atualizar: (id: string, entrada: EntradaDeConstrutora) => Promise<{ success: boolean; error?: string }>;
  remover: (codigo: string) => Promise<{ success: boolean; error?: string }>;
  recarregar: () => void;
}

const chave = (t: string | null | undefined) =>
  (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

export function useConstrutoras(): UseConstrutorasResult {
  const { tenantId } = useAuthContext();
  const [construtoras, setConstrutoras] = useState<Construtora[]>([]);
  const [comissoes, setComissoes] = useState<Map<string, ComissaoDaConstrutora>>(new Map());
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let cancelado = false;
    if (!tenantId || tenantId === 'owner') {
      setConstrutoras([]);
      setComissoes(new Map());
      return;
    }
    setCarregando(true);
    setErro(null);
    fetchConstrutoras(tenantId)
      .then(async (lista) => {
        if (cancelado) return;
        setConstrutoras(lista);
        const com = await fetchComissoes(tenantId);
        if (!cancelado) setComissoes(new Map(com.map((c) => [c.construtoraId, c])));
      })
      .catch((e) => {
        if (cancelado) return;
        setConstrutoras([]);
        setErro(e?.message || 'não foi possível carregar as construtoras');
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => { cancelado = true; };
  }, [tenantId, versao]);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  const indicePorNome = useMemo(() => {
    const m = new Map<string, Construtora>();
    for (const c of construtoras) m.set(chave(c.nome), c);
    return m;
  }, [construtoras]);

  const porNome = useCallback(
    (nome: string | null | undefined) => indicePorNome.get(chave(nome)),
    [indicePorNome]
  );

  const comEscrita = useCallback(
    async (acao: () => Promise<{ success: boolean; error?: string }>) => {
      if (!tenantId) return { success: false, error: 'imobiliária não selecionada' };
      setSalvando(true);
      const r = await acao();
      setSalvando(false);
      if (r.success) recarregar();
      return r;
    },
    [tenantId, recarregar]
  );

  return {
    construtoras,
    comissoes,
    podeVerComissao: comissoes.size > 0,
    carregando,
    salvando,
    erro,
    porNome,
    criar: (entrada) => comEscrita(() => criarConstrutora(tenantId as string, entrada)),
    atualizar: (id, entrada) => comEscrita(() => atualizarConstrutora(tenantId as string, id, entrada)),
    remover: (codigo) => comEscrita(() => removerConstrutora(tenantId as string, codigo)),
    recarregar,
  };
}

/**
 * PDI — Plano de Desenvolvimento Individual (P3.4), agora com banco.
 *
 * Até 21/09/2026 este hook guardava tudo em `localStorage['octodash_pdis']`,
 * filtrado por e-mail e sem nenhuma noção de imobiliária: trocar de
 * computador perdia o plano, e o gestor nunca via o da equipe.
 *
 * O que ficou no navegador de cada um não é jogado fora. A tela diz quantos
 * achou e oferece subir — decidido com o chefe em 21/09. Ninguém perde
 * trabalho escrito sem mandar.
 *
 * A API pública é a mesma de antes mais três coisas (`pendentesNoNavegador`,
 * `migrarDoNavegador`, `dispensarAvisoDoNavegador`), para as 1.062 linhas do
 * `PDIManager` não precisarem mudar.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuthContext } from '@/contexts/AuthContext';
import { lerDoNavegador, limparDoNavegador, paraOBanco } from './pdiDoNavegador';

export type NivelCompetencia = 'iniciante' | 'intermediario' | 'avancado' | 'expert';
export type StatusPDI = 'planejado' | 'em_andamento' | 'concluido' | 'pausado';
export type TipoPDI = 'individual' | 'dinamo' | 'personalizado';

export interface AcaoPDI {
  id: string;
  descricao: string;
  concluida: boolean;
  prazo?: string;
}

export interface PDIDinamoRow {
  id: string;
  col1: string;
  col2: string;
  col3: string;
  col4?: string;
  vistoCorretor?: boolean;
}

export interface PDIDinamoSection {
  id: string;
  titulo: string;
  tituloOriginal?: string;
  campos: string[];
  rows: PDIDinamoRow[];
}

export interface PDI {
  /** uuid. Era `number` (um `Date.now()`) enquanto isto vivia no navegador. */
  id?: string;
  corretor_email: string;
  tipo: TipoPDI;
  competencia: string;
  nivel_atual: NivelCompetencia;
  nivel_desejado: NivelCompetencia;
  progresso: number;
  acoes: AcaoPDI[];
  prazo?: string | null;
  status: StatusPDI;
  observacoes?: string;
  ordem: number;
  criador_email?: string | null;
  criador_nome?: string | null;
  atribuido_por_admin?: boolean;
  created_at?: string;
  updated_at?: string;
  sections?: PDIDinamoSection[];
}

/** O progresso do plano: quantas ações já foram feitas. */
export const calcularProgressoPDI = (acoes: AcaoPDI[]): number => {
  if (acoes.length === 0) return 0;
  return Math.round((acoes.filter((a) => a.concluida).length / acoes.length) * 100);
};

/**
 * @param emailAlvo de quem é o plano. Vazio = o de quem está logado. Quem não
 * for da gestão simplesmente não recebe as linhas de outra pessoa — quem
 * decide é a política do banco, não esta linha.
 */
export const usePDI = (emailAlvo?: string) => {
  const { user } = useAuthContext();
  const tenantId = user?.tenantId;
  const email = (emailAlvo || user?.email || '').toLowerCase();
  /** Só faz sentido oferecer migração do PRÓPRIO navegador para o próprio dono. */
  const ehOProprio = !emailAlvo || emailAlvo.toLowerCase() === (user?.email ?? '').toLowerCase();

  const [pdis, setPdis] = useState<PDI[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendentesNoNavegador, setPendentes] = useState(0);

  const loadPDIs = useCallback(async () => {
    if (!tenantId || tenantId === 'owner' || !email) {
      setPdis([]);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('pdis')
        .select('*')
        .eq('tenant_id', tenantId)
        .ilike('corretor_email', email)
        .order('ordem', { ascending: true });
      if (err) throw err;
      setPdis((data ?? []) as unknown as PDI[]);
      setPendentes(ehOProprio ? lerDoNavegador(email).length : 0);
    } catch (err) {
      // Erro NÃO vira lista vazia: "não tenho plano" e "não deu para ler" são
      // coisas diferentes, e a tela precisa poder dizer qual das duas é.
      console.error('Erro ao carregar PDIs:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, email, ehOProprio]);

  /**
   * Sobe para o banco o que estava guardado naquele navegador.
   *
   * O navegador só é limpo DEPOIS de o banco confirmar. Se o insert falhar, o
   * que estava escrito continua onde estava — perder o plano por causa de uma
   * falha de rede seria o pior desfecho possível deste item.
   */
  const migrarDoNavegador = async (): Promise<number> => {
    if (!tenantId || !email) return 0;
    const guardados = lerDoNavegador(email);
    if (guardados.length === 0) {
      setPendentes(0);
      return 0;
    }
    const { error: err } = await supabase
      .from('pdis')
      .insert(guardados.map((p) => paraOBanco(p, tenantId, email)));
    if (err) {
      setError(err.message);
      throw err;
    }
    limparDoNavegador(email);
    setPendentes(0);
    await loadPDIs();
    return guardados.length;
  };

  /** Some com o aviso sem apagar nada do navegador. */
  const dispensarAvisoDoNavegador = () => setPendentes(0);

  const criarPDI = async (pdi: Omit<PDI, 'id' | 'corretor_email' | 'created_at' | 'updated_at'>) => {
    if (!tenantId || !email) return;
    const { data, error: err } = await supabase
      .from('pdis')
      .insert({
        ...pdi,
        tenant_id: tenantId,
        corretor_email: email,
        tipo: pdi.tipo || 'individual',
        prazo: pdi.prazo || null,
        criador_email: user?.email ?? null,
        criador_nome: user?.name ?? null,
        atribuido_por_admin: !ehOProprio,
      })
      .select('*')
      .single();
    if (err) {
      setError(err.message);
      throw err;
    }
    setPdis((prev) => [...prev, data as unknown as PDI]);
    return data as unknown as PDI;
  };

  const atualizarPDI = async (id: string, updates: Partial<PDI>) => {
    const { data, error: err } = await supabase
      .from('pdis')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();
    if (err) {
      setError(err.message);
      throw err;
    }
    setPdis((prev) => prev.map((p) => (p.id === id ? (data as unknown as PDI) : p)));
    return data as unknown as PDI;
  };

  /**
   * Grava as ações e o progresso NA MESMA escrita.
   *
   * Conserta um defeito antigo: o código anterior gravava as ações e logo
   * depois chamava `atualizarProgresso`, que relia `pdis` do estado do React —
   * ainda o de antes. O progresso saía sempre um passo atrasado.
   */
  const gravarAcoes = async (pdiId: string, acoes: AcaoPDI[]) =>
    atualizarPDI(pdiId, { acoes, progresso: calcularProgressoPDI(acoes) });

  const atualizarProgresso = async (id: string) => {
    const pdi = pdis.find((p) => p.id === id);
    if (!pdi) return;
    await atualizarPDI(id, { progresso: calcularProgressoPDI(pdi.acoes) });
  };

  const adicionarAcao = async (pdiId: string, descricao: string, prazo?: string) => {
    const pdi = pdis.find((p) => p.id === pdiId);
    if (!pdi) return;
    await gravarAcoes(pdiId, [
      ...pdi.acoes,
      { id: crypto.randomUUID(), descricao, concluida: false, prazo },
    ]);
  };

  const toggleAcao = async (pdiId: string, acaoId: string) => {
    const pdi = pdis.find((p) => p.id === pdiId);
    if (!pdi) return;
    await gravarAcoes(
      pdiId,
      pdi.acoes.map((a) => (a.id === acaoId ? { ...a, concluida: !a.concluida } : a))
    );
  };

  const removerAcao = async (pdiId: string, acaoId: string) => {
    const pdi = pdis.find((p) => p.id === pdiId);
    if (!pdi) return;
    await gravarAcoes(pdiId, pdi.acoes.filter((a) => a.id !== acaoId));
  };

  const deletarPDI = async (id: string) => {
    const { error: err } = await supabase.from('pdis').delete().eq('id', id);
    if (err) {
      setError(err.message);
      throw err;
    }
    setPdis((prev) => prev.filter((p) => p.id !== id));
  };

  const estatisticas = {
    total: pdis.length,
    planejados: pdis.filter((p) => p.status === 'planejado').length,
    em_andamento: pdis.filter((p) => p.status === 'em_andamento').length,
    concluidos: pdis.filter((p) => p.status === 'concluido').length,
    pausados: pdis.filter((p) => p.status === 'pausado').length,
    progressoMedio:
      pdis.length > 0 ? Math.round(pdis.reduce((acc, p) => acc + p.progresso, 0) / pdis.length) : 0,
  };

  useEffect(() => {
    loadPDIs();
  }, [loadPDIs]);

  return {
    pdis,
    isLoading,
    error,
    criarPDI,
    atualizarPDI,
    adicionarAcao,
    toggleAcao,
    removerAcao,
    deletarPDI,
    atualizarProgresso,
    estatisticas,
    refetch: loadPDIs,
    pendentesNoNavegador,
    migrarDoNavegador,
    dispensarAvisoDoNavegador,
  };
};

/**
 * Hook para gerenciar PDI (Plano de Desenvolvimento Individual)
 * Suporta 3 tipos: Individual, Dinamo e Personalizado
 * Persistência via localStorage
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';

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
  vistoCorretor?: boolean;
}

export interface PDIDinamoSection {
  id: string;
  titulo: string;
  campos: string[];
  rows: PDIDinamoRow[];
}

export interface PDI {
  id?: number;
  corretor_email: string;
  tipo: TipoPDI;
  competencia: string;
  nivel_atual: NivelCompetencia;
  nivel_desejado: NivelCompetencia;
  progresso: number;
  acoes: AcaoPDI[];
  prazo?: string;
  status: StatusPDI;
  observacoes?: string;
  ordem: number;
  criador_email?: string;
  criador_nome?: string;
  atribuido_por_admin?: boolean;
  created_at?: string;
  updated_at?: string;
  // Campos para PDI Dinamo/Personalizado
  sections?: PDIDinamoSection[];
}

const STORAGE_KEY = 'octodash_pdis';

export const usePDI = () => {
  const { user } = useAuth();
  const [pdis, setPdis] = useState<PDI[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Salvar no localStorage
  const savePDIs = useCallback((newPdis: PDI[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newPdis));
    } catch (err) {
      console.error('Erro ao salvar PDIs no localStorage:', err);
    }
  }, []);

  // Carregar PDIs do localStorage
  const loadPDIs = useCallback(async () => {
    if (!user?.email) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const allPdis: PDI[] = JSON.parse(stored);
        // Filtrar por email do usuário
        const userPdis = allPdis.filter(p => p.corretor_email === user.email);
        setPdis(userPdis);
      } else {
        setPdis([]);
      }
    } catch (err) {
      console.error('Erro ao carregar PDIs:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      setPdis([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.email]);

  // Criar novo PDI
  const criarPDI = async (pdi: Omit<PDI, 'id' | 'corretor_email' | 'created_at' | 'updated_at'>) => {
    if (!user?.email) return;

    const novoPDI: PDI = {
      ...pdi,
      id: Date.now(),
      corretor_email: user.email,
      tipo: pdi.tipo || 'individual',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const novosPdis = [...pdis, novoPDI];
    setPdis(novosPdis);
    
    // Salvar todos os PDIs (incluindo de outros usuários)
    const stored = localStorage.getItem(STORAGE_KEY);
    const allPdis: PDI[] = stored ? JSON.parse(stored) : [];
    const otherPdis = allPdis.filter(p => p.corretor_email !== user.email);
    savePDIs([...otherPdis, ...novosPdis]);
    
    return novoPDI;
  };

  // Atualizar PDI
  const atualizarPDI = async (id: number, updates: Partial<PDI>) => {
    if (!user?.email) return;

    const novosPdis = pdis.map(p => 
      p.id === id 
        ? { ...p, ...updates, updated_at: new Date().toISOString() } 
        : p
    );
    setPdis(novosPdis);
    
    // Salvar todos os PDIs
    const stored = localStorage.getItem(STORAGE_KEY);
    const allPdis: PDI[] = stored ? JSON.parse(stored) : [];
    const otherPdis = allPdis.filter(p => p.corretor_email !== user.email);
    savePDIs([...otherPdis, ...novosPdis]);
    
    return novosPdis.find(p => p.id === id);
  };

  // Atualizar progresso baseado nas ações
  const atualizarProgresso = async (id: number) => {
    const pdi = pdis.find(p => p.id === id);
    if (!pdi) return;

    const totalAcoes = pdi.acoes.length;
    if (totalAcoes === 0) return;

    const concluidas = pdi.acoes.filter(a => a.concluida).length;
    const novoProgresso = Math.round((concluidas / totalAcoes) * 100);

    await atualizarPDI(id, { progresso: novoProgresso });
  };

  // Adicionar ação ao PDI
  const adicionarAcao = async (pdiId: number, descricao: string, prazo?: string) => {
    const pdi = pdis.find(p => p.id === pdiId);
    if (!pdi) return;

    const novaAcao: AcaoPDI = {
      id: Date.now().toString(),
      descricao,
      concluida: false,
      prazo
    };

    const novasAcoes = [...pdi.acoes, novaAcao];
    await atualizarPDI(pdiId, { acoes: novasAcoes });
    await atualizarProgresso(pdiId);
  };

  // Marcar ação como concluída/não concluída
  const toggleAcao = async (pdiId: number, acaoId: string) => {
    const pdi = pdis.find(p => p.id === pdiId);
    if (!pdi) return;

    const novasAcoes = pdi.acoes.map(a =>
      a.id === acaoId ? { ...a, concluida: !a.concluida } : a
    );

    await atualizarPDI(pdiId, { acoes: novasAcoes });
    await atualizarProgresso(pdiId);
  };

  // Remover ação
  const removerAcao = async (pdiId: number, acaoId: string) => {
    const pdi = pdis.find(p => p.id === pdiId);
    if (!pdi) return;

    const novasAcoes = pdi.acoes.filter(a => a.id !== acaoId);
    await atualizarPDI(pdiId, { acoes: novasAcoes });
    await atualizarProgresso(pdiId);
  };

  // Deletar PDI
  const deletarPDI = async (id: number) => {
    if (!user?.email) return;

    const novosPdis = pdis.filter(p => p.id !== id);
    setPdis(novosPdis);
    
    // Salvar todos os PDIs
    const stored = localStorage.getItem(STORAGE_KEY);
    const allPdis: PDI[] = stored ? JSON.parse(stored) : [];
    const otherPdis = allPdis.filter(p => p.corretor_email !== user.email);
    savePDIs([...otherPdis, ...novosPdis]);
  };

  // Estatísticas dos PDIs
  const estatisticas = {
    total: pdis.length,
    planejados: pdis.filter(p => p.status === 'planejado').length,
    em_andamento: pdis.filter(p => p.status === 'em_andamento').length,
    concluidos: pdis.filter(p => p.status === 'concluido').length,
    pausados: pdis.filter(p => p.status === 'pausado').length,
    progressoMedio: pdis.length > 0
      ? Math.round(pdis.reduce((acc, p) => acc + p.progresso, 0) / pdis.length)
      : 0
  };

  // Carregar ao montar
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
    refetch: loadPDIs
  };
};


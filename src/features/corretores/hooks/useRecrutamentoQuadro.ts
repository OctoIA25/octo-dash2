import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LABEL_ESTAGIO, type EstagioId } from '../domain/recruitmentStages';
import { recruitmentService, type CandidatoComEtapas } from '../services/recruitmentService';
import { aplicarMudancaDeEtapa } from '../services/mudancaDeEtapa';

/**
 * A carga COMPLETA de candidatos do tenant, para o Kanban e o funil. O hook
 * antigo (useRecruitment) pede 10 por vez ao servidor — serve à lista
 * paginada, não a um quadro nem a um funil.
 *
 * `moverEstagio` é otimista: o card troca de coluna na hora, a etapa é
 * gravada, e em erro o card volta com o motivo na tela. Depois do sucesso
 * recarrega em silêncio, para o quadro refletir o que o banco decidiu.
 */
export interface UseRecrutamentoQuadroOptions {
  tenantId?: string | null;
  usuarioEmail?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export interface UseRecrutamentoQuadroReturn {
  candidatos: CandidatoComEtapas[];
  carregando: boolean;
  erro: string | null;
  refresh: () => Promise<void>;
  /** Devolve true quando a etapa foi gravada. */
  moverEstagio: (candidato: CandidatoComEtapas, paraId: EstagioId) => Promise<boolean>;
}

export function useRecrutamentoQuadro({
  tenantId, usuarioEmail, autoRefresh = true, refreshInterval = 30_000,
}: UseRecrutamentoQuadroOptions): UseRecrutamentoQuadroReturn {
  const [candidatos, setCandidatos] = useState<CandidatoComEtapas[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!tenantId) { setCarregando(false); return; }
    try {
      setCandidatos(await recruitmentService.getTodosCandidatos(tenantId));
      setErro(null);
    } catch (e) {
      console.error('Erro ao carregar o quadro de candidatos:', e);
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar os candidatos');
    } finally {
      setCarregando(false);
    }
  }, [tenantId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => { void refresh(); }, refreshInterval);
    return () => clearInterval(id);
  }, [autoRefresh, refreshInterval, refresh]);

  const moverEstagio = useCallback(async (candidato: CandidatoComEtapas, paraId: EstagioId): Promise<boolean> => {
    const anterior = { estagio: candidato.estagio, status: candidato.status };
    const novoLabel = LABEL_ESTAGIO[paraId];
    const troca = (para: { estagio: EstagioId; status: string }) =>
      setCandidatos((prev) => prev.map((c) => (c.id === candidato.id ? { ...c, ...para } : c)));

    troca({ estagio: paraId, status: novoLabel });
    try {
      await aplicarMudancaDeEtapa({ candidato, novoLabel, usuarioEmail, tenantId });
      toast.success(`${candidato.nome} → ${novoLabel}`);
      void refresh();
      return true;
    } catch (e) {
      troca(anterior);
      console.error('Erro ao mover candidato:', e);
      toast.error(e instanceof Error ? e.message : 'Não foi possível mover o candidato');
      return false;
    }
  }, [usuarioEmail, tenantId, refresh]);

  return { candidatos, carregando, erro, refresh, moverEstagio };
}

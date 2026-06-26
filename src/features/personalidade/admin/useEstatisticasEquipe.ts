/**
 * Carrega as estatísticas agregadas dos 3 testes da equipe (DISC/Eneagrama/MBTI).
 * Reusa o testesEstatisticasService existente — sem tocar na agregação.
 */

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  buscarEstatisticasDISC,
  buscarEstatisticasEneagrama,
  buscarEstatisticasMBTI,
  type DISCStats,
  type EneagramaStats,
  type MBTIStats,
} from '@/services/testesEstatisticasService';

export interface EstatisticasEquipe {
  disc: DISCStats | null;
  eneagrama: EneagramaStats | null;
  mbti: MBTIStats | null;
}

export interface UseEstatisticasEquipeResult {
  loading: boolean;
  stats: EstatisticasEquipe;
  totalCorretores: number;
}

const VAZIO: EstatisticasEquipe = { disc: null, eneagrama: null, mbti: null };

export function useEstatisticasEquipe(): UseEstatisticasEquipeResult {
  const { tenantId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<EstatisticasEquipe>(VAZIO);

  useEffect(() => {
    let cancelado = false;
    const carregar = async () => {
      setLoading(true);
      try {
        const [disc, eneagrama, mbti] = await Promise.all([
          buscarEstatisticasDISC(tenantId || undefined).catch(() => null),
          buscarEstatisticasEneagrama(tenantId || undefined).catch(() => null),
          buscarEstatisticasMBTI(tenantId || undefined).catch(() => null),
        ]);
        if (!cancelado) setStats({ disc, eneagrama, mbti });
      } catch (error) {
        console.error('❌ Erro ao carregar estatísticas da equipe:', error);
        if (!cancelado) setStats(VAZIO);
      } finally {
        if (!cancelado) setLoading(false);
      }
    };
    carregar();
    return () => {
      cancelado = true;
    };
  }, [tenantId]);

  const totalCorretores = stats.disc?.totalCorretores ?? stats.eneagrama?.totalCorretores ?? stats.mbti?.totalCorretores ?? 0;

  return { loading, stats, totalCorretores };
}

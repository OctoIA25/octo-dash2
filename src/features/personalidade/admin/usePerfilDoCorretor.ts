/**
 * Carrega o perfil completo (DISC/Eneagrama/MBTI) de um corretor por id — para o
 * drawer de drill-down do admin. Reusa os mesmos services do fluxo do corretor.
 */

import { useEffect, useState } from 'react';
import { buscarResultadoDISCCorretor } from '@/features/corretores/services/discResultsService';
import { buscarResultadoEneagramaCorretor } from '@/features/corretores/services/eneagramaResultsService';
import { buscarResultadoMBTICorretor } from '@/features/corretores/services/mbtiResultsService';
import type { PerfilCompleto } from '../hooks/usePerfilCompleto';

const VAZIO: PerfilCompleto = { disc: null, eneagrama: null, mbti: null };

export function usePerfilDoCorretor(corretorId: number | null): { loading: boolean; perfil: PerfilCompleto } {
  const [loading, setLoading] = useState(false);
  const [perfil, setPerfil] = useState<PerfilCompleto>(VAZIO);

  useEffect(() => {
    if (!corretorId) {
      setPerfil(VAZIO);
      return;
    }
    let cancelado = false;
    const carregar = async () => {
      setLoading(true);
      try {
        const [disc, eneagrama, mbti] = await Promise.all([
          buscarResultadoDISCCorretor(corretorId).catch(() => null),
          buscarResultadoEneagramaCorretor(corretorId).catch(() => null),
          buscarResultadoMBTICorretor(corretorId).catch(() => null),
        ]);
        if (!cancelado) setPerfil({ disc, eneagrama, mbti });
      } finally {
        if (!cancelado) setLoading(false);
      }
    };
    carregar();
    return () => {
      cancelado = true;
    };
  }, [corretorId]);

  return { loading, perfil };
}

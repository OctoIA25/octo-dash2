/**
 * Carrega, de forma unificada, os 3 resultados de personalidade do corretor logado
 * (DISC, Eneagrama, MBTI). Centraliza o fetch que antes era duplicado em
 * MeuResumoCompleto e MeusResultadosCorretor — mesma lógica, uma fonte só.
 *
 * Não altera contratos: apenas reusa os services existentes.
 */

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { buscarCorretorPorEmail } from '@/features/corretores/services/buscarCorretorPorEmailService';
import {
  buscarResultadoDISCCorretor,
  type DISCResultData,
} from '@/features/corretores/services/discResultsService';
import {
  buscarResultadoEneagramaCorretor,
  type EneagramaCorretorProfile,
} from '@/features/corretores/services/eneagramaResultsService';
import {
  buscarResultadoMBTICorretor,
  type MBTICorretorProfile,
} from '@/features/corretores/services/mbtiResultsService';

export interface PerfilCompleto {
  disc: DISCResultData | null;
  eneagrama: EneagramaCorretorProfile | null;
  mbti: MBTICorretorProfile | null;
}

export interface UsePerfilCompletoResult {
  loading: boolean;
  perfil: PerfilCompleto;
  /** true quando nenhum dos 3 testes tem resultado */
  vazio: boolean;
  /** quantos dos 3 testes têm resultado (0–3) */
  totalCompletos: number;
}

const PERFIL_VAZIO: PerfilCompleto = { disc: null, eneagrama: null, mbti: null };

export function usePerfilCompleto(): UsePerfilCompletoResult {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [perfil, setPerfil] = useState<PerfilCompleto>(PERFIL_VAZIO);

  useEffect(() => {
    let cancelado = false;

    const carregar = async () => {
      if (!user?.email) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const identidade = await buscarCorretorPorEmail(user.email, user.name);
        const id = identidade?.id ?? null;
        if (!id) {
          if (!cancelado) setPerfil(PERFIL_VAZIO);
          return;
        }

        const [disc, eneagrama, mbti] = await Promise.all([
          buscarResultadoDISCCorretor(id).catch(() => null),
          buscarResultadoEneagramaCorretor(id).catch(() => null),
          buscarResultadoMBTICorretor(id).catch(() => null),
        ]);

        if (!cancelado) setPerfil({ disc, eneagrama, mbti });
      } catch (error) {
        console.error('❌ Erro ao carregar perfil de personalidade:', error);
        if (!cancelado) setPerfil(PERFIL_VAZIO);
      } finally {
        if (!cancelado) setLoading(false);
      }
    };

    carregar();
    return () => {
      cancelado = true;
    };
  }, [user]);

  const totalCompletos =
    (perfil.disc ? 1 : 0) + (perfil.eneagrama ? 1 : 0) + (perfil.mbti ? 1 : 0);

  return { loading, perfil, vazio: totalCompletos === 0, totalCompletos };
}

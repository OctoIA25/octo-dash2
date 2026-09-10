/**
 * Carrega as estatísticas agregadas dos 3 testes da equipe (DISC/Eneagrama/MBTI).
 * Reusa o testesEstatisticasService existente — sem tocar na agregação.
 */

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { fetchTenantMembers } from '@/features/corretores/services/tenantMembersService';
import { montarUniverso, type MembroTenant, type PessoaDoRelatorio } from './montarUniverso';
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
  /** quem entra no relatório (ver montarUniverso) */
  universo: PessoaDoRelatorio[];
  /**
   * Quantos do universo fizeram cada teste. Não usar `stats.X.comTeste` para
   * isso: aquele número conta a tabela `Corretores` crua, e um numerador de um
   * conjunto com denominador de outro já produziu card de "2 de 1 fizeram".
   */
  comTeste: { disc: number; eneagrama: number; mbti: number };
  totalCorretores: number;
}

const VAZIO: EstatisticasEquipe = { disc: null, eneagrama: null, mbti: null };

/** ids que aparecem no `corretoresPorTipo` de uma metodologia (fizeram aquele teste). */
function idsDaMetodologia(stats: { corretoresPorTipo?: unknown } | null): Set<number> {
  const ids = new Set<number>();
  for (const lista of Object.values(stats?.corretoresPorTipo ?? {})) {
    for (const c of lista as Array<{ id: number }>) ids.add(c.id);
  }
  return ids;
}

/** ids que têm resultado em qualquer uma das 3 metodologias. */
function idsComTeste({ disc, eneagrama, mbti }: EstatisticasEquipe): Set<number> {
  const ids = new Set<number>();
  for (const stats of [disc, eneagrama, mbti]) {
    for (const id of idsDaMetodologia(stats)) ids.add(id);
  }
  return ids;
}

export function useEstatisticasEquipe(): UseEstatisticasEquipeResult {
  const { tenantId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<EstatisticasEquipe>(VAZIO);
  const [membros, setMembros] = useState<MembroTenant[] | null>(null);

  useEffect(() => {
    let cancelado = false;
    const carregar = async () => {
      setLoading(true);
      try {
        // Membros vêm junto: sem eles o denominador seria a tabela `Corretores`
        // crua, que inclui ex-corretor e cadastro morto. fetchTenantMembers já
        // engole o próprio erro devolvendo []; o catch aqui é só rede de segurança
        // e cai no mesmo fail-open de montarUniverso.
        const [disc, eneagrama, mbti, membrosDoTenant] = await Promise.all([
          buscarEstatisticasDISC(tenantId || undefined).catch(() => null),
          buscarEstatisticasEneagrama(tenantId || undefined).catch(() => null),
          buscarEstatisticasMBTI(tenantId || undefined).catch(() => null),
          tenantId ? fetchTenantMembers(tenantId).catch(() => null) : Promise.resolve(null),
        ]);
        if (!cancelado) {
          setStats({ disc, eneagrama, mbti });
          setMembros(membrosDoTenant);
        }
      } catch (error) {
        console.error('❌ Erro ao carregar estatísticas da equipe:', error);
        if (!cancelado) {
          setStats(VAZIO);
          setMembros(null);
        }
      } finally {
        if (!cancelado) setLoading(false);
      }
    };
    carregar();
    return () => {
      cancelado = true;
    };
  }, [tenantId]);

  // Memoizado porque a página o usa como dep de um useMemo: um array novo a
  // cada render refazia unirCorretores a cada tecla digitada na busca.
  const universo = useMemo(() => {
    // As 3 queries leem as mesmas linhas; basta a primeira que respondeu.
    const linhas = stats.disc?.todos ?? stats.eneagrama?.todos ?? stats.mbti?.todos ?? [];
    return montarUniverso(linhas, idsComTeste(stats), membros);
  }, [stats, membros]);

  const comTeste = useMemo(() => {
    const idsDoUniverso = new Set(universo.map((p) => p.id).filter((id): id is number => id !== null));
    const contar = (st: { corretoresPorTipo?: unknown } | null) =>
      [...idsDaMetodologia(st)].filter((id) => idsDoUniverso.has(id)).length;
    return {
      disc: contar(stats.disc),
      eneagrama: contar(stats.eneagrama),
      mbti: contar(stats.mbti),
    };
  }, [stats, universo]);

  return { loading, stats, universo, comTeste, totalCorretores: universo.length };
}

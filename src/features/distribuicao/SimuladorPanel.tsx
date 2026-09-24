/**
 * A aba do simulador dentro do Bolsão.
 *
 * Carrega a fila e a configuração REAIS da imobiliária e entrega ao
 * simulador. Tudo em leitura: esta tela não grava nada em lugar nenhum.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { OctoDashLoader } from '@/components/ui/OctoDashLoader';
import { SimuladorDistribuicao } from './SimuladorDistribuicao';
import { montarFila, type ParticipanteDaRoleta, type PonteiroDaRoleta } from './regraDoServidor';

interface SimuladorPanelProps {
  tenantId?: string;
}

interface Estado {
  participantes: ParticipanteDaRoleta[];
  equipe: ParticipanteDaRoleta[];
  horario: unknown;
  config: { tempo_expiracao_exclusivo?: number | null } | null;
  /** Quem recebe recrutamento e vendedores nesta imobiliária (24/09). */
  destinoPorTipo: Record<string, string> | null;
  ponteiro: PonteiroDaRoleta;
}

export function SimuladorPanel({ tenantId }: SimuladorPanelProps) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    if (!tenantId || tenantId === 'owner') return;

    (async () => {
      setErro(null);
      // `get_tenant_members` vence a RLS de tenant_memberships e traz
      // `permissions` e `created_at`, que é a ordem da fila.
      const [membros, curados, config, ponteiro] = await Promise.all([
        supabase.rpc('get_tenant_members', { p_tenant_id: tenantId }),
        supabase.from('roleta_participantes').select('broker_id').eq('tenant_id', tenantId).eq('is_active', true),
        supabase
          .from('tenant_bolsao_config')
          .select('horario_funcionamento, tempo_expiracao_exclusivo, destino_por_tipo')
          .eq('tenant_id', tenantId)
          .maybeSingle(),
        supabase
          .from('distribuicao_eventos')
          .select('corretor_id, detalhes')
          .eq('tenant_id', tenantId)
          .eq('evento', 'consultado')
          .not('detalhes->>posicao', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (cancelado) return;
      if (membros.error) {
        // Fila vazia por erro é indistinguível de "ninguém na roleta", e o
        // gestor concluiria que a equipe some.
        setErro(membros.error.message);
        return;
      }

      const ordenados = [...((membros.data ?? []) as Array<Record<string, unknown>>)].sort((a, b) =>
        String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
      );
      const pos = Number.parseInt((ponteiro.data?.detalhes as { posicao?: unknown })?.posicao as string, 10);

      setEstado({
        participantes: montarFila(
          ordenados as never,
          ((curados.data ?? []) as Array<{ broker_id: string }>).map((c) => c.broker_id)
        ),
        // Sem curadoria: quem pode ser CAPTADOR não é quem está no rodízio.
        equipe: montarFila(ordenados as never, []),
        horario: config.data?.horario_funcionamento ?? {},
        config: config.data ?? null,
        destinoPorTipo: (config.data?.destino_por_tipo as Record<string, string>) ?? null,
        ponteiro: {
          posicao: Number.isInteger(pos) ? pos : -1,
          corretorId: (ponteiro.data?.corretor_id as string) ?? null,
        },
      });
    })().catch((e) => {
      if (!cancelado) setErro(e?.message || 'não foi possível carregar a fila');
    });

    return () => { cancelado = true; };
  }, [tenantId]);

  if (!tenantId || tenantId === 'owner') {
    return <p className="p-6 text-sm text-text-secondary">Selecione uma imobiliária para simular.</p>;
  }

  if (erro) {
    return (
      <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
        Não foi possível carregar a fila: {erro}
      </p>
    );
  }

  if (!estado) {
    return (
      <div className="flex items-center justify-center py-16">
        <OctoDashLoader />
      </div>
    );
  }

  return (
    <SimuladorDistribuicao
      participantes={estado.participantes}
      equipe={estado.equipe}
      horarioFuncionamento={estado.horario}
      configPrazo={estado.config}
      destinoPorTipo={estado.destinoPorTipo}
      ponteiro={estado.ponteiro}
    />
  );
}

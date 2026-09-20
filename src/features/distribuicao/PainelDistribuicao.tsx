/**
 * A aba do painel ao vivo dentro do Bolsão (P1.3).
 *
 * Lê o extrato direto da tabela: a RLS de `distribuicao_eventos` já deixa
 * qualquer membro ler o da própria imobiliária, e ninguém escreve pelo
 * navegador — quem grava é o servidor, com a chave de serviço.
 *
 * Atualiza sozinho a cada 30 s, com `setInterval`, que é como as outras telas
 * deste módulo se atualizam. Não é tempo real de verdade, e a tela diz a hora
 * da última leitura em vez de fingir que é.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { OctoDashLoader } from '@/components/ui/OctoDashLoader';
import { ExtratoDistribuicao, type EventoDistribuicao } from './ExtratoDistribuicao';

interface Props {
  tenantId?: string;
}

const INTERVALO_MS = 30_000;
const JANELA_MS = 24 * 60 * 60 * 1000;
/** Teto de linhas por leitura: um dia cheio da Lotus cabe folgado. */
const TETO = 200;

interface Estado {
  eventos: EventoDistribuicao[];
  nomes: Record<string, string>;
  jaHouveAlgum: boolean;
  lidoAs: Date;
}

export function PainelDistribuicao({ tenantId }: Props) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  // Os nomes não mudam a cada 30 s; buscá-los de novo a cada ciclo seria uma
  // consulta por minuto para nada.
  const nomesRef = useRef<Record<string, string> | null>(null);

  const carregar = useCallback(async () => {
    if (!tenantId || tenantId === 'owner') return;
    setAtualizando(true);
    try {
      const desde = new Date(Date.now() - JANELA_MS).toISOString();
      const [eventos, algum, membros] = await Promise.all([
        supabase
          .from('distribuicao_eventos')
          .select('id, lead_id, lead_ref, evento, corretor_id, motivo, tipo, prazo_ate, origem, created_at')
          .eq('tenant_id', tenantId)
          .gte('created_at', desde)
          .order('created_at', { ascending: false })
          .limit(TETO),
        // Painel vazio tem duas causas muito diferentes, e a tela precisa
        // saber qual é antes de escrever a frase.
        supabase
          .from('distribuicao_eventos')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId),
        nomesRef.current
          ? Promise.resolve({ data: null, error: null })
          : supabase.rpc('get_tenant_members', { p_tenant_id: tenantId }),
      ]);

      if (eventos.error) throw eventos.error;

      if (membros.data) {
        nomesRef.current = Object.fromEntries(
          (membros.data as Array<{ user_id: string; name?: string; email?: string }>).map((m) => [
            m.user_id,
            m.name || m.email || m.user_id.slice(0, 8),
          ])
        );
      }

      setErro(null);
      setEstado({
        eventos: (eventos.data ?? []) as EventoDistribuicao[],
        nomes: nomesRef.current ?? {},
        jaHouveAlgum: (algum.count ?? 0) > 0,
        lidoAs: new Date(),
      });
    } catch (e) {
      // Erro NÃO vira painel zerado: "nenhum lead distribuído" e "não
      // consegui ler" se parecem na tela e significam coisas opostas.
      setErro((e as { message?: string })?.message || 'não foi possível ler o extrato');
    } finally {
      setAtualizando(false);
    }
  }, [tenantId]);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, INTERVALO_MS);
    return () => clearInterval(t);
  }, [carregar]);

  if (!tenantId || tenantId === 'owner') {
    return <p className="p-6 text-sm text-text-secondary">Selecione uma imobiliária para ver a distribuição.</p>;
  }

  if (erro) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          Não foi possível ler o extrato: {erro}
        </p>
        <button type="button" onClick={carregar} className="text-[13px] font-medium text-blue-600 hover:underline">
          Tentar de novo
        </button>
      </div>
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-text-secondary">
          Cada linha é um acontecimento gravado pelo servidor — esta tela não escreve nada.
        </p>
        <button
          type="button"
          onClick={carregar}
          disabled={atualizando}
          className="flex items-center gap-1.5 text-[12px] font-medium text-text-secondary hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${atualizando ? 'animate-spin' : ''}`} />
          lido às {estado.lidoAs.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </button>
      </div>
      <ExtratoDistribuicao
        eventos={estado.eventos}
        nomes={estado.nomes}
        jaHouveAlgum={estado.jaHouveAlgum}
      />
    </div>
  );
}

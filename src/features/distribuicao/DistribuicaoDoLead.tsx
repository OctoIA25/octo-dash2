/**
 * "Distribuição (extrato)" na ficha do lead (P1.1).
 *
 * O plano pede este bloco com duas coisas: a linha do tempo dos eventos e o
 * relógio do prazo. Ele responde a pergunta que o corretor faz em voz alta —
 * *"por que este lead é meu?"* — e a que o gestor faz depois: *"por que ele
 * foi para essa pessoa e não para outra?"*.
 *
 * useState/useEffect, e NÃO React Query: mesmo motivo que já está escrito em
 * `CadenciaToquesSection` — este bloco é montado dentro do modal do lead, que
 * aparece em telas cujos testes não têm `QueryClientProvider`. Escrevi com
 * `useQuery` primeiro e quebrei 22 testes de uma vez; a casa já tinha decidido
 * isto antes de mim.
 *
 * DE ONDE SAI O PRAZO, e por que não de `leads`
 * A Dash não grava prazo no lead, de propósito: quem atribui é a Lia. O prazo
 * vive no extrato, na linha em que a regra respondeu. Guardar uma cópia no
 * lead criaria a segunda verdade — e seria a que envelhece, porque quem a
 * atualizaria é justamente quem não escreve ali.
 */

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { ExtratoDistribuicao, type EventoDistribuicao } from './ExtratoDistribuicao';
import { relogioDoPrazo, corDoRelogio } from './relogioDoPrazo';

interface Props {
  tenantId: string | null;
  leadId: string | null;
  /** Quando o corretor atendeu, se atendeu. Para o relógio de vez. */
  atendidoEm?: string | null;
}

async function carregar(tenantId: string, leadId: string): Promise<EventoDistribuicao[]> {
  const { data, error } = await supabase
    .from('distribuicao_eventos')
    .select('id, evento, corretor_id, motivo, tipo, prazo_ate, origem, detalhes, created_at')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as EventoDistribuicao[];
}

export function DistribuicaoDoLead({ tenantId, leadId, atendidoEm = null }: Props) {
  const [lista, setLista] = useState<EventoDistribuicao[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [carregou, setCarregou] = useState(false);

  useEffect(() => {
    if (!tenantId || !leadId) return;
    let vivo = true;
    setCarregando(true);
    carregar(tenantId, leadId)
      .then((e) => { if (vivo) { setLista(e); setCarregou(true); } })
      // Erro aqui não pode derrubar a ficha inteira: o extrato é informação de
      // apoio, e o corretor está no meio de outra coisa.
      .catch(() => { if (vivo) setCarregou(true); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [tenantId, leadId]);

  if (!tenantId || !leadId) return null;

  // O prazo que vale é o da ÚLTIMA decisão: se o lead passou de um corretor
  // para outro, o relógio do primeiro não cobra o segundo.
  const ultimoComPrazo = [...lista].reverse().find((e) => e.prazo_ate);
  const relogio = relogioDoPrazo({ prazoAte: ultimoComPrazo?.prazo_ate ?? null, atendidoEm });

  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Distribuição</h3>
        {relogio.situacao !== 'sem_prazo' && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${corDoRelogio(relogio)}`}>
            <Clock className="h-3 w-3" /> {relogio.texto}
          </span>
        )}
      </header>

      {carregando && <p className="text-xs text-muted-foreground">Carregando…</p>}

      {carregou && lista.length === 0 && (
        // Dizer "nenhum evento" seria ambíguo: pode ser que a regra não tenha
        // sido consultada, ou que este lead seja anterior ao extrato existir.
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          A regra da distribuição não foi consultada para este lead. O extrato registra
          desde que a Lia passou a perguntar — leads anteriores a isso não têm linha aqui.
        </p>
      )}

      {lista.length > 0 && (
        <ExtratoDistribuicao eventos={lista} nomes={{}} jaHouveAlgum agora={new Date()} />
      )}
    </section>
  );
}

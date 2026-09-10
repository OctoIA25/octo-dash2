/**
 * Histórico de um lead.
 *
 * useState/useEffect e não React Query pelo mesmo motivo de useCadenciaLead: o
 * modal do lead é montado em quatro telas cujos testes não têm
 * QueryClientProvider, e um único hook de React Query aqui obrigaria todas a
 * montar um provider para renderizar o modal.
 *
 * `ativo` é o que torna a busca preguiçosa: o Kanban abre e fecha este modal o
 * tempo todo e a seção começa fechada, então só há requisição quando o corretor
 * realmente expande o histórico.
 */
import { useEffect, useState } from 'react';
import { fetchHistoricoDoLead, type Historico } from '../services/historicoLeadService';

const TENANT_DE_TESTE = 'tenant-area-de-teste';
const tenantReal = (t?: string | null) => Boolean(t && t !== 'owner' && t !== TENANT_DE_TESTE);

export function useHistoricoLead(leadId?: string | null, tenantId?: string | null, ativo = true) {
  const [historico, setHistorico] = useState<Historico | undefined>(undefined);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!ativo || !leadId || !tenantReal(tenantId)) {
      setHistorico(undefined);
      setCarregando(false);
      setErro(null);
      return undefined;
    }

    // Trocar de lead com a busca anterior em voo escreveria o histórico do lead
    // errado no card. O flag descarta a resposta que chegou tarde.
    let atual = true;
    setCarregando(true);
    setErro(null);

    fetchHistoricoDoLead(leadId, tenantId)
      .then((dados) => { if (atual) setHistorico(dados); })
      .catch((e: unknown) => {
        if (!atual) return;
        setHistorico(undefined);
        setErro(e instanceof Error ? e.message : 'Falha ao carregar o histórico.');
      })
      .finally(() => { if (atual) setCarregando(false); });

    return () => { atual = false; };
  }, [leadId, tenantId, ativo]);

  return { historico, carregando, erro };
}

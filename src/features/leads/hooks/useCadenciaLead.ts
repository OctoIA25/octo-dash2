/**
 * Cadência da LIA de um lead.
 *
 * useState/useEffect e não React Query de propósito: o modal do lead e todas
 * as suas seções (CPF, imóveis de interesse, classificação) usam esse padrão,
 * e ele é montado em quatro telas cujos testes não têm QueryClientProvider.
 * Um único hook de React Query aqui obrigaria todas elas a montar um provider
 * para renderizar o modal. O ganho perdido é o cache entre aberturas — que
 * vale pouco: cada abertura é um clique deliberado do corretor e a cadência
 * muda entre um e outro.
 *
 * Só busca com o modal aberto em modo edição: criar lead não tem cadência.
 */
import { useEffect, useState } from 'react';
import { fetchCadenciaDoLead, type Cadencia } from '../services/cadenciaService';

const TENANT_DE_TESTE = 'tenant-area-de-teste';
const tenantReal = (t?: string | null) => Boolean(t && t !== 'owner' && t !== TENANT_DE_TESTE);

export function useCadenciaLead(leadId?: string | null, tenantId?: string | null, ativo = true) {
  const [cadencia, setCadencia] = useState<Cadencia | undefined>(undefined);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!ativo || !leadId || !tenantReal(tenantId)) {
      setCadencia(undefined);
      setCarregando(false);
      setErro(null);
      return undefined;
    }

    // Trocar de lead com a busca anterior em voo escreveria a cadência do lead
    // errado no card. O flag descarta a resposta que chegou tarde.
    let atual = true;
    setCarregando(true);
    setErro(null);

    fetchCadenciaDoLead(leadId, tenantId)
      .then((dados) => { if (atual) setCadencia(dados); })
      .catch((e: unknown) => {
        if (!atual) return;
        setCadencia(undefined);
        setErro(e instanceof Error ? e.message : 'Falha ao carregar a cadência.');
      })
      .finally(() => { if (atual) setCarregando(false); });

    return () => { atual = false; };
  }, [leadId, tenantId, ativo]);

  return { cadencia, carregando, erro };
}

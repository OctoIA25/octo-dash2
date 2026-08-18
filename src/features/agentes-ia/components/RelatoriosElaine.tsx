/**
 * Lista os relatórios que a Elaine gerou sobre um corretor.
 *
 * Mesma peça nas duas pontas: o corretor abre pelo "Meu Perfil" (chave =
 * e-mail) e o gestor pelo drawer da equipe (chave = id do corretor). Quem
 * decide o que cada um enxerga é a RLS, não este componente.
 */

import { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { listElaineReports, type AgentReport } from '../services/agentConversationService';
import { MessageText } from './MessageText';

const ROTULO_ESPECIALIDADE: Record<string, string> = {
  disc: 'DISC',
  eneagrama: 'Eneagrama',
  mbti: 'MBTI',
  'relatorio-geral': 'Relatório Geral',
  'gestao-liderados': 'Gestão de Liderados',
};

interface RelatoriosElaineProps {
  /** Chave do gestor (drawer da equipe). */
  subjectCorretorId?: number | null;
  /** Chave do próprio corretor (Meu Perfil). */
  subjectEmail?: string | null;
}

export function RelatoriosElaine({ subjectCorretorId, subjectEmail }: RelatoriosElaineProps) {
  const [relatorios, setRelatorios] = useState<AgentReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    const carregar = async () => {
      setLoading(true);
      const lista = await listElaineReports({ subjectCorretorId, subjectEmail });
      if (!cancelado) {
        setRelatorios(lista);
        setLoading(false);
      }
    };
    carregar();
    return () => {
      cancelado = true;
    };
  }, [subjectCorretorId, subjectEmail]);

  return (
    <section>
      <h2 className="text-lg font-bold mb-1 flex items-center gap-2" style={{ color: 'hsl(var(--text-primary))' }}>
        <FileText className="w-4 h-4" aria-hidden="true" />
        Relatórios da Elaine
      </h2>
      <p className="text-xs mb-3" style={{ color: 'hsl(var(--text-secondary))' }}>
        Análises comportamentais geradas a partir dos testes. Visíveis para o corretor e para o gestor.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm" style={{ color: 'hsl(var(--text-secondary))' }}>
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Carregando relatórios…
        </div>
      ) : relatorios.length === 0 ? (
        <p className="text-sm py-6" style={{ color: 'hsl(var(--text-secondary))' }}>
          Nenhum relatório gerado ainda.
        </p>
      ) : (
        <Accordion type="single" collapsible className="w-full">
          {relatorios.map((relatorio) => (
            <AccordionItem key={relatorio.id} value={relatorio.id}>
              <AccordionTrigger className="text-left">
                <span className="flex flex-col gap-0.5 pr-2">
                  <span className="text-sm font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>
                    {ROTULO_ESPECIALIDADE[relatorio.especialidade ?? ''] ?? 'Análise comportamental'}
                  </span>
                  <span className="text-xs font-normal" style={{ color: 'hsl(var(--text-secondary))' }}>
                    {new Date(relatorio.createdAt).toLocaleDateString('pt-BR')}
                    {relatorio.geradoPor ? ` · por ${relatorio.geradoPor}` : ''}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="text-sm leading-relaxed" style={{ color: 'hsl(var(--text-primary))' }}>
                  <MessageText text={relatorio.content} />
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </section>
  );
}

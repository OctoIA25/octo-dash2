import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { TipoLead } from '../utils/classificarLead';

/**
 * Badge da classificação do lead. SEM regra de negócio: o valor vem pronto do
 * banco. Se um dia isto precisar decidir alguma coisa, a decisão está no
 * lugar errado — ela mora no trigger `classificar_lead`.
 */
/**
 * Rótulos e cores dos quatro valores, em um lugar só. Exportado porque os
 * controles de edição (botões no CriarLeadQuickModal, Select no
 * LeadDetailsModal) precisam dos MESMOS rótulos — sem isto, cada um vira uma
 * cópia do vocabulário que pode divergir do CHECK do banco em silêncio.
 */
export const CLASSIFICACAO_ESTILOS: Record<TipoLead, { label: string; className: string }> = {
  lancamento: {
    label: 'Lançamento',
    className: 'bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-800',
  },
  pronto: {
    label: 'Pronto',
    className: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
  },
  locacao: {
    label: 'Locação',
    className: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
  },
  indefinido: {
    label: 'Sem classificação',
    className: 'bg-muted/30 text-muted-foreground border-muted',
  },
};

/** Ordem de exibição nos controles de edição. `indefinido` por último: é a saída. */
export const CLASSIFICACAO_ORDEM: TipoLead[] = ['lancamento', 'pronto', 'locacao', 'indefinido'];

export function ClassificacaoBadge({ tipo, className }: { tipo?: string | null; className?: string }) {
  const estilo = CLASSIFICACAO_ESTILOS[tipo as TipoLead] ?? CLASSIFICACAO_ESTILOS.indefinido;
  return (
    <Badge variant="outline" className={cn(estilo.className, 'flex-shrink-0', className)}>
      {estilo.label}
    </Badge>
  );
}

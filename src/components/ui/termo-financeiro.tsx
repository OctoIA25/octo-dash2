import { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { GLOSSARIO_FINANCEIRO, type SiglaFinanceira } from '@/lib/glossario-financeiro';
import { cn } from '@/lib/utils';

interface TermoFinanceiroProps {
  sigla: SiglaFinanceira;
  /** Texto exibido; por padrão, a própria sigla. */
  children?: ReactNode;
  className?: string;
}

/**
 * Sigla financeira com sublinhado pontilhado que revela, no hover ou no
 * foco via teclado, o nome completo, a explicação e a fórmula do termo
 * (definidos no glossário central).
 */
export function TermoFinanceiro({ sigla, children, className }: TermoFinanceiroProps) {
  const termo = GLOSSARIO_FINANCEIRO[sigla];

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            'underline decoration-dotted decoration-gray-400 dark:decoration-slate-500 underline-offset-2 cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-sm',
            className,
          )}
        >
          {children ?? sigla}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs space-y-1">
        <p className="font-semibold">{termo.nome}</p>
        <p className="text-xs text-muted-foreground">{termo.descricao}</p>
        {termo.formula && (
          <p className="text-xs font-mono text-muted-foreground">{termo.formula}</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

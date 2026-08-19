import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { classificacoesDe, type TipoLead, type ValorClassificacao } from '../utils/classificarLead';

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
export const CLASSIFICACAO_ESTILOS: Record<
  TipoLead,
  { label: string; className: string; dot: string }
> = {
  lancamento: {
    label: 'Lançamento',
    className: 'bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-800',
    dot: 'bg-violet-500',
  },
  pronto: {
    label: 'Pronto',
    className: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
    dot: 'bg-blue-500',
  },
  locacao: {
    label: 'Locação',
    className: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
    dot: 'bg-amber-500',
  },
  indefinido: {
    label: 'Sem classificação',
    className: 'bg-muted/30 text-muted-foreground border-muted',
    dot: 'bg-muted-foreground/30',
  },
};

/** Ordem de exibição nos controles de edição. `indefinido` por último: é a saída. */
export const CLASSIFICACAO_ORDEM: TipoLead[] = ['lancamento', 'pronto', 'locacao', 'indefinido'];

/**
 * `tipo` aceita array desde a 20260818: um lead pode carregar Lançamento E
 * Locação, e aí saem duas badges. String única (linha antiga do banco) segue
 * valendo — quem normaliza é `classificacoesDe`.
 */
export function ClassificacaoBadge({
  tipo,
  className,
}: {
  tipo?: ValorClassificacao;
  className?: string;
}) {
  return (
    <>
      {classificacoesDe(tipo).map((valor) => {
        const estilo = CLASSIFICACAO_ESTILOS[valor as TipoLead] ?? CLASSIFICACAO_ESTILOS.indefinido;
        return (
          <Badge
            key={valor}
            variant="outline"
            className={cn(estilo.className, 'flex-shrink-0', className)}
          >
            {estilo.label}
          </Badge>
        );
      })}
    </>
  );
}

/**
 * Versão compacta para os cards (Kanban e Bolsão): um ponto colorido por
 * classificação, com os rótulos no tooltip.
 *
 * Existe porque o card não tem largura para dois rótulos por extenso — duas
 * badges por escrito estouravam o rodapé da coluna do Kanban. A tabela e o
 * modal continuam mostrando o texto, que é onde há espaço para ele; a cor é a
 * MESMA de `CLASSIFICACAO_ESTILOS`, então o ponto e a badge nunca divergem.
 *
 * `role="img"` + `aria-label` em cada ponto: sem isso a classificação some
 * para leitor de tela, e cor sozinha não é informação acessível.
 */
export function ClassificacaoDots({
  tipo,
  className,
}: {
  tipo?: ValorClassificacao;
  className?: string;
}) {
  const tipos = classificacoesDe(tipo);
  const rotulos = tipos.map(
    (v) => (CLASSIFICACAO_ESTILOS[v as TipoLead] ?? CLASSIFICACAO_ESTILOS.indefinido).label,
  );
  return (
    <span className={cn('flex items-center gap-1 flex-shrink-0', className)} title={rotulos.join(' · ')}>
      {tipos.map((valor, i) => {
        const estilo = CLASSIFICACAO_ESTILOS[valor as TipoLead] ?? CLASSIFICACAO_ESTILOS.indefinido;
        return (
          <span
            key={valor}
            role="img"
            aria-label={rotulos[i]}
            className={cn('w-2 h-2 rounded-full ring-1 ring-inset ring-black/10', estilo.dot)}
          />
        );
      })}
    </span>
  );
}
